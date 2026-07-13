import { describe, expect, it } from "vitest";
import { InMemoryWorkflowRuntimeRepository } from "../src/index.js";

const admittedAt = new Date("2026-07-10T00:00:00.000Z");
const inconsistentBefore = new Date("2026-07-10T00:01:00.000Z");
const reconcileAt = new Date("2026-07-10T00:02:00.000Z");

describe("workflow run/task consistency reconciliation", () => {
  it("keeps a waiting run whose authoritative task points to the delayed successor", async () => {
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
    await repository.commitNodeResult({
      expectedRunLockVersion: created.run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-10T00:00:00.000Z"),
        messageId: "wait-completed",
      },
      nextTask: {
        dispatchImmediately: false,
        dueAt: new Date("2026-07-11T00:00:00.000Z"),
        nodeId: "end",
        nodeKind: "end",
        taskType: "wait",
      },
      nodeExecution: { idempotencyKey: "wait", input: {}, output: {} },
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
    expect(repository.tasks.at(-1)).toMatchObject({ nodeId: "end", status: "pending" });
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
    const created = await repository.createRunWithInitialTask(createRunInput());
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
    const created = await repository.createRunWithInitialTask(createRunInput());
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
    const committed = await repository.commitNodeResult({
      expectedRunLockVersion: created.run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-10T00:00:00.000Z"),
        messageId: "advanced",
      },
      nextTask: {
        dueAt: now,
        nodeId: "end",
        nodeKind: "end",
        taskType: "execute",
      },
      nodeExecution: { idempotencyKey: "advanced", input: {}, output: {} },
      runId: created.run.id,
      taskId: created.task.id,
      uid: created.run.uid,
    });
    if (committed.kind !== "success" || !committed.nextTask) throw new Error("commit failed");
    repository.tasks.splice(repository.tasks.indexOf(
      repository.tasks.find(task => task.id === committed.nextTask?.id)!,
    ), 1);

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore,
      limit: 100,
      now: reconcileAt,
    });

    expect(result.inconsistentRunsFailed).toBe(0);
    expect(repository.runs[0]?.status).toBe("running");
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
});

function createRunInput() {
  return {
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
