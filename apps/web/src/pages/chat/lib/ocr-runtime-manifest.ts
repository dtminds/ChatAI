/**
 * 浏览器 OCR CDN 运行时清单。
 * 升级 OCR 栈时优先更新本文件，再同步 package.json 与 CDN 上传。
 */
export const OCR_RUNTIME_MANIFEST = {
  cdnOrigin: "https://b5.bokr.com.cn/dist/ocr",
  onnxRuntimeVersion: "1.26.0",
  paddleOcrVersion: "0.4.2",
  paddleWorkerFile: "assets/worker-entry-C9UNuyOJ.js",
  models: {
    detFile: "PP-OCRv6_tiny_det_onnx_infer.tar",
    detName: "PP-OCRv6_tiny_det",
    recFile: "PP-OCRv6_tiny_rec_onnx_infer.tar",
    recName: "PP-OCRv6_tiny_rec",
  },
} as const;

export type OcrRuntimeUrlOverrides = {
  ortWasmBaseUrl?: string;
  paddleModelBaseUrl?: string;
  paddleModuleUrl?: string;
  paddleWorkerUrl?: string;
};

export type OcrRuntimeUrls = {
  modelNames: {
    det: string;
    rec: string;
  };
  modelUrls: {
    det: string;
    rec: string;
  };
  ortWasmBaseUrl: string;
  paddleModelBaseUrl: string;
  paddleModuleUrl: string;
  paddleWorkerUrl: string;
};

export function getDefaultOcrCdnUrls(
  manifest: typeof OCR_RUNTIME_MANIFEST = OCR_RUNTIME_MANIFEST,
): OcrRuntimeUrls {
  const paddleBase = `${manifest.cdnOrigin}/paddleocr-js/${manifest.paddleOcrVersion}`;
  const paddleModelBaseUrl = `${paddleBase}/`;
  const ortWasmBaseUrl =
    `${manifest.cdnOrigin}/onnxruntime-web/${manifest.onnxRuntimeVersion}/`;

  return {
    paddleModuleUrl: `${paddleBase}/index.mjs`,
    paddleWorkerUrl: `${paddleBase}/${manifest.paddleWorkerFile}`,
    paddleModelBaseUrl,
    ortWasmBaseUrl,
    modelUrls: {
      det: `${paddleModelBaseUrl}${manifest.models.detFile}`,
      rec: `${paddleModelBaseUrl}${manifest.models.recFile}`,
    },
    modelNames: {
      det: manifest.models.detName,
      rec: manifest.models.recName,
    },
  };
}

export type ResolveOcrRuntimeUrlsOptions = {
  importMetaUrl?: string;
};

export function resolveOcrRuntimeUrls(
  overrides: OcrRuntimeUrlOverrides = {},
  options: ResolveOcrRuntimeUrlsOptions = {},
): OcrRuntimeUrls {
  const defaults = getDefaultOcrCdnUrls();
  const paddleModuleUrl = overrides.paddleModuleUrl?.trim() || defaults.paddleModuleUrl;
  const configuredWorkerUrl = overrides.paddleWorkerUrl?.trim();
  const paddleModelBaseUrl = ensureTrailingSlash(
    overrides.paddleModelBaseUrl?.trim() || defaults.paddleModelBaseUrl,
  );

  return {
    paddleModuleUrl,
    paddleWorkerUrl:
      configuredWorkerUrl ||
      resolvePaddleWorkerUrlFromModule(paddleModuleUrl, options.importMetaUrl),
    paddleModelBaseUrl,
    ortWasmBaseUrl: ensureTrailingSlash(
      overrides.ortWasmBaseUrl?.trim() || defaults.ortWasmBaseUrl,
    ),
    modelUrls: {
      det: `${paddleModelBaseUrl}${OCR_RUNTIME_MANIFEST.models.detFile}`,
      rec: `${paddleModelBaseUrl}${OCR_RUNTIME_MANIFEST.models.recFile}`,
    },
    modelNames: defaults.modelNames,
  };
}

export function resolvePaddleWorkerUrlFromModule(
  paddleModuleUrl: string,
  importMetaUrl?: string,
) {
  try {
    return new URL(
      OCR_RUNTIME_MANIFEST.paddleWorkerFile,
      new URL(paddleModuleUrl),
    ).href;
  } catch {
    if (importMetaUrl) {
      return new URL(
        OCR_RUNTIME_MANIFEST.paddleWorkerFile,
        new URL(paddleModuleUrl, importMetaUrl),
      ).href;
    }

    if (paddleModuleUrl.startsWith("/")) {
      const moduleDirectory = paddleModuleUrl.slice(
        0,
        paddleModuleUrl.lastIndexOf("/") + 1,
      );

      return `${moduleDirectory}${OCR_RUNTIME_MANIFEST.paddleWorkerFile}`;
    }

    throw new TypeError(
      `Cannot resolve PaddleOCR worker URL from relative module URL "${paddleModuleUrl}" without a base URL.`,
    );
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
