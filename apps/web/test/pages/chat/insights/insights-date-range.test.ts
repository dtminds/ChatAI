// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentMonthDateRange,
  getDefaultDateRange,
  getPreviousMonthDateRange,
  getPreviousWeekDateRange,
  getRecentDateRange,
  getWeekDateRange,
  getYesterdayDateRange,
  toBoundaryDate,
} from "@/pages/chat/insights/insights-date-range";

describe("insight date range", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes overview presets and query boundaries from the current day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T10:00:00+08:00"));

    expect(getYesterdayDateRange()).toEqual({ from: "2026-06-02", to: "2026-06-02" });
    expect(getRecentDateRange(7)).toEqual({ from: "2026-05-28", to: "2026-06-03" });
    expect(getDefaultDateRange()).toEqual({ from: "2026-05-05", to: "2026-06-03" });
    expect(getWeekDateRange()).toEqual({ from: "2026-06-01", to: "2026-06-03" });
    expect(getPreviousWeekDateRange()).toEqual({ from: "2026-05-25", to: "2026-05-31" });
    expect(getCurrentMonthDateRange()).toEqual({ from: "2026-06-01", to: "2026-06-03" });
    expect(getPreviousMonthDateRange()).toEqual({ from: "2026-05-01", to: "2026-05-31" });
    expect(toBoundaryDate("2026-05-28", "start")).toBe("2026-05-28T00:00:00.000+08:00");
    expect(toBoundaryDate("2026-06-03", "end")).toBe("2026-06-03T23:59:59.999+08:00");
  });
});
