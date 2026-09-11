import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  AiUsageBatchReportRequestSchema,
  AiUsageBatchReportResponseSchema,
  AiUsageBillingDetailResponseSchema,
  AiUsageBillingDetailQuerySchema,
  AiUsageBillingSummaryQuerySchema,
  AiUsageBillingSummaryResponseSchema,
  AiUsageEventSchema,
  isAiUsageEvent,
} from "../src/index.js";

function event(overrides: Record<string, unknown> = {}) {
  return {
    billingKey: "logical-session:42:auto",
    billingModel: {
      creditMultiplier: 150,
      model: "doubao-seed-2.0-lite",
      modelId: 3,
    },
    businessSnapshot: { analysisMode: "automatic" },
    businessId: "42",
    businessType: "logical_session",
    capability: "conversation_insight",
    eventKey: "insight-job:99",
    occurredAt: "2026-09-10T08:00:00.000Z",
    schemaVersion: 1,
    uid: 9,
    ...overrides,
  };
}

describe("AI usage contracts", () => {
  it("accepts a business usage event with separate delivery and billing keys", () => {
    expect(Value.Check(AiUsageEventSchema, event())).toBe(true);
  });

  it("accepts 255-character usage strings and rejects longer values", () => {
    expect(Value.Check(AiUsageEventSchema, event({
      billingKey: "b".repeat(255),
      billingModel: {
        creditMultiplier: 150,
        model: "m".repeat(255),
        modelId: 3,
      },
      businessId: "i".repeat(255),
      businessSnapshot: { source: "s".repeat(255) },
      eventKey: "e".repeat(255),
    }))).toBe(true);
    expect(Value.Check(AiUsageEventSchema, event({ eventKey: "e".repeat(256) }))).toBe(false);
  });

  it("rejects model token details in billing events", () => {
    expect(Value.Check(AiUsageEventSchema, event({
      modelUsages: [{
        inputTokens: 1_200,
        model: "ep-analysis",
        modelId: null,
        outputTokens: 300,
        provider: "volcengine_ark",
        requestCount: 2,
      }],
    }))).toBe(false);
  });

  it("rejects decimal multiplier values instead of treating them as basis points", () => {
    expect(Value.Check(AiUsageEventSchema, event({
      billingModel: {
        creditMultiplier: 1.5,
        model: "doubao-seed-2.0-lite",
        modelId: 3,
      },
    }))).toBe(false);
  });

  it("rejects capability and business type mismatches", () => {
    expect(Value.Check(AiUsageEventSchema, event({ businessType: "workflow_node_execution" }))).toBe(false);
  });

  it("rejects impossible UTC occurrence timestamps", () => {
    expect(isAiUsageEvent(event({ occurredAt: "2026-02-30T08:00:00.000Z" }))).toBe(false);
    expect(isAiUsageEvent(event({ occurredAt: "2026-09-10T08:00:00.123456Z" }))).toBe(false);
  });

  it("bounds one Java report to 100 events", () => {
    expect(Value.Check(AiUsageBatchReportRequestSchema, {
      events: Array.from({ length: 100 }, (_, index) => event({ eventKey: `event:${index}` })),
    })).toBe(true);
    expect(Value.Check(AiUsageBatchReportRequestSchema, {
      events: Array.from({ length: 101 }, (_, index) => event({ eventKey: `event:${index}` })),
    })).toBe(false);
  });

  it("models per-event accepted, duplicate, and rejected results", () => {
    expect(Value.Check(AiUsageBatchReportResponseSchema, {
      results: [
        { eventKey: "event:1", status: "accepted", uid: 9 },
        { eventKey: "event:2", status: "duplicate", uid: 9 },
        { errorCode: "INVALID_EVENT", errorMessage: "invalid event", eventKey: "event:3", status: "rejected", uid: 9 },
      ],
    })).toBe(true);
    expect(Value.Check(AiUsageBatchReportResponseSchema, {
      results: [{ eventKey: "event:1", status: "accepted" }],
    })).toBe(false);
  });

  it("uses fixed six-decimal credit strings in billing responses", () => {
    expect(Value.Check(AiUsageBillingSummaryResponseSchema, {
      accruedCredits: "4.000000",
      deductedCredits: "0.000000",
      items: [{
        accruedCredits: "4.000000",
        capability: "conversation_insight",
        deductedCredits: "0.000000",
        usageCount: 1,
        waivedCredits: "4.000000",
      }],
      period: { endAt: "2026-10-01T00:00:00.000Z", startAt: "2026-09-01T00:00:00.000Z" },
      waivedCredits: "4.000000",
    })).toBe(true);
    expect(Value.Check(AiUsageBillingDetailResponseSchema, {
      items: [{
        accruedCredits: "4.000000",
        baseCredits: "4.000000",
        billingKey: "logical-session:42:auto",
        businessId: "42",
        businessType: "logical_session",
        capability: "conversation_insight",
        creditMultiplier: 100,
        deductedCredits: "0.000000",
        eventKey: "insight-job:99",
        model: "doubao-seed-2.0-lite",
        occurredAt: "2026-09-10T08:00:00.000Z",
        priceVersion: "2026-09-10",
        waivedCredits: "4.000000",
        waiverReason: "beta",
      }],
      nextCursor: null,
    })).toBe(true);
  });

  it("requires tenant scope and bounds billing detail pages", () => {
    expect(Value.Check(AiUsageBillingSummaryQuerySchema, {
      endAt: "2026-10-01T00:00:00.000Z",
      startAt: "2026-09-01T00:00:00.000Z",
      uid: 9,
    })).toBe(true);
    expect(Value.Check(AiUsageBillingDetailQuerySchema, {
      endAt: "2026-10-01T00:00:00.000Z",
      limit: 101,
      startAt: "2026-09-01T00:00:00.000Z",
      uid: 9,
    })).toBe(false);
  });
});
