import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/pages/chat/chat-types";
import {
  buildQuotedMessagePreview,
  isUnavailableQuotedMessagePreview,
  mergeQuoteMessageContent,
  resolveQuoteMessageContent,
  resolveQuoteMessagesInList,
} from "@/pages/chat/lib/quote-message";

function createTextMessage(input: {
  id: string;
  remoteMessageId?: string;
  seq?: number;
  text: string;
  senderName?: string;
}): ChatMessage {
  return {
    author: input.senderName ?? "客户",
    content: {
      text: input.text,
      type: "text",
    },
    conversationId: "conv-001",
    id: input.id,
    isGroupConversation: true,
    isOwnMessage: false,
    remoteMessageId: input.remoteMessageId ?? input.id,
    role: "customer",
    sender: {
      id: "sender-customer-1",
      name: input.senderName ?? "客户",
    },
    sentAt: "2026-05-29 10:00:00",
    seq: input.seq,
    status: "sent",
  };
}

describe("quote-message helpers", () => {
  it("treats missing and backend fallback previews as unavailable", () => {
    expect(isUnavailableQuotedMessagePreview(undefined)).toBe(true);
    expect(
      isUnavailableQuotedMessagePreview({
        contentType: "text",
        senderName: "",
        text: "引用消息不可用",
      }),
    ).toBe(true);
  });

  it("resolves unavailable quote previews from loaded messages by seq", () => {
    const source = createTextMessage({
      id: "remote-msg-538",
      seq: 538,
      text: "@帅庆 你好啊",
    });
    const quoteMessage: ChatMessage = {
      ...createTextMessage({
        id: "remote-msg-900",
        seq: 900,
        text: "收到",
        senderName: "客服",
      }),
      isOwnMessage: true,
      role: "agent",
      content: {
        quoteMsgId: "538",
        quotedMessage: {
          contentType: "text",
          senderName: "",
          text: "引用消息不可用",
        },
        text: "收到",
        type: "quote",
      },
    };

    expect(resolveQuoteMessagesInList([source, quoteMessage])).toMatchObject([
      {},
      {
        content: {
          quotedMessage: {
            text: "@帅庆 你好啊",
          },
        },
      },
    ]);
  });

  it("resolves unavailable previews by copied message id when seq differs", () => {
    const source = createTextMessage({
      id: "1009005",
      remoteMessageId: "1009005",
      seq: 8_291_005,
      text: "@帅庆 你好啊",
    });
    const resolved = resolveQuoteMessageContent(
      {
        quoteMsgId: "1009005",
        quotedMessage: {
          contentType: "text",
          senderName: "",
          text: "引用消息不可用",
        },
        text: "回复一下",
        type: "quote",
      },
      [source],
    );

    expect(resolved.quotedMessage).toMatchObject({
      text: "@帅庆 你好啊",
    });
  });

  it("resolves unavailable previews by quotedMessageId when quoteMsgId is audit seq", () => {
    const source = createTextMessage({
      id: "1009005",
      remoteMessageId: "1009005",
      seq: 8_291_005,
      text: "@帅庆 你好啊",
    });
    const resolved = resolveQuoteMessageContent(
      {
        quoteMsgId: "8291005",
        quotedMessage: {
          contentType: "text",
          senderName: "",
          text: "引用消息不可用",
        },
        quotedMessageId: "1009005",
        text: "回复一下",
        type: "quote",
      },
      [source],
    );

    expect(resolved.quotedMessage).toMatchObject({
      text: "@帅庆 你好啊",
    });
  });

  it("keeps optimistic quote previews when server returns unavailable preview", () => {
    const optimisticPreview = {
      contentType: "text" as const,
      senderName: "群内成员",
      text: "@帅庆 你好啊",
    };
    const merged = mergeQuoteMessageContent(
      {
        quoteMsgId: "8291005",
        quotedMessage: optimisticPreview,
        text: "回复一下",
        type: "quote",
      },
      {
        quoteMsgId: "1009005",
        quotedMessage: {
          contentType: "text",
          senderName: "",
          text: "引用消息不可用",
        },
        text: "回复一下",
        type: "quote",
      },
    );

    expect(merged.quotedMessage).toEqual(optimisticPreview);
    expect(merged.quoteMsgId).toBe("8291005");
  });

  it("builds quote reference id from message seq only", () => {
    expect(
      buildQuotedMessagePreview(
        createTextMessage({
          id: "1009005",
          remoteMessageId: "1009005",
          seq: 8_291_005,
          text: "原消息",
        }),
      ),
    ).toMatchObject({
      quoteMsgId: "8291005",
      quotedMessageId: "1009005",
      text: "原消息",
    });
  });
});
