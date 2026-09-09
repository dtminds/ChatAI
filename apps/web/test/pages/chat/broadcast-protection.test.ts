// @vitest-environment node

import { describe, expect, it } from "vitest";
import { formatBroadcastProtectionEta } from "@/pages/chat/lib/broadcast-protection";

describe("formatBroadcastProtectionEta", () => {
  it.each([
    [1, "1 分钟"],
    [5, "5 分钟"],
    [10, "10 分钟"],
    [15, "15 分钟"],
    [30, "30 分钟"],
    [60, "1 小时"],
    [61, "1 小时 1 分钟"],
    [90, "1 小时 30 分钟"],
    [120, "2 小时"],
    [121, "> 2 小时"],
    [240, "> 2 小时"],
  ])("maps a %i-minute estimate to %s", (minutes, expected) => {
    expect(formatBroadcastProtectionEta(minutes * 10, 10)).toBe(expected);
  });

  it("rounds a fractional estimate up to the next minute", () => {
    expect(formatBroadcastProtectionEta(6_001, 600)).toBe("11 分钟");
  });

  it("shows a sub-minute estimate as one minute", () => {
    expect(formatBroadcastProtectionEta(1, 10)).toBe("1 分钟");
  });

  it("does not estimate an inactive or stalled queue", () => {
    expect(formatBroadcastProtectionEta(0, 10)).toBeUndefined();
    expect(formatBroadcastProtectionEta(10, 0)).toBeUndefined();
  });
});
