import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageRow } from "@/pages/chat/components/message-feed";
import { TextMessageBubble } from "@/pages/chat/components/message";
import type { ChatMessage } from "@/pages/chat/chat-types";

describe("text message bubble layout", () => {
  it("caps text bubbles to 90 percent of the message row", () => {
    render(<MessageRow message={createTextMessage("短消息")} />);

    expect(screen.getByTestId("message-row-group")).toHaveClass("max-w-[90%]");
    expect(screen.getByTestId("message-content-stack")).toHaveClass("max-w-full");
    expect(screen.getByText("短消息").closest('[data-testid="text-message-bubble"]')).toHaveClass(
      "max-w-full",
    );
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
          remoteMessageId: "opt-001",
          status: "accepted",
        }}
      />,
    );

    expect(screen.getByText("发送中...")).toBeInTheDocument();
  });

  it("does not show sending state after optimistic messages are reconciled", () => {
    render(
      <MessageRow
        message={{
          ...createTextMessage("已确认消息"),
          optNo: "opt-001",
          remoteMessageId: "remote-001",
          status: "read",
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
          id: "sys-layout",
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

  it("does not show a sender name for single chat messages", () => {
    render(<MessageRow message={createTextMessage("单聊消息")} />);

    expect(screen.queryByText("成员甲")).not.toBeInTheDocument();
  });
});

function createTextMessage(text: string): ChatMessage {
  return {
    id: "msg-text-layout",
    conversationId: "conv-layout",
    role: "agent",
    author: "客服",
    sender: {
      id: "agent-layout",
      name: "客服",
    },
    content: {
      type: "text",
      text,
    },
    sentAt: "2026-05-08 09:54:00",
    status: "read",
  };
}
