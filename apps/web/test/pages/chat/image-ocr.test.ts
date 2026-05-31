import { beforeEach, describe, expect, it, vi } from "vitest";
import { recognizeImageText } from "@/pages/chat/lib/image-ocr";

const init = vi.fn(async () => undefined);
const recognize = vi.fn();

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
    init.mockClear();
    recognize.mockReset();
    document.head.querySelectorAll("script[data-paddlejs-ocr]").forEach((script) => {
      script.remove();
    });
    Object.defineProperty(window, "paddlejs", {
      configurable: true,
      value: {
        ocr: {
          init,
          recognize,
        },
      },
    });
    createdImages.length = 0;
    vi.stubGlobal("Image", class extends ImageMock {
      constructor() {
        super();
        createdImages.push(this);
      }
    });
  });

  it("loads Paddle.js OCR lazily, normalizes text regions, and reuses initialization", async () => {
    recognize
      .mockResolvedValueOnce({
        points: [
          [
            [10, 20],
            [150, 20],
            [150, 44],
            [10, 44],
          ],
          [
            [10, 56],
            [180, 56],
            [180, 82],
            [10, 82],
          ],
        ],
        text: [" 订单号 12345 ", "收货地址 上海市"],
      })
      .mockResolvedValueOnce({ points: [], text: ["第二张"] });

    const result = await recognizeImageText({
      alt: "订单截图",
      imageUrl: "https://cdn.example.com/order.jpg",
    });
    const nextResult = await recognizeImageText({
      alt: "第二张图片",
      imageUrl: "https://cdn.example.com/second.jpg",
    });

    expect(init).toHaveBeenCalledTimes(1);
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(createdImages).toHaveLength(2);
    expect(createdImages.every((image) => image.crossOrigin === "anonymous")).toBe(true);
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

  it("removes failed Paddle.js OCR script elements so retries can load a fresh script", async () => {
    vi.resetModules();
    Object.defineProperty(window, "paddlejs", {
      configurable: true,
      value: undefined,
    });
    vi.stubGlobal("Image", class extends ImageMock {
      constructor() {
        super();
        createdImages.push(this);
      }
    });
    const { recognizeImageText: recognizeFreshImageText } = await import(
      "@/pages/chat/lib/image-ocr"
    );
    const firstRecognition = recognizeFreshImageText({
      alt: "首次失败图片",
      imageUrl: "https://cdn.example.com/first.jpg",
    });
    const failedScript = document.querySelector<HTMLScriptElement>(
      "script[data-paddlejs-ocr]",
    );

    expect(failedScript).toBeInTheDocument();

    failedScript?.dispatchEvent(new Event("error"));

    await expect(firstRecognition).rejects.toThrow("Paddle.js OCR 加载失败");
    expect(
      document.querySelector("script[data-paddlejs-ocr]"),
    ).not.toBeInTheDocument();

    const secondRecognition = recognizeFreshImageText({
      alt: "重试图片",
      imageUrl: "https://cdn.example.com/retry.jpg",
    });
    const retryScript = document.querySelector<HTMLScriptElement>(
      "script[data-paddlejs-ocr]",
    );

    expect(retryScript).toBeInTheDocument();
    expect(retryScript).not.toBe(failedScript);

    Object.defineProperty(window, "paddlejs", {
      configurable: true,
      value: {
        ocr: {
          init,
          recognize: vi.fn(async () => ({
            points: [],
            text: ["重试成功"],
          })),
        },
      },
    });
    retryScript?.dispatchEvent(new Event("load"));

    await expect(secondRecognition).resolves.toEqual({
      regions: [
        {
          id: "ocr-region-1",
          points: [],
          text: "重试成功",
        },
      ],
      text: "重试成功",
    });
  });

  it("cleans up paired listeners when an existing Paddle.js OCR script finishes loading", async () => {
    vi.resetModules();
    Object.defineProperty(window, "paddlejs", {
      configurable: true,
      value: undefined,
    });
    const existingScript = document.createElement("script");
    const addEventListenerSpy = vi.spyOn(existingScript, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(existingScript, "removeEventListener");

    existingScript.dataset.paddlejsOcr = "true";
    document.head.appendChild(existingScript);

    const { recognizeImageText: recognizeFreshImageText } = await import(
      "@/pages/chat/lib/image-ocr"
    );
    const recognition = recognizeFreshImageText({
      alt: "已有脚本图片",
      imageUrl: "https://cdn.example.com/existing.jpg",
    });

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "load",
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );

    Object.defineProperty(window, "paddlejs", {
      configurable: true,
      value: {
        ocr: {
          init,
          recognize: vi.fn(async () => ({
            points: [],
            text: ["已有脚本加载成功"],
          })),
        },
      },
    });
    existingScript.dispatchEvent(new Event("load"));

    await expect(recognition).resolves.toEqual({
      regions: [
        {
          id: "ocr-region-1",
          points: [],
          text: "已有脚本加载成功",
        },
      ],
      text: "已有脚本加载成功",
    });
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "load",
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
  });
});
