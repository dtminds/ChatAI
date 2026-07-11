import { describe, expect, it } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeReconciler,
} from "../../../src/modules/workflow/index.js";

describe("workflow runtime repository", () => {
  it("deduplicates entry events and creates one initial task", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const input = createRunInput();

    const first = await repository.createRunWithInitialTask(input);
    const duplicate = await repository.createRunWithInitialTask(input);

    expect(first.deduplicated).toBe(false);
    expect(duplicate).toMatchObject({ deduplicated: true, run: { id: first.run.id } });
    expect(repository.snapshot().tasks).toHaveLength(1);
    expect(repository.snapshot().outbox).toHaveLength(1);
  });

  it("claims a task only with the current task version", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());

    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });

    expect(claimed).toMatchObject({ kind: "success", task: { status: "running", taskVersion: 2 } });
    await expect(repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-2",
      taskId: created.task.id,
      uid: 9,
    })).resolves.toEqual({ kind: "conflict" });
  });

  it("commits execution and the next task under run and task version fences", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());
    const claimed = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");

    const committed = await repository.commitNodeResult({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: { consumer: "workflow-task", expiresAt: new Date("2026-08-10T00:00:00.000Z"), messageId: "message-1" },
      nodeExecution: {
        idempotencyKey: "9:1:start:1",
        input: {},
        output: {},
      },
      nextTask: {
        dueAt: new Date("2026-07-10T00:00:00.000Z"),
        nodeId: "end",
        nodeKind: "end",
        taskType: "execute",
      },
      runId: created.run.id,
      taskId: claimed.task.id,
      uid: 9,
    });

    expect(committed).toMatchObject({ kind: "success", run: { lockVersion: 2, sequence: 2 } });
    expect(repository.snapshot().nodeExecutions).toHaveLength(1);
    expect(repository.snapshot().inbox).toHaveLength(1);
    expect(repository.snapshot().tasks).toHaveLength(2);
  });

  it("recovers expired running task leases without per-task writes", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());
    await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });

    const recovered = await repository.recoverExpiredLeases({
      limit: 100,
      now: new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(recovered).toBe(1);
    expect(repository.snapshot().tasks[0]).toMatchObject({ status: "pending", taskVersion: 3 });
  });

  it("cancels stopped workflow runs in cursor-based batches", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    await repository.createRunWithInitialTask(createRunInput());
    await repository.createRunWithInitialTask({ ...createRunInput(), entryEventId: "event-2" });
    const reconciler = new WorkflowRuntimeReconciler(repository);

    const first = await reconciler.cancelStoppedWorkflow({ limit: 1, uid: 9, workflowId: "31" });
    const second = await reconciler.cancelStoppedWorkflow({
      afterRunId: first.nextCursor ?? undefined,
      limit: 1,
      uid: 9,
      workflowId: "31",
    });

    expect(first).toMatchObject({ cancelled: 1, done: false });
    expect(second).toMatchObject({ cancelled: 1 });
    expect(repository.snapshot().runs.every((run) => run.status === "cancelled")).toBe(true);
  });
});

function createRunInput() {
  return {
    context: { trigger: { eventType: "customer.created" } },
    entryEventId: "event-1",
    initialNodeId: "start",
    initialNodeKind: "start" as const,
    occurredAt: new Date("2026-07-10T00:00:00.000Z"),
    revision: 1,
    shardId: 7,
    subjectId: "customer-1",
    uid: 9,
    workflowId: "31",
  };
}
