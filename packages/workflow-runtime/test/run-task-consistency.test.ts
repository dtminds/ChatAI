import { describe, expect, it } from "vitest";
import { InMemoryWorkflowRuntimeRepository } from "../src/index.js";

const admittedAt = new Date("2026-07-10T00:00:00.000Z");
const inconsistentBefore = new Date("2026-07-10T00:01:00.000Z");
const reconcileAt = new Date("2026-07-10T00:02:00.000Z");

describe("workflow run/task consistency reconciliation", () => {
  it("keeps a waiting run whose authoritative task remains on the wait node", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => admittedAt);
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    if (created.kind !== "success") throw new Error("create failed");
    const claimed = await repository.claimTask({
      expectedTaskVersion: created.task.taskVersion,
      leaseExpiresAt: new Date("2026-07-10T00:00:30.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: created.task.uid,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");
    await repository.beginFixedWait({
      dueAt: new Date("2026-07-11T00:00:00.000Z"),
      expectedRunLockVersion: created.run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-10T00:00:00.000Z"),
        messageId: "wait-completed",
      },
      now: admittedAt,
      runId: created.run.id,
      taskId: created.task.id,
      uid: created.run.uid,
    });

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 100,
      now: reconcileAt,
    });

    expect(result).toMatchObject({
      inconsistentRunsFailed: 0,
      staleTasksCancelled: 0,
      terminalRunTasksCancelled: 0,
    });
    expect(repository.runs[0]).toMatchObject({ currentNodeId: "wait-1", status: "waiting" });
    expect(repository.tasks).toHaveLength(1);
    expect(repository.tasks[0]).toMatchObject({ nodeId: "wait-1", status: "pending", taskType: "wait" });
  });

  it("leaves an unavailable run for the cancellation reconciler", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus: "stopped",
    }), () => admittedAt);
    repository.runs.push(createRunRecord());

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 100,
      now: reconcileAt,
    });

    expect(result.inconsistentRunsFailed).toBe(0);
    expect(repository.runs[0]?.status).toBe("running");
  });

  it("fails an old active run that has no authoritative task", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => admittedAt);
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    if (created.kind !== "success") throw new Error("create failed");
    repository.tasks.splice(0);

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 100,
      now: reconcileAt,
    });

    expect(result.inconsistentRunsFailed).toBe(1);
    expect(repository.runs[0]).toMatchObject({ nextExecuteAt: null, status: "failed" });
  });

  it("uses the latest run transition time for the inconsistency grace period", async () => {
    let now = admittedAt;
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const created = await repository.createRunWithInitialTask({
      ...createRunInput(),
      initialNodeId: "wait-1",
      initialNodeKind: "wait",
    });
    if (created.kind !== "success") throw new Error("create failed");
    const claimed = await repository.claimTask({
      expectedTaskVersion: created.task.taskVersion,
      leaseExpiresAt: new Date("2026-07-10T00:02:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: created.task.uid,
    });
    if (claimed.kind !== "success") throw new Error("claim failed");
    now = new Date("2026-07-10T00:01:30.000Z");
    const waiting = await repository.beginFixedWait({
      dueAt: new Date("2026-07-11T00:00:00.000Z"),
      expectedRunLockVersion: created.run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-10T00:00:00.000Z"),
        messageId: "advanced",
      },
      now,
      runId: created.run.id,
      taskId: created.task.id,
      uid: created.run.uid,
    });
    if (waiting.kind !== "success") throw new Error("wait failed");
    repository.tasks.splice(0);

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 100,
      now: reconcileAt,
    });

    expect(result.inconsistentRunsFailed).toBe(0);
    expect(repository.runs[0]?.status).toBe("waiting");
  });

  it("does not extend the grace period when re-claiming an already-running run", async () => {
    let now = admittedAt;
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const created = await repository.createRunWithInitialTask(createRunInput());
    if (created.kind !== "success") throw new Error("create failed");
    const firstClaim = await repository.claimTask({
      expectedTaskVersion: created.task.taskVersion,
      leaseExpiresAt: new Date("2026-07-10T00:00:30.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: created.task.uid,
    });
    if (firstClaim.kind !== "success") throw new Error("claim failed");
    await repository.recoverExpiredLeases({
      limit: 100,
      maxAttempts: 5,
      now: new Date("2026-07-10T00:01:00.000Z"),
    });
    now = new Date("2026-07-10T00:01:30.000Z");
    const secondClaim = await repository.claimTask({
      expectedTaskVersion: firstClaim.task.taskVersion + 1,
      leaseExpiresAt: new Date("2026-07-10T00:02:30.000Z"),
      leaseOwner: "worker-2",
      taskId: created.task.id,
      uid: created.task.uid,
    });
    if (secondClaim.kind !== "success") throw new Error("re-claim failed");
    repository.tasks.splice(0);

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 100,
      now: reconcileAt,
    });

    expect(result.inconsistentRunsFailed).toBe(1);
    expect(repository.runs[0]?.status).toBe("failed");
  });

  it("fails an inconsistent paused run after the grace period", async () => {
    let runtimeStatus: "active" | "paused" = "active";
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus,
    }), () => admittedAt);
    const created = await repository.createRunWithInitialTask(createRunInput());
    if (created.kind !== "success") throw new Error("create failed");
    repository.tasks.splice(0);
    runtimeStatus = "paused";

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 100,
      now: reconcileAt,
    });

    expect(result.inconsistentRunsFailed).toBe(1);
    expect(repository.runs[0]?.status).toBe("failed");
  });

  it("repairs an authoritative suspended Task after its Workflow resumes", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus: "active",
    }), () => admittedAt);
    const created = await repository.createRunWithInitialTask(createRunInput());
    if (created.kind !== "success") throw new Error("create failed");
    repository.tasks[0]!.status = "suspended";

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 100,
      now: reconcileAt,
    });

    expect(result).toMatchObject({
      inconsistentRunsFailed: 0,
      taskStatusesReconciled: 1,
    });
    expect(repository.tasks[0]).toMatchObject({
      status: "pending",
      taskVersion: created.task.taskVersion + 1,
    });
  });

  it("repairs an authoritative pending Task after its Workflow pauses", async () => {
    let runtimeStatus: "active" | "paused" = "active";
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus,
    }), () => admittedAt);
    const created = await repository.createRunWithInitialTask(createRunInput());
    if (created.kind !== "success") throw new Error("create failed");
    repository.tasks[0]!.status = "pending";
    runtimeStatus = "paused";

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 100,
      now: reconcileAt,
    });

    expect(result).toMatchObject({
      inconsistentRunsFailed: 0,
      taskStatusesReconciled: 1,
    });
    expect(repository.tasks[0]).toMatchObject({
      status: "suspended",
      taskVersion: created.task.taskVersion + 1,
    });
  });

  it("cancels stale and terminal-run tasks without failing a healthy active run", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => admittedAt);
    const active = await repository.createRunWithInitialTask(createRunInput());
    const terminal = await repository.createRunWithInitialTask({
      ...createRunInput(),
      entryEventId: "event-2",
      subjectId: "customer-2",
    });
    if (active.kind !== "success" || terminal.kind !== "success") throw new Error("create failed");
    repository.tasks.push({
      ...structuredClone(active.task),
      id: "999",
      sequence: active.run.sequence - 1,
      status: "pending",
    });
    repository.runs.find(run => run.id === terminal.run.id)!.status = "completed";

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 100,
      now: reconcileAt,
    });

    expect(result).toMatchObject({
      inconsistentRunsFailed: 0,
      staleTasksCancelled: 1,
      terminalRunTasksCancelled: 1,
    });
    expect(repository.tasks.find(task => task.id === "999")).toMatchObject({
      status: "cancelled",
      taskVersion: active.task.taskVersion + 1,
    });
    expect(repository.tasks.find(task => task.runId === terminal.run.id)).toMatchObject({
      status: "cancelled",
      taskVersion: terminal.task.taskVersion + 1,
    });
    expect(repository.runs.find(run => run.id === active.run.id)?.status).toBe("queued");
  });

  it("advances and resets the run and task consistency cursors independently", async () => {
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => admittedAt);
    const first = await repository.createRunWithInitialTask(createRunInput());
    const second = await repository.createRunWithInitialTask({
      ...createRunInput(),
      entryEventId: "event-2",
      subjectId: "customer-2",
    });
    if (first.kind !== "success" || second.kind !== "success") throw new Error("create failed");

    const firstPage = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 1,
      now: reconcileAt,
    });
    const secondPage = await repository.reconcileRunTaskConsistency({
      afterRunId: firstPage.lastRunId ?? undefined,
      afterTaskId: firstPage.lastTaskId ?? undefined,
      inconsistentBefore,
      limit: 1,
      now: reconcileAt,
    });
    const resetPage = await repository.reconcileRunTaskConsistency({
      afterRunId: secondPage.hasMoreRuns ? secondPage.lastRunId ?? undefined : undefined,
      afterTaskId: secondPage.hasMoreTasks ? secondPage.lastTaskId ?? undefined : undefined,
      inconsistentBefore,
      limit: 1,
      now: reconcileAt,
    });

    expect(firstPage).toMatchObject({
      hasMoreRuns: true,
      hasMoreTasks: true,
      lastRunId: first.run.id,
      lastTaskId: first.task.id,
    });
    expect(secondPage).toMatchObject({
      hasMoreRuns: false,
      hasMoreTasks: false,
      lastRunId: second.run.id,
      lastTaskId: second.task.id,
    });
    expect(resetPage).toMatchObject({
      lastRunId: first.run.id,
      lastTaskId: first.task.id,
    });
  });
});

function createRunInput() {
  return {
    activeRunLimit: 10_000,
    context: { trigger: { eventType: "customer.created" } },
    entryEventId: "event-1",
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" as const },
    initialNodeId: "start",
    initialNodeKind: "start" as const,
    occurredAt: admittedAt,
    revision: 1,
    shardId: 7,
    subjectId: "customer-1",
    uid: 9,
    workflowId: "31",
  };
}

function createRunRecord() {
  return {
    context: {},
    createdAt: admittedAt,
    currentNodeId: "start",
    entryEventId: "event-1",
    id: "1",
    lockVersion: 1,
    nextExecuteAt: admittedAt,
    revision: 1,
    sequence: 1,
    shardId: 7,
    status: "running" as const,
    subjectId: "customer-1",
    uid: 9,
    workflowId: "31",
  };
}
