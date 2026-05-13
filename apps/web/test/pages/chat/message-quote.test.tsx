import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/pages/chat/chat-types";
import { MessageContentRenderer } from "@/pages/chat/components/message";

describe("MessageContentRenderer quote messages", () => {
  it("renders the quote body as a normal text bubble", () => {
    render(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "538",
          text: "正式引用消息",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByText("正式引用消息").closest('[data-testid="text-message-bubble"]'))
      .toBeInTheDocument();
  });

  it("renders a text quoted-message preview with sender name", () => {
    render(
      <MessageContentRenderer
        isAgent={false}
        message={createQuoteMessage({
          quoteMsgId: "538",
          quotedMessage: {
            contentType: "text",
            senderName: "哼 ╭(╯^╰)╮",
            text: "测试被引用",
          },
          text: "正式引用消息",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByText("哼 ╭(╯^╰)╮：测试被引用")).toBeInTheDocument();
    expect(screen.getByTestId("quote-text-preview")).toHaveClass("text-[12px]");
  });

  it("renders an image quoted-message preview as a square thumbnail", () => {
    render(
      <MessageContentRenderer
        isAgent={false}
        message={createQuoteMessage({
          quoteMsgId: "538",
          quotedMessage: {
            contentType: "image",
            imageUrl: "https://cdn.example.com/quoted.jpg",
            senderName: "范双飞",
          },
          text: "这是什么活动",
          type: "quote",
        })}
      />,
    );

    const image = screen.getByRole("img", { name: "引用图片：范双飞" });

    expect(screen.getByTestId("quote-image-preview")).toHaveClass("items-start", "text-[12px]");
    expect(screen.getByTestId("quote-image-sender")).toHaveClass("min-w-0", "shrink", "truncate");
    expect(screen.getByText("范双飞：")).toBeInTheDocument();
    expect(image).toHaveAttribute("src", "https://cdn.example.com/quoted.jpg");
    expect(image).toHaveClass("aspect-square", "object-cover");
  });

  it("renders a generic quoted-message preview with icon, title, and image", () => {
    render(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "538",
          quotedMessage: {
            contentType: "contact-card",
            imageUrl: "https://cdn.example.com/avatar.png",
            senderName: "郁佳杰",
            title: "binarywang",
          },
          text: "引用名片",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByText("郁佳杰：")).toBeInTheDocument();
    expect(screen.getByText("binarywang")).toBeInTheDocument();
    expect(screen.getByTestId("quote-generic-preview")).toHaveClass("items-start", "text-[12px]");
    expect(screen.getByTestId("quote-generic-text-row")).toHaveClass("items-center");
    expect(screen.getByTestId("quote-generic-sender")).toHaveClass(
      "min-w-0",
      "shrink",
      "truncate",
    );
    expect(screen.getByRole("img", { name: "引用预览：binarywang" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/avatar.png",
    );
  });

  it("uses original component marks for mini program, sphfeed, and voice previews", () => {
    const { rerender } = render(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "mini-program",
          quotedMessage: {
            contentType: "mini-program",
            senderName: "客服",
            title: "生椰拿铁",
          },
          text: "引用小程序",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByTestId("quote-mini-program-mark")).toBeInTheDocument();

    rerender(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "sphfeed",
          quotedMessage: {
            contentType: "sphfeed",
            senderName: "客服",
            title: "天眼新闻",
          },
          text: "引用视频号",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByTestId("quote-sphfeed-mark")).toBeInTheDocument();

    rerender(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "voice",
          quotedMessage: {
            contentType: "voice",
            senderName: "客服",
            title: "2''",
          },
          text: "引用语音",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByTestId("quote-voice-volume-icon")).toBeInTheDocument();
  });

  it("uses simplified h5, file, contact-card, and video quote icons", () => {
    const { rerender } = render(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "h5",
          quotedMessage: {
            contentType: "h5",
            senderName: "客服",
            title: "公众号链接",
          },
          text: "引用公众号链接",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByTestId("quote-h5-link-icon")).toHaveAttribute("data-icon-name", "link-04");
    expect(screen.getByTestId("quote-h5-link-icon")).toHaveClass("text-muted-foreground");

    rerender(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "file",
          quotedMessage: {
            contentType: "file",
            senderName: "客服",
            title: "报价单.pdf",
          },
          text: "引用文件",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByTestId("quote-file-attachment-icon")).toHaveAttribute(
      "data-icon-name",
      "file-empty-01",
    );
    expect(screen.getByTestId("quote-file-attachment-icon")).toHaveClass("text-muted-foreground");

    rerender(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "contact-card",
          quotedMessage: {
            contentType: "contact-card",
            senderName: "客服",
            title: "binarywang",
          },
          text: "引用名片",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByTestId("quote-contact-card-icon")).toHaveAttribute(
      "data-icon-name",
      "identity-card",
    );

    rerender(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "video",
          quotedMessage: {
            contentType: "video",
            senderName: "客服",
            title: "视频",
          },
          text: "引用视频",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByTestId("quote-video-icon")).toHaveAttribute(
      "data-icon-name",
      "play-circle-02",
    );
  });

  it("opens the quoted message when the preview is clicked or activated by keyboard", async () => {
    const user = userEvent.setup();
    const onOpenQuotedMessage = vi.fn();

    render(
      <MessageContentRenderer
        isAgent={false}
        message={createQuoteMessage({
          quoteMsgId: "538",
          quotedMessage: {
            contentType: "text",
            senderName: "哼 ╭(╯^╰)╮",
            text: "测试被引用",
          },
          text: "正式引用消息",
          type: "quote",
        })}
        onOpenQuotedMessage={onOpenQuotedMessage}
      />,
    );

    const preview = screen.getByRole("button", { name: /测试被引用/ });

    await user.click(preview);
    await user.keyboard("{Enter}");

    expect(onOpenQuotedMessage).toHaveBeenCalledTimes(2);
    expect(onOpenQuotedMessage).toHaveBeenNthCalledWith(1, "538");
    expect(onOpenQuotedMessage).toHaveBeenNthCalledWith(2, "538");
  });
});

function createQuoteMessage(content: ChatMessage["content"]): ChatMessage {
  return {
    author: "客服",
    content,
    conversationId: "conv-quote",
    id: "msg-quote",
    role: "agent",
    sender: {
      id: "agent-quote",
      name: "客服",
    },
    sentAt: "2026-05-13 10:00:00",
    status: "read",
  };
}
