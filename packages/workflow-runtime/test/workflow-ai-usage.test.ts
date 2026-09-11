import { describe, expect, it } from "vitest";
import { createWorkflowNodeUsageEvent } from "../src/workflow-ai-usage.js";

describe("Workflow AI usage", () => {
  it("creates one AI Collect billing event from the execution model snapshot", () => {
    const event = createWorkflowNodeUsageEvent({
      billingModel: { creditMultiplier: 100, model: "ep-ai-collect", modelId: null },
      executionId: "81",
      nodeId: "collect-1",
      nodeKind: "ai-collect",
      occurredAt: new Date("2026-09-10T08:00:00.000Z"),
      runId: "51",
      uid: 9,
      workflowId: "31",
    });

    expect(event).toMatchObject({
      billingKey: "workflow-node-execution:81",
      billingModel: { creditMultiplier: 100, model: "ep-ai-collect", modelId: null },
      businessId: "81",
      businessType: "workflow_node_execution",
      capability: "workflow_ai_collect",
      eventKey: "workflow-node-execution:81",
    });
    expect(event).not.toHaveProperty("modelUsages");
  });

  it("does not create usage without a successful Provider model snapshot", () => {
    expect(createWorkflowNodeUsageEvent({
      billingModel: null,
      executionId: "82",
      nodeId: "intent-1",
      nodeKind: "ai-intent",
      occurredAt: new Date("2026-09-10T08:00:00.000Z"),
      runId: "52",
      uid: 9,
      workflowId: "31",
    })).toBeNull();
  });
});
