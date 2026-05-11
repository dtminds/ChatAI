import { describe, expect, it, vi } from "vitest";
import { formatConversationTimestamp } from "@/pages/chat/lib/chat-time";
import {
  MAX_ACCOUNT_RAIL_WIDTH,
  MIN_ACCOUNT_RAIL_WIDTH,
  clampAccountRailWidth,
} from "@/pages/chat/lib/account-rail-width";
import {
  MAX_CUSTOMER_PANEL_WIDTH,
  MIN_CUSTOMER_PANEL_WIDTH,
  shouldShowCustomerPanel,
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

  it("clamps the customer panel width inside available workbench space", () => {
    expect(clampCustomerPanelWidth(120, 1000)).toBe(MIN_CUSTOMER_PANEL_WIDTH);
    expect(clampCustomerPanelWidth(1000, 1000)).toBe(MAX_CUSTOMER_PANEL_WIDTH);
    expect(clampCustomerPanelWidth(380, 860)).toBe(336);
    expect(clampCustomerPanelWidth(380, 780)).toBe(MIN_CUSTOMER_PANEL_WIDTH);
  });

  it("shows the customer panel when the chat body has enough room for both panes", () => {
    expect(shouldShowCustomerPanel(780)).toBe(true);
    expect(shouldShowCustomerPanel(779)).toBe(false);
  });

  it("clamps the account rail width within its resize range", () => {
    expect(clampAccountRailWidth(180)).toBe(MIN_ACCOUNT_RAIL_WIDTH);
    expect(clampAccountRailWidth(280)).toBe(280);
    expect(clampAccountRailWidth(400)).toBe(MAX_ACCOUNT_RAIL_WIDTH);
    expect(clampAccountRailWidth(Number.NaN)).toBe(MIN_ACCOUNT_RAIL_WIDTH);
  });
});
