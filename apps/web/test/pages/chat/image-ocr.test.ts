import { beforeEach, describe, expect, it, vi } from "vitest";
import { recognizeImageText } from "@/pages/chat/lib/image-ocr";

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

vi.mock("@paddleocr/paddleocr-js", () => ({
  PaddleOCR: {
    create,
  },
}));

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
    create.mockClear();
    predict.mockReset();
    createdImages.length = 0;
    vi.stubGlobal("Image", class extends ImageMock {
      constructor() {
        super();
        createdImages.push(this);
      }
    });
  });

  it("loads PaddleOCR.js lazily with PP-OCRv6, normalizes text regions, and reuses initialization", async () => {
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
      lang: "ch",
      ocrVersion: "PP-OCRv6",
      ortOptions: {
        wasmPaths: {
          mjs: expect.stringContaining("ort-wasm-simd-threaded.jsep.mjs"),
          wasm: expect.stringContaining("ort-wasm-simd-threaded.jsep.wasm"),
        },
      },
      worker: true,
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
      lang: "ch",
      ocrVersion: "PP-OCRv6",
      ortOptions: {
        wasmPaths: {
          mjs: expect.stringContaining("ort-wasm-simd-threaded.jsep.mjs"),
          wasm: expect.stringContaining("ort-wasm-simd-threaded.jsep.wasm"),
        },
      },
      worker: true,
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      lang: "ch",
      ocrVersion: "PP-OCRv6",
      ortOptions: {
        wasmPaths: {
          mjs: expect.stringContaining("ort-wasm-simd-threaded.jsep.mjs"),
          wasm: expect.stringContaining("ort-wasm-simd-threaded.jsep.wasm"),
        },
      },
      worker: false,
    });
  });
});
