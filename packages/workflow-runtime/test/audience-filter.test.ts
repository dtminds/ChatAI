import { describe, expect, it } from "vitest";
import {
  createWorkflowAudienceFilterCommand,
  executeWorkflowCapability,
  executeWorkflowCapabilityStep,
  resolveWorkflowAudienceFilterSourceOutlet,
  WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  currentNodeLifecycle: { enteredAt: "2026-08-24T09:30:00.000Z" },
  identities: { externalUserId: 101 },
  nodeLifecycle: {},
  outputs: {},
  subjectId: "customer-1",
  trigger: { occurredAt: "2026-08-24T08:00:00.000Z" },
  workflow: {},
};

describe("Workflow Audience Filter capability", () => {
  it("queries without an idempotency key and routes by exist", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ exist: true }));

    const result = await executeWorkflowCapability({
      binding: WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING,
      commandContext: context,
      config: { group: { id: 301, name: "高价值客户" } },
      deadlineAt: new Date("2026-08-24T09:30:15.000Z"),
      execution: {
        nodeId: "audience-filter",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:audience-filter:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(result).toEqual({});
    expect(adapter.calls[0]).toMatchObject({
      definition: {
        capabilityKey: "cdp.group.check-contact",
        contractVersion: 1,
        kind: "query",
      },
      request: {
        command: { groupId: 301 },
        subjectId: "customer-1",
      },
    });
    expect(adapter.calls[0]?.request).not.toHaveProperty("idempotencyKey");
  });

  it("resolves matched and unmatched outlets from the Java exist flag", async () => {
    expect(resolveWorkflowAudienceFilterSourceOutlet({ exist: true })).toBe("matched");
    expect(resolveWorkflowAudienceFilterSourceOutlet({ exist: false })).toBe("unmatched");

    const unmatched = await executeWorkflowCapabilityStep({
      binding: WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING,
      commandContext: context,
      config: { group: { id: 301, name: "高价值客户" } },
      deadlineAt: new Date("2026-08-24T09:30:15.000Z"),
      execution: {
        nodeId: "audience-filter",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:audience-filter:3",
      port: new FakeWorkflowCapabilityAdapter(async () => ({ exist: false })),
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(unmatched).toEqual({
      output: {},
      sourceOutletId: "unmatched",
    });
  });

  it("rejects missing identity or incomplete group config before calling Java", () => {
    expect(() => createWorkflowAudienceFilterCommand({
      config: { group: { id: 301, name: "高价值客户" } },
      context: { ...context, identities: {} },
    })).toThrow(expect.objectContaining({
      code: "WORKFLOW_AUDIENCE_FILTER_COMMAND_INVALID",
      diagnosticMessage: "Audience Filter subject is unavailable in the Run context",
      failureKind: "terminal",
    }));

    expect(() => createWorkflowAudienceFilterCommand({
      config: {},
      context,
    })).toThrow(expect.objectContaining({
      code: "WORKFLOW_AUDIENCE_FILTER_COMMAND_INVALID",
      diagnosticMessage: "Audience Filter execution config failed schema validation",
      failureKind: "terminal",
    }));
  });
});
