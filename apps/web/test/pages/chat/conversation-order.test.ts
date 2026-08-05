import { describe, expect, it } from "vitest";
import type { Conversation } from "@/pages/chat/chat-types";
import {
  sortConversationsForDisplay,
  type ConversationPromotion,
} from "@/pages/chat/lib/conversation-order";

function createConversation(
  id: string,
  updatedAtMs: number,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    accountId: "seat-1",
    conversationAIHostingSwitch: false,
    customerAvatarUrl: "",
    customerId: `customer-${id}`,
    customerName: id,
    handoffMsgId: 0,
    id,
    mode: "single",
    preview: id,
    priority: "medium",
    quietFor: "",
    unread: 0,
    updatedAt: String(updatedAtMs),
    updatedAtMs,
    ...overrides,
  };
}

describe("sortConversationsForDisplay", () => {
  it("temporarily places the opened conversation first without changing real data", () => {
    const newest = createConversation("newest", 300, { isPinned: true });
    const target = createConversation("target", 100);
    const originalTarget = { ...target };
    const promotion: ConversationPromotion = {
      accountId: "seat-1",
      baselineUpdatedAtMs: 300,
      conversationId: "target",
      mode: "single",
    };

    const result = sortConversationsForDisplay(
      [target, newest],
      promotion,
    );

    expect(result.map((conversation) => conversation.id)).toEqual([
      "target",
      "newest",
    ]);
    expect(target).toEqual(originalTarget);
    expect(result[0]).toBe(target);
  });

  it("allows genuinely new activity after opening to move ahead of the target", () => {
    const target = createConversation("target", 100);
    const previouslyNewest = createConversation("previously-newest", 300, {
      isPinned: true,
    });
    const newlyActive = createConversation("newly-active", 301);

    const result = sortConversationsForDisplay(
      [target, previouslyNewest, newlyActive],
      {
        accountId: "seat-1",
        baselineUpdatedAtMs: 300,
        conversationId: "target",
        mode: "single",
      },
    );

    expect(result.map((conversation) => conversation.id)).toEqual([
      "newly-active",
      "target",
      "previously-newest",
    ]);
  });

  it("ignores a promotion outside the rendered seat and chat type", () => {
    const pinned = createConversation("pinned", 100, { isPinned: true });
    const newer = createConversation("newer", 300);

    const result = sortConversationsForDisplay(
      [newer, pinned],
      {
        accountId: "another-seat",
        baselineUpdatedAtMs: 300,
        conversationId: "newer",
        mode: "single",
      },
    );

    expect(result.map((conversation) => conversation.id)).toEqual([
      "pinned",
      "newer",
    ]);
  });
});
