import { describe, expect, it } from "vitest";
import {
  createWorkflowOrderBindCommand,
  executeWorkflowCapability,
  WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  currentNodeLifecycle: { enteredAt: "2026-08-21T09:30:00.000Z" },
  identities: { externalUserId: 101 },
  nodeLifecycle: {},
  outputs: {
    llm: {
      orderNo: "SO20260821001",
    },
  },
  subjectId: "customer-1",
  trigger: { occurredAt: "2026-08-21T08:00:00.000Z" },
  workflow: {},
};

describe("Workflow Order Bind capability", () => {
  it("resolves the order number and maps the bind result", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ result: "success" }));

    const result = await executeWorkflowCapability({
      binding: WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        orderNumberSelector: ["node", "llm", "orderNo"],
      },
      deadlineAt: new Date("2026-08-21T09:30:15.000Z"),
      execution: {
        nodeId: "order-bind",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:order-bind:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(createWorkflowOrderBindCommand({
      config: { orderNumberSelector: ["node", "llm", "orderNo"] },
      context,
    })).toEqual({
      orderNumber: "SO20260821001",
      source: "workflow",
    });
    expect(result).toEqual({ result: "success" });
  });

  it("keeps a business failure as a completed node result", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ result: "false" }));

    await expect(executeWorkflowCapability({
      binding: WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        orderNumberSelector: ["node", "llm", "orderNo"],
      },
      deadlineAt: new Date("2026-08-21T09:30:15.000Z"),
      execution: {
        nodeId: "order-bind",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:order-bind:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    })).resolves.toEqual({ result: "false" });
  });

  it("stops before calling Java when the customer identity is missing", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ result: "success" }));

    await expect(executeWorkflowCapability({
      binding: WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
      commandContext: { ...context, identities: {} },
      config: {
        orderNumberSelector: ["node", "llm", "orderNo"],
      },
      deadlineAt: new Date("2026-08-21T09:30:15.000Z"),
      execution: {
        nodeId: "order-bind",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:order-bind:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_ORDER_BIND_COMMAND_INVALID",
    });
  });
});
