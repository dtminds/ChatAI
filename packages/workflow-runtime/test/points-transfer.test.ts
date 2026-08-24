import { describe, expect, it } from "vitest";
import {
  createWorkflowPointsTransferCommand,
  executeWorkflowCapability,
  WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  currentNodeLifecycle: { enteredAt: "2026-08-24T09:30:00.000Z" },
  identities: { mallUserId: 202 },
  nodeLifecycle: {},
  outputs: {
    llm: {
      orderNo: "SO20260824001",
    },
  },
  subjectId: "customer-1",
  trigger: { occurredAt: "2026-08-24T08:00:00.000Z" },
  workflow: {},
};

describe("Workflow Points Transfer capability", () => {
  it("resolves the order number and maps the transfer result", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ result: "success" }));

    const result = await executeWorkflowCapability({
      binding: WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        orderNumberSelector: ["node", "llm", "orderNo"],
      },
      deadlineAt: new Date("2026-08-24T09:30:15.000Z"),
      execution: {
        nodeId: "points-transfer",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:points-transfer:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(createWorkflowPointsTransferCommand({
      config: { orderNumberSelector: ["node", "llm", "orderNo"] },
      context,
    })).toEqual({
      orderNumber: "SO20260824001",
      source: "workflow",
    });
    expect(result).toEqual({ result: "success" });
  });

  it("stops before calling Java when the mall user identity is missing", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ result: "success" }));

    await expect(executeWorkflowCapability({
      binding: WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING,
      commandContext: { ...context, identities: {} },
      config: {
        orderNumberSelector: ["node", "llm", "orderNo"],
      },
      deadlineAt: new Date("2026-08-24T09:30:15.000Z"),
      execution: {
        nodeId: "points-transfer",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:points-transfer:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_POINTS_TRANSFER_COMMAND_INVALID",
    });
  });
});
