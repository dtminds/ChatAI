import { describe, expect, it } from "vitest";
import { resolveSendFailureReason } from "@/pages/chat/lib/send-fail-reason";

describe("resolveSendFailureReason", () => {
  it("uses the Java failReason when it has text", () => {
    expect(resolveSendFailureReason("当前机器人不在线")).toBe("当前机器人不在线");
  });

  it("falls back when failReason is missing or blank", () => {
    expect(resolveSendFailureReason()).toBe("发送失败");
    expect(resolveSendFailureReason("   ")).toBe("发送失败");
  });
});
