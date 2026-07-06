import { fireEvent, render, screen } from "@testing-library/react";
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
            senderName: "Sender Alpha",
            text: "测试被引用",
          },
          text: "正式引用消息",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByText("Sender Alpha：测试被引用")).toBeInTheDocument();
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
            senderName: "Alex Sender",
          },
          text: "这是什么活动",
          type: "quote",
        })}
      />,
    );

    const image = screen.getByRole("img", { name: "引用图片：Alex Sender" });

    expect(screen.getByText("Alex Sender：")).toBeInTheDocument();
    expect(image).toHaveAttribute("src", "https://cdn.example.com/quoted.jpg");
  });

  it("renders a fallback thumbnail when a quoted image fails to load", () => {
    render(
      <MessageContentRenderer
        isAgent={false}
        message={createQuoteMessage({
          quoteMsgId: "538",
          quotedMessage: {
            contentType: "image",
            imageUrl: "https://cdn.example.com/broken.jpg",
            senderName: "Alex Sender",
          },
          text: "这是什么活动",
          type: "quote",
        })}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "引用图片：Alex Sender" }));

    expect(screen.getByRole("img", { name: "引用图片不可用" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "引用图片：Alex Sender" })).not.toBeInTheDocument();
  });

  it("renders a fallback thumbnail when a quoted image URL is empty", () => {
    render(
      <MessageContentRenderer
        isAgent={false}
        message={createQuoteMessage({
          quoteMsgId: "538",
          quotedMessage: {
            contentType: "image",
            imageUrl: "   ",
            senderName: "Alex Sender",
          },
          text: "这是什么活动",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "引用图片不可用" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "引用图片：Alex Sender" })).not.toBeInTheDocument();
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
            senderName: "Casey Sender",
            title: "binarywang",
          },
          text: "引用名片",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByText("Casey Sender：")).toBeInTheDocument();
    expect(screen.getByText("binarywang")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "引用预览：binarywang" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/avatar.png",
    );
  });

  it("renders a fallback thumbnail when a generic quoted preview image fails to load", () => {
    render(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "538",
          quotedMessage: {
            contentType: "contact-card",
            imageUrl: "https://cdn.example.com/broken-avatar.png",
            senderName: "Casey Sender",
            title: "binarywang",
          },
          text: "引用名片",
          type: "quote",
        })}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "引用预览：binarywang" }));

    expect(screen.getByRole("img", { name: "引用预览图片不可用" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "引用预览：binarywang" })).not.toBeInTheDocument();
  });

  it("uses original component marks for mini program, sphfeed, and voice previews", () => {
    const { rerender } = render(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "mini-program",
          quotedMessage: {
            contentType: "mini-program",
            senderName: "Support Agent",
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
            senderName: "Support Agent",
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
            senderName: "Support Agent",
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
            senderName: "Support Agent",
            title: "公众号链接",
          },
          text: "引用公众号链接",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByTestId("quote-h5-link-icon")).toHaveAttribute("data-icon-name", "link-04");

    rerender(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "file",
          quotedMessage: {
            contentType: "file",
            senderName: "Support Agent",
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

    rerender(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "contact-card",
          quotedMessage: {
            contentType: "contact-card",
            senderName: "Support Agent",
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
            senderName: "Support Agent",
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

  it("renders a fallback thumbnail when a quoted video has no image", () => {
    render(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "video-without-cover",
          quotedMessage: {
            contentType: "video",
            imageUrl: "   ",
            senderName: "Support Agent",
            title: "视频",
          },
          text: "引用视频",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "引用视频封面不可用：视频" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "引用预览：视频" })).not.toBeInTheDocument();
  });

  it("renders a quoted video cover image when it is available", () => {
    render(
      <MessageContentRenderer
        isAgent={true}
        message={createQuoteMessage({
          quoteMsgId: "video-with-cover",
          quotedMessage: {
            contentType: "video",
            imageUrl: "https://cdn.example.com/video-cover.jpg",
            senderName: "Support Agent",
            title: "视频",
          },
          text: "引用视频",
          type: "quote",
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "引用预览：视频" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/video-cover.jpg",
    );
    expect(screen.queryByTestId("quote-video-fallback")).not.toBeInTheDocument();
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
            senderName: "Sender Alpha",
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
    author: "Support Agent",
    content,
    conversationId: "conv-quote",
    msgid: "msg-quote",
    role: "agent",
    sender: {
      id: "agent-quote",
      name: "Support Agent",
    },
    sentAt: "2026-05-13 10:00:00",
    status: "sent",
    uiMessageKey: "msg-quote",
  };
}
