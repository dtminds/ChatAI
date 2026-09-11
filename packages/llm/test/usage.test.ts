import { describe, expect, it } from "vitest";
import {
  AI_USAGE_COLLECTION_ENABLED,
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
    occurredAt: "2026-09-10T08:00:00.000Z",
    uid: 9,
    ...overrides,
  };
}

describe("createAiUsageEvent", () => {
  it("keeps usage collection disabled until the code-level switch is enabled", () => {
    expect(AI_USAGE_COLLECTION_ENABLED).toBe(false);
  });

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
