import { describe, expect, it } from "vitest";
import {
  filterConversationsByView,
  resolveConversationView,
} from "@/pages/chat/lib/conversation-view";
import type { Conversation } from "@/pages/chat/chat-types";

function createConversation(
  overrides: Partial<Omit<Conversation, "id" | "mode">> &
    Pick<Conversation, "id" | "mode">,
): Conversation {
  const { id, mode, ...rest } = overrides;

  return {
    accountId: "account-1",
    conversationAIHostingSwitch: false,
    handoffMsgId: 0,
    customerAvatarUrl: "",
    customerBindType: mode === "single" ? 1 : undefined,
    customerId: `customer-${id}`,
    customerName: id,
    id,
    lastMessageId: 100,
    mode,
    preview: "",
    priority: "medium",
    quietFor: "刚刚",
    replied: true,
    unread: 0,
    updatedAt: "2026-06-24 10:00:00",
    ...rest,
  };
}

describe("conversation view helpers", () => {
  it("falls back to all when the requested view is unavailable for the mode", () => {
    expect(resolveConversationView("ai", "group", true)).toBe("all");
    expect(resolveConversationView("human", "group", true)).toBe("all");
    expect(resolveConversationView("ai", "single", false)).toBe("all");
    expect(resolveConversationView("human", "single", false)).toBe("all");
    expect(resolveConversationView("unread", "group", false)).toBe("unread");
    expect(resolveConversationView("read-unreplied", "group", false)).toBe("all");
    expect(resolveConversationView("read-unreplied", "single", false)).toBe(
      "read-unreplied",
    );
  });

  it("filters conversations by mode and resolved view", () => {
    const conversations = [
      createConversation({
        conversationAIHostingSwitch: true,
        id: "single-ai",
        mode: "single",
      }),
      createConversation({
        conversationAIHostingSwitch: false,
        id: "single-human",
        mode: "single",
      }),
      createConversation({
        conversationAIHostingSwitch: undefined,
        id: "single-unknown",
        mode: "single",
      }),
      createConversation({
        id: "single-unread",
        mode: "single",
        unread: 2,
      }),
      createConversation({
        id: "group-unread",
        mode: "group",
        unread: 1,
      }),
      createConversation({
        conversationAIHostingSwitch: true,
        customerBindType: 2,
        id: "single-app-message",
        mode: "single",
      }),
      createConversation({
        conversationAIHostingSwitch: true,
        id: "group-ai-switch",
        mode: "group",
      }),
    ];

    expect(
      filterConversationsByView(conversations, "single", "ai", true).map(
        (conversation) => conversation.id,
      ),
    ).toEqual(["single-ai"]);
    expect(
      filterConversationsByView(conversations, "single", "human", true).map(
        (conversation) => conversation.id,
      ),
    ).toEqual(["single-human", "single-unknown", "single-unread", "single-app-message"]);
    expect(
      filterConversationsByView(conversations, "group", "ai", true).map(
        (conversation) => conversation.id,
      ),
    ).toEqual(["group-unread", "group-ai-switch"]);
    expect(
      filterConversationsByView(conversations, "group", "unread", true).map(
        (conversation) => conversation.id,
      ),
    ).toEqual(["group-unread"]);
  });

  it("keeps retained conversations in a view while still accepting new matches", () => {
    const conversations = [
      createConversation({
        id: "single-retained-read",
        mode: "single",
        unread: 0,
      }),
      createConversation({
        id: "single-new-unread",
        mode: "single",
        unread: 2,
      }),
      createConversation({
        id: "group-retained-read",
        mode: "group",
        unread: 0,
      }),
    ];

    expect(
      filterConversationsByView(
        conversations,
        "single",
        "unread",
        false,
        new Set(["single-retained-read", "group-retained-read"]),
      ).map((conversation) => conversation.id),
    ).toEqual(["single-retained-read", "single-new-unread"]);
  });

  it("filters locally for non-application single conversations that have been read but not replied", () => {
    const conversations = [
      createConversation({
        id: "matching",
        mode: "single",
        replied: false,
      }),
      createConversation({
        id: "unread",
        mode: "single",
        replied: false,
        unread: 1,
      }),
      createConversation({
        id: "replied",
        mode: "single",
        replied: true,
      }),
      createConversation({
        id: "no-message",
        lastMessageId: undefined,
        mode: "single",
        replied: false,
      }),
      createConversation({
        customerBindType: 2,
        id: "application-message",
        mode: "single",
        replied: false,
      }),
      createConversation({
        id: "missing-reply-state",
        mode: "single",
        replied: undefined,
      }),
      createConversation({
        id: "group",
        mode: "group",
        replied: false,
      }),
    ];

    expect(
      filterConversationsByView(
        conversations,
        "single",
        "read-unreplied",
        false,
      ).map((conversation) => conversation.id),
    ).toEqual(["matching"]);
  });

  it("keeps read-unreplied matches stable while accepting new local matches", () => {
    const conversations = [
      createConversation({
        id: "replied-after-entry",
        mode: "single",
        replied: true,
      }),
      createConversation({
        id: "new-match",
        mode: "single",
        replied: false,
      }),
    ];

    expect(
      filterConversationsByView(
        conversations,
        "single",
        "read-unreplied",
        false,
        new Set(["replied-after-entry"]),
      ).map((conversation) => conversation.id),
    ).toEqual(["replied-after-entry", "new-match"]);
  });
});
