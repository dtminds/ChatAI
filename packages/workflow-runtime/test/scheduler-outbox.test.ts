import { describe, expect, it } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeReconciler,
} from "../src/index.js";

describe("workflow scheduler repository", () => {
  it("dispatches one due task once across concurrent scheduler claims", async () => {
    const repository = createRepository();
    const created = await createWaitingTask(repository);

    const [first, second] = await Promise.all([
      repository.dispatchDueTasks({ limit: 10, now: dueAt, shardIds: [7] }),
      repository.dispatchDueTasks({ limit: 10, now: dueAt, shardIds: [7] }),
    ]);

    expect(first.dispatched + second.dispatched).toBe(1);
    expect(repository.snapshot().tasks.find(task => task.id === created.nextTask!.id)).toMatchObject({
      status: "dispatched",
      taskVersion: 2,
    });
    expect(repository.snapshot().outbox).toHaveLength(2);
    expect(repository.snapshot().outbox.at(-1)?.payload).toMatchObject({
      messageId: `workflow-task:${created.nextTask!.id}:v2`,
      runId: created.run.id,
      shardId: 7,
      taskId: created.nextTask!.id,
      taskVersion: 2,
      uid: "9",
    });
  });

  it("leaves due tasks pending while the workflow is paused", async () => {
    let runtimeStatus = "active" as const | "paused";
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus,
    }), () => now);
    const created = await createWaitingTask(repository);
    runtimeStatus = "paused";

    const result = await repository.dispatchDueTasks({ limit: 10, now: dueAt });

    expect(result).toMatchObject({ cancelled: 0, deferred: 1, dispatched: 0 });
    expect(repository.snapshot().tasks.find(task => task.id === created.nextTask!.id)).toMatchObject({
      status: "pending",
      taskVersion: 1,
    });
  });

  it("cancels due tasks when the workflow is stopped", async () => {
    let runtimeStatus = "active" as const | "stopped";
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus,
    }), () => now);
    const created = await createWaitingTask(repository);
    runtimeStatus = "stopped";

    const result = await repository.dispatchDueTasks({ limit: 10, now: dueAt });

    expect(result).toMatchObject({ cancelled: 1, deferred: 0, dispatched: 0 });
    expect(repository.snapshot().tasks.find(task => task.id === created.nextTask!.id)).toMatchObject({
      status: "cancelled",
      taskVersion: 2,
    });
  });

  it("does not let paused tasks starve an active due task", async () => {
    const workflowStatuses = new Map<string, "active" | "paused">();
    const repository = new InMemoryWorkflowRuntimeRepository(async ({ workflowId }) => ({
      bizStatus: 1,
      runtimeStatus: workflowStatuses.get(workflowId) ?? "active",
    }), () => now);
    for (let index = 0; index < 3; index += 1) {
      const workflowId = String(100 + index);
      workflowStatuses.set(workflowId, "active");
      await createWaitingTask(repository, workflowId, `event-paused-${index}`);
      workflowStatuses.set(workflowId, "paused");
    }
    workflowStatuses.set("200", "active");
    const active = await createWaitingTask(repository, "200", "event-active");

    const result = await repository.dispatchDueTasks({ limit: 1, now: dueAt });

    expect(result).toMatchObject({ dispatched: 1 });
    expect(repository.snapshot().tasks.find(task => task.id === active.nextTask!.id)).toMatchObject({
      status: "dispatched",
    });
  });
});

describe("workflow outbox repository", () => {
  it("republishes a dispatched task with the same version after the delivery timeout", async () => {
    const repository = createRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());
    const [claimedOutbox] = await repository.claimOutboxBatch({
      leaseExpiresAt,
      leaseOwner: "publisher-1",
      limit: 10,
      now,
    });
    await repository.markOutboxSent({
      id: claimedOutbox!.id,
      leaseOwner: "publisher-1",
      sentAt: now,
    });

    await expect(repository.republishStalledDispatchedTasks({
      dispatchedBefore: new Date("2026-07-11T00:05:00.000Z"),
      limit: 10,
      now: new Date("2026-07-11T00:10:00.000Z"),
    })).resolves.toBe(1);
    expect(repository.snapshot().tasks[0]).toMatchObject({
      status: "dispatched",
      taskVersion: 1,
    });
    expect(repository.snapshot().outbox).toHaveLength(2);
    expect(repository.snapshot().outbox.at(-1)?.payload.taskVersion).toBe(1);
    await expect(repository.republishStalledDispatchedTasks({
      dispatchedBefore: new Date("2026-07-11T00:05:00.000Z"),
      limit: 10,
      now: new Date("2026-07-11T00:10:30.000Z"),
    })).resolves.toBe(0);
    expect(repository.snapshot().outbox).toHaveLength(2);
    await expect(repository.claimTask({
      expectedTaskVersion: created.task.taskVersion,
      leaseExpiresAt,
      leaseOwner: "consumer",
      taskId: created.task.id,
      uid: 9,
    })).resolves.toMatchObject({ kind: "success" });
  });

  it("leases one outbox row to only one concurrent publisher", async () => {
    const repository = createRepository();
    await repository.createRunWithInitialTask(createRunInput());

    const [first, second] = await Promise.all([
      repository.claimOutboxBatch({
        leaseExpiresAt,
        leaseOwner: "publisher-1",
        limit: 10,
        now,
      }),
      repository.claimOutboxBatch({
        leaseExpiresAt,
        leaseOwner: "publisher-2",
        limit: 10,
        now,
      }),
    ]);

    expect(first.length + second.length).toBe(1);
    expect([first[0]?.leaseOwner, second[0]?.leaseOwner]).toContain("publisher-1");
  });

  it("recovers expired outbox leases for a later publisher", async () => {
    const repository = createRepository();
    await repository.createRunWithInitialTask(createRunInput());
    const [claimed] = await repository.claimOutboxBatch({
      leaseExpiresAt,
      leaseOwner: "publisher-1",
      limit: 10,
      now,
    });

    const reconciler = new WorkflowRuntimeReconciler(repository);
    await expect(reconciler.recoverExpiredOutboxLeases({
      limit: 10,
      now: new Date("2026-07-11T00:02:00.000Z"),
    })).resolves.toBe(1);
    const [reclaimed] = await repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2026-07-11T00:03:00.000Z"),
      leaseOwner: "publisher-2",
      limit: 10,
      now: new Date("2026-07-11T00:02:00.000Z"),
    });

    expect(reclaimed).toMatchObject({ id: claimed!.id, leaseOwner: "publisher-2" });
  });

  it("requires the current lease owner to mark an outbox row sent", async () => {
    const repository = createRepository();
    await repository.createRunWithInitialTask(createRunInput());
    const [claimed] = await repository.claimOutboxBatch({
      leaseExpiresAt,
      leaseOwner: "publisher-1",
      limit: 10,
      now,
    });

    await expect(repository.markOutboxSent({
      id: claimed!.id,
      leaseOwner: "publisher-2",
      sentAt: now,
    })).resolves.toBe(false);
    await expect(repository.markOutboxSent({
      id: claimed!.id,
      leaseOwner: "publisher-1",
      sentAt: now,
    })).resolves.toBe(true);
  });

  it("requires the current lease owner to release a failed outbox row", async () => {
    const repository = createRepository();
    await repository.createRunWithInitialTask(createRunInput());
    const [claimed] = await repository.claimOutboxBatch({
      leaseExpiresAt,
      leaseOwner: "publisher-1",
      limit: 10,
      now,
    });

    await expect(repository.markOutboxFailed({
      id: claimed!.id,
      leaseOwner: "publisher-2",
      nextAttemptAt: dueAt,
    })).resolves.toBe(false);
    await expect(repository.markOutboxFailed({
      id: claimed!.id,
      leaseOwner: "publisher-1",
      nextAttemptAt: dueAt,
    })).resolves.toBe(true);
  });

  it("fails a still-dispatched task when its outbox delivery attempts are exhausted", async () => {
    const repository = createRepository();
    await repository.createRunWithInitialTask(createRunInput());
    const [claimed] = await repository.claimOutboxBatch({
      leaseExpiresAt,
      leaseOwner: "publisher-1",
      limit: 10,
      now,
    });

    await expect(repository.markOutboxDead({
      failedAt: now,
      id: claimed!.id,
      leaseOwner: "publisher-1",
    })).resolves.toBe(true);
    expect(repository.snapshot().outbox[0]).toMatchObject({ status: "dead" });
    expect(repository.snapshot().tasks[0]).toMatchObject({
      status: "dead",
      taskVersion: 2,
    });
    expect(repository.snapshot().runs[0]).toMatchObject({ status: "failed" });
  });

  it("marks an exhausted outbox row dead after its task was already cancelled", async () => {
    const repository = createRepository();
    const created = await repository.createRunWithInitialTask(createRunInput());
    const [claimed] = await repository.claimOutboxBatch({
      leaseExpiresAt,
      leaseOwner: "publisher-1",
      limit: 10,
      now,
    });
    await repository.cancelWorkflowBatch({
      limit: 10,
      uid: 9,
      workflowId: created.run.workflowId,
    });

    await expect(repository.markOutboxDead({
      failedAt: now,
      id: claimed!.id,
      leaseOwner: "publisher-1",
    })).resolves.toBe(true);
    expect(repository.snapshot().outbox[0]).toMatchObject({ status: "dead" });
    expect(repository.snapshot().tasks[0]).toMatchObject({ status: "cancelled" });
    expect(repository.snapshot().runs[0]).toMatchObject({ status: "cancelled" });
  });
});

describe("workflow runtime reconciliation", () => {
  it("cancels unfinished runs after their workflow becomes stopped", async () => {
    let runtimeStatus = "active" as const | "stopped";
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus,
    }), () => now);
    await repository.createRunWithInitialTask(createRunInput());
    runtimeStatus = "stopped";

    const result = await repository.cancelUnavailableWorkflowRuns({ limit: 100 });

    expect(result).toEqual({ cancelled: 1, hasMore: false, lastRunId: "1" });
    expect(repository.snapshot().runs[0]).toMatchObject({ status: "cancelled" });
    expect(repository.snapshot().tasks[0]).toMatchObject({ status: "cancelled", taskVersion: 2 });
  });

  it("does not cancel unfinished runs while their workflow is paused", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus: "paused",
    }), () => now);
    repository.runs.push({
      context: {},
      createdAt: now,
      currentNodeId: "wait",
      entryEventId: "event-1",
      id: "1",
      lockVersion: 1,
      nextExecuteAt: dueAt,
      revision: 1,
      sequence: 2,
      shardId: 7,
      status: "waiting",
      subjectId: "customer-1",
      uid: 9,
      workflowId: "31",
    });

    await expect(repository.cancelUnavailableWorkflowRuns({ limit: 100 })).resolves.toEqual({
      cancelled: 0,
      hasMore: false,
      lastRunId: null,
    });
  });
});

const now = new Date("2026-07-11T00:00:00.000Z");
const dueAt = new Date("2026-07-11T01:00:00.000Z");
const leaseExpiresAt = new Date("2026-07-11T00:01:00.000Z");

function createRepository() {
  return new InMemoryWorkflowRuntimeRepository(undefined, () => now);
}

async function createWaitingTask(
  repository: InMemoryWorkflowRuntimeRepository,
  workflowId = "31",
  entryEventId = "event-1",
) {
  const created = await repository.createRunWithInitialTask({
    ...createRunInput(),
    entryEventId,
    workflowId,
  });
  const claimed = await repository.claimTask({
    expectedTaskVersion: 1,
    leaseExpiresAt,
    leaseOwner: "worker-1",
    taskId: created.task.id,
    uid: 9,
  });
  if (claimed.kind !== "success") throw new Error("claim failed");
  const run = repository.runs.find(item => item.id === created.run.id);
  if (!run) throw new Error("run missing");
  run.status = "running";
  const committed = await repository.commitNodeResult({
    expectedRunLockVersion: 1,
    expectedTaskVersion: claimed.task.taskVersion,
    inbox: {
      consumer: "workflow-task",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      messageId: `message-${workflowId}-${entryEventId}`,
    },
    nextTask: {
      dispatchImmediately: false,
      dueAt,
      nodeId: "end",
      nodeKind: "end",
      taskType: "wait",
    },
    nodeExecution: {
      idempotencyKey: `9:${created.run.id}:start:1`,
      input: {},
      output: {},
    },
    runId: created.run.id,
    taskId: claimed.task.id,
    uid: 9,
  });
  if (committed.kind !== "success") throw new Error("commit failed");
  return committed;
}

function createRunInput() {
  return {
    context: { trigger: { eventType: "contact.friend_added" } },
    entryEventId: "event-1",
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" as const },
    initialNodeId: "start",
    initialNodeKind: "start" as const,
    occurredAt: now,
    revision: 1,
    shardId: 7,
    subjectId: "customer-1",
    uid: 9,
    workflowId: "31",
  };
}
