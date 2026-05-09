import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMessageDividerLabel } from "@/pages/chat/components/message-feed";

describe("formatMessageDividerLabel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats today's divider with time only", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("2026-05-09 14:59:00")).toBe("14:59");
  });

  it("formats yesterday's divider with yesterday and time", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("2026-05-08 21:05:00")).toBe("昨天 21:05");
  });

  it("formats other days in the current week with weekday and time", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("2026-05-04 14:59:00")).toBe("周一 14:59");
  });

  it("omits the year for current-year dates outside this week", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("2026-04-19 10:12:00")).toBe("4月19日 10:12");
  });

  it("keeps the year for dates outside the current year", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("2025-12-31 23:40:00")).toBe(
      "2025年12月31日 23:40",
    );
  });

  it("keeps invalid dates unchanged", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("not-a-date")).toBe("not-a-date");
  });
});
