import { describe, expect, it } from "vitest";
import {
  filterInsightData,
  insightDemoData,
  type InsightFilters,
} from "@/pages/chat/insights/insights-data";

describe("insights demo data filters", () => {
  it("filters priority items by conversation mode and risk level", () => {
    const filters: InsightFilters = {
      intent: "all",
      mode: "group",
      range: "today",
      riskLevel: "high",
      seatId: "all",
    };

    const result = filterInsightData(insightDemoData, filters);

    expect(result.priorityQueue).toHaveLength(1);
    expect(result.priorityQueue[0]?.conversationName).toBe("VIP 老客福利群");
    expect(result.priorityQueue[0]?.mode).toBe("group");
    expect(result.priorityQueue[0]?.riskLevel).toBe("high");
  });

  it("recalculates overview totals after intent filtering", () => {
    const filters: InsightFilters = {
      intent: "after_sale.refund",
      mode: "all",
      range: "today",
      riskLevel: "all",
      seatId: "all",
    };

    const result = filterInsightData(insightDemoData, filters);

    expect(result.overview.afterSaleConversations).toBe(3);
    expect(result.overview.highRiskConversations).toBe(2);
    expect(result.intentBreakdown.find((item) => item.type === "after_sale.refund")?.count).toBe(3);
  });
});
