import type { OcrResult, PaddleOCR } from "@paddleocr/paddleocr-js";
import {
  resolveOcrRuntimeUrls,
  resolvePaddleWorkerUrlFromModule,
} from "@/pages/chat/lib/ocr-runtime-manifest";

export type ImageOcrPoint = readonly [number, number];

export type ImageOcrRegion = {
  id: string;
  points: ImageOcrPoint[];
  text: string;
};

export type ImageOcrResult = {
  regions: ImageOcrRegion[];
  text: string;
};

export type RecognizeImageTextInput = {
  alt: string;
  imageUrl: string;
  onPhaseChange?: (phase: ImageOcrPhase) => void;
};

export type ImageOcrPhase = "loading-model" | "recognizing";

type PaddleOcrInstance = Awaited<ReturnType<typeof PaddleOCR.create>>;
type PaddleOcrCreateOptions = NonNullable<Parameters<typeof PaddleOCR.create>[0]>;
type LocalPaddleOcrCreateOptions = PaddleOcrCreateOptions;

const ocrRuntimeUrls = resolveOcrRuntimeUrls(
  {
    ortWasmBaseUrl: import.meta.env.VITE_OCR_ORT_WASM_BASE_URL,
    paddleModelBaseUrl: import.meta.env.VITE_OCR_PADDLE_MODEL_BASE_URL,
    paddleModuleUrl: import.meta.env.VITE_OCR_PADDLE_MODULE_URL,
    paddleWorkerUrl: import.meta.env.VITE_OCR_PADDLE_WORKER_URL,
  },
  { importMetaUrl: import.meta.url },
);

const ocrCreateOptions: LocalPaddleOcrCreateOptions = {
  ortOptions: {
    wasmPaths: ocrRuntimeUrls.ortWasmBaseUrl,
  },
  textDetectionModelAsset: {
    url: ocrRuntimeUrls.modelUrls.det,
  },
  textDetectionModelName: ocrRuntimeUrls.modelNames.det,
  textRecognitionModelAsset: {
    url: ocrRuntimeUrls.modelUrls.rec,
  },
  textRecognitionModelName: ocrRuntimeUrls.modelNames.rec,
  worker: {
    createWorker: createPaddleOcrWorker,
  },
};
const fallbackOcrCreateOptions = {
  ...ocrCreateOptions,
  worker: false,
} satisfies LocalPaddleOcrCreateOptions;

let ocrPromise: Promise<PaddleOcrInstance> | null = null;
let paddleOcrModulePromise: Promise<typeof import("@paddleocr/paddleocr-js")> | null =
  null;

export async function recognizeImageText(
  input: RecognizeImageTextInput,
): Promise<ImageOcrResult> {
  input.onPhaseChange?.("loading-model");
  const ocr = await getOcr();
  input.onPhaseChange?.("recognizing");
  const image = await loadImageForOcr(input);
  const rawResult = await ocr.predict(image);

  return normalizeOcrResult(rawResult);
}

async function getOcr() {
  ocrPromise ??= loadPaddleOcrModule()
    .then(async ({ PaddleOCR }) => {
      try {
        return await PaddleOCR.create(ocrCreateOptions);
      } catch (error) {
        if (!isWorkerInitializationError(error)) {
          throw error;
        }

        return PaddleOCR.create(fallbackOcrCreateOptions);
      }
    })
    .catch((error: unknown) => {
      ocrPromise = null;
      throw error;
    });

  return ocrPromise;
}

async function loadPaddleOcrModule() {
  const moduleSpecifier = resolvePaddleOcrModuleSpecifier(import.meta.env.MODE);

  paddleOcrModulePromise ??= import(/* @vite-ignore */ moduleSpecifier).catch(
    (error: unknown) => {
      paddleOcrModulePromise = null;
      ocrPromise = null;
      throw error;
    },
  );

  return paddleOcrModulePromise;
}

export function resolvePaddleOcrModuleSpecifier(mode: string | undefined) {
  return mode === "test" ? "@paddleocr/paddleocr-js" : ocrRuntimeUrls.paddleModuleUrl;
}

export function resolvePaddleOcrWorkerUrl(
  workerUrl: string | undefined,
  moduleUrl: string,
  importMetaUrl: string,
) {
  const configuredWorkerUrl = workerUrl?.trim();

  if (configuredWorkerUrl) {
    return configuredWorkerUrl;
  }

  return resolvePaddleWorkerUrlFromModule(moduleUrl, importMetaUrl);
}

function isWorkerInitializationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /worker/i.test(message);
}

function createPaddleOcrWorker() {
  const workerModule = new Blob(
    [`import ${JSON.stringify(ocrRuntimeUrls.paddleWorkerUrl)};\n`],
    {
      type: "text/javascript",
    },
  );
  const workerUrl = URL.createObjectURL(workerModule);
  const worker = new Worker(workerUrl, { type: "module" });

  setTimeout(() => URL.revokeObjectURL(workerUrl), 0);

  return worker;
}

function loadImageForOcr(input: RecognizeImageTextInput) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      reject(new Error(`图片加载失败：${input.alt}`));
    };
    image.src = input.imageUrl;
  });
}

function normalizeOcrResult(
  rawResult: OcrResult[] | null | undefined,
): ImageOcrResult {
  const items = rawResult?.[0]?.items ?? [];

  if (items.length === 0) {
    return {
      regions: [],
      text: "",
    };
  }

  const regions = items
    .map((item, index) => ({
      id: `ocr-region-${index + 1}`,
      points: normalizePoints(item.poly),
      text: String(item.text ?? "").trim(),
    }))
    .filter((region) => region.text.length > 0);

  return {
    regions,
    text: regions.map((region) => region.text).join("\n"),
  };
}

function normalizePoints(points: unknown): ImageOcrPoint[] {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      return [];
    }

    const x = Number(point[0]);
    const y = Number(point[1]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return [];
    }

    return [[x, y] satisfies ImageOcrPoint];
  });
}
