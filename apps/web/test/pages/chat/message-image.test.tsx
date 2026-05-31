import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { ChatMessage, ImageMessageContent } from "@/pages/chat/chat-types";
import { ImageMessageCard, MessageContentRenderer } from "@/pages/chat/components/message";
import { recognizeImageText } from "@/pages/chat/lib/image-ocr";

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      success: vi.fn(),
      warning: vi.fn(),
    },
  };
});

vi.mock("@/pages/chat/lib/image-ocr", () => ({
  recognizeImageText: vi.fn(),
}));

Object.defineProperties(HTMLImageElement.prototype, {
  naturalHeight: {
    configurable: true,
    get() {
      return 292;
    },
  },
  naturalWidth: {
    configurable: true,
    get() {
      return 668;
    },
  },
});

describe("MessageContentRenderer image messages", () => {
  it("renders an image thumbnail with a weak border and opens a full preview", async () => {
    const user = userEvent.setup();

    render(
      <MessageContentRenderer
        isAgent={false}
        message={createImageMessage({
          alt: "客户发来的现场照片",
          height: 900,
          imageUrl: "https://cdn.example.com/chat/photo.jpg",
          type: "image",
          width: 1200,
        })}
      />,
    );

    const trigger = screen.getByRole("button", { name: "查看大图：客户发来的现场照片" });
    expect(trigger).toHaveClass("border", "border-border/40");
    expect(screen.getByRole("img", { name: "客户发来的现场照片" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/chat/photo.jpg",
    );

    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "图片预览" })).toBeInTheDocument();
    expect(screen.getByTestId("image-preview-full")).toHaveAttribute(
      "src",
      "https://cdn.example.com/chat/photo.jpg",
    );
    expect(screen.getByTestId("image-preview-full")).not.toHaveAttribute(
      "crossorigin",
    );

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "图片预览" })).not.toBeInTheDocument();
  });

  it("uses the optimized b5 image URL for thumbnails while previewing the original image", async () => {
    const user = userEvent.setup();
    const imageUrl =
      "https://b5.bokr.com.cn/s5/20260511/272/fa4ccebe1fa94d60997824dd1a22656b.jpg";

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "客户发来的表情图片",
          height: 900,
          imageUrl,
          width: 1200,
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "客户发来的表情图片" })).toHaveAttribute(
      "src",
      `${imageUrl}!w480.webp`,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：客户发来的表情图片" }));

    expect(screen.getByTestId("image-preview-full")).toHaveAttribute("src", imageUrl);
  });

  it("uses the natural image ratio when dimensions are missing", () => {
    render(
      <ImageMessageCard
        content={{
          type: "image",
          alt: "缺少尺寸的横图",
          imageUrl: "https://cdn.example.com/chat/wide-photo.jpg",
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "查看大图：缺少尺寸的横图" });
    const image = screen.getByRole("img", { name: "缺少尺寸的横图" });

    expect(trigger).not.toHaveStyle({
      height: "320px",
      width: "320px",
    });
    expect(trigger).toHaveStyle({
      maxHeight: "360px",
      maxWidth: "300px",
      minWidth: "120px",
      width: "fit-content",
    });
    expect(image).toHaveClass("object-cover");
    expect(image).toHaveClass("h-auto", "max-h-[360px]", "w-auto", "max-w-full");
    expect(image).not.toHaveAttribute("height");
    expect(image).not.toHaveAttribute("width");
  });

  it("constrains loaded images with max dimensions while preserving natural ratio", () => {
    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "大尺寸图片",
          height: 900,
          imageUrl: "https://cdn.example.com/chat/large-photo.jpg",
          width: 1200,
        })}
      />,
    );

    const trigger = screen.getByRole("button", { name: "查看大图：大尺寸图片" });
    const image = screen.getByRole("img", { name: "大尺寸图片" });

    expect(trigger).toHaveStyle({
      maxHeight: "360px",
      maxWidth: "300px",
      minWidth: "120px",
      width: "fit-content",
    });
    expect(trigger).not.toHaveStyle({
      height: "225px",
      width: "300px",
    });
    expect(image).toHaveClass("object-cover");
    expect(image).toHaveAttribute("height", "900");
    expect(image).toHaveAttribute("width", "1200");
    expect(image).toHaveClass("h-auto", "max-h-[360px]", "w-auto", "max-w-full");
  });

  it("uses compact constraints for emotion images", () => {
    render(
      <ImageMessageCard
        content={{
          type: "image",
          alt: "客户表情",
          imageUrl: "https://cdn.example.com/chat/emotion.gif",
          variant: "emotion",
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "查看大图：客户表情" });
    const image = screen.getByRole("img", { name: "客户表情" });

    expect(trigger).toHaveStyle({
      maxHeight: "120px",
      maxWidth: "120px",
      minHeight: "48px",
      minWidth: "48px",
      width: "fit-content",
    });
    expect(image).toHaveClass("max-h-[120px]");
  });

  it("uses the natural image ratio for invalid image sizes", () => {
    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "无效尺寸图片",
          height: Number.NaN,
          imageUrl: "https://cdn.example.com/chat/photo.jpg",
          width: 0,
        })}
      />,
    );

    const trigger = screen.getByRole("button", { name: "查看大图：无效尺寸图片" });
    const image = screen.getByRole("img", { name: "无效尺寸图片" });

    expect(trigger).not.toHaveStyle({
      height: "320px",
      width: "320px",
    });
    expect(image).not.toHaveAttribute("height", "NaN");
    expect(image).not.toHaveAttribute("width", "0");
  });

  it("renders an image-not-found icon when the image URL is empty", () => {
    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "空图片",
          height: 900,
          imageUrl: "",
          width: 1200,
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "图片不可用：空图片" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "空图片" })).not.toBeInTheDocument();
  });

  it("renders an image-not-found fallback when the thumbnail fails to load", () => {
    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "加载失败图片",
          height: 900,
          imageUrl: "https://cdn.example.com/chat/broken.jpg",
          width: 1200,
        })}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "加载失败图片" }));

    expect(screen.getByRole("img", { name: "图片不可用：加载失败图片" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("image-message-fallback")).toHaveClass(
      "h-[120px]",
      "w-[120px]",
    );
    expect(screen.queryByRole("img", { name: "加载失败图片" })).not.toBeInTheDocument();
  });

  it("closes the full preview when blank preview space is clicked", async () => {
    const user = userEvent.setup();

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "可关闭预览图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：可关闭预览图片" }));

    expect(screen.getByRole("dialog", { name: "图片预览" })).toBeInTheDocument();

    await user.click(screen.getByTestId("image-preview-backdrop"));

    expect(screen.queryByRole("dialog", { name: "图片预览" })).not.toBeInTheDocument();
  });

  it("closes the full preview when blank space around the OCR action is clicked", async () => {
    const user = userEvent.setup();

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "按钮周边空白图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：按钮周边空白图片" }));

    expect(screen.getByRole("dialog", { name: "图片预览" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("image-preview-action-bar"));

    expect(screen.queryByRole("dialog", { name: "图片预览" })).not.toBeInTheDocument();
  });

  it("keeps the full preview open when the image itself is clicked", async () => {
    const user = userEvent.setup();

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "预览图片本体",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：预览图片本体" }));
    await user.click(screen.getByTestId("image-preview-full"));

    expect(screen.getByRole("dialog", { name: "图片预览" })).toBeInTheDocument();
  });

  it("shows browser OCR action for regular image previews", async () => {
    const user = userEvent.setup();

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "带文字的图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：带文字的图片" }));

    expect(
      screen.getByRole("button", { name: "提取图片文字" }),
    ).toBeInTheDocument();
  });

  it("places the browser OCR action below the preview image", async () => {
    const user = userEvent.setup();

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "下方按钮图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：下方按钮图片" }));

    const action = screen.getByRole("button", { name: "提取图片文字" });

    expect(screen.getByTestId("image-preview-action-bar")).toContainElement(action);
    expect(screen.getByTestId("image-preview-image-frame")).not.toContainElement(action);
  });

  it("does not show browser OCR action for emotion image previews", async () => {
    const user = userEvent.setup();

    render(
      <ImageMessageCard
        content={{
          type: "image",
          alt: "客户表情",
          imageUrl: "https://cdn.example.com/chat/emotion.gif",
          variant: "emotion",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：客户表情" }));

    expect(
      screen.queryByRole("button", { name: "提取图片文字" }),
    ).not.toBeInTheDocument();
  });

  it("loads OCR lazily and shows recognized text in a fixed right panel", async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImageText).mockResolvedValue({
      text: "订单号 12345\n收货地址 上海市",
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
    });

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "待识别图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：待识别图片" }));

    expect(recognizeImageText).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "提取图片文字" }));

    expect(recognizeImageText).toHaveBeenCalledWith(
      expect.objectContaining({
        alt: "待识别图片",
        imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
      }),
    );
    expect(await screen.findByTestId("image-preview-ocr-panel")).toBeInTheDocument();
    expect(screen.getByTestId("image-preview-layout")).toHaveAttribute(
      "data-ocr-panel",
      "open",
    );
    expect(screen.getByText("订单号 12345")).toBeInTheDocument();
    expect(screen.getByText("收货地址 上海市")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提取图片文字" })).not.toBeInTheDocument();
    expect(screen.queryByText("文本 1")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    fireEvent.load(screen.getByTestId("image-preview-full"));

    expect(screen.getByTestId("image-preview-ocr-overlay")).toBeInTheDocument();
    expect(screen.getAllByTestId("image-preview-ocr-region")).toHaveLength(2);
  });

  it("scrolls the matching OCR text block into view when an overlay region is clicked", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();

    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    vi.mocked(recognizeImageText).mockResolvedValue({
      text: "第一行文字\n第二行文字",
      regions: [
        {
          id: "ocr-region-1",
          points: [
            [10, 20],
            [150, 20],
            [150, 44],
            [10, 44],
          ],
          text: "第一行文字",
        },
        {
          id: "ocr-region-2",
          points: [
            [10, 56],
            [180, 56],
            [180, 82],
            [10, 82],
          ],
          text: "第二行文字",
        },
      ],
    });

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "点击标注图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：点击标注图片" }));
    await user.click(screen.getByRole("button", { name: "提取图片文字" }));
    await screen.findByText("第二行文字");
    fireEvent.load(screen.getByTestId("image-preview-full"));

    await user.click(screen.getAllByTestId("image-preview-ocr-region")[1]);

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });
  });

  it("shows separate loading messages for model loading and text recognition", async () => {
    const user = userEvent.setup();
    let changePhase: Parameters<typeof recognizeImageText>[0]["onPhaseChange"] | undefined;
    let resolveOcr: ((value: Awaited<ReturnType<typeof recognizeImageText>>) => void) | undefined;
    vi.mocked(recognizeImageText).mockImplementation(({ onPhaseChange }) => {
      onPhaseChange?.("loading-model");
      changePhase = onPhaseChange;

      return new Promise((resolve) => {
        resolveOcr = resolve;
      });
    });

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "阶段提示图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：阶段提示图片" }));
    await user.click(screen.getByRole("button", { name: "提取图片文字" }));

    expect(await screen.findByText("正在加载 OCR 模型")).toBeInTheDocument();
    changePhase?.("recognizing");
    expect(await screen.findByText("正在识别图片文字")).toBeInTheDocument();

    resolveOcr?.({
      regions: [],
      text: "",
    });
  });

  it("copies all and single OCR text results", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(recognizeImageText).mockResolvedValue({
      text: "订单号 12345\n收货地址 上海市",
      regions: [
        {
          id: "ocr-region-1",
          points: [],
          text: "订单号 12345",
        },
      ],
    });

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "可复制识别结果",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：可复制识别结果" }));
    await user.click(screen.getByRole("button", { name: "提取图片文字" }));
    await screen.findByTestId("image-preview-ocr-panel");
    await user.click(screen.getByRole("button", { name: "复制全部识别文字" }));
    await user.click(screen.getByRole("button", { name: "复制第 1 条识别文字" }));

    expect(writeText).toHaveBeenNthCalledWith(1, "订单号 12345\n收货地址 上海市");
    expect(writeText).toHaveBeenNthCalledWith(2, "订单号 12345");
  });

  it("falls back to document copy when clipboard write is unavailable", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => true),
    });
    const execCommand = vi.mocked(document.execCommand);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(recognizeImageText).mockResolvedValue({
      text: "兜底复制文本",
      regions: [
        {
          id: "ocr-region-1",
          points: [],
          text: "兜底复制文本",
        },
      ],
    });

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "兜底复制图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：兜底复制图片" }));
    await user.click(screen.getByRole("button", { name: "提取图片文字" }));
    await screen.findByTestId("image-preview-ocr-panel");
    await user.click(screen.getByRole("button", { name: "复制全部识别文字" }));

    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("lets the loading state paint before starting OCR", async () => {
    const user = userEvent.setup();
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    vi.mocked(recognizeImageText).mockResolvedValue({
      regions: [],
      text: "",
    });

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "先渲染加载态图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：先渲染加载态图片" }));
    await user.click(screen.getByRole("button", { name: "提取图片文字" }));

    expect(await screen.findByText("正在加载 OCR 模型")).toBeInTheDocument();
    expect(requestAnimationFrameSpy).toHaveBeenCalled();
    expect(recognizeImageText).not.toHaveBeenCalled();

    await act(async () => {
      frameCallbacks.shift()?.(0);
    });
    expect(recognizeImageText).not.toHaveBeenCalled();

    await act(async () => {
      frameCallbacks.shift()?.(16);
    });
    await vi.waitFor(() => {
      expect(recognizeImageText).toHaveBeenCalled();
    });
    requestAnimationFrameSpy.mockRestore();
  });

  it("ignores OCR results from a closed preview", async () => {
    const user = userEvent.setup();
    let resolveOcr: ((value: Awaited<ReturnType<typeof recognizeImageText>>) => void) | undefined;
    vi.mocked(recognizeImageText).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOcr = resolve;
        }),
    );

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "关闭中识别图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：关闭中识别图片" }));
    await user.click(screen.getByRole("button", { name: "提取图片文字" }));
    await screen.findByText("正在加载 OCR 模型");

    await vi.waitFor(() => {
      expect(recognizeImageText).toHaveBeenCalled();
    });

    await user.click(screen.getByTestId("image-preview-backdrop"));

    expect(screen.queryByRole("dialog", { name: "图片预览" })).not.toBeInTheDocument();

    resolveOcr?.({
      regions: [
        {
          id: "ocr-region-1",
          points: [],
          text: "旧请求结果",
        },
      ],
      text: "旧请求结果",
    });

    await user.click(screen.getByRole("button", { name: "查看大图：关闭中识别图片" }));

    expect(screen.queryByText("旧请求结果")).not.toBeInTheDocument();
    expect(screen.queryByTestId("image-preview-ocr-panel")).not.toBeInTheDocument();
  });

  it("does not apply OCR phase changes after the preview component unmounts", async () => {
    const user = userEvent.setup();
    let changePhase: Parameters<typeof recognizeImageText>[0]["onPhaseChange"] | undefined;
    vi.mocked(recognizeImageText).mockImplementation(
      ({ onPhaseChange }) =>
        new Promise(() => {
          changePhase = onPhaseChange;
        }),
    );

    const { unmount } = render(
      <ImageMessageCard
        content={createImageContent({
          alt: "卸载中识别图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：卸载中识别图片" }));
    await user.click(screen.getByRole("button", { name: "提取图片文字" }));

    await vi.waitFor(() => {
      expect(recognizeImageText).toHaveBeenCalled();
    });

    unmount();

    expect(() => changePhase?.("recognizing")).not.toThrow();
  });

  it("does not show copy toast after the OCR panel unmounts", async () => {
    const user = userEvent.setup();
    let resolveClipboard: (() => void) | undefined;
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveClipboard = resolve;
        }),
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.warning).mockClear();
    vi.mocked(recognizeImageText).mockResolvedValue({
      text: "延迟复制文本",
      regions: [
        {
          id: "ocr-region-1",
          points: [],
          text: "延迟复制文本",
        },
      ],
    });

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "复制后关闭图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：复制后关闭图片" }));
    await user.click(screen.getByRole("button", { name: "提取图片文字" }));
    await screen.findByText("延迟复制文本");
    await user.click(screen.getByRole("button", { name: "复制全部识别文字" }));
    await user.click(screen.getByTestId("image-preview-backdrop"));

    expect(screen.queryByTestId("image-preview-ocr-panel")).not.toBeInTheDocument();

    await act(async () => {
      resolveClipboard?.();
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("shows a retryable error state when OCR fails", async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImageText)
      .mockRejectedValueOnce(new Error("图片加载失败：失败图片"))
      .mockResolvedValueOnce({
        text: "重试成功",
        regions: [
          {
            id: "ocr-region-1",
            points: [],
            text: "重试成功",
          },
        ],
      });

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "失败图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/text-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：失败图片" }));
    await user.click(screen.getByRole("button", { name: "提取图片文字" }));

    expect(
      await screen.findByText(
        "图片加载失败：失败图片（请检查网络或图片服务器是否允许跨域读取）",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "提取图片文字" }));

    expect(await screen.findByText("重试成功")).toBeInTheDocument();
  });

  it("shows a specific message when browser canvas security blocks OCR", async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImageText).mockRejectedValue(
      new Error(
        "Failed to execute 'texImage2D' on 'WebGL2RenderingContext': Tainted canvases may not be loaded.",
      ),
    );

    render(
      <ImageMessageCard
        content={createImageContent({
          alt: "跨域图片",
          height: 292,
          imageUrl: "https://cdn.example.com/chat/cors-photo.jpg",
          width: 668,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看大图：跨域图片" }));
    await user.click(screen.getByRole("button", { name: "提取图片文字" }));

    expect(
      await screen.findByText("图片服务器未允许跨域读取，无法在浏览器内识别这张图片"),
    ).toBeInTheDocument();
  });
});

function createImageMessage(content: ImageMessageContent): ChatMessage {
  return {
    id: "msg-image-1",
    conversationId: "conv-image",
    role: "customer",
    author: "客户",
    sender: {
      id: "sender-image",
      name: "客户",
    },
    content,
    sentAt: "2026-04-19 10:12:00",
    status: "sent",
  };
}

function createImageContent({
  alt,
  height,
  imageUrl,
  width,
}: {
  alt: string;
  height: number;
  imageUrl: string;
  width: number;
}): ImageMessageContent {
  return {
    type: "image",
    alt,
    height,
    imageUrl,
    width,
  };
}
