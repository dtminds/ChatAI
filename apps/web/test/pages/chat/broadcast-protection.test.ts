import { describe, expect, it } from "vitest";
import { formatBroadcastProtectionEta } from "@/pages/chat/lib/broadcast-protection";

describe("formatBroadcastProtectionEta", () => {
  it.each([
    [1, "5 分钟内"],
    [5, "5 分钟内"],
    [6, "5～15 分钟"],
    [15, "5～15 分钟"],
    [16, "15～30 分钟"],
    [30, "15～30 分钟"],
    [31, "30～60 分钟"],
    [60, "30～60 分钟"],
    [61, "1～2 小时"],
    [120, "1～2 小时"],
    [121, "2～4 小时"],
    [240, "2～4 小时"],
    [241, "4 小时以上"],
  ])("maps a %i-minute estimate to %s", (minutes, expected) => {
    expect(formatBroadcastProtectionEta(minutes * 10, 10)).toBe(expected);
  });

  it("does not estimate an inactive or stalled queue", () => {
    expect(formatBroadcastProtectionEta(0, 10)).toBeUndefined();
    expect(formatBroadcastProtectionEta(10, 0)).toBeUndefined();
  });
});
