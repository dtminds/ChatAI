import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRow, MESSAGE_SENT_AT_HOVER_DELAY_MS } from "@/pages/chat/components/message-feed";
import { TextMessageBubble } from "@/pages/chat/components/message";
import type { ChatMessage } from "@/pages/chat/chat-types";
import {
  installChatWorkbenchTestEnvironment,
  resetChatWorkbenchTestState,
} from "./workbench-test-utils";

describe("text message bubble layout", () => {
  beforeEach(() => {
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("shrinks failed media message stacks to their content width", () => {
    render(
      <MessageRow
        message={{
          ...createTextMessage("视频"),
          content: {
            alt: "视频",
            coverImageUrl: "https://example.com/video-cover.jpg",
            durationLabel: "0:08",
            height: 240,
            type: "video",
            videoUrl: "https://example.com/video.mp4",
            width: 320,
          },
          status: "failed",
        }}
        onRetryMessage={() => undefined}
      />,
    );

    const contentStack = screen.getByTestId("message-content-stack");
    const contentRow = screen.getByTestId("message-inline-content-row");
    const retrySlot = screen.getByTestId("message-inline-status-slot");

    expect(contentRow).toHaveClass("w-fit", "max-w-full");
    expect(contentStack).toHaveClass("w-fit", "max-w-full");
    expect(contentRow).toContainElement(retrySlot);
    expect(contentRow).toContainElement(contentStack);
    expect(contentStack).not.toContainElement(retrySlot);
  });

  it("forces long words and URLs to wrap inside the bubble", () => {
    render(
      <TextMessageBubble
        isAgent={false}
        text="https://example.com/verylongpathwithoutbreakpoints/abcdefghijklmnopqrstuvwxyz0123456789"
      />,
    );

    const bubble = screen.getByTestId("text-message-bubble");
    const text = screen.getByText(/verylongpathwithoutbreakpoints/);

    expect(bubble).toHaveClass("max-w-full");
    expect(text).toHaveStyle({
      overflowWrap: "anywhere",
      wordBreak: "break-word",
    });
  });

  it("shows the sender name for other group members", () => {
    render(
      <MessageRow
        message={{
          ...createTextMessage("群消息"),
          isGroupConversation: true,
          isOwnMessage: false,
          role: "customer",
          sender: {
            ...createTextMessage("群消息").sender,
            name: "成员甲",
          },
          senderDisplayName: "成员甲",
        }}
      />,
    );

    expect(screen.getByText("成员甲")).toBeInTheDocument();
  });

  it("shows revoked state under a text message", () => {
    render(<MessageRow message={{ ...createTextMessage("原始文本"), isRevoked: true }} />);

    expect(screen.getByText("原始文本")).toBeInTheDocument();
    expect(screen.getByText("已撤回")).toBeInTheDocument();
  });

  it("shows sending state for accepted optimistic messages", () => {
    render(
      <MessageRow
        message={{
          ...createTextMessage("待确认消息"),
          optNo: "opt-001",
          msgid: "opt-001",
          status: "accepted",
        }}
      />,
    );

    const sendingState = screen.getByRole("status", { name: "发送中" });

    expect(sendingState).toBeInTheDocument();
    expect(screen.getByTestId("message-inline-status-slot")).toContainElement(sendingState);
  });

  it("anchors quote sending state to the quote text bubble instead of quoted preview", () => {
    render(
      <MessageRow
        message={{
          ...createTextMessage("看看"),
          content: {
            quoteMsgId: "quote-video-001",
            quotedMessage: {
              contentType: "video",
              imageUrl: "https://cdn.example.com/cover.jpg",
              senderName: "lsave",
              title: "[视频]",
            },
            text: "看看",
            type: "quote",
          },
          optNo: "opt-quote-001",
          msgid: "opt-quote-001",
          status: "accepted",
        }}
      />,
    );

    const textBubble = screen.getByTestId("text-message-bubble");
    const sendingSlot = screen.getByTestId("message-inline-status-slot");
    const quotePreview = screen.getByTestId("quote-generic-preview");

    expect(screen.getByRole("status", { name: "发送中" })).toBeInTheDocument();
    expect(textBubble.parentElement).toContainElement(sendingSlot);
    expect(textBubble.parentElement).not.toContainElement(quotePreview);
  });

  it("anchors quote retry icon to the quote text bubble instead of quoted preview", () => {
    render(
      <MessageRow
        message={{
          ...createTextMessage("看看"),
          content: {
            quoteMsgId: "quote-video-001",
            quotedMessage: {
              contentType: "video",
              imageUrl: "https://cdn.example.com/cover.jpg",
              senderName: "lsave",
              title: "[视频]",
            },
            text: "看看",
            type: "quote",
          },
          status: "failed",
        }}
        onRetryMessage={() => undefined}
      />,
    );

    const textBubble = screen.getByTestId("text-message-bubble");
    const retrySlot = screen.getByTestId("message-inline-status-slot");
    const quotePreview = screen.getByTestId("quote-generic-preview");

    expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    expect(textBubble.parentElement).toContainElement(retrySlot);
    expect(textBubble.parentElement).not.toContainElement(quotePreview);
  });

  it("shows retry loading state for failed messages being resent", () => {
    render(
      <MessageRow
        isRetryingMessage
        message={{
          ...createTextMessage("重试中"),
          status: "failed",
        }}
        onRetryMessage={() => undefined}
      />,
    );

    const retryButton = screen.getByRole("button", { name: "正在重试发送" });

    expect(retryButton).toBeDisabled();
    expect(retryButton).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "重试发送" })).not.toBeInTheDocument();
  });

  it("does not show sending state after optimistic messages are reconciled", () => {
    render(
      <MessageRow
        message={{
          ...createTextMessage("已确认消息"),
          optNo: "opt-001",
          msgid: "remote-001",
          status: "sent",
        }}
      />,
    );

    expect(screen.queryByText("发送中...")).not.toBeInTheDocument();
  });

  it("shows revoked state under a non-text message", () => {
    render(
      <MessageRow
        message={{
          ...createTextMessage("图片"),
          content: {
            alt: "图片",
            imageUrl: "https://example.com/image.png",
            type: "image",
          },
          isRevoked: true,
        }}
      />,
    );

    expect(screen.getByText("已撤回")).toBeInTheDocument();
  });

  it("does not show revoked state for system messages", () => {
    render(
      <MessageRow
        message={{
          author: "系统",
          content: {
            text: "系统提示",
            type: "system",
          },
          conversationId: "conv-layout",
          uiMessageKey: "sys-layout",
          isRevoked: true,
          role: "system",
          sentAt: "2026-05-08 09:54:00",
          status: "sent",
        }}
      />,
    );

    expect(screen.getByText("系统提示")).toBeInTheDocument();
    expect(screen.queryByText("已撤回")).not.toBeInTheDocument();
  });

  it("renders system messages like a centered divider without avatar actions", () => {
    render(
      <MessageRow
        message={{
          author: "系统",
          content: {
            text: "客户已加入群聊",
            type: "system",
          },
          conversationId: "conv-layout",
          uiMessageKey: "sys-layout",
          role: "system",
          sentAt: "2026-05-08 09:54:00",
          status: "sent",
        }}
      />,
    );

    const systemMessage = screen.getByText("客户已加入群聊");
    const systemNotice = systemMessage.closest('[data-testid="system-message-notice"]');

    expect(systemNotice).toBeInTheDocument();
    expect(screen.queryByTestId("message-row")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "消息操作" })).not.toBeInTheDocument();
  });

  it("does not show a sender name for single chat messages", () => {
    render(<MessageRow message={createTextMessage("单聊消息")} />);

    expect(screen.queryByText("成员甲")).not.toBeInTheDocument();
  });

  it("shows sent time above a text bubble after hovering the message row", () => {
    vi.useFakeTimers();

    try {
      render(<MessageRow message={createTextMessage("hover查看时间")} />);

      const sentAt = screen.getByTestId("text-message-sent-at");
      const row = screen.getByTestId("message-row");

      expect(sentAt).toHaveClass("opacity-0");
      expect(sentAt).toHaveTextContent("5/8 09:54");

      fireEvent.mouseEnter(row);
      act(() => {
        vi.advanceTimersByTime(MESSAGE_SENT_AT_HOVER_DELAY_MS - 1);
      });
      expect(sentAt).toHaveClass("opacity-0");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(sentAt).toHaveClass("opacity-100");
      expect(
        sentAt.compareDocumentPosition(screen.getByTestId("message-row-body")),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

      fireEvent.mouseLeave(row);
      expect(sentAt).toHaveClass("opacity-0");
    } finally {
      vi.useRealTimers();
    }
  });
});

function createTextMessage(text: string): ChatMessage {
  return {
    uiMessageKey: "msg-text-layout",
    msgid: "msg-text-layout",
    conversationId: "conv-layout",
    role: "agent" as const,
    author: "客服",
    sender: {
      id: "agent-layout",
      name: "客服",
    },
    content: {
      type: "text" as const,
      text,
    },
    sentAt: "2026-05-08 09:54:00",
    status: "sent" as const,
  };
}
