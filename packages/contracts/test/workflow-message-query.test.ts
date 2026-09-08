import { describe, expect, it } from "vitest";
import {
  isWorkflowNodeDraftConfig,
  isWorkflowNodeExecutionConfig,
  isMessageQueryRelativeRangeWithinBounds,
  isMessageQueryFixedRangeWithinBounds,
  normalizeWorkflowMessageQueryConfigTimePrecision,
  normalizeWorkflowOrderQueryConfigTimePrecision,
} from "../src/index.js";

describe("Message Query relative time contract", () => {
  it("upgrades legacy minute precision without changing interval bounds", () => {
    expect(normalizeWorkflowMessageQueryConfigTimePrecision({
      limit: 10,
      take: "latest",
      timeRange: {
        endAt: "2026-09-05T23:59",
        mode: "fixed",
        startAt: "2026-09-01T00:00",
      },
    })).toMatchObject({
      timeRange: {
        endAt: "2026-09-05T23:59:59",
        startAt: "2026-09-01T00:00:00",
      },
    });
    expect(normalizeWorkflowOrderQueryConfigTimePrecision({
      conditions: {
        amount: {},
        shopIds: [],
        timeField: "order-time",
        timeRange: {
          end: { amount: 0, time: "23:59", unit: "day" },
          mode: "relative",
          start: { amount: 30, time: "00:00", unit: "day" },
        },
      },
      mode: "conditions",
    })).toMatchObject({
      conditions: {
        timeRange: {
          end: { amount: 0, time: "23:59:59", unit: "day" },
          start: { amount: 30, time: "00:00:00", unit: "day" },
        },
      },
    });
  });

  it.each([
    [{ amount: 0, unit: "hour" }, { amount: 1, unit: "day", time: "00:00:00" }, false],
    [{ amount: 0, unit: "day", time: "00:00:00" }, { amount: 24, unit: "hour" }, false],
    [{ amount: 1, unit: "day", time: "00:00:00" }, { amount: 0, unit: "minute" }, true],
    [{ amount: 60, unit: "minute" }, { amount: 0, unit: "day", time: "23:59:59" }, true],
    [{ amount: 0, unit: "day", time: "23:59:59" }, { amount: 0, unit: "minute" }, true],
    [{ amount: 0, unit: "minute" }, { amount: 0, unit: "day", time: "00:00:00" }, true],
  ])("checks mixed-unit ordering without rejecting partially valid ranges: %j → %j", (start, end, valid) => {
    const config = { limit: 10, take: "latest", timeRange: { mode: "relative", start, end } };
    expect(isWorkflowNodeDraftConfig("message-query", config)).toBe(true);
    expect(isWorkflowNodeExecutionConfig("message-query", config)).toBe(valid);
  });
  it.each(["message-query", "order-query"] as const)("rejects clock times on duration units for %s", kind => {
    const range = { mode: "relative", start: { amount: 1, unit: "hour" }, end: { amount: 0, unit: "minute" } };
    const config = (timeRange: unknown) => kind === "message-query"
      ? { limit: 10, take: "latest", timeRange }
      : { mode: "conditions", conditions: { amount: {}, shopIds: [], timeField: "order-time", timeRange } };
    expect(isWorkflowNodeDraftConfig(kind, config(range))).toBe(true);
    expect(isWorkflowNodeDraftConfig(kind, config({ ...range, start: { ...range.start, time: "23:00" } }))).toBe(false);
    expect(isWorkflowNodeDraftConfig(kind, config({ ...range, start: { amount: 1, unit: "day" } }))).toBe(false);
  });
  it("checks fixed time lookback and inclusive end second against 90 days", () => {
    const now = Date.parse("2026-09-05T10:00:00+08:00");
    expect(isMessageQueryFixedRangeWithinBounds(now, "2026-06-07T10:00:00", "2026-09-05T09:59:59")).toBe(true);
    expect(isMessageQueryFixedRangeWithinBounds(now, "2026-06-07T00:00:00", "2026-09-05T23:59:59")).toBe(true);
    expect(isMessageQueryFixedRangeWithinBounds(now, "2026-06-06T10:00:00", "2026-09-05T09:59:59")).toBe(false);
    expect(isMessageQueryFixedRangeWithinBounds(now, "2026-06-07T10:00:00", "2026-09-06T10:00:00")).toBe(false);
    expect(isWorkflowNodeExecutionConfig("message-query", {
      limit: 10, take: "latest", timeRange: { mode: "fixed", startAt: "2026-06-07T10:00:00", endAt: "2026-09-05T10:00:00" },
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("message-query", {
      limit: 10, take: "latest", timeRange: { mode: "fixed", startAt: "2026-06-07T10:00", endAt: "2026-09-05T10:00" },
    })).toBe(false);
  });
  const config = (amount = 30, unit = "day") => ({
    limit: 10, take: "latest",
    timeRange: {
      mode: "relative",
      start: { amount, unit, ...(unit === "day" ? { time: "00:00:00" } : {}) },
      end: { amount: 0, unit: "day", time: "23:59:59" },
    },
  });

  it.each([[90, "day"], [2160, "hour"], [129600, "minute"]])(
    "accepts the 90-day offset boundary expressed as %s %s", (amount, unit) => {
      expect(isWorkflowNodeDraftConfig("message-query", config(Number(amount), String(unit)))).toBe(true);
      expect(isWorkflowNodeExecutionConfig("message-query", config(Number(amount), String(unit)))).toBe(true);
      expect(isWorkflowNodeExecutionConfig("message-query", config(Number(amount) + 1, String(unit)))).toBe(false);
    },
  );

  it("allows 91 days minus one millisecond but rejects the 91-day boundary", () => {
    const now = Date.parse("2026-09-05T04:00:00.000Z");
    const earliest = now - 91 * 86_400_000;
    expect(isMessageQueryRelativeRangeWithinBounds(now, earliest + 1, now)).toBe(true);
    expect(isMessageQueryRelativeRangeWithinBounds(now, earliest, now - 1)).toBe(false);
    expect(isMessageQueryRelativeRangeWithinBounds(now, earliest + 1, now + 1)).toBe(false);
  });

  it("allows intermediate reversed drafts but rejects execution", () => {
    const value = config();
    value.timeRange.start.amount = 0;
    value.timeRange.end.amount = 1;
    expect(isWorkflowNodeDraftConfig("message-query", value)).toBe(true);
    expect(isWorkflowNodeExecutionConfig("message-query", value)).toBe(false);
  });

  it("rejects invalid units, fractional offsets and invalid clock times", () => {
    expect(isWorkflowNodeDraftConfig("message-query", config(1, "week"))).toBe(false);
    expect(isWorkflowNodeDraftConfig("message-query", config(1.5))).toBe(false);
    const value = config();
    value.timeRange.end.time = "24:00:00";
    expect(isWorkflowNodeDraftConfig("message-query", value)).toBe(false);
  });
});
