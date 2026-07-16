import { describe, expect, it } from "vitest";
import {
  CONVERSATION_HANDOFF_TAKEOVER_PREVIEW_PREFIX,
  getConversationHandoffTakeoverPreviewParts,
} from "@/pages/chat/lib/conversation-handoff-preview";

describe("getConversationHandoffTakeoverPreviewParts", () => {
  it("strips Agent handoff system preview into takeover reminder parts", () => {
    expect(
      getConversationHandoffTakeoverPreviewParts(
        "Agent 转人工处理：客户明确要求转人工，同时存在不满情绪，符合handoff规则",
      ),
    ).toEqual({
      body: "客户明确要求转人工，同时存在不满情绪，符合handoff规则",
      prefix: CONVERSATION_HANDOFF_TAKEOVER_PREVIEW_PREFIX,
    });
  });

  it("restyles previews that already start with the takeover reminder prefix", () => {
    expect(
      getConversationHandoffTakeoverPreviewParts("[接管提醒]客户明确要求转人工"),
    ).toEqual({
      body: "客户明确要求转人工",
      prefix: CONVERSATION_HANDOFF_TAKEOVER_PREVIEW_PREFIX,
    });
  });

  it("keeps ordinary preview text as the body when wait_manual is on", () => {
    expect(getConversationHandoffTakeoverPreviewParts("请尽快处理")).toEqual({
      body: "请尽快处理",
      prefix: CONVERSATION_HANDOFF_TAKEOVER_PREVIEW_PREFIX,
    });
  });
});
