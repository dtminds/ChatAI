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
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ result: true }));

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
    expect(result).toEqual({ result: true });
  });

  it("keeps a business failure as a completed node result", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ result: false }));

    await expect(executeWorkflowCapability({
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
    })).resolves.toEqual({ result: false });
  });

  it("stops before calling Java when the mall user identity is missing", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ result: true }));

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
    expect(adapter.calls).toHaveLength(0);
  });

  it("completes empty, blank, or overlong order numbers as false without calling Java", async () => {
    for (const orderNo of ["", "   ", "S".repeat(65)]) {
      const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ result: true }));

      await expect(executePointsTransfer(adapter, {
        ...context,
        outputs: { llm: { orderNo } },
      })).resolves.toEqual({ result: false });
      expect(adapter.calls).toHaveLength(0);
    }
  });
});

function executePointsTransfer(
  adapter: FakeWorkflowCapabilityAdapter,
  commandContext: typeof context,
) {
  return executeWorkflowCapability({
    binding: WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING,
    commandContext,
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
}
