import { describe, expect, it } from "vitest";
import type { ChatMessage, Conversation } from "@/pages/chat/chat-types";
import {
  buildForwardSegmentFromMessage,
  buildRecentForwardSearchResults,
  canForwardMessage,
  getMessageForwardPreview,
  MESSAGE_FORWARD_MAX_MESSAGES,
  MESSAGE_FORWARD_MAX_RECIPIENTS,
  MESSAGE_FORWARD_SEND_INTERVAL_MAX_MS,
  MESSAGE_FORWARD_SEND_INTERVAL_MIN_MS,
  MESSAGE_FORWARD_SEND_HINT,
  resolveForwardSendDelayMs,
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
  it("exposes forward limits and send delay range", () => {
    expect(MESSAGE_FORWARD_MAX_RECIPIENTS).toBe(9);
    expect(MESSAGE_FORWARD_MAX_MESSAGES).toBe(20);
    expect(MESSAGE_FORWARD_SEND_INTERVAL_MIN_MS).toBe(1000);
    expect(MESSAGE_FORWARD_SEND_INTERVAL_MAX_MS).toBe(5000);
    expect(MESSAGE_FORWARD_SEND_HINT).toBe(
      "转发的每条消息会自动间隔1-5秒，每个转发对象轮流发送",
    );

    const delays = Array.from({ length: 20 }, () => resolveForwardSendDelayMs());

    expect(delays.every((delay) => delay >= 1000 && delay <= 5000)).toBe(true);
  });

  it("builds text segment for forwardable text messages", () => {
    const message = createTextMessage("你好");

    expect(canForwardMessage(message)).toBe(true);
    expect(buildForwardSegmentFromMessage(message)).toEqual({
      text: "你好",
      type: "text",
    });
    expect(getMessageForwardPreview(message)).toBe("你好");
  });

  it("uses msgInfoId for mini-program forward segments", () => {
    const message: ChatMessage = {
      ...createTextMessage(""),
      content: {
        appName: "测试小程序",
        title: "商品详情",
        type: "mini-program",
      },
      seq: 12345,
    };

    expect(canForwardMessage(message)).toBe(true);
    expect(buildForwardSegmentFromMessage(message)).toMatchObject({
      msgInfoId: "12345",
      type: "weapp",
    });
    expect(getMessageForwardPreview(message)).toBe("商品详情");
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

  it("builds recent forward targets from loaded conversations", () => {
    const conversations: Conversation[] = [
      createConversation({
        customerName: "客户甲",
        id: "conv-current",
        mode: "single",
        thirdExternalUserId: "ext-current",
        updatedAtMs: 500,
      }),
      createConversation({
        customerName: "客户乙",
        id: "conv-single-1",
        mode: "single",
        thirdExternalUserId: "ext-1",
        updatedAtMs: 400,
      }),
      createConversation({
        customerName: "群聊一",
        id: "conv-group-1",
        mode: "group",
        thirdGroupId: "group-1",
        updatedAtMs: 300,
      }),
      createConversation({
        bizStatus: 0,
        customerName: "失效客户",
        id: "conv-inactive",
        mode: "single",
        thirdExternalUserId: "ext-inactive",
        updatedAtMs: 200,
      }),
    ];

    const results = buildRecentForwardSearchResults(conversations, {
      excludeConversationId: "conv-current",
    });

    expect(results.contacts).toHaveLength(1);
    expect(results.contacts[0]).toMatchObject({
      conversationId: "conv-single-1",
      name: "客户乙",
      thirdExternalUserId: "ext-1",
    });
    expect(results.groups).toHaveLength(1);
    expect(results.groups[0]).toMatchObject({
      conversationId: "conv-group-1",
      name: "群聊一",
      thirdGroupId: "group-1",
    });
  });
});

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    accountId: "seat-1",
    bizStatus: 1,
    customerAvatarUrl: "",
    customerId: "customer-1",
    customerName: "客户",
    id: "conv-1",
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "",
    unread: 0,
    updatedAt: "",
    ...overrides,
  };
}
