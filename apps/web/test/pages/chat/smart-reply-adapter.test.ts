import { describe, expect, it } from "vitest";
import {
  adaptSmartReplySuggestions,
  collectSmartReplyMsgIds,
  getSmartReplyLookupKey,
} from "@/pages/chat/api/smart-reply-adapter";

describe("smart-reply-adapter", () => {
  it("collects the latest message seq values up to the limit", () => {
    const msgIds = collectSmartReplyMsgIds(
      Array.from({ length: 120 }, (_, index) => ({
        id: `msg-${index}`,
        seq: index + 1,
      })),
      100,
    );

    expect(msgIds).toHaveLength(100);
    expect(msgIds[0]).toBe(21);
    expect(msgIds[99]).toBe(120);
  });

  it("drops messages without seq", () => {
    expect(
      collectSmartReplyMsgIds([
        { id: "msg-001" },
        { id: "msg-002", seq: 1022692 },
      ]),
    ).toEqual([1022692]);
  });

  it("uses seq for smart reply lookup key", () => {
    expect(getSmartReplyLookupKey({ id: "wx-msg-001", seq: 1090 })).toBe("1090");
    expect(getSmartReplyLookupKey({ id: "wx-msg-001" })).toBe("wx-msg-001");
  });

  it("adapts suggestions into a message id map", () => {
    const map = adaptSmartReplySuggestions([
      {
        assistantName: "护肤小助手",
        content: "建议回复",
        messageId: "1090",
        status: "ready",
        versionCount: 2,
        versionIndex: 1,
      },
    ]);

    expect(map["1090"]).toEqual({
      assistantName: "护肤小助手",
      content: "建议回复",
      status: "ready",
      versionCount: 2,
      versionIndex: 1,
    });
  });
});
