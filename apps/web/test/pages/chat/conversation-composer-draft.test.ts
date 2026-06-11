import { describe, expect, it } from "vitest";
import {
  buildConversationComposerDraft,
  getConversationComposerDraftPreview,
  hasConversationComposerDraftContent,
} from "@/pages/chat/lib/conversation-composer-draft";

describe("conversation composer draft", () => {
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
});
