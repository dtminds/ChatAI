import type { WorkflowDraft } from "@chatai/contracts";
import {
  compileWorkflowDraft,
  createWorkflowDeploymentCapabilities,
} from "@chatai/workflow-engine";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
} from "../src/index.js";

const enteredAt = new Date("2026-08-10T00:00:00.000Z");
const entryCapability = {
  capabilityKey: "event.contact.friend_added",
  contractVersion: 1,
} as const;

describe("Branch runtime", () => {
  it("routes from compiled selectors after lease recovery and keeps Branch routing-only", async () => {
    const spec = compileWorkflowDraft({
      draft: branchDraft(),
      revision: 1,
      workflowId: "31",
      workflowType: "chatai_sop",
    });
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => enteredAt);
    const service = new WorkflowRuntimeService(control(spec), runtime, undefined, {
      clock: () => enteredAt,
      deploymentCapabilities: createWorkflowDeploymentCapabilities([entryCapability]),
      entitlementPort: { check: async () => ({ entitled: true, unentitledSince: null }) },
    });
    const started = await service.startRun({
      entryEventId: "event-1",
      expectedRevision: 1,
      subjectId: "contact-1",
      subjectType: "chatai_contact",
      trigger: { eventType: "contact.friend_added", occurredAt: enteredAt.toISOString() },
      uid: 9,
      workflowId: "31",
    });

    const startResult = await service.executeTask(taskInput(started.task));
    if (!("nextTask" in startResult) || !startResult.nextTask) throw new Error("Wait task missing");
    const waitResult = await service.executeTask(taskInput(startResult.nextTask));
    if (!("nextTask" in waitResult) || !waitResult.nextTask) throw new Error("Branch task missing");

    const branchTask = waitResult.nextTask;
    const claimed = await runtime.claimTask({
      expectedTaskVersion: branchTask.taskVersion,
      leaseExpiresAt: new Date("2026-08-10T00:01:01.000Z"),
      leaseOwner: "crashed-worker",
      taskId: branchTask.id,
      uid: 9,
    });
    expect(claimed.kind).toBe("success");
    await runtime.recoverExpiredLeases({
      limit: 10,
      maxAttempts: 3,
      now: new Date("2026-08-10T00:02:00.000Z"),
    });
    const recovered = await runtime.findTask(9, branchTask.id);
    if (!recovered) throw new Error("Recovered Branch task missing");

    const branchResult = await service.executeTask(taskInput(recovered, new Date("2026-08-10T00:02:00.000Z")));
    expect(branchResult).toMatchObject({
      kind: "success",
      nextTask: { nodeId: "matched" },
    });
    const run = await runtime.findRun(9, started.run.id);
    expect(run?.context).toMatchObject({
      outputs: { branch: {}, start: {}, wait: { dueAt: "2026-08-10T00:01:00.000Z" } },
    });
    expect(run?.context).not.toHaveProperty("branchMatches");
  });
});

function control(spec: ReturnType<typeof compileWorkflowDraft>) {
  return {
    applyEntitlementLoss: vi.fn(async () => ({ affectedDefinitions: 0 })),
    findDefinition: vi.fn(async () => ({
      bizStatus: 1 as const,
      publishedRevision: 1,
      runtimeStatus: "active" as const,
      statusReason: null,
      workflowType: "chatai_sop" as const,
    })),
    findRevision: vi.fn(async () => ({
      executionSpec: spec,
      revision: 1,
      subjectType: "chatai_contact" as const,
      workflowType: "chatai_sop" as const,
    })),
  };
}

function taskInput(task: { id: string; taskVersion: number }, now = enteredAt) {
  return {
    now,
    taskId: task.id,
    taskVersion: task.taskVersion,
    uid: 9,
    workerId: "worker-1",
  };
}

function branchDraft(): WorkflowDraft {
  return {
    edges: [
      { id: "start-wait", source: "start", target: "wait" },
      { id: "wait-branch", source: "wait", target: "branch" },
      { id: "branch-matched", source: "branch", sourceHandle: "matched", target: "matched" },
      { id: "branch-default", source: "branch", sourceHandle: "default", target: "fallback" },
      { id: "matched-end", source: "matched", target: "end" },
      { id: "fallback-end", source: "fallback", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        accountIds: ["account-a"],
        entryPolicy: { mode: "never" },
        triggers: [{ type: "contact.friend_added" }],
      }),
      node("wait", "wait", { duration: 1, mode: "duration", unit: "minute" }),
      node("branch", "branch", {
        branchPaths: [
          {
            conditions: [{
              id: "condition-1",
              operator: "equals",
              selector: ["node", "wait", "dueAt"],
              value: "2026-08-10T08:01",
              valueType: "datetime",
            }],
            id: "matched",
            label: "如果",
            logic: "all",
          },
          { conditions: [], id: "default", isDefault: true, label: "否则", logic: "all" },
        ],
      }),
      node("matched", "wait", { duration: 1, mode: "duration", unit: "minute" }),
      node("fallback", "wait", { duration: 1, mode: "duration", unit: "minute" }),
      node("end", "end"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function node(id: string, kind: string, config: Record<string, unknown> = {}) {
  return {
    data: {
      ...config,
      kind,
      label: kind,
      metric: "",
      schemaVersion: 1,
      status: "ready" as const,
      title: kind,
    },
    id,
    position: { x: 0, y: 0 },
    type: "workflowNode",
  };
}
