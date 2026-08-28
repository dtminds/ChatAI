import type { WorkflowDraft } from "@chatai/contracts";
import { compileWorkflowDraft } from "@chatai/workflow-engine";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
} from "../src/index.js";

const now = new Date("2026-08-20T00:00:00.000Z");

describe("Ratio Split runtime", () => {
  it("freezes the allocation at Node Arrival and records the selected Source Outlet", async () => {
    const revision1 = compileRatioSplit(1, 0);
    const revision2 = compileRatioSplit(2, 10_000);
    let publishedRevision = 1;
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, () => publishedRevision, [revision1, revision2]);
    const started = await startRun(service);

    const startResult = await service.executeTask(taskInput(started.task));
    if (!("nextTask" in startResult) || !startResult.nextTask) throw new Error("Split task missing");
    expect(startResult.nextTask).toMatchObject({ nodeId: "split", revision: 1 });
    expect(runtime.snapshot().nodeExecutions.find(execution => execution.nodeId === "start"))
      .toMatchObject({ sourceOutletId: null });

    publishedRevision = 2;
    const splitResult = await service.executeTask(taskInput(startResult.nextTask));

    expect(splitResult).toMatchObject({
      kind: "success",
      nextTask: { nodeId: "b-path", revision: 2 },
    });
    expect(runtime.snapshot().nodeExecutions.find(execution => execution.nodeId === "split"))
      .toMatchObject({ output: {}, revision: 1, sourceOutletId: "ratio-b" });
    expect((await runtime.findRun(9, started.run.id))?.context)
      .toMatchObject({ outputs: { split: {} } });
  });

  it("uses the latest allocation when an in-flight Run has not arrived at the node", async () => {
    const revision1 = compileRatioSplit(1, 0);
    const revision2 = compileRatioSplit(2, 10_000);
    let publishedRevision = 1;
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, () => publishedRevision, [revision1, revision2]);
    const started = await startRun(service);

    publishedRevision = 2;
    const startResult = await service.executeTask(taskInput(started.task));
    if (!("nextTask" in startResult) || !startResult.nextTask) throw new Error("Split task missing");
    expect(startResult.nextTask).toMatchObject({ nodeId: "split", revision: 2 });

    const splitResult = await service.executeTask(taskInput(startResult.nextTask));
    expect(splitResult).toMatchObject({
      kind: "success",
      nextTask: { nodeId: "a-path", revision: 2 },
    });
    expect(runtime.snapshot().nodeExecutions.find(execution => execution.nodeId === "split"))
      .toMatchObject({ revision: 2, sourceOutletId: "ratio-a" });
  });

  it("takes a Flow Changed Exit when the pinned allocation selects a group deleted after Node Arrival", async () => {
    const revision1 = compileRatioSplitGroups(1, [
      { basisPoints: 0, id: "ratio-a", label: "A 组" },
      { basisPoints: 0, id: "ratio-b", label: "B 组" },
      { basisPoints: 10_000, id: "ratio-c", label: "C 组" },
    ]);
    const revision2 = compileRatioSplitGroups(2, [
      { basisPoints: 10_000, id: "ratio-a", label: "A 组" },
      { basisPoints: 0, id: "ratio-b", label: "B 组" },
    ]);
    let publishedRevision = 1;
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, () => publishedRevision, [revision1, revision2]);
    const started = await startRun(service);
    const startResult = await service.executeTask(taskInput(started.task));
    if (!("nextTask" in startResult) || !startResult.nextTask) throw new Error("Split task missing");

    publishedRevision = 2;
    await expect(service.executeTask(taskInput(startResult.nextTask))).resolves.toMatchObject({
      kind: "success",
      nextTask: null,
      run: {
        status: "cancelled",
        terminalReason: "flow_changed_outlet_deleted",
      },
    });
    expect(runtime.snapshot().nodeExecutions.find(execution => execution.nodeId === "split"))
      .toMatchObject({ sourceOutletId: "ratio-c" });
  });

  it("commits corrupted Ratio Split configuration as a terminal Core failure", async () => {
    const spec = compileRatioSplit(1, 5_000);
    const split = spec.nodes.find(node => node.id === "split");
    if (!split) throw new Error("Split node missing");
    split.config = {
      groups: [
        { basisPoints: 5_000, id: "ratio-a", label: "" },
        { basisPoints: 5_000, id: "ratio-b", label: "B 组" },
      ],
    };
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = createService(runtime, () => 1, [spec]);
    const started = await startRun(service);
    const startResult = await service.executeTask(taskInput(started.task));
    if (!("nextTask" in startResult) || !startResult.nextTask) throw new Error("Split task missing");

    await expect(service.executeTask(taskInput(startResult.nextTask))).resolves.toMatchObject({
      errorCode: "WORKFLOW_CORE_NODE_EXECUTION_INVALID",
      kind: "node-failed",
    });
    await expect(runtime.findRun(9, started.run.id)).resolves.toMatchObject({
      status: "failed",
      terminalReason: "WORKFLOW_CORE_NODE_EXECUTION_INVALID",
    });
  });
});

function createService(
  runtime: InMemoryWorkflowRuntimeRepository,
  getPublishedRevision: () => number,
  revisions: ReturnType<typeof compileRatioSplit>[],
) {
  return new WorkflowRuntimeService({
    applyEntitlementLoss: vi.fn(async () => ({ affectedDefinitions: 0 })),
    findDefinition: vi.fn(async () => ({
      bizStatus: 1 as const,
      publishedRevision: getPublishedRevision(),
      runtimeStatus: "active" as const,
      statusReason: null,
      workflowType: "chatai_sop" as const,
    })),
    findRevision: vi.fn(async (_uid, _workflowId, revision) => {
      const spec = revisions.find(candidate => candidate.revision === revision);
      return spec ? {
        executionSpec: spec,
        revision,
        subjectType: "chatai_contact" as const,
        workflowType: "chatai_sop" as const,
      } : null;
    }),
    findRuntimeSnapshots: vi.fn(async () => ({ invalidKeys: [], snapshots: [] })),
  }, runtime, undefined, {
    clock: () => now,
    entitlementPort: { check: async () => ({ activeRunLimit: 10_000, entitled: true, unentitledSince: null }) },
  });
}

async function startRun(service: WorkflowRuntimeService) {
  return service.startRun({
    entryEventId: "event-1",
    expectedRevision: 1,
    subjectId: "contact-1",
    subjectType: "chatai_contact",
    trigger: { eventType: "contact.friend_added", occurredAt: now.toISOString() },
    uid: 9,
    workflowId: "31",
  });
}

function taskInput(task: { id: string; taskVersion: number }) {
  return {
    now,
    taskId: task.id,
    taskVersion: task.taskVersion,
    uid: 9,
    workerId: "worker-1",
  };
}

function compileRatioSplit(revision: number, aBasisPoints: number) {
  return compileWorkflowDraft({
    draft: ratioSplitDraft(aBasisPoints),
    revision,
    workflowId: "31",
    workflowType: "chatai_sop",
  });
}

function compileRatioSplitGroups(
  revision: number,
  groups: Array<{ basisPoints: number; id: string; label: string }>,
) {
  return compileWorkflowDraft({
    draft: {
      edges: [
        { id: "start-split", source: "start", target: "split" },
        ...groups.map(group => ({
          id: `split-${group.id}`,
          source: "split",
          sourceHandle: group.id,
          target: `${group.id}-path`,
        })),
        ...groups.map(group => ({
          id: `${group.id}-end`,
          source: `${group.id}-path`,
          target: "end",
        })),
      ],
      nodes: [
        node("start", "start", {
          entryPolicy: { mode: "never" },
          seatIds: [101],
          triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
        }),
        node("split", "ratio-split", { groups }),
        ...groups.map(group => node(
          `${group.id}-path`,
          "wait",
          { duration: 1, mode: "duration", unit: "minute" },
        )),
        node("end", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    revision,
    workflowId: "31",
    workflowType: "chatai_sop",
  });
}

function ratioSplitDraft(aBasisPoints: number): WorkflowDraft {
  return {
    edges: [
      { id: "start-split", source: "start", target: "split" },
      { id: "split-a", source: "split", sourceHandle: "ratio-a", target: "a-path" },
      { id: "split-b", source: "split", sourceHandle: "ratio-b", target: "b-path" },
      { id: "a-end", source: "a-path", target: "end" },
      { id: "b-end", source: "b-path", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      }),
      node("split", "ratio-split", {
        groups: [
          { basisPoints: aBasisPoints, id: "ratio-a", label: "A 组" },
          { basisPoints: 10_000 - aBasisPoints, id: "ratio-b", label: "B 组" },
        ],
      }),
      node("a-path", "wait", { duration: 1, mode: "duration", unit: "minute" }),
      node("b-path", "wait", { duration: 1, mode: "duration", unit: "minute" }),
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
