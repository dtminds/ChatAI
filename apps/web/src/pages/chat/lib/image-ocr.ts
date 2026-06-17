import type { OcrResult, PaddleOCR } from "@paddleocr/paddleocr-js";

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

const ocrCreateOptions = {
  lang: "ch",
  ocrVersion: "PP-OCRv6",
  worker: true,
} as const;

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
    .then(({ PaddleOCR }) => PaddleOCR.create(ocrCreateOptions))
    .catch((error: unknown) => {
      ocrPromise = null;
      throw error;
    });

  return ocrPromise;
}

async function loadPaddleOcrModule() {
  paddleOcrModulePromise ??= import("@paddleocr/paddleocr-js").catch((error: unknown) => {
    paddleOcrModulePromise = null;
    ocrPromise = null;
    throw error;
  });

  return paddleOcrModulePromise;
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
      text: item.text.trim(),
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
