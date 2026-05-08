import { describe, expect, it, vi } from "vitest";
import { formatConversationTimestamp } from "@/pages/chat/lib/chat-time";
import {
  MAX_CUSTOMER_PANEL_WIDTH,
  MIN_CUSTOMER_PANEL_WIDTH,
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
    expect(clampCustomerPanelWidth(380, 860)).toBe(340);
  });
});
