// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Message } from "@/pages/chat/chat-types";
import { getFirstUnreadCustomerMessageKey } from "@/pages/chat/hooks/use-visible-unread-conversation-read";

function createCustomerMessage(uiMessageKey: string): Message {
  return {
    author: "客户",
    content: {
      text: "新消息",
      type: "text",
    },
    conversationId: "conv-001",
    role: "customer",
    sender: {
      id: "sender-cust-001",
      name: "客户",
    },
    sentAt: "2026-04-14 19:18:50",
    status: "sent",
    uiMessageKey,
  };
}

function createAgentMessage(uiMessageKey: string): Message {
  return {
    author: "客服",
    content: {
      text: "已回复",
      type: "text",
    },
    conversationId: "conv-001",
    role: "agent",
    sender: {
      id: "sender-agent-001",
      name: "客服",
    },
    sentAt: "2026-04-14 19:18:40",
    status: "sent",
    uiMessageKey,
  };
}

function createSystemMessage(uiMessageKey: string): Message {
  return {
    author: "系统",
    content: {
      text: "系统提示",
      type: "system",
    },
    conversationId: "conv-001",
    role: "system",
    sentAt: "2026-04-14 19:18:40",
    status: "sent",
    uiMessageKey,
  };
}

describe("getFirstUnreadCustomerMessageKey", () => {
  it("returns undefined when there is nothing unread", () => {
    expect(getFirstUnreadCustomerMessageKey([], 0)).toBeUndefined();
    expect(
      getFirstUnreadCustomerMessageKey([createCustomerMessage("customer")], 0),
    ).toBeUndefined();
  });

  it("skips empty message slots when finding the first unread customer message", () => {
    const messages = new Array<Message>(2);
    messages[1] = createCustomerMessage("sparse-customer-message");

    expect(getFirstUnreadCustomerMessageKey(messages, 2)).toBe(
      "sparse-customer-message",
    );
  });

  it("skips system and agent messages in the unread tail", () => {
    const messages = [
      createCustomerMessage("read-customer"),
      createAgentMessage("unread-agent"),
      createSystemMessage("unread-system"),
      createCustomerMessage("unread-customer"),
    ];

    expect(getFirstUnreadCustomerMessageKey(messages, 3)).toBe("unread-customer");
  });

  it("returns undefined when the unread tail has no customer message", () => {
    const messages = [
      createCustomerMessage("read-customer"),
      createAgentMessage("unread-agent"),
      createSystemMessage("unread-system"),
    ];

    expect(getFirstUnreadCustomerMessageKey(messages, 2)).toBeUndefined();
  });
});
