import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  isWorkflowNodeDraftConfig,
  isWorkflowNodeExecutionConfig,
  WorkflowOrderQueryTestRunRequestSchema,
  WorkflowOrderQueryTestRunResponseSchema,
} from "../src/index.js";

describe("Workflow Order Query contract", () => {
  it("keeps incomplete mode drafts saveable", () => {
    expect(isWorkflowNodeDraftConfig("order-query", { mode: "order-number" })).toBe(true);
    expect(isWorkflowNodeDraftConfig("order-query", { mode: "conditions" })).toBe(true);
  });

  it("allows unbounded and single-sided inclusive amount ranges", () => {
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({}))).toBe(true);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({ min: 100 }))).toBe(true);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({ max: 100 }))).toBe(true);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({ max: 200, min: 100 }))).toBe(true);
  });

  it("allows customer conditions without a platform filter", () => {
    const config = conditions({});
    delete config.conditions.platformId;

    expect(isWorkflowNodeExecutionConfig("order-query", config)).toBe(true);
  });

  it("accepts an optional bounded goods name", () => {
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({}))).toBe(true);
    expect(isWorkflowNodeExecutionConfig("order-query", {
      ...conditions({}),
      conditions: { ...conditions({}).conditions, goodsName: "秋季连衣裙" },
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("order-query", {
      ...conditions({}),
      conditions: { ...conditions({}).conditions, goodsName: "" },
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("order-query", {
      ...conditions({}),
      conditions: { ...conditions({}).conditions, goodsName: "a".repeat(513) },
    })).toBe(false);
  });

  it("accepts all three order time modes", () => {
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({}, {
      end: ["current-node-lifecycle", "enteredAt"],
      mode: "dynamic",
      start: ["trigger", "occurredAt"],
    }))).toBe(true);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({}, {
      endAt: "2026-09-04T23:59",
      mode: "absolute",
      startAt: "2025-09-09T00:00",
    }))).toBe(true);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({}, {
      end: { amount: 0, time: "23:59", unit: "day" },
      mode: "relative",
      start: { amount: 30, time: "00:00", unit: "day" },
    }))).toBe(true);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({}))).toBe(true);
  });

  it("rejects negative or reversed amounts and invalid time ranges", () => {
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({ min: -1 }))).toBe(false);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({ max: 99, min: 100 }))).toBe(false);
    expect(isWorkflowNodeExecutionConfig("order-query", {
      ...conditions({}),
      conditions: {
        ...conditions({}).conditions,
        timeRange: {
          endAt: "2026-09-01T00:00",
          mode: "absolute",
          startAt: "2026-09-02T00:00",
        },
      },
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({}, {
      end: ["trigger", "occurredAt"],
      mode: "dynamic",
      start: ["current-node-lifecycle", "enteredAt"],
    }))).toBe(false);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({}, {
      end: ["trigger", "occurredAt"],
      mode: "dynamic",
      start: ["trigger", "occurredAt"],
    }))).toBe(false);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({}, {
      endAt: "2026-09-05T12:00",
      mode: "absolute",
      startAt: "2025-09-09T12:00",
    }))).toBe(false);
    expect(isWorkflowNodeExecutionConfig("order-query", conditions({}, {
      end: { amount: 0, time: "23:59", unit: "day" },
      mode: "relative",
      start: { amount: 361, time: "00:00", unit: "day" },
    }))).toBe(false);
  });

  it("validates synchronous test-run inputs and mapped outputs", () => {
    expect(Value.Check(WorkflowOrderQueryTestRunRequestSchema, {
      expectedDraftVersion: 3,
      orderNumber: "SO-1001",
    })).toBe(true);
    expect(Value.Check(WorkflowOrderQueryTestRunRequestSchema, {
      expectedDraftVersion: 3,
      externalUserId: 101,
      variableValues: [{
        selector: ["trigger", "occurredAt"],
        value: "2026-09-01T00:00:00.000Z",
      }],
    })).toBe(true);
    expect(Value.Check(WorkflowOrderQueryTestRunRequestSchema, {
      expectedDraftVersion: 3,
      orderNumber: "SO-1001",
      variableValues: [],
    })).toBe(false);
    expect(Value.Check(WorkflowOrderQueryTestRunRequestSchema, {
      expectedDraftVersion: 3,
      variableValues: [
        { selector: ["trigger", "occurredAt"], value: "2026-09-01T00:00:00.000Z" },
        { selector: ["node", "source", "createdAt"], value: "2026-09-02T00:00:00.000Z" },
        { selector: ["node", "source", "paidAt"], value: "2026-09-03T00:00:00.000Z" },
      ],
    })).toBe(false);
    expect(Value.Check(WorkflowOrderQueryTestRunResponseSchema, {
      output: {
        netAmount: 80,
        orderCount: 1,
        totalAmount: 100,
      },
    })).toBe(true);
  });
});

function conditions(
  amount: Record<string, unknown>,
  timeRange: Record<string, unknown> = {
    endAt: "2026-09-04T23:59",
    mode: "absolute",
    startAt: "2026-09-01T00:00",
  },
) {
  return {
    conditions: {
      amount,
      platformId: 2,
      shopIds: [],
      timeField: "order-time",
      timeRange,
    },
    mode: "conditions",
  };
}
