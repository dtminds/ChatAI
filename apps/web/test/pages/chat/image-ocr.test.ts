import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recognizeImageText,
  resolvePaddleOcrWorkerUrl,
  resolvePaddleOcrModuleSpecifier,
} from "@/pages/chat/lib/image-ocr";
import { getDefaultOcrCdnUrls, OCR_RUNTIME_MANIFEST } from "@/pages/chat/lib/ocr-runtime-manifest";

const ocrCdnUrls = getDefaultOcrCdnUrls();
const paddleOcrModelCreateOptions = {
  textDetectionModelAsset: {
    url: ocrCdnUrls.modelUrls.det,
  },
  textDetectionModelName: ocrCdnUrls.modelNames.det,
  textRecognitionModelAsset: {
    url: ocrCdnUrls.modelUrls.rec,
  },
  textRecognitionModelName: ocrCdnUrls.modelNames.rec,
};

type CreateWorkerOptions = {
  worker?: boolean | {
    createWorker?: () => Worker;
  };
};

const { create, predict } = vi.hoisted(() => {
  const predict = vi.fn();
  const create = vi.fn(async () => ({
    predict,
  }));

  return {
    create,
    predict,
  };
});

const { createObjectUrlMock, revokeObjectUrlMock } = vi.hoisted(() => ({
  createObjectUrlMock: vi.fn(() => "blob:https://chat.example.com/ocr-worker"),
  revokeObjectUrlMock: vi.fn(),
}));

vi.mock("@paddleocr/paddleocr-js", () => ({
  PaddleOCR: {
    create,
  },
}));

const WorkerMock = vi.fn(function WorkerMock(
  this: Worker,
  url: string | URL,
  options?: WorkerOptions,
) {
  Object.assign(this, {
    options,
    url: String(url),
  });
});

class ImageMock {
  alt = "";
  crossOrigin: string | null = null;
  decoding = "auto";
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;

  set src(value: string) {
    if (value.includes("broken")) {
      this.onerror?.();
      return;
    }

    this.onload?.();
  }
}

const createdImages: ImageMock[] = [];

describe("recognizeImageText", () => {
  beforeEach(() => {
    vi.useRealTimers();
    create.mockClear();
    WorkerMock.mockClear();
    createObjectUrlMock.mockClear();
    revokeObjectUrlMock.mockClear();
    predict.mockReset();
    createdImages.length = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrlMock,
    });
    vi.stubGlobal("Worker", WorkerMock);
    vi.stubGlobal("Image", class extends ImageMock {
      constructor() {
        super();
        createdImages.push(this);
      }
    });
  });

  it("loads PaddleOCR.js lazily with PP-OCRv6 tiny models, normalizes text regions, and reuses initialization", async () => {
    predict
      .mockResolvedValueOnce([
        {
          items: [
            {
              poly: [
                [10, 20],
                [150, 20],
                [150, 44],
                [10, 44],
              ],
              score: 0.99,
              text: " 订单号 12345 ",
            },
            {
              poly: [
                [10, 56],
                [180, 56],
                [180, 82],
                [10, 82],
              ],
              score: 0.98,
              text: "收货地址 上海市",
            },
          ],
        },
      ])
      .mockResolvedValueOnce([{ items: [{ poly: [], score: 0.95, text: "第二张" }] }]);

    const result = await recognizeImageText({
      alt: "订单截图",
      imageUrl: "https://cdn.example.com/order.jpg",
    });
    const nextResult = await recognizeImageText({
      alt: "第二张图片",
      imageUrl: "https://cdn.example.com/second.jpg",
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      ortOptions: {
        wasmPaths: ocrCdnUrls.ortWasmBaseUrl,
      },
      ...paddleOcrModelCreateOptions,
      worker: {
        createWorker: expect.any(Function),
      },
    });
    const createOptions = (create.mock.calls as unknown as Array<[CreateWorkerOptions]>)[0]?.[0];
    const createWorker =
      typeof createOptions?.worker === "object"
        ? createOptions.worker.createWorker
        : undefined;
    expect(createWorker).toEqual(expect.any(Function));
    createWorker?.();
    const workerBootstrap = (createObjectUrlMock.mock.calls as unknown as Array<[Blob]>)[0]?.[0];
    expect(workerBootstrap).toBeInstanceOf(Blob);
    await expect(workerBootstrap.text()).resolves.toBe(
      `import ${JSON.stringify(ocrCdnUrls.paddleWorkerUrl)};\n`,
    );
    expect(WorkerMock).toHaveBeenCalledWith("blob:https://chat.example.com/ocr-worker", {
      type: "module",
    });
    expect(predict).toHaveBeenCalledTimes(2);
    expect(createdImages).toHaveLength(2);
    expect(createdImages.every((image) => image.crossOrigin === "anonymous")).toBe(true);
    expect(predict.mock.calls[0]?.[0]).toBe(createdImages[0]);
    expect(result).toEqual({
      regions: [
        {
          id: "ocr-region-1",
          points: [
            [10, 20],
            [150, 20],
            [150, 44],
            [10, 44],
          ],
          text: "订单号 12345",
        },
        {
          id: "ocr-region-2",
          points: [
            [10, 56],
            [180, 56],
            [180, 82],
            [10, 82],
          ],
          text: "收货地址 上海市",
        },
      ],
      text: "订单号 12345\n收货地址 上海市",
    });
    expect(nextResult.text).toBe("第二张");
  });

  it("revokes the worker blob URL after worker creation can start", () => {
    vi.useFakeTimers();
    vi.resetModules();
    predict.mockResolvedValue([]);

    return import("@/pages/chat/lib/image-ocr").then(
      async ({ recognizeImageText: recognizeFreshImageText }) => {
        try {
          await recognizeFreshImageText({
            alt: "worker 图片",
            imageUrl: "https://cdn.example.com/worker.jpg",
          });

          const createOptions = (create.mock.calls as unknown as Array<
            [CreateWorkerOptions]
          >)[0]?.[0];
          const createWorker =
            typeof createOptions?.worker === "object"
              ? createOptions.worker.createWorker
              : undefined;

          createWorker?.();

          expect(revokeObjectUrlMock).not.toHaveBeenCalled();

          vi.runOnlyPendingTimers();

          expect(revokeObjectUrlMock).toHaveBeenCalledWith(
            "blob:https://chat.example.com/ocr-worker",
          );
        } finally {
          vi.useRealTimers();
        }
      },
    );
  });

  it("uses the CDN module outside Vitest and keeps a mockable package import in tests", () => {
    expect(resolvePaddleOcrModuleSpecifier("development")).toBe(
      ocrCdnUrls.paddleModuleUrl,
    );
    expect(resolvePaddleOcrModuleSpecifier("production")).toBe(
      ocrCdnUrls.paddleModuleUrl,
    );
    expect(resolvePaddleOcrModuleSpecifier("test")).toBe("@paddleocr/paddleocr-js");
  });

  it("resolves the default worker URL from relative module URLs", () => {
    const moduleUrl = "/dist/ocr/paddleocr-js/0.4.2/index.mjs";
    const importMetaUrl = "https://chat.example.com/assets/chat-workbench-page.js";

    expect(resolvePaddleOcrWorkerUrl("", moduleUrl, importMetaUrl)).toBe(
      new URL(OCR_RUNTIME_MANIFEST.paddleWorkerFile, new URL(moduleUrl, importMetaUrl))
        .href,
    );
  });

  it("normalizes falsy OCR results to an empty result", async () => {
    predict.mockResolvedValue(null);

    await expect(
      recognizeImageText({
        alt: "空结果图片",
        imageUrl: "https://cdn.example.com/empty-result.jpg",
      }),
    ).resolves.toEqual({
      regions: [],
      text: "",
    });
  });

  it("resets failed PaddleOCR.js initialization so retries can create a fresh instance", async () => {
    vi.resetModules();
    create.mockRejectedValueOnce(new Error("model load failed"));

    const { recognizeImageText: recognizeFreshImageText } = await import(
      "@/pages/chat/lib/image-ocr"
    );

    await expect(
      recognizeFreshImageText({
        alt: "首次失败图片",
        imageUrl: "https://cdn.example.com/first.jpg",
      }),
    ).rejects.toThrow("model load failed");

    create.mockResolvedValueOnce({
      predict: vi.fn(async () => [
        {
          items: [{ poly: [], score: 0.99, text: "重试成功" }],
        },
      ]),
    });

    await expect(
      recognizeFreshImageText({
        alt: "重试图片",
        imageUrl: "https://cdn.example.com/retry.jpg",
      }),
    ).resolves.toEqual({
      regions: [
        {
          id: "ocr-region-1",
          points: [],
          text: "重试成功",
        },
      ],
      text: "重试成功",
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("falls back to main-thread OCR when worker initialization fails", async () => {
    vi.resetModules();
    create
      .mockRejectedValueOnce(new Error("OCR worker failed."))
      .mockResolvedValueOnce({
        predict: vi.fn(async () => [
          {
            items: [{ poly: [], score: 0.99, text: "主线程识别成功" }],
          },
        ]),
      });
    const { recognizeImageText: recognizeFreshImageText } = await import(
      "@/pages/chat/lib/image-ocr"
    );

    await expect(
      recognizeFreshImageText({
        alt: "worker 失败图片",
        imageUrl: "https://cdn.example.com/worker-failed.jpg",
      }),
    ).resolves.toEqual({
      regions: [
        {
          id: "ocr-region-1",
          points: [],
          text: "主线程识别成功",
        },
      ],
      text: "主线程识别成功",
    });
    expect(create).toHaveBeenNthCalledWith(1, {
      ortOptions: {
        wasmPaths: ocrCdnUrls.ortWasmBaseUrl,
      },
      ...paddleOcrModelCreateOptions,
      worker: {
        createWorker: expect.any(Function),
      },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      ortOptions: {
        wasmPaths: ocrCdnUrls.ortWasmBaseUrl,
      },
      ...paddleOcrModelCreateOptions,
      worker: false,
    });
  });

  it("falls back to main-thread OCR when worker initialization throws a string", async () => {
    vi.resetModules();
    create
      .mockRejectedValueOnce("OCR worker failed.")
      .mockResolvedValueOnce({
        predict: vi.fn(async () => [
          {
            items: [{ poly: [], score: 0.99, text: "字符串错误回退成功" }],
          },
        ]),
      });
    const { recognizeImageText: recognizeFreshImageText } = await import(
      "@/pages/chat/lib/image-ocr"
    );

    await expect(
      recognizeFreshImageText({
        alt: "worker 字符串错误图片",
        imageUrl: "https://cdn.example.com/worker-string-error.jpg",
      }),
    ).resolves.toMatchObject({
      text: "字符串错误回退成功",
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("normalizes nullable OCR text items to empty text instead of throwing", async () => {
    predict.mockResolvedValue([
      {
        items: [
          { poly: [], score: 0.99, text: null },
          { poly: [], score: 0.98, text: " 可用文字 " },
        ],
      },
    ]);

    await expect(
      recognizeImageText({
        alt: "异常文本图片",
        imageUrl: "https://cdn.example.com/nullable-text.jpg",
      }),
    ).resolves.toEqual({
      regions: [
        {
          id: "ocr-region-2",
          points: [],
          text: "可用文字",
        },
      ],
      text: "可用文字",
    });
  });
});
