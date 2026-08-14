import { describe, expect, it, vi } from "vitest";
import { createWorkflowDeploymentCapabilities } from "@chatai/workflow-engine";
import {
  InMemoryWorkflowRepository,
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
  WorkflowService,
} from "../../../src/modules/workflow/index.js";

const owner = { roles: ["owner"], subUserId: "17", uid: 9 };

describe("WorkflowRuntimeService", () => {
  it("uses the configured execution lease duration when claiming a task", async () => {
    const control = new InMemoryWorkflowRepository();
    const runtime = createRuntimeRepository(control);
    const claimTask = vi.spyOn(runtime, "claimTask");
    const definition = await createEnabledWorkflow(control, createDraft());
    const service = createRuntimeService(control, runtime, {
      taskLeaseDurationMs: 120_000,
    });
    const started = await service.startRun({
      entryEventId: "event-lease",
      expectedRevision: 1,
      subjectId: "customer-lease",
      subjectType: "chatai_contact",
      trigger: {},
      uid: owner.uid,
      workflowId: definition.id,
    });

    await service.executeTask({
      now: new Date("2026-07-10T00:00:00.000Z"),
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: owner.uid,
      workerId: "worker-1",
    });

    expect(claimTask).toHaveBeenCalledWith(expect.objectContaining({
      leaseExpiresAt: new Date("2026-07-10T00:02:00.000Z"),
    }));
  });

  it("deduplicates entry and advances one token through start and end", async () => {
    const control = new InMemoryWorkflowRepository();
    const runtime = createRuntimeRepository(control);
    const definition = await createEnabledWorkflow(control, createDraft());
    const service = createRuntimeService(control, runtime);

    const first = await service.startRun({
      entryEventId: "event-1",
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      trigger: { source: "member-created" },
      uid: owner.uid,
      expectedRevision: 1,
      workflowId: definition.id,
    });
    const duplicate = await service.startRun({
      entryEventId: "event-1",
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      trigger: { source: "member-created" },
      uid: owner.uid,
      expectedRevision: 1,
      workflowId: definition.id,
    });

    expect(duplicate.run.id).toBe(first.run.id);
    expect(runtime.runs).toHaveLength(1);

    const start = await service.executeTask({
      now: new Date("2026-07-10T00:00:00.000Z"),
      taskId: first.task.id,
      taskVersion: first.task.taskVersion,
      uid: owner.uid,
      workerId: "worker-1",
    });
    expect(start.nextTask?.nodeId).toBe("end");

    const end = await service.executeTask({
      now: new Date("2026-07-10T00:00:02.000Z"),
      taskId: start.nextTask!.id,
      taskVersion: start.nextTask!.taskVersion,
      uid: owner.uid,
      workerId: "worker-1",
    });
    expect(end.run.status).toBe("completed");
    expect(runtime.nodeExecutions).toHaveLength(2);
  });

  it("persists wait as a pending due task instead of an in-process timer", async () => {
    const control = new InMemoryWorkflowRepository();
    const runtime = createRuntimeRepository(control);
    const definition = await createEnabledWaitWorkflow(control);
    const service = createRuntimeService(control, runtime);
    const started = await service.startRun({
      entryEventId: "event-wait",
      subjectId: "customer-2",
      subjectType: "chatai_contact",
      trigger: {},
      uid: owner.uid,
      expectedRevision: 1,
      workflowId: definition.id,
    });
    const start = await service.executeTask({
      now: new Date("2026-07-10T00:00:00.000Z"),
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: owner.uid,
      workerId: "worker-1",
    });

    const waited = await service.executeTask({
      now: new Date("2026-07-10T00:00:01.000Z"),
      taskId: start.nextTask!.id,
      taskVersion: start.nextTask!.taskVersion,
      uid: owner.uid,
      workerId: "worker-1",
    });

    expect(waited.kind).toBe("waiting");
    expect(waited.run.status).toBe("waiting");
    expect(waited.task).toMatchObject({
      dueAt: new Date("2026-07-12T00:00:01.000Z"),
      nodeId: "wait",
      status: "pending",
      taskType: "wait",
    });
  });

  it("rejects stale task versions and execution while paused", async () => {
    const control = new InMemoryWorkflowRepository();
    const runtime = createRuntimeRepository(control);
    const definition = await createEnabledWorkflow(control, createDraft());
    const workflow = createWorkflowService(control);
    const service = createRuntimeService(control, runtime);
    const started = await service.startRun({
      entryEventId: "event-fence",
      subjectId: "customer-3",
      subjectType: "chatai_contact",
      trigger: {},
      uid: owner.uid,
      expectedRevision: 1,
      workflowId: definition.id,
    });

    await workflow.pause(owner, definition.id);
    await expect(service.executeTask({
      now: new Date(),
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: owner.uid,
      workerId: "worker-1",
    })).rejects.toMatchObject({ code: "WORKFLOW_RUNTIME_PAUSED" });

    const deferredTask = await runtime.findTask(owner.uid, started.task.id);
    expect(deferredTask).toMatchObject({ status: "pending", taskVersion: 2 });

    await workflow.resume(owner, definition.id);
    await service.executeTask({
      now: new Date(),
      taskId: started.task.id,
      taskVersion: deferredTask!.taskVersion,
      uid: owner.uid,
      workerId: "worker-1",
    });
    await expect(service.executeTask({
      now: new Date(),
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: owner.uid,
      workerId: "worker-2",
    })).rejects.toMatchObject({ code: "WORKFLOW_TASK_STALE" });
  });

  it("cancels a dispatched task at the execution boundary after logical deletion", async () => {
    const control = new InMemoryWorkflowRepository();
    const runtime = createRuntimeRepository(control);
    const definition = await createEnabledWorkflow(control, createDraft());
    const workflow = createWorkflowService(control);
    const service = createRuntimeService(control, runtime);
    const started = await service.startRun({
      entryEventId: "event-delete",
      subjectId: "customer-deleted",
      subjectType: "chatai_contact",
      trigger: {},
      uid: owner.uid,
      expectedRevision: 1,
      workflowId: definition.id,
    });

    await workflow.delete(owner, definition.id);
    await expect(service.executeTask({
      now: new Date(),
      taskId: started.task.id,
      taskVersion: started.task.taskVersion,
      uid: owner.uid,
      workerId: "worker-1",
    })).rejects.toMatchObject({ code: "WORKFLOW_RUNTIME_UNAVAILABLE" });

    await expect(runtime.findTask(owner.uid, started.task.id))
      .resolves.toMatchObject({ status: "cancelled", taskVersion: 2 });
  });

  it("rejects an entry matched against a stale trigger binding revision", async () => {
    const control = new InMemoryWorkflowRepository();
    const runtime = createRuntimeRepository(control);
    const definition = await createEnabledWorkflow(control, createDraft());
    const service = createRuntimeService(control, runtime);

    await expect(service.startRun({
      entryEventId: "event-stale-binding",
      expectedRevision: 2,
      subjectId: "customer-stale",
      subjectType: "chatai_contact",
      trigger: {},
      uid: owner.uid,
      workflowId: definition.id,
    })).rejects.toMatchObject({ code: "WORKFLOW_DEFINITION_STALE" });
    expect(runtime.runs).toHaveLength(0);
  });
});

function createRuntimeRepository(control: InMemoryWorkflowRepository) {
  return new InMemoryWorkflowRuntimeRepository(async ({ uid, workflowId }) => {
    const definition = await control.findDefinition(uid, workflowId);
    return definition
      ? { bizStatus: definition.bizStatus, runtimeStatus: definition.runtimeStatus }
      : null;
  });
}

async function createEnabledWaitWorkflow(repository: InMemoryWorkflowRepository) {
  return createEnabledWorkflow(repository, {
    edges: [edge("start", "wait"), edge("wait", "end")],
    nodes: [
      node("start", "start"),
      node("wait", "wait", { duration: 2, mode: "duration", unit: "day" }),
      node("end", "end"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  });
}

async function createEnabledWorkflow(
  repository: InMemoryWorkflowRepository,
  draft: ReturnType<typeof createDraft>,
) {
  const service = createWorkflowService(repository);
  const created = await service.create(owner, { workflowType: "chatai_sop" });
  const saved = await service.saveDraft(owner, created.id, { draft, expectedDraftVersion: 1 });
  await service.publish(owner, created.id, { expectedDraftVersion: saved.draftVersion });
  return service.enable(owner, created.id);
}

function createWorkflowService(repository: InMemoryWorkflowRepository) {
  return new WorkflowService(repository, {
    deploymentCapabilities: deploymentCapabilities(),
    entitlementPort: entitledPort(),
    sourceIdentityResolver: {
      async resolveActiveSeatWorkUserIds(_uid, seatIds) {
        return new Map(seatIds.map(seatId => [seatId, seatId + 100]));
      },
    },
  });
}

function createRuntimeService(
  control: InMemoryWorkflowRepository,
  runtime: InMemoryWorkflowRuntimeRepository,
  options: { taskLeaseDurationMs?: number } = {},
) {
  return new WorkflowRuntimeService(control, runtime, undefined, {
    ...options,
    deploymentCapabilities: deploymentCapabilities(),
    entitlementPort: entitledPort(),
  });
}

function deploymentCapabilities() {
  return createWorkflowDeploymentCapabilities([{
    capabilityKey: "event.contact.friend_added",
    contractVersion: 1,
  }]);
}

function entitledPort() {
  return { check: async () => ({ entitled: true as const, unentitledSince: null }) };
}

function createDraft() {
  return {
    edges: [edge("start", "end")],
    nodes: [node("start", "start"), node("end", "end")],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function edge(source: string, target: string, sourceHandle?: string) {
  return { id: `edge-${source}-${sourceHandle ?? "default"}-${target}`, source, sourceHandle, target };
}

function node(
  id: string,
  kind: "branch" | "end" | "start" | "wait",
  config: Record<string, unknown> = {},
) {
  return {
    data: {
      ...(kind === "start" ? startConfig() : {}),
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
  };
}

function startConfig() {
  return {
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" as const },
    seatIds: [101],
    triggers: [{ sourceIds: [], type: "contact.friend_added" as const }],
  };
}
