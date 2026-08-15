import { Type } from "@sinclair/typebox";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import { describe, expect, it, vi } from "vitest";
import {
  executeWorkflowCapability,
  type WorkflowCapabilityExecutionBinding,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const actionBinding = binding("action");
const queryBinding = binding("query");
const inferenceBinding = binding("inference");

describe("Workflow Capability Port", () => {
  it("passes only a validated typed action command and stable execution envelope", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ value: "ok" }));
    const controller = new AbortController();

    await expect(executeWorkflowCapability(invocation({
      adapter,
      binding: actionBinding,
      controller,
    }))).resolves.toEqual({ value: "ok" });

    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toEqual({
      definition: actionBinding.definition,
      request: {
        command: { value: "hello" },
        deadlineAt: new Date("2026-08-10T00:00:15.000Z"),
        execution: {
          nodeId: "message",
          revision: 2,
          runId: "run-1",
          sequence: 3,
          workflowId: "workflow-1",
        },
        idempotencyKey: "9:run-1:message:3",
        signal: controller.signal,
        subjectId: "contact-1",
        subjectType: "chatai_contact",
        uid: 9,
      },
    });
    expect(adapter.calls[0]!.request).not.toHaveProperty("node");
    expect(adapter.calls[0]!.request).not.toHaveProperty("nodeConfig");
    expect(adapter.calls[0]!.request).not.toHaveProperty("selector");
  });

  it.each([
    ["query", queryBinding],
    ["inference", inferenceBinding],
  ] as const)("does not send an idempotency key for %s", async (_kind, capabilityBinding) => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ value: "ok" }));
    await executeWorkflowCapability(invocation({ adapter, binding: capabilityBinding }));
    expect(adapter.calls[0]!.request).not.toHaveProperty("idempotencyKey");
  });

  it("rejects an invalid command before calling the adapter", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(vi.fn(async () => ({ value: "ok" })));
    await expect(executeWorkflowCapability(invocation({
      adapter,
      binding: { ...actionBinding, createCommand: () => ({ value: 42 }) },
    }))).rejects.toMatchObject({
      code: "WORKFLOW_CAPABILITY_COMMAND_INVALID",
      failureKind: "terminal",
    });
    expect(adapter.calls).toHaveLength(0);
  });

  it("classifies an invalid result as a terminal output failure", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ value: 42 }));
    await expect(executeWorkflowCapability(invocation({ adapter, binding: actionBinding })))
      .rejects.toMatchObject({
        code: "WORKFLOW_CAPABILITY_OUTPUT_INVALID",
        failureKind: "terminal",
      });
  });

  it.each(["retryable", "terminal", "unknown"] as const)(
    "preserves %s adapter error classification for Runtime retry policy",
    async (failureKind) => {
      const adapter = new FakeWorkflowCapabilityAdapter(async () => {
        throw new WorkflowCapabilityExecutionError(failureKind, "TEST_FAILURE", "测试失败");
      });
      await expect(executeWorkflowCapability(invocation({ adapter, binding: actionBinding })))
        .rejects.toMatchObject({ failureKind });
    },
  );
});

function binding(kind: "action" | "inference" | "query"): WorkflowCapabilityExecutionBinding {
  return {
    createCommand: ({ config }) => ({ value: config.value }),
    definition: {
      capabilityKey: `operation.test.${kind}`,
      commandSchema: Type.Object({ value: Type.String() }, { additionalProperties: false }),
      contractVersion: 1,
      kind,
      resultSchema: Type.Object({ value: Type.String() }, { additionalProperties: false }),
    },
    nodeKind: kind === "action" ? "message" : kind === "query" ? "message-query" : "llm",
  };
}

function invocation(input: {
  adapter: FakeWorkflowCapabilityAdapter;
  binding: WorkflowCapabilityExecutionBinding;
  controller?: AbortController;
}) {
  return {
    binding: input.binding,
    commandContext: {
      currentNodeLifecycle: {},
      nodeLifecycle: {},
      outputs: {},
      subjectId: "contact-1",
      trigger: {},
    },
    config: { value: "hello" },
    deadlineAt: new Date("2026-08-10T00:00:15.000Z"),
    execution: {
      nodeId: "message",
      revision: 2,
      runId: "run-1",
      sequence: 3,
      workflowId: "workflow-1",
    },
    executionKey: "9:run-1:message:3",
    port: input.adapter,
    signal: (input.controller ?? new AbortController()).signal,
    subjectId: "contact-1",
    subjectType: "chatai_contact" as const,
    uid: 9,
  };
}
