import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatMessage, VoiceCallMessageContent } from "@/pages/chat/chat-types";
import { MessageContentRenderer } from "@/pages/chat/components/message";

function createVoiceCallMessage(
  content: VoiceCallMessageContent,
  options?: {
    isOwnMessage?: boolean;
  },
): ChatMessage {
  return {
    author: options?.isOwnMessage ? "客服" : "客户",
    content,
    conversationId: "88",
    isOwnMessage: options?.isOwnMessage,
    role: options?.isOwnMessage ? "agent" : "customer",
    sender: {
      id: options?.isOwnMessage ? "sender-agent-12" : "sender-customer-1",
      name: options?.isOwnMessage ? "客服" : "客户",
    },
    sentAt: "2026-09-18 11:00:00",
    status: "sent",
    uiMessageKey: "101",
  };
}

describe("voice call message bubble", () => {
  it("shows missed incoming copy with an unread mark", () => {
    render(
      <MessageContentRenderer
        isAgent={false}
        message={createVoiceCallMessage({
          missed: true,
          text: "对方已取消",
          type: "voice-call",
        })}
      />,
    );

    expect(screen.getByTestId("voice-call-message-bubble")).toHaveAccessibleName(
      "对方已取消 未接听",
    );
    expect(screen.getByText("对方已取消")).toBeInTheDocument();
    expect(screen.getByTestId("voice-call-missed-dot")).toBeInTheDocument();
  });

  it("keeps other-device and connected copy without a missed mark", () => {
    const { rerender } = render(
      <MessageContentRenderer
        isAgent={false}
        message={createVoiceCallMessage({
          text: "已在其它设备接听",
          type: "voice-call",
        })}
      />,
    );

    expect(screen.getByTestId("voice-call-message-bubble")).toHaveAccessibleName(
      "已在其它设备接听",
    );
    expect(screen.queryByTestId("voice-call-missed-dot")).not.toBeInTheDocument();

    rerender(
      <MessageContentRenderer
        isAgent={false}
        message={createVoiceCallMessage({
          text: "已在其它设备拒绝",
          type: "voice-call",
        })}
      />,
    );

    expect(screen.getByText("已在其它设备拒绝")).toBeInTheDocument();
    expect(screen.queryByTestId("voice-call-missed-dot")).not.toBeInTheDocument();

    rerender(
      <MessageContentRenderer
        isAgent={false}
        message={createVoiceCallMessage({
          text: "通话时长 00:08",
          type: "voice-call",
        })}
      />,
    );

    expect(screen.getByText("通话时长 00:08")).toBeInTheDocument();
    expect(screen.queryByTestId("voice-call-missed-dot")).not.toBeInTheDocument();
  });

  it("shows outgoing cancelled and rejected copy without a missed mark", () => {
    render(
      <MessageContentRenderer
        isAgent
        message={createVoiceCallMessage(
          {
            text: "已取消",
            type: "voice-call",
          },
          { isOwnMessage: true },
        )}
      />,
    );

    expect(screen.getByTestId("voice-call-message-bubble")).toHaveAccessibleName("已取消");
    expect(screen.queryByTestId("voice-call-missed-dot")).not.toBeInTheDocument();
  });
});
