import { describe, expect, it } from "vitest";
import {
  createAiUsageEvent,
  InvalidAiUsageEventError,
  type AiUsageEventInput,
} from "../src/index.js";

function input(overrides: Record<string, unknown> = {}) {
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
    modelUsages: [{
      inputTokens: 1_200,
      model: "ep-analysis",
      modelId: null,
      outputTokens: 300,
      provider: "volcengine_ark",
      requestCount: 2,
    }],
    occurredAt: "2026-09-10T08:00:00.000Z",
    uid: 9,
    ...overrides,
  };
}

describe("createAiUsageEvent", () => {
  it("adds the contract version without merging the event and billing keys", () => {
    expect(createAiUsageEvent(input({
      occurredAt: "2026-09-10T08:00:00.123456789Z",
    }) as AiUsageEventInput)).toMatchObject({
      billingKey: "logical-session:42:auto",
      eventKey: "insight-job:99",
      occurredAt: "2026-09-10T08:00:00.123Z",
      schemaVersion: 1,
    });
  });

  it("rejects runtime capability and business type mismatches", () => {
    expect(() => createAiUsageEvent(input({
      businessType: "workflow_node_execution",
    }) as AiUsageEventInput)).toThrow(InvalidAiUsageEventError);
  });
});
