import { describe, expect, it } from "vitest";
import {
  getDefaultOcrCdnUrls,
  OCR_RUNTIME_MANIFEST,
  resolveOcrRuntimeUrls,
  resolvePaddleWorkerUrlFromModule,
} from "@/pages/chat/lib/ocr-runtime-manifest";

describe("resolveOcrRuntimeUrls", () => {
  it("derives the worker URL from the resolved module URL by default", () => {
    const defaults = getDefaultOcrCdnUrls();

    expect(defaults.paddleWorkerUrl).toBe(
      resolvePaddleWorkerUrlFromModule(defaults.paddleModuleUrl),
    );
  });

  it("derives the worker URL from an overridden absolute module URL when worker is unset", () => {
    const moduleUrl = "https://staging.example.com/dist/ocr/paddleocr-js/0.5.0/index.mjs";

    expect(
      resolveOcrRuntimeUrls({
        paddleModuleUrl: moduleUrl,
      }).paddleWorkerUrl,
    ).toBe(resolvePaddleWorkerUrlFromModule(moduleUrl));
  });

  it("derives the worker URL from a root-relative module URL without a base", () => {
    const moduleUrl = "/dist/ocr/paddleocr-js/0.4.2/index.mjs";

    expect(
      resolveOcrRuntimeUrls({
        paddleModuleUrl: moduleUrl,
      }).paddleWorkerUrl,
    ).toBe("/dist/ocr/paddleocr-js/0.4.2/assets/worker-entry-C9UNuyOJ.js");
  });

  it("derives the worker URL from a root-relative module URL with import.meta.url", () => {
    const moduleUrl = "/dist/ocr/paddleocr-js/0.4.2/index.mjs";
    const importMetaUrl = "https://chat.example.com/assets/chat-workbench-page.js";

    expect(
      resolveOcrRuntimeUrls(
        {
          paddleModuleUrl: moduleUrl,
        },
        { importMetaUrl },
      ).paddleWorkerUrl,
    ).toBe(
      new URL(OCR_RUNTIME_MANIFEST.paddleWorkerFile, new URL(moduleUrl, importMetaUrl))
        .href,
    );
  });

  it("keeps an explicit worker override when provided", () => {
    const workerUrl =
      "https://staging.example.com/dist/ocr/paddleocr-js/0.5.0/assets/custom-worker.js";

    expect(
      resolveOcrRuntimeUrls({
        paddleModuleUrl:
          "https://staging.example.com/dist/ocr/paddleocr-js/0.5.0/index.mjs",
        paddleWorkerUrl: workerUrl,
      }).paddleWorkerUrl,
    ).toBe(workerUrl);
  });
});
