import { describe, expect, it } from "vitest";
import {
  InMemoryWorkflowRepository,
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
  WorkflowService,
} from "../../../src/modules/workflow/index.js";

const owner = { roles: ["owner"], subUserId: "17", uid: 9 };

describe("WorkflowRuntimeService", () => {
  it("deduplicates entry and advances one token through start and end", async () => {
    const control = new InMemoryWorkflowRepository();
    const runtime = createRuntimeRepository(control);
    const definition = await createEnabledWorkflow(control, createDraft());
    const service = new WorkflowRuntimeService(control, runtime);

    const first = await service.startRun({
      entryEventId: "event-1",
      subjectId: "customer-1",
      trigger: { source: "member-created" },
      uid: owner.uid,
      workflowId: definition.id,
    });
    const duplicate = await service.startRun({
      entryEventId: "event-1",
      subjectId: "customer-1",
      trigger: { source: "member-created" },
      uid: owner.uid,
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
    const service = new WorkflowRuntimeService(control, runtime);
    const started = await service.startRun({
      entryEventId: "event-wait",
      subjectId: "customer-2",
      trigger: {},
      uid: owner.uid,
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

    expect(waited.run.status).toBe("waiting");
    expect(waited.nextTask).toMatchObject({
      dueAt: new Date("2026-07-12T00:00:01.000Z"),
      nodeId: "end",
      status: "pending",
    });
  });

  it("rejects stale task versions and execution while paused", async () => {
    const control = new InMemoryWorkflowRepository();
    const runtime = createRuntimeRepository(control);
    const definition = await createEnabledWorkflow(control, createDraft());
    const workflow = new WorkflowService(control);
    const service = new WorkflowRuntimeService(control, runtime);
    const started = await service.startRun({
      entryEventId: "event-fence",
      subjectId: "customer-3",
      trigger: {},
      uid: owner.uid,
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
    const workflow = new WorkflowService(control);
    const service = new WorkflowRuntimeService(control, runtime);
    const started = await service.startRun({
      entryEventId: "event-delete",
      subjectId: "customer-deleted",
      trigger: {},
      uid: owner.uid,
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
    nodes: [node("start", "start"), node("wait", "wait", { duration: 2, unit: "day" }), node("end", "end")],
    viewport: { x: 0, y: 0, zoom: 1 },
  });
}

async function createEnabledWorkflow(
  repository: InMemoryWorkflowRepository,
  draft: ReturnType<typeof createDraft>,
) {
  const service = new WorkflowService(repository);
  const created = await service.create(owner, {});
  const saved = await service.saveDraft(owner, created.id, { draft, expectedDraftVersion: 1 });
  await service.publish(owner, created.id, { expectedDraftVersion: saved.draftVersion });
  return service.enable(owner, created.id);
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
      summary: "",
      title: kind,
    },
    id,
    position: { x: 0, y: 0 },
  };
}

function startConfig() {
  return {
    accountIds: ["account-a"],
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" as const },
    triggers: [{ type: "contact.friend_added" as const }],
  };
}
