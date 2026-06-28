import { describe, expect, it } from "vitest";
import {
  buildConversationComposerDraft,
  getConversationComposerDraftPreview,
  hasConversationComposerDraftContent,
  isConversationListedInWorkbench,
} from "@/pages/chat/lib/conversation-composer-draft";
import type { Conversation } from "@/pages/chat/chat-types";

describe("conversation composer draft", () => {
  it("checks whether a conversation still exists in cached workbench lists", () => {
    const conversationListsByScope: Record<string, Conversation[]> = {
      drc: [
        {
          accountId: "drc",
          conversationAIHostingSwitch: false,
          customerAvatarUrl: "https://example.com/customer.png",
          customerId: "customer-1",
          customerName: "客户 A",
          id: "conv-001",
          mode: "single",
          preview: "preview",
          priority: "medium",
          quietFor: "刚刚",
          unread: 0,
          updatedAt: "2026-05-07 09:00:00",
        },
      ],
    };

    expect(
      isConversationListedInWorkbench(conversationListsByScope, "conv-001"),
    ).toBe(true);
    expect(
      isConversationListedInWorkbench(conversationListsByScope, "conv-002"),
    ).toBe(false);
  });

  it("detects draft content from text, segments, or quote preview", () => {
    expect(
      hasConversationComposerDraftContent(
        buildConversationComposerDraft({
          draft: "  ",
          quotedMessage: null,
          segments: [],
        }),
      ),
    ).toBe(false);

    expect(
      hasConversationComposerDraftContent(
        buildConversationComposerDraft({
          draft: "待发送",
          quotedMessage: null,
          segments: [{ text: "待发送", type: "text" }],
        }),
      ),
    ).toBe(true);
  });

  it("formats draft preview with a draft prefix", () => {
    expect(
      getConversationComposerDraftPreview(
        buildConversationComposerDraft({
          draft: "你好",
          quotedMessage: null,
          segments: [{ text: "你好", type: "text" }],
        }),
      ),
    ).toBe("[草稿]你好");

    expect(
      getConversationComposerDraftPreview(
        buildConversationComposerDraft({
          draft: "",
          quotedMessage: {
            contentType: "text",
            senderName: "客户",
            text: "原消息",
          },
          segments: [],
        }),
      ),
    ).toBe("[草稿][引用消息]");
  });

  it("preserves lite attachment segments in draft content and preview", () => {
    const draft = buildConversationComposerDraft({
      draft: "",
      quotedMessage: null,
      segments: [
        {
          desc: "活动说明",
          href: "https://example.com/activity",
          materialCollectionId: "material-h5-001",
          title: "活动链接",
          type: "h5",
        },
      ],
    });

    expect(hasConversationComposerDraftContent(draft)).toBe(true);
    expect(draft.segments).toEqual([
      {
        desc: "活动说明",
        href: "https://example.com/activity",
        materialCollectionId: "material-h5-001",
        title: "活动链接",
        type: "h5",
      },
    ]);
    expect(getConversationComposerDraftPreview(draft)).toBe("[草稿][链接]");
  });
});
