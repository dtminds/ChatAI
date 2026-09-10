import { describe, expect, it } from "vitest";
import { resolveSendFailureTooltip } from "@/pages/chat/lib/send-fail-reason";

describe("resolveSendFailureTooltip", () => {
  it("uses the Java failReason when it has text", () => {
    expect(resolveSendFailureTooltip("当前机器人不在线")).toBe("当前机器人不在线");
  });

  it("falls back when failReason is missing or blank", () => {
    expect(resolveSendFailureTooltip()).toBe("发送失败");
    expect(resolveSendFailureTooltip("   ")).toBe("发送失败");
  });
});
