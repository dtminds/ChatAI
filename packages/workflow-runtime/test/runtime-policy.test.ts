import type {
  WorkflowExecutionSpec,
  WorkflowSubjectType,
  WorkflowType,
  WorkflowTypeEntitlementResult,
} from "@chatai/contracts";
import {
  createWorkflowDeploymentCapabilities,
  WORKFLOW_INFERENCE_CAPABILITIES,
} from "@chatai/workflow-engine";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
} from "../src/index.js";

const now = new Date("2026-08-10T00:00:00.000Z");
const entryEventCapability = {
  capabilityKey: "event.contact.friend_added",
  contractVersion: 1,
} as const;

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

  it("does not create a Run when an entry capability is disabled in this deployment", async () => {
    const harness = createHarness({
      deploymentCapabilities: createWorkflowDeploymentCapabilities([]),
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
    });

    await expect(harness.service.startRun(entryInput())).rejects.toMatchObject({
      code: "WORKFLOW_DEPLOYMENT_CAPABILITY_DISABLED",
    });
    expect(harness.runtime.runs).toHaveLength(0);
  });

  it("does not create a Run for Inference excluded from the production registry", async () => {
    const executionSpec = createExecutionSpec("chatai-workflow");
    const inferenceCapability = WORKFLOW_INFERENCE_CAPABILITIES.llm;
    executionSpec.nodes.splice(1, 0, {
      config: {},
      id: "llm",
      kind: "llm",
      nodeSchemaVersion: 1,
      requiredCapabilities: [inferenceCapability],
    });
    executionSpec.edges = [
      { id: "start-llm", source: "start", sourceOutletId: "default", target: "llm" },
      { id: "llm-end", source: "llm", sourceOutletId: "default", target: "end" },
    ];
    executionSpec.requiredCapabilities.push(inferenceCapability);
    const harness = createHarness({
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
      executionSpec,
    });

    await expect(harness.service.startRun(entryInput())).rejects.toMatchObject({
      code: "WORKFLOW_DEPLOYMENT_CAPABILITY_DISABLED",
    });
    expect(harness.runtime.runs).toHaveLength(0);
  });

  it("defers a task without consuming an attempt when its deployment capability is removed", async () => {
    const deploymentCapabilities = createWorkflowDeploymentCapabilities([entryEventCapability]);
    const harness = createHarness({
      deploymentCapabilities,
      entitlement: async () => ({ entitled: true, unentitledSince: null }),
    });
    const started = await harness.service.startRun(entryInput());
    deploymentCapabilities.capabilities.length = 0;

    await expect(harness.service.executeTask({
      now,
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: 9,
      workerId: "worker-1",
    })).rejects.toMatchObject({ code: "WORKFLOW_DEPLOYMENT_CAPABILITY_DISABLED" });

    await expect(harness.runtime.findTask(9, started.task.id)).resolves.toMatchObject({
      attempt: 0,
      status: "pending",
      taskVersion: 2,
    });
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
});

function createHarness(options: {
  deploymentCapabilities?: ReturnType<typeof createWorkflowDeploymentCapabilities>;
  entitlement: () => Promise<WorkflowTypeEntitlementResult>;
  executionSpec?: WorkflowExecutionSpec;
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
  const service = new WorkflowRuntimeService(control, runtime, undefined, {
    clock: () => now,
    entitlementPort: { check: options.entitlement },
    ...(options.deploymentCapabilities
      ? { deploymentCapabilities: options.deploymentCapabilities }
      : {}),
  });
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
        requiredCapabilities: [entryEventCapability],
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
        requiredCapabilities: [],
      },
    ],
    requiredCapabilities: [entryEventCapability],
    revision: 1,
    schemaVersion: 2,
    terminalNodeId: "end",
    workflowId,
  };
}
