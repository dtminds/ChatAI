import type {
  WorkflowExecutionSpec,
  WorkflowSubjectType,
  WorkflowType,
  WorkflowTypeEntitlementResult,
} from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
  WORKFLOW_HANDOFF_CAPABILITY_BINDING,
  WORKFLOW_MESSAGE_CAPABILITY_BINDING,
  WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING,
  WORKFLOW_TAG_CAPABILITY_BINDING,
  WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
  WorkflowRuntimeService,
  type WorkflowCapabilityExecutionBinding,
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

  it("does not prepare irrelevant identity data before a core node", async () => {
    const harness = createHarness({
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
    });
    const started = await harness.service.startRun(entryInput({
      trigger: { projection: { thirdExternalUserId: "conflicting-chatai-id" } },
    }));

    await expect(harness.service.executeTask({
      now,
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({
      kind: "success",
      nextTask: { nodeId: "end" },
    });
    await expect(harness.runtime.findTask(9, started.task.id)).resolves.toMatchObject({
      status: "completed",
    });
  });

  it("commits a terminal Prepare failure for a core node that needs global context", async () => {
    const harness = createHarness({
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
      executionSpec: createGlobalBranchExecutionSpec(),
    });
    const started = await harness.service.startRun(entryInput({
      trigger: { projection: { thirdExternalUserId: "conflicting-chatai-id" } },
    }));
    const startResult = await harness.service.executeTask({
      now,
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });
    if (!("nextTask" in startResult) || !startResult.nextTask) {
      throw new Error("Branch Task was not created");
    }

    await expect(harness.service.executeTask({
      now,
      taskId: startResult.nextTask.id,
      taskVersion: startResult.nextTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({
      errorCode: "WORKFLOW_CONTACT_IDENTITY_CONFLICT",
      failureKind: "terminal",
      kind: "failed",
      run: { status: "failed" },
      task: { status: "dead" },
    });
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
      id: "order-query",
      kind: "order-query",
      nodeSchemaVersion: 1,
    });
    executionSpec.edges = [
      { id: "start-query", source: "start", sourceOutletId: "default", target: "order-query" },
      { id: "query-end", source: "order-query", sourceOutletId: "default", target: "end" },
    ];
    const harness = createHarness({
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
      executionSpec,
    });
    const claimTask = vi.spyOn(harness.runtime, "claimTask");
    const created = await harness.runtime.createRunWithInitialTask({
      context: { outputs: {}, trigger: {} },
      entryEventId: "existing-unsupported-task",
      entryPolicy: { mode: "never" },
      initialNodeId: "order-query",
      initialNodeKind: "order-query",
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

  it("accepts a Run containing a runtime-ready LLM node", async () => {
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

    await expect(harness.service.startRun(entryInput())).resolves.toMatchObject({
      kind: "success",
    });
    expect(harness.runtime.runs).toHaveLength(1);
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

  it("executes a runtime-ready Tag Query with the prepared externalUserId", async () => {
    const harness = createHarness({
      capabilityResult: {
        matchedTags: [{ id: 302, name: "已成交" }],
      },
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
      executionSpec: createTagQueryExecutionSpec(),
    });
    const started = await harness.service.startRun(entryInput({
      trigger: { projection: { externalUserId: 101 } },
    }));
    const startResult = await harness.service.executeTask({
      now,
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });
    if (!("nextTask" in startResult) || !startResult.nextTask) {
      throw new Error("Tag Query Task was not created");
    }

    await expect(harness.service.executeTask({
      now,
      taskId: startResult.nextTask.id,
      taskVersion: startResult.nextTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({
      kind: "success",
      nextTask: { nodeId: "end" },
      run: {
        context: {
          outputs: {
            "tag-query": {
              matched: true,
              matchedTagCount: 1,
              matchedTagNames: "已成交",
            },
          },
        },
      },
    });
    expect(harness.capabilityCalls).toHaveLength(1);
    expect(harness.capabilityCalls[0]).toMatchObject({
      definition: { capabilityKey: "customer.tag.query", kind: "query" },
      request: {
        command: { tagIds: [301, 302] },
        identities: { externalUserId: 101 },
      },
    });
    expect(harness.capabilityCalls[0]?.request).not.toHaveProperty("idempotencyKey");
  });

  it("executes a runtime-ready Tag action with prepared identity and a stable key", async () => {
    const harness = createHarness({
      capabilityResult: {},
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
      executionSpec: createTagExecutionSpec(),
    });
    const started = await harness.service.startRun(entryInput({
      trigger: { projection: { externalUserId: 101 } },
    }));
    const startResult = await harness.service.executeTask({
      now,
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });
    if (!("nextTask" in startResult) || !startResult.nextTask) {
      throw new Error("Tag Task was not created");
    }

    await expect(harness.service.executeTask({
      now,
      taskId: startResult.nextTask.id,
      taskVersion: startResult.nextTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({
      kind: "success",
      nextTask: { nodeId: "end" },
    });
    expect(harness.capabilityCalls).toHaveLength(1);
    expect(harness.capabilityCalls[0]).toMatchObject({
      definition: { capabilityKey: "customer.tag.update", kind: "action" },
      request: {
        command: { operation: "remove", source: "workflow", tagIds: [301, 302] },
        idempotencyKey: `9:${started.run.id}:tag:2`,
        identities: { externalUserId: 101 },
      },
    });
  });

  it("executes a runtime-ready Customer Update action with prepared identity and a stable key", async () => {
    const harness = createHarness({
      capabilityResult: {},
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
      executionSpec: createCustomerUpdateExecutionSpec(),
    });
    const started = await harness.service.startRun(entryInput({
      trigger: { projection: { externalUserId: 101 } },
    }));
    const startResult = await harness.service.executeTask({
      now,
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: 9,
      workerId: "worker-1",
    });
    if (!("nextTask" in startResult) || !startResult.nextTask) {
      throw new Error("Customer Update Task was not created");
    }

    await expect(harness.service.executeTask({
      now,
      taskId: startResult.nextTask.id,
      taskVersion: startResult.nextTask.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).resolves.toMatchObject({
      kind: "success",
      nextTask: { nodeId: "end" },
    });
    expect(harness.capabilityCalls).toHaveLength(1);
    expect(harness.capabilityCalls[0]).toMatchObject({
      definition: { capabilityKey: "customer.update", kind: "action" },
      request: {
        command: {
          source: "workflow",
          updates: [{ fieldId: 301, fieldType: 1, value: "重点客户" }],
        },
        idempotencyKey: `9:${started.run.id}:customer-update:2`,
        identities: { externalUserId: 101 },
      },
    });
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
  capabilityBindings?: readonly WorkflowCapabilityExecutionBinding[];
  capabilityPort?: boolean;
  capabilityResult?: unknown;
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
  const capabilityCalls: Array<{ definition: unknown; request: unknown }> = [];
  const hasCapabilityPort = options.capabilityPort || options.capabilityResult !== undefined;
  const service = new WorkflowRuntimeService(
    control,
    runtime,
    hasCapabilityPort
      ? {
          execute: async (definition, request) => {
            capabilityCalls.push({ definition, request });
            return options.capabilityResult ?? {};
          },
        }
      : undefined,
    {
      ...(hasCapabilityPort
        ? {
            capabilityBindings: options.capabilityBindings ?? [
              WORKFLOW_HANDOFF_CAPABILITY_BINDING,
              WORKFLOW_MESSAGE_CAPABILITY_BINDING,
              WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
              WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING,
              WORKFLOW_TAG_CAPABILITY_BINDING,
              WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
            ],
          }
        : {}),
      clock: () => now,
      entitlementPort: { check: options.entitlement },
      ...(options.messageQueryPort
        ? { messageQueryPort: { execute: async () => ({}) } }
        : {}),
    },
  );
  return { applyEntitlementLoss, capabilityCalls, runtime, service };
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

function createGlobalBranchExecutionSpec(): WorkflowExecutionSpec {
  const spec = createExecutionSpec("chatai-workflow");
  spec.nodes.splice(1, 0, {
    config: {
      branchPaths: [
        {
          conditions: [{
            id: "global-customer-name",
            operator: "is-not-empty",
            selector: ["global", "customer", "name"],
            valueType: "string",
          }],
          id: "matched",
          label: "已匹配",
          logic: "all",
        },
        {
          conditions: [],
          id: "default",
          isDefault: true,
          label: "否则",
          logic: "all",
        },
      ],
    },
    id: "branch",
    kind: "branch",
    nodeSchemaVersion: 1,
  });
  spec.edges = [
    { id: "start-branch", source: "start", sourceOutletId: "default", target: "branch" },
    { id: "branch-matched", source: "branch", sourceOutletId: "matched", target: "end" },
    { id: "branch-default", source: "branch", sourceOutletId: "default", target: "end" },
  ];
  return spec;
}

function createTagQueryExecutionSpec(): WorkflowExecutionSpec {
  const spec = createExecutionSpec("chatai-workflow");
  spec.nodes.splice(1, 0, {
    config: { matchMode: "any", tagIds: [301, 302] },
    id: "tag-query",
    kind: "tag-query",
    nodeSchemaVersion: 1,
  });
  spec.edges = [
    { id: "start-query", source: "start", sourceOutletId: "default", target: "tag-query" },
    { id: "query-end", source: "tag-query", sourceOutletId: "default", target: "end" },
  ];
  return spec;
}

function createTagExecutionSpec(): WorkflowExecutionSpec {
  const spec = createExecutionSpec("chatai-workflow");
  spec.nodes.splice(1, 0, {
    config: { operation: "remove", tagIds: [301, 302] },
    id: "tag",
    kind: "tag",
    nodeSchemaVersion: 1,
  });
  spec.edges = [
    { id: "start-tag", source: "start", sourceOutletId: "default", target: "tag" },
    { id: "tag-end", source: "tag", sourceOutletId: "default", target: "end" },
  ];
  return spec;
}

function createCustomerUpdateExecutionSpec(): WorkflowExecutionSpec {
  const spec = createExecutionSpec("chatai-workflow");
  spec.nodes.splice(1, 0, {
    config: {
      fields: [{
        fieldId: 301,
        fieldType: 1,
        value: { kind: "literal", value: "重点客户" },
      }],
    },
    id: "customer-update",
    kind: "customer-update",
    nodeSchemaVersion: 1,
  });
  spec.edges = [
    {
      id: "start-customer-update",
      source: "start",
      sourceOutletId: "default",
      target: "customer-update",
    },
    {
      id: "customer-update-end",
      source: "customer-update",
      sourceOutletId: "default",
      target: "end",
    },
  ];
  return spec;
}
