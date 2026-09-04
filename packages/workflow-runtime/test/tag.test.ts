import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowTagCommand,
  executeWorkflowCapability,
  WORKFLOW_TAG_CAPABILITY_BINDING,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  currentNodeLifecycle: { enteredAt: "2026-08-17T09:30:00.000Z" },
  identities: { externalUserId: 101 },
  nodeLifecycle: {},
  outputs: {},
  subjectId: "customer-1",
  trigger: { occurredAt: "2026-08-17T08:00:00.000Z" },
  workflow: {},
};

describe("Workflow Tag capability", () => {
  it("creates a typed multi-tag action and reuses the execution key for idempotency", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({}));

    const result = await executeWorkflowCapability({
      binding: WORKFLOW_TAG_CAPABILITY_BINDING,
      commandContext: context,
      config: { operation: "add", tagIds: [101, 102] },
      deadlineAt: new Date("2026-08-17T09:30:15.000Z"),
      execution: {
        nodeId: "tag",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:tag:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(result).toEqual({});
    expect(adapter.calls[0]).toMatchObject({
      definition: {
        capabilityKey: "customer.tag.update",
        contractVersion: 1,
        kind: "action",
      },
      request: {
        command: {
          operation: "add",
          source: "workflow",
          tagIds: [101, 102],
        },
        idempotencyKey: "9:run-1:tag:3",
        subjectId: "customer-1",
        subjectType: "chatai_contact",
      },
    });
  });

  it("rejects empty tags and missing recipients before invoking Java", async () => {
    expect(() => createWorkflowTagCommand({
      config: { operation: "add", tagIds: [] },
      context,
    })).toThrow(expect.objectContaining({
      code: "WORKFLOW_TAG_COMMAND_INVALID",
      failureKind: "terminal",
    }));

    const execute = vi.fn(async () => ({}));
    await expect(executeWorkflowCapability({
      binding: WORKFLOW_TAG_CAPABILITY_BINDING,
      commandContext: { ...context, identities: {}, subjectId: "" },
      config: { operation: "remove", tagIds: [101] },
      deadlineAt: new Date("2026-08-17T09:30:15.000Z"),
      execution: {
        nodeId: "tag",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:tag:3",
      port: new FakeWorkflowCapabilityAdapter(execute),
      signal: new AbortController().signal,
      subjectId: "",
      subjectType: "wecom_contact",
      uid: 9,
    })).rejects.toMatchObject({ code: "WORKFLOW_TAG_COMMAND_INVALID" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects unexpected Java result fields", async () => {
    await expect(executeWorkflowCapability({
      binding: WORKFLOW_TAG_CAPABILITY_BINDING,
      commandContext: context,
      config: { operation: "remove", tagIds: [101] },
      deadlineAt: new Date("2026-08-17T09:30:15.000Z"),
      execution: {
        nodeId: "tag",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:tag:3",
      port: new FakeWorkflowCapabilityAdapter(async () => ({ updated: true })),
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "wecom_contact",
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_CAPABILITY_OUTPUT_INVALID",
      failureKind: "terminal",
    });
  });
});
