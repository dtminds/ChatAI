import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ChatMessage, ImageMessageContent } from "@/pages/chat/chat-types";
import { ImageMessageCard, MessageContentRenderer } from "@/pages/chat/components/message";

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
      maxWidth: "min(300px, 60%)",
      minWidth: "120px",
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
      maxWidth: "min(300px, 60%)",
      minWidth: "120px",
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
    status: "read",
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
