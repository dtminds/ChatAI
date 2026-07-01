import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/pages/chat/chat-types";
import {
  canForwardMessage,
  MESSAGE_FORWARD_MAX_MESSAGES,
  MESSAGE_FORWARD_MAX_RECIPIENTS,
} from "@/pages/chat/lib/message-forward";

function createTextMessage(text: string): ChatMessage {
  return {
    author: "客服",
    content: { text, type: "text" },
    conversationId: "conv-1",
    isOwnMessage: true,
    role: "agent",
    sender: { id: "agent-1", name: "客服" },
    sentAt: "2026-06-25T10:00:00.000Z",
    status: "sent",
    uiMessageKey: "msg-1",
  };
}

describe("message-forward", () => {
  it("exposes forward selection limits", () => {
    expect(MESSAGE_FORWARD_MAX_RECIPIENTS).toBe(9);
    expect(MESSAGE_FORWARD_MAX_MESSAGES).toBe(20);
  });

  it("allows text messages and collectable material messages", () => {
    const textMessage = createTextMessage("你好");
    const fileMessage: ChatMessage = {
      ...createTextMessage(""),
      content: {
        extension: "pdf",
        fileName: "说明.pdf",
        type: "file",
      },
    };
    const voiceMessage: ChatMessage = {
      ...createTextMessage(""),
      content: {
        audioUrl: "https://example.com/voice.mp3",
        durationLabel: "3''",
        type: "voice",
      },
    };

    expect(canForwardMessage(textMessage)).toBe(true);
    expect(canForwardMessage(fileMessage)).toBe(true);
    expect(canForwardMessage(voiceMessage)).toBe(false);
  });
});
