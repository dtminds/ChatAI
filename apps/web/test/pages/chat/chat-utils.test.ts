import { describe, expect, it, vi } from "vitest";
import {
  formatConversationTimestamp,
  isSameCalendarDay,
  parseWorkbenchDate,
} from "@/pages/chat/lib/chat-time";
import {
  MAX_ACCOUNT_RAIL_WIDTH,
  MIN_ACCOUNT_RAIL_WIDTH,
  clampAccountRailWidth,
} from "@/pages/chat/lib/account-rail-width";
import {
  MAX_CUSTOMER_PANEL_WIDTH,
  MIN_CUSTOMER_PANEL_WIDTH,
  MIN_WORKBENCH_CONTENT_WIDTH,
  clampCustomerPanelWidth,
} from "@/pages/chat/lib/panel-width";

describe("chat utility helpers", () => {
  it("formats conversation timestamps relative to today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 6, 10, 30, 0));

    expect(formatConversationTimestamp("2026-05-06 10:05:00")).toBe("25分钟前");
    expect(formatConversationTimestamp("2026-05-06 08:05:00")).toBe("08:05");
    expect(formatConversationTimestamp("2026-04-30 08:05:00")).toBe("04/30");
    expect(formatConversationTimestamp("2025-12-30 08:05:00")).toBe("2025/12/30");
    expect(formatConversationTimestamp("不是日期")).toBe("不是日期");

    vi.useRealTimers();
  });

  it("formats conversation timestamps within one minute as just now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 6, 10, 30, 0));

    expect(formatConversationTimestamp("2026-05-06 10:29:01")).toBe("刚刚");
    expect(formatConversationTimestamp("2026-05-06 10:29:00")).toBe("1分钟前");

    vi.useRealTimers();
  });

  it("parses workbench timestamps and rejects invalid values", () => {
    const date = parseWorkbenchDate("2026-05-06 10:05:00");

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(4);
    expect(date?.getDate()).toBe(6);
    expect(date?.getHours()).toBe(10);
    expect(date?.getMinutes()).toBe(5);
    expect(parseWorkbenchDate("不是日期")).toBeNull();
  });

  it("compares dates by local calendar day", () => {
    expect(
      isSameCalendarDay(
        new Date("2026-05-06T00:00:00"),
        new Date("2026-05-06T23:59:59"),
      ),
    ).toBe(true);
    expect(
      isSameCalendarDay(
        new Date("2026-05-06T23:59:59"),
        new Date("2026-05-07T00:00:00"),
      ),
    ).toBe(false);
  });

  it("clamps the customer panel width inside available workbench space", () => {
    expect(clampCustomerPanelWidth(120, 1000)).toBe(MIN_CUSTOMER_PANEL_WIDTH);
    expect(clampCustomerPanelWidth(1000, 1000)).toBe(MAX_CUSTOMER_PANEL_WIDTH);
    expect(clampCustomerPanelWidth(380, 1000)).toBe(380);
    expect(clampCustomerPanelWidth(380, 895)).toBe(MIN_CUSTOMER_PANEL_WIDTH);
  });

  it("keeps a desktop workbench floor instead of reflowing into a phone layout", () => {
    expect(MIN_WORKBENCH_CONTENT_WIDTH).toBe(1100);
  });

  it("clamps the account rail width within its resize range", () => {
    expect(clampAccountRailWidth(180)).toBe(MIN_ACCOUNT_RAIL_WIDTH);
    expect(clampAccountRailWidth(280)).toBe(280);
    expect(clampAccountRailWidth(400)).toBe(MAX_ACCOUNT_RAIL_WIDTH);
    expect(clampAccountRailWidth(Number.NaN)).toBe(MIN_ACCOUNT_RAIL_WIDTH);
  });
});
