import { describe, expect, it } from "vitest";
import { createWorkflowNodeUsageEvent } from "../src/workflow-ai-usage.js";

describe("Workflow AI usage", () => {
  it("aggregates repeated AI Collect inference calls into one node execution event", () => {
    const event = createWorkflowNodeUsageEvent({
      executionId: "81",
      nodeId: "collect-1",
      nodeKind: "ai-collect",
      occurredAt: new Date("2026-09-10T08:00:00.000Z"),
      runId: "51",
      uid: 9,
      usages: [
        usage(100, 20),
        usage(80, 10),
      ],
      workflowId: "31",
    });

    expect(event).toMatchObject({
      billingKey: "workflow-node-execution:81",
      billingModel: { creditMultiplier: 100, model: "ep-ai-collect", modelId: null },
      businessId: "81",
      businessType: "workflow_node_execution",
      capability: "workflow_ai_collect",
      eventKey: "workflow-node-execution:81",
      modelUsages: [{
        inputTokens: 180,
        model: "ep-ai-collect",
        modelId: null,
        outputTokens: 30,
        provider: "volcengine_ark",
        requestCount: 2,
      }],
    });
  });

  it("does not create usage without a successful Provider invocation", () => {
    expect(createWorkflowNodeUsageEvent({
      executionId: "82",
      nodeId: "intent-1",
      nodeKind: "ai-intent",
      occurredAt: new Date("2026-09-10T08:00:00.000Z"),
      runId: "52",
      uid: 9,
      usages: [],
      workflowId: "31",
    })).toBeNull();
  });
});

function usage(inputTokens: number, outputTokens: number) {
  return {
    billingModel: { creditMultiplier: 100, model: "ep-ai-collect", modelId: null },
    modelUsage: {
      inputTokens,
      model: "ep-ai-collect",
      modelId: null,
      outputTokens,
      provider: "volcengine_ark",
      requestCount: 1,
    },
  };
}
