import paddleOcrBundleUrl from "@paddlejs-models/ocr/lib/index.js?url";

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

type PaddleOcrModule = {
  init: () => Promise<void>;
  recognize: (
    image: HTMLImageElement,
    option?: {
      canvas?: HTMLCanvasElement;
      style?: {
        fillStyle?: string;
        lineWidth?: number;
        strokeStyle?: string;
      };
    },
  ) => Promise<PaddleOcrRawResult>;
};

type PaddleOcrRawResult = {
  points?: unknown;
  text?: unknown;
};

let ocrModulePromise: Promise<PaddleOcrModule> | null = null;
let ocrInitPromise: Promise<void> | null = null;

export async function recognizeImageText(
  input: RecognizeImageTextInput,
): Promise<ImageOcrResult> {
  input.onPhaseChange?.("loading-model");
  const ocr = await getInitializedOcr();
  input.onPhaseChange?.("recognizing");
  const image = await loadImageForOcr(input);
  const rawResult = await ocr.recognize(image);

  return normalizeOcrResult(rawResult);
}

async function getInitializedOcr() {
  const ocr = await loadOcrModule();

  ocrInitPromise ??= ocr.init().catch((error: unknown) => {
    ocrInitPromise = null;
    throw error;
  });
  await ocrInitPromise;

  return ocr;
}

async function loadOcrModule() {
  ocrModulePromise ??= loadPaddleOcrScript().catch((error: unknown) => {
    ocrModulePromise = null;
    throw error;
  });

  return ocrModulePromise;
}

function loadPaddleOcrScript() {
  return new Promise<PaddleOcrModule>((resolve, reject) => {
    const existingOcr = getWindowPaddleOcr();

    if (existingOcr) {
      resolve(existingOcr);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      "script[data-paddlejs-ocr]",
    );

    if (existingScript) {
      const handleLoad = () => {
        cleanupExistingScriptListeners();
        const ocr = getWindowPaddleOcr();

        if (ocr) {
          resolve(ocr);
          return;
        }

        existingScript.remove();
        reject(new Error("Paddle.js OCR 加载失败"));
      };
      const handleError = () => {
        cleanupExistingScriptListeners();
        existingScript.remove();
        reject(new Error("Paddle.js OCR 加载失败"));
      };
      const cleanupExistingScriptListeners = () => {
        existingScript.removeEventListener("load", handleLoad);
        existingScript.removeEventListener("error", handleError);
      };

      existingScript.addEventListener("load", handleLoad);
      existingScript.addEventListener("error", handleError);
      return;
    }

    const script = document.createElement("script");

    script.async = true;
    script.dataset.paddlejsOcr = "true";
    script.src = paddleOcrBundleUrl;
    script.onload = () => {
      const ocr = getWindowPaddleOcr();

      if (ocr) {
        resolve(ocr);
        return;
      }

      script.remove();
      reject(new Error("Paddle.js OCR 加载失败"));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Paddle.js OCR 加载失败"));
    };
    document.head.appendChild(script);
  });
}

function getWindowPaddleOcr() {
  const paddlejs = (window as Window & {
    paddlejs?: {
      ocr?: PaddleOcrModule;
    };
  }).paddlejs;

  return paddlejs?.ocr ?? null;
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

function normalizeOcrResult(rawResult: PaddleOcrRawResult): ImageOcrResult {
  const rawTexts = Array.isArray(rawResult.text)
    ? rawResult.text
    : typeof rawResult.text === "string"
      ? [rawResult.text]
      : [];
  const rawPoints = Array.isArray(rawResult.points) ? rawResult.points : [];
  const regions = rawTexts
    .map((text, index) => ({
      id: `ocr-region-${index + 1}`,
      points: normalizePoints(rawPoints[index]),
      text: String(text).trim(),
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
