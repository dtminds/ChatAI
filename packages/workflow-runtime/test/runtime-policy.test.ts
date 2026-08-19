import type {
  WorkflowExecutionSpec,
  WorkflowSubjectType,
  WorkflowType,
  WorkflowTypeEntitlementResult,
} from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WORKFLOW_MESSAGE_CAPABILITY_BINDING,
  WorkflowRuntimeService,
} from "../src/index.js";

const now = new Date("2026-08-10T00:00:00.000Z");
describe("Workflow runtime policy", () => {
  it("admits an entry when the Workflow type remains entitled", async () => {
    const harness = createHarness({
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
    });

    await expect(harness.service.startRun(entryInput())).resolves.toMatchObject({
      deduplicated: false,
      kind: "success",
      run: { subjectType: "chatai_contact" },
    });
    expect(harness.applyEntitlementLoss).not.toHaveBeenCalled();
  });

  it.each([
    {
      expectedCode: "WORKFLOW_RUNTIME_PAUSED",
      transition: "pause",
      unentitledSince: "2026-08-09T00:00:00.000Z",
    },
    {
      expectedCode: "WORKFLOW_RUNTIME_STOPPED",
      transition: "stop",
      unentitledSince: "2026-08-03T00:00:00.000Z",
    },
  ] as const)("applies the $transition transition at the entry boundary", async ({
    expectedCode,
    transition,
    unentitledSince,
  }) => {
    const harness = createHarness({
      entitlement: async () => ({ entitled: false, unentitledSince }),
    });

    await expect(harness.service.startRun(entryInput())).rejects.toMatchObject({
      code: expectedCode,
    });
    expect(harness.applyEntitlementLoss).toHaveBeenCalledWith({
      opSubUserId: "0",
      transitionedAt: now,
      transition,
      uid: 9,
      workflowType: "chatai_sop",
    });
    expect(harness.runtime.runs).toHaveLength(0);
  });

  it("fails closed without changing Workflow status when entitlement is unavailable", async () => {
    const harness = createHarness({
      entitlement: async () => { throw new Error("Java unavailable"); },
    });

    await expect(harness.service.startRun(entryInput())).rejects.toMatchObject({
      code: "WORKFLOW_ENTITLEMENT_UNAVAILABLE",
    });
    expect(harness.applyEntitlementLoss).not.toHaveBeenCalled();
    expect(harness.runtime.runs).toHaveLength(0);
  });

  it("defers an existing task without consuming an attempt when entitlement is unavailable", async () => {
    const entitlement = vi.fn<() => Promise<WorkflowTypeEntitlementResult>>()
      .mockResolvedValueOnce({ entitled: true, unentitledSince: null })
      .mockRejectedValueOnce(new Error("Java unavailable"));
    const harness = createHarness({ entitlement });
    const started = await harness.service.startRun(entryInput());

    await expect(harness.service.executeTask({
      now,
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).rejects.toMatchObject({ code: "WORKFLOW_ENTITLEMENT_UNAVAILABLE" });

    await expect(harness.runtime.findTask(9, started.task.id)).resolves.toMatchObject({
      attempt: 0,
      dueAt: new Date(now.getTime() + 60_000),
      status: "pending",
      taskVersion: 2,
    });
    expect(harness.applyEntitlementLoss).not.toHaveBeenCalled();
  });

  it("defers an unsupported node before claiming its Task", async () => {
    const executionSpec = createExecutionSpec("chatai-workflow");
    executionSpec.nodes.splice(1, 0, {
      config: {},
      id: "tag",
      kind: "tag",
      nodeSchemaVersion: 1,
    });
    executionSpec.edges = [
      { id: "start-tag", source: "start", sourceOutletId: "default", target: "tag" },
      { id: "tag-end", source: "tag", sourceOutletId: "default", target: "end" },
    ];
    const harness = createHarness({
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
      executionSpec,
    });
    const claimTask = vi.spyOn(harness.runtime, "claimTask");
    const created = await harness.runtime.createRunWithInitialTask({
      context: { outputs: {}, trigger: {} },
      entryEventId: "existing-tag-task",
      entryPolicy: { mode: "never" },
      initialNodeId: "tag",
      initialNodeKind: "tag",
      occurredAt: now,
      revision: 1,
      shardId: 7,
      subjectId: "shared-subject",
      subjectType: "chatai_contact",
      uid: 9,
      workflowId: "chatai-workflow",
      workflowType: "chatai_sop",
    });
    if (created.kind !== "success") throw new Error("Run was not created");

    await expect(harness.service.executeTask({
      now,
      taskId: created.task.id,
      taskVersion: created.task.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).rejects.toMatchObject({ code: "WORKFLOW_RUNTIME_NODE_UNSUPPORTED" });

    expect(claimTask).not.toHaveBeenCalled();
    await expect(harness.runtime.findTask(9, created.task.id)).resolves.toMatchObject({
      attempt: 0,
      dueAt: new Date(now.getTime() + 60_000),
      status: "pending",
      taskVersion: 2,
    });
  });

  it("does not create a Run containing a node that is not runtime-ready", async () => {
    const executionSpec = createExecutionSpec("chatai-workflow");
    executionSpec.nodes.splice(1, 0, {
      config: {},
      id: "llm",
      kind: "llm",
      nodeSchemaVersion: 1,
    });
    executionSpec.edges = [
      { id: "start-llm", source: "start", sourceOutletId: "default", target: "llm" },
      { id: "llm-end", source: "llm", sourceOutletId: "default", target: "end" },
    ];
    const harness = createHarness({
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
      executionSpec,
    });

    await expect(harness.service.startRun(entryInput())).rejects.toMatchObject({
      code: "WORKFLOW_RUNTIME_NODE_UNSUPPORTED",
    });
    expect(harness.runtime.runs).toHaveLength(0);
  });

  it("keeps identical Subject ids isolated by Subject type", async () => {
    const harness = createHarness({
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
    });
    const chatai = await harness.service.startRun(entryInput());
    const wecom = await harness.service.startRun(entryInput({
      entryEventId: "event-wecom",
      subjectType: "wecom_contact",
      workflowId: "wecom-workflow",
    }));

    expect(chatai.run.subjectId).toBe(wecom.run.subjectId);
    expect(chatai.run.subjectType).not.toBe(wecom.run.subjectType);
    expect(chatai.run.shardId).not.toBe(wecom.run.shardId);
  });

  it("validates that every runtime-ready node has a composed execution path", () => {
    const incomplete = createHarness({
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
    });
    expect(() => incomplete.service.assertRuntimeComposition())
      .toThrow("message-query");

    const complete = createHarness({
      capabilityPort: true,
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
      messageQueryPort: true,
    });
    expect(() => complete.service.assertRuntimeComposition()).not.toThrow();
  });
});

function createHarness(options: {
  capabilityPort?: boolean;
  entitlement: () => Promise<WorkflowTypeEntitlementResult>;
  executionSpec?: WorkflowExecutionSpec;
  messageQueryPort?: boolean;
}) {
  const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
  const applyEntitlementLoss = vi.fn(async () => ({ affectedDefinitions: 1 }));
  const control = {
    applyEntitlementLoss,
    findDefinition: vi.fn(async (_uid: number, workflowId: string) => {
      const identity = getWorkflowIdentity(workflowId);
      return {
        bizStatus: 1 as const,
        publishedRevision: 1,
        runtimeStatus: "active" as const,
        statusReason: null,
        workflowType: identity.workflowType,
      };
    }),
    findRevision: vi.fn(async (_uid: number, workflowId: string) => {
      const identity = getWorkflowIdentity(workflowId);
      return {
        executionSpec: options.executionSpec ?? createExecutionSpec(workflowId),
        revision: 1,
        subjectType: identity.subjectType,
        workflowType: identity.workflowType,
      };
    }),
  };
  const service = new WorkflowRuntimeService(
    control,
    runtime,
    options.capabilityPort ? { execute: async () => ({}) } : undefined,
    {
      ...(options.capabilityPort
        ? { capabilityBindings: [WORKFLOW_MESSAGE_CAPABILITY_BINDING] }
        : {}),
      clock: () => now,
      entitlementPort: { check: options.entitlement },
      ...(options.messageQueryPort
        ? { messageQueryPort: { execute: async () => ({}) } }
        : {}),
    },
  );
  return { applyEntitlementLoss, runtime, service };
}

function getWorkflowIdentity(workflowId: string): {
  subjectType: WorkflowSubjectType;
  workflowType: WorkflowType;
} {
  return workflowId === "wecom-workflow"
    ? { subjectType: "wecom_contact", workflowType: "wecom_sop" }
    : { subjectType: "chatai_contact", workflowType: "chatai_sop" };
}

function entryInput(overrides: Partial<Parameters<WorkflowRuntimeService["startRun"]>[0]> = {}) {
  return {
    entryEventId: "event-chatai",
    expectedRevision: 1,
    subjectId: "shared-subject",
    subjectType: "chatai_contact" as const,
    trigger: {},
    uid: 9,
    workflowId: "chatai-workflow",
    ...overrides,
  };
}

function createExecutionSpec(workflowId: string): WorkflowExecutionSpec {
  return {
    edges: [{ id: "start-end", source: "start", sourceOutletId: "default", target: "end" }],
    entryNodeId: "start",
    nodes: [
      {
        config: workflowId === "wecom-workflow"
          ? {
              entryPolicy: { mode: "never" },
              triggers: [{ sourceIds: [], type: "contact.friend_added" }],
              workUserIds: [201],
            }
          : {
              entryPolicy: { mode: "never" },
              seatIds: [101],
              triggers: [{ sourceIds: [], type: "contact.friend_added" }],
            },
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
      },
    ],
    revision: 1,
    schemaVersion: 3,
    terminalNodeId: "end",
    workflowId,
  };
}
