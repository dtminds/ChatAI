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
