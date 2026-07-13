import { describe, expect, it } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeReconciler,
} from "../src/index.js";

describe("workflow runtime repository", () => {
  it("rejects run creation when the workflow boundary is unavailable", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus: "stopped",
    }));

    await expect(repository.createRunWithInitialTask(createRunInput())).resolves.toEqual({
      action: "cancel",
      kind: "workflow-unavailable",
    });
    expect(repository.snapshot().runs).toHaveLength(0);
  });

  it("deduplicates entry events and creates one initial task", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const input = createRunInput();

    const first = await repository.createRunWithInitialTask(input);
    const duplicate = await repository.createRunWithInitialTask(input);

    expect(first.deduplicated).toBe(false);
    expect(duplicate).toMatchObject({ deduplicated: true, run: { id: first.run.id } });
    expect(repository.snapshot().tasks).toHaveLength(1);
    expect(repository.snapshot().outbox).toHaveLength(1);
    expect(repository.snapshot().nodeMetricEvents).toEqual([
      expect.objectContaining({ entered: 1, eventKey: expect.stringContaining(":entered"), nodeId: "start" }),
    ]);
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

  it("rejects a task claim after its run becomes terminal", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());
    repository.runs[0]!.status = "cancelled";

    await expect(repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    })).resolves.toEqual({ kind: "conflict" });
    expect(repository.tasks[0]).toMatchObject({ attempt: 0, status: "dispatched", taskVersion: 1 });
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
    expect(repository.snapshot().nodeMetricEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ current: 0, entered: 1, nodeId: "start" }),
    ]));
  });

  it("aggregates pending node metric events once", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    await repository.createRunWithInitialTask(createRunInput());

    await expect(repository.aggregateNodeMetricEvents({ limit: 100 })).resolves.toBe(1);
    await expect(repository.aggregateNodeMetricEvents({ limit: 100 })).resolves.toBe(0);
    expect(repository.snapshot().nodeMetrics).toEqual([
      expect.objectContaining({ completed: 0, current: 0, entered: 1, nodeId: "start", passed: 0 }),
    ]);
    await expect(repository.cleanupProcessedNodeMetricEvents({
      limit: 100,
      processedBefore: new Date("2027-07-11T00:00:00.000Z"),
    })).resolves.toBe(1);
    expect(repository.snapshot().nodeMetricEvents).toHaveLength(0);
  });

  it("keeps a run on a wait node until the delayed successor is claimed", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    const claimedWait = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimedWait.kind !== "success") throw new Error("claim failed");

    const committed = await repository.commitNodeResult({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimedWait.task.taskVersion,
      inbox: { consumer: "workflow-task", expiresAt: new Date("2026-08-10T00:00:00.000Z"), messageId: "wait-1" },
      nextTask: {
        dispatchImmediately: false,
        dueAt: new Date("2026-07-13T00:00:00.000Z"),
        nodeId: "message-1",
        nodeKind: "message",
        taskType: "wait",
      },
      nodeExecution: { idempotencyKey: "wait", input: {}, output: {} },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    });
    if (committed.kind !== "success" || !committed.nextTask) throw new Error("commit failed");

    expect(committed.run).toMatchObject({ currentNodeId: "wait-1", status: "waiting" });

    const claimedSuccessor = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-13T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: committed.nextTask.id,
      uid: 9,
    });
    expect(claimedSuccessor).toMatchObject({ kind: "success" });
    expect(repository.runs[0]).toMatchObject({ currentNodeId: "message-1", status: "running" });
    expect(repository.snapshot().nodeMetricEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ current: -1, nodeId: "wait-1", passed: 1 }),
      expect.objectContaining({ current: 1, nodeId: "message-1", passed: 0 }),
    ]));
  });

  it("removes a cancelled waiting run from the wait node instead of its delayed successor", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
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
      inbox: { consumer: "workflow-task", expiresAt: new Date("2026-08-10T00:00:00.000Z"), messageId: "waiting-cancel" },
      nextTask: {
        dispatchImmediately: false,
        dueAt: new Date("2026-07-13T00:00:00.000Z"),
        nodeId: "message-1",
        nodeKind: "message",
        taskType: "wait",
      },
      nodeExecution: { idempotencyKey: "waiting-cancel", input: {}, output: {} },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    });
    if (committed.kind !== "success") throw new Error("commit failed");

    await repository.cancelWorkflowBatch({ limit: 100, uid: 9, workflowId: "31" });

    expect(repository.snapshot().nodeMetricEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ current: -1, nodeId: "wait-1", passed: 0 }),
    ]));
    expect(repository.snapshot().nodeMetricEvents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ current: -1, nodeId: "message-1" }),
    ]));
  });

  it("rejects a commit whose next run state violates the runtime state machine", async () => {
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
    repository.runs[0]!.status = "completed";

    await expect(repository.commitNodeResult({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: { consumer: "workflow-task", expiresAt: new Date("2026-08-10T00:00:00.000Z"), messageId: "invalid-state" },
      nodeExecution: { idempotencyKey: "invalid", input: {}, output: {} },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    })).rejects.toThrow("Invalid workflow run transition");
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
      maxAttempts: 5,
      now: new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(recovered).toEqual({ dead: 0, recovered: 1 });
    expect(repository.snapshot().tasks[0]).toMatchObject({ attempt: 1, status: "pending", taskVersion: 3 });
  });

  it("marks the task dead and fails its run when execution attempts are exhausted", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });

    const result = await repository.recoverExpiredLeases({
      limit: 100,
      maxAttempts: 1,
      now: new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(result).toEqual({ dead: 1, recovered: 0 });
    expect(repository.snapshot().tasks[0]).toMatchObject({
      attempt: 1,
      status: "dead",
      taskVersion: 3,
    });
    expect(repository.snapshot().runs[0]).toMatchObject({
      nextExecuteAt: null,
      status: "failed",
    });
    expect(repository.snapshot().nodeMetricEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ current: -1, nodeId: "wait-1", passed: 0 }),
    ]));
  });

  it("removes expired inbox records in bounded batches", async () => {
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
    await repository.commitNodeResult({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-07-11T00:00:00.000Z"),
        messageId: "expired-message",
      },
      nodeExecution: { idempotencyKey: "expired", input: {}, output: {} },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    });

    await expect(repository.cleanupExpiredInbox({
      limit: 1,
      now: new Date("2026-07-12T00:00:00.000Z"),
    })).resolves.toBe(1);
    expect(repository.snapshot().inbox).toHaveLength(0);
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
    expect(repository.snapshot().nodeMetricEvents.filter(event => event.current === -1)).toHaveLength(0);
  });
});

function createRunInput() {
  return {
    context: { trigger: { eventType: "customer.created" } },
    entryEventId: "event-1",
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" as const },
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
