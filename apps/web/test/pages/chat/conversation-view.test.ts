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
    aiHosted: false,
    agentMode: "semi",
    customerAvatarUrl: "",
    customerId: `customer-${id}`,
    customerName: id,
    id,
    mode,
    preview: "",
    priority: "medium",
    quietFor: "刚刚",
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
  });

  it("filters conversations by mode and resolved view", () => {
    const conversations = [
      createConversation({
        aiHosted: true,
        id: "single-ai",
        mode: "single",
      }),
      createConversation({
        aiHosted: false,
        id: "single-human",
        mode: "single",
      }),
      createConversation({
        aiHosted: undefined,
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
    ).toEqual(["single-human", "single-unknown", "single-unread"]);
    expect(
      filterConversationsByView(conversations, "group", "ai", true).map(
        (conversation) => conversation.id,
      ),
    ).toEqual(["group-unread"]);
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
});
