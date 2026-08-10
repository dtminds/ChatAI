import type { WorkflowRunStatus } from "@chatai/contracts";
import { beforeEach, expect, it } from "vitest";
import type {
  WorkflowCreateRunInput,
  WorkflowRuntimeRepository,
} from "../../src/index.js";

type RepositoryContractHarness = {
  repository: WorkflowRuntimeRepository;
  setRunStatus(runId: string, status: WorkflowRunStatus): Promise<void>;
};

type CreateRepositoryContractHarness = () => Promise<RepositoryContractHarness> | RepositoryContractHarness;

const OUTBOX_READY_AT = new Date("2099-01-01T00:00:00.000Z");
const OUTBOX_RETRY_AT = new Date("2099-01-01T00:05:00.000Z");

export function runWorkflowRuntimeRepositoryContract(
  createHarness: CreateRepositoryContractHarness,
) {
  let harness: RepositoryContractHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  it("deduplicates concurrent entry creation with one initial task and outbox event", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => harness.repository.createRunWithInitialTask(createRunInput())),
    );
    const created = results.map(requireCreatedRun);

    expect(created.filter((result) => !result.deduplicated)).toHaveLength(1);
    expect(new Set(created.map((result) => result.run.id)).size).toBe(1);
    expect(new Set(created.map((result) => result.task.id)).size).toBe(1);

    const outbox = await harness.repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "publisher-1",
      limit: 10,
      now: OUTBOX_READY_AT,
    });
    expect(outbox).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          runId: created[0]!.run.id,
          taskId: created[0]!.task.id,
        }),
        taskVersion: 1,
      }),
    ]);
  });

  it("isolates lifetime entry guards by subject type", async () => {
    const entryPolicy = { mode: "never" } as const;
    const first = await harness.repository.createRunWithInitialTask({
      ...createRunInput(),
      entryPolicy,
    });
    const otherSubjectType = await harness.repository.createRunWithInitialTask({
      ...createRunInput(),
      entryEventId: "event-2",
      entryPolicy,
      subjectType: "wecom_contact",
    });
    const repeatedOriginalSubject = await harness.repository.createRunWithInitialTask({
      ...createRunInput(),
      entryEventId: "event-3",
      entryPolicy,
    });

    expect(first).toMatchObject({ deduplicated: false, kind: "success" });
    expect(otherSubjectType).toMatchObject({ deduplicated: false, kind: "success" });
    expect(repeatedOriginalSubject).toEqual({ kind: "entry-policy-rejected" });
  });

  it("allows only one claimant through the task version and lease fence", async () => {
    const created = requireCreatedRun(
      await harness.repository.createRunWithInitialTask(createRunInput()),
    );
    const claims = await Promise.all([
      harness.repository.claimTask({
        expectedTaskVersion: 1,
        leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
        leaseOwner: "worker-1",
        taskId: created.task.id,
        uid: 9,
      }),
      harness.repository.claimTask({
        expectedTaskVersion: 1,
        leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
        leaseOwner: "worker-2",
        taskId: created.task.id,
        uid: 9,
      }),
    ]);

    expect(claims.filter((claim) => claim.kind === "success")).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === "conflict")).toHaveLength(1);
    const task = await harness.repository.findTask(9, created.task.id);
    expect(task).toMatchObject({
      attempt: 1,
      status: "running",
      taskVersion: 2,
    });
    expect(["worker-1", "worker-2"]).toContain(task?.leaseOwner);
  });

  it("deduplicates action retry inbox messages and republishes failed outbox delivery", async () => {
    const created = requireCreatedRun(
      await harness.repository.createRunWithInitialTask(createRunInput()),
    );
    const initialOutbox = await harness.repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "publisher-initial",
      limit: 10,
      now: OUTBOX_READY_AT,
    });
    expect(initialOutbox).toHaveLength(1);
    await expect(harness.repository.markOutboxSent({
      id: initialOutbox[0]!.id,
      leaseOwner: "publisher-initial",
      sentAt: OUTBOX_READY_AT,
    })).resolves.toBe(true);

    const claimed = await harness.repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("Expected initial task claim to succeed");
    const prepared = await harness.repository.prepareActionExecution({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      idempotencyKey: "9:1:start:1",
      input: { subjectId: "customer-1" },
      now: OUTBOX_READY_AT,
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    });
    expect(prepared).toMatchObject({ kind: "success" });

    const retryInput = {
      dueAt: OUTBOX_RETRY_AT,
      errorCode: "CAPABILITY_TEMPORARY_UNAVAILABLE",
      errorMessage: "Temporary failure",
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      failureKind: "retryable" as const,
      idempotencyKey: "9:1:start:1",
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2099-02-01T00:00:00.000Z"),
        messageId: "retry-message-1",
      },
      now: OUTBOX_READY_AT,
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    };
    await expect(harness.repository.scheduleActionRetry(retryInput)).resolves.toMatchObject({
      kind: "success",
      task: { status: "pending", taskVersion: 3 },
    });
    await expect(harness.repository.scheduleActionRetry(retryInput)).resolves.toEqual({
      kind: "already-processed",
    });

    await expect(harness.repository.dispatchDueTasks({
      limit: 10,
      now: OUTBOX_RETRY_AT,
    })).resolves.toEqual({ cancelled: 0, deferred: 0, dispatched: 1 });
    const retryOutbox = await harness.repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2099-01-01T00:06:00.000Z"),
      leaseOwner: "publisher-retry",
      limit: 10,
      now: OUTBOX_RETRY_AT,
    });
    expect(retryOutbox).toEqual([
      expect.objectContaining({ attempt: 1, taskVersion: 4 }),
    ]);
    await expect(harness.repository.markOutboxFailed({
      id: retryOutbox[0]!.id,
      leaseOwner: "publisher-retry",
      nextAttemptAt: new Date("2099-01-01T00:10:00.000Z"),
    })).resolves.toBe(true);
    await expect(harness.repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2099-01-01T00:11:00.000Z"),
      leaseOwner: "publisher-early",
      limit: 10,
      now: new Date("2099-01-01T00:09:00.000Z"),
    })).resolves.toEqual([]);
    await expect(harness.repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2099-01-01T00:12:00.000Z"),
      leaseOwner: "publisher-second-attempt",
      limit: 10,
      now: new Date("2099-01-01T00:10:00.000Z"),
    })).resolves.toEqual([
      expect.objectContaining({ attempt: 2, taskVersion: 4 }),
    ]);
  });

  it("rolls back a failed commit before recording inbox or task state", async () => {
    const created = requireCreatedRun(
      await harness.repository.createRunWithInitialTask(createRunInput()),
    );
    const claimed = await harness.repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("Expected initial task claim to succeed");
    await harness.setRunStatus(created.run.id, "completed");

    const commitInput = {
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2099-02-01T00:00:00.000Z"),
        messageId: "transaction-rollback",
      },
      nodeExecution: {
        idempotencyKey: "transaction-rollback",
        input: {},
        output: {},
      },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    };
    await expect(harness.repository.commitNodeResult(commitInput)).rejects.toThrow(
      "Invalid workflow run transition",
    );
    expect(await harness.repository.findTask(9, created.task.id)).toMatchObject({
      status: "running",
      taskVersion: claimed.task.taskVersion,
    });

    await harness.setRunStatus(created.run.id, "running");
    await expect(harness.repository.commitNodeResult(commitInput)).resolves.toMatchObject({
      kind: "success",
      run: { status: "completed" },
    });
    await expect(harness.repository.commitNodeResult(commitInput)).resolves.toEqual({
      kind: "already-processed",
    });
  });
}

export function createRunInput(
  overrides: Partial<WorkflowCreateRunInput> = {},
): WorkflowCreateRunInput {
  return {
    context: { trigger: { eventType: "message.received" } },
    entryEventId: "event-1",
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
    initialNodeId: "start",
    initialNodeKind: "start",
    occurredAt: new Date("2026-07-10T00:00:00.000Z"),
    revision: 1,
    shardId: 7,
    subjectId: "customer-1",
    subjectType: "chatai_contact",
    uid: 9,
    workflowId: "31",
    workflowType: "chatai_sop",
    ...overrides,
  };
}

function requireCreatedRun(
  result: Awaited<ReturnType<WorkflowRuntimeRepository["createRunWithInitialTask"]>>,
) {
  if (result.kind !== "success") {
    throw new Error(`Expected run creation to succeed, received ${result.kind}`);
  }
  return result;
}
