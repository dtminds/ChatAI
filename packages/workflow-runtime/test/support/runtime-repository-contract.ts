import {
  WORKFLOW_ACTIVE_RUN_STATUSES,
  type WorkflowRunStatus,
  type WorkflowRuntimeStatus,
} from "@chatai/contracts";
import { beforeEach, expect, it } from "vitest";
import type {
  WorkflowCreateRunInput,
  WorkflowRuntimeRepository,
} from "../../src/index.js";

type RepositoryContractHarness = {
  repository: WorkflowRuntimeRepository;
  setRunStatus(runId: string, status: WorkflowRunStatus): Promise<void>;
  setWorkflowRuntimeStatus(status: WorkflowRuntimeStatus, transitionedAt?: Date): Promise<void>;
};

type CreateRepositoryContractHarness = () => Promise<RepositoryContractHarness> | RepositoryContractHarness;

const OUTBOX_READY_AT = new Date("2099-01-01T00:00:00.000Z");
const OUTBOX_RETRY_AT = new Date("2099-01-01T00:05:00.000Z");
const EVENT_WAIT_EXPIRES_AT = new Date("2099-01-02T00:00:00.000Z");
const EVENT_RESUME_AT = new Date("2099-01-01T00:00:10.000Z");
const INFERENCE_DEADLINE = new Date("2099-01-01T00:10:00.000Z");

export function runWorkflowRuntimeRepositoryContract(
  createHarness: CreateRepositoryContractHarness,
) {
  let harness: RepositoryContractHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  it("persists a deferred Task as a waiting Run and clears the reason when execution resumes", async () => {
    const created = requireCreatedRun(await harness.repository.createRunWithInitialTask(createRunInput()));
    const dueAt = new Date("2099-01-02T01:00:00.000Z");

    await expect(harness.repository.deferTask({
      dueAt,
      expectedTaskVersion: created.task.taskVersion,
      reasonCode: "WORKFLOW_MESSAGE_SENDING_WINDOW_DEFERRED",
      taskId: created.task.id,
      uid: 9,
    })).resolves.toMatchObject({
      kind: "success",
      run: { nextExecuteAt: dueAt, status: "waiting" },
      task: {
        dueAt,
        lastErrorCode: "WORKFLOW_MESSAGE_SENDING_WINDOW_DEFERRED",
        status: "pending",
      },
    });
    await expect(harness.repository.reconcileRunTaskConsistency({
      inconsistentBefore: new Date("2099-01-02T00:01:00.000Z"),
      limit: 10,
      now: new Date("2099-01-02T00:02:00.000Z"),
    })).resolves.toMatchObject({
      inconsistentRunsFailed: 0,
      staleTasksCancelled: 0,
    });

    const deferredTask = await harness.repository.findTask(9, created.task.id);
    if (!deferredTask) throw new Error("Expected deferred Task");
    await expect(harness.repository.claimTask({
      expectedTaskVersion: deferredTask.taskVersion,
      leaseExpiresAt: new Date("2099-01-02T01:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: deferredTask.id,
      uid: 9,
    })).resolves.toMatchObject({
      kind: "success",
      task: { lastErrorCode: null, status: "running" },
    });
    await expect(harness.repository.findRun(9, created.run.id)).resolves.toMatchObject({
      nextExecuteAt: null,
      status: "running",
    });
  });

  it("records one stable Entry Inbox message across concurrent deliveries", async () => {
    const input = {
      capacityRejectedCount: 0,
      consumer: "workflow-entry",
      expiresAt: new Date("2099-02-01T00:00:00.000Z"),
      messageId: "9:event-1",
      processedAt: new Date("2099-01-01T00:00:00.000Z"),
      uid: 9,
    };
    const recorded = await Promise.all(Array.from({ length: 8 }, () =>
      harness.repository.recordProcessedInboxMessage(input)));

    expect(recorded.filter(Boolean)).toHaveLength(1);
    await expect(harness.repository.hasProcessedInboxMessage(input)).resolves.toBe(true);
  });

  it("deduplicates Inference Job creation and wakes its original Task exactly once", async () => {
    const created = requireCreatedRun(await harness.repository.createRunWithInitialTask(createRunInput({
      initialNodeId: "llm-1",
      initialNodeKind: "llm",
    })));
    const claimed = await harness.repository.claimTask({
      expectedTaskVersion: created.task.taskVersion,
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "task-worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("Expected Inference Task claim to succeed");
    const input = {
      contractVersion: 1,
      deadlineAt: INFERENCE_DEADLINE,
      executionKey: `9:${created.run.id}:llm-1:1`,
      expectedRunLockVersion: created.run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2099-02-01T00:00:00.000Z"),
        messageId: `inference:${created.task.id}`,
      },
      now: OUTBOX_READY_AT,
      payload: {
        kind: "message-list" as const,
        messageList: [{
          content: [{ text: "Summarize", type: "text" as const }],
          role: "system" as const,
        }],
        modelTarget: { kind: "catalog-model", modelId: "model-1" },
        reasoningEffort: "medium",
        responseFormat: { type: "text" as const },
      },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    };
    const waiting = await harness.repository.beginInference(input);
    expect(waiting).toMatchObject({
      created: true,
      kind: "success",
      task: { status: "waiting_external", taskType: "inference" },
    });
    await expect(harness.repository.beginInference(input)).resolves.toEqual({ kind: "already-processed" });
    const jobs = await harness.repository.claimInferenceBatch({
      leaseExpiresAt: new Date("2099-01-01T00:02:00.000Z"),
      leaseOwner: "inference-worker-1",
      limit: 10,
      now: OUTBOX_READY_AT,
    });
    expect(jobs).toHaveLength(1);
    await expect(harness.repository.completeInference({
      completedAt: new Date("2099-01-01T00:00:30.000Z"),
      id: jobs[0]!.id,
      leaseOwner: "inference-worker-1",
      result: { content: "summary", type: "text" },
    })).resolves.toBe(true);
    await expect(harness.repository.completeInference({
      completedAt: new Date("2099-01-01T00:00:31.000Z"),
      id: jobs[0]!.id,
      leaseOwner: "inference-worker-1",
      result: { content: "duplicate", type: "text" },
    })).resolves.toBe(false);
    await expect(harness.repository.findTask(9, created.task.id)).resolves.toMatchObject({
      status: "dispatched",
      taskType: "execute",
      taskVersion: 4,
    });
    const outbox = await harness.repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2099-01-01T00:03:00.000Z"),
      leaseOwner: "publisher-1",
      limit: 10,
      now: new Date("2099-01-01T00:00:30.000Z"),
    });
    expect(outbox.filter(item => item.taskVersion === 4)).toHaveLength(1);
  });

  it("recovers an expired Inference lease without dispatching its waiting Task", async () => {
    const waiting = await createInferenceWait(harness.repository);
    await harness.repository.claimInferenceBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "inference-worker-1",
      limit: 1,
      now: OUTBOX_READY_AT,
    });
    await expect(harness.repository.recoverInferenceJobs({
      limit: 10,
      maxAttempts: 5,
      now: new Date("2099-01-01T00:01:00.000Z"),
    })).resolves.toEqual({ expired: 0, recovered: 1 });
    await expect(harness.repository.findTask(9, waiting.task.id)).resolves.toMatchObject({
      status: "waiting_external",
      taskType: "inference",
    });
    await expect(harness.repository.claimInferenceBatch({
      leaseExpiresAt: new Date("2099-01-01T00:03:00.000Z"),
      leaseOwner: "inference-worker-2",
      limit: 1,
      now: new Date("2099-01-01T00:01:00.000Z"),
    })).resolves.toHaveLength(1);
  });

  it("keeps a valid Inference wait during consistency reconciliation", async () => {
    const waiting = await createInferenceWait(harness.repository);

    await expect(harness.repository.reconcileRunTaskConsistency({
      inconsistentBefore: new Date("2099-01-01T00:01:00.000Z"),
      limit: 10,
      now: new Date("2099-01-01T00:02:00.000Z"),
    })).resolves.toMatchObject({
      inconsistentRunsFailed: 0,
      staleTasksCancelled: 0,
    });
    await expect(harness.repository.findTask(9, waiting.task.id)).resolves.toMatchObject({
      status: "waiting_external",
      taskType: "inference",
    });
  });

  it("does not fail a final Inference attempt before its lease expires", async () => {
    const waiting = await createInferenceWait(harness.repository);
    await harness.repository.claimInferenceBatch({
      leaseExpiresAt: new Date("2099-01-01T00:02:00.000Z"),
      leaseOwner: "inference-worker-1",
      limit: 1,
      now: OUTBOX_READY_AT,
    });

    await expect(harness.repository.recoverInferenceJobs({
      limit: 10,
      maxAttempts: 1,
      now: new Date("2099-01-01T00:01:00.000Z"),
    })).resolves.toEqual({ expired: 0, recovered: 0 });
    await expect(harness.repository.findInferenceByExecutionKey(9, waiting.job.executionKey))
      .resolves.toMatchObject({ status: "running" });
  });

  it("does not call inference while paused and resumes the same Job after activation", async () => {
    const waiting = await createInferenceWait(harness.repository);
    await harness.setWorkflowRuntimeStatus("paused");
    await expect(harness.repository.claimInferenceBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "inference-worker-1",
      limit: 1,
      now: OUTBOX_READY_AT,
    })).resolves.toEqual([]);

    await harness.setWorkflowRuntimeStatus("active");
    await expect(harness.repository.claimInferenceBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "inference-worker-1",
      limit: 1,
      now: OUTBOX_READY_AT,
    })).resolves.toEqual([
      expect.objectContaining({ id: waiting.job.id, status: "running" }),
    ]);
  });

  it("does not create an Inference Job after its Workflow was paused", async () => {
    const created = requireCreatedRun(await harness.repository.createRunWithInitialTask(createRunInput({
      entryEventId: "inference-event-paused-before-begin",
      initialNodeId: "llm-paused-before-begin",
      initialNodeKind: "llm",
    })));
    const claimed = await harness.repository.claimTask({
      expectedTaskVersion: created.task.taskVersion,
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "task-worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("Expected Inference Task claim to succeed");
    await harness.setWorkflowRuntimeStatus(
      "paused",
      new Date("2099-01-01T00:05:00.000Z"),
    );

    await expect(harness.repository.beginInference({
      contractVersion: 1,
      deadlineAt: INFERENCE_DEADLINE,
      executionKey: `9:${created.run.id}:llm-paused-before-begin:1`,
      expectedRunLockVersion: created.run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2099-02-01T00:00:00.000Z"),
        messageId: `inference:${created.task.id}`,
      },
      now: OUTBOX_READY_AT,
      payload: {
        kind: "message-list",
        messageList: [{ content: [{ text: "Summarize", type: "text" }], role: "system" }],
        modelTarget: { kind: "catalog-model", modelId: "model-1" },
        reasoningEffort: "medium",
        responseFormat: { type: "text" },
      },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    })).resolves.toEqual({ action: "defer", kind: "workflow-unavailable" });
  });

  it("preserves the remaining Inference deadline while its Workflow is paused", async () => {
    const waiting = await createInferenceWait(harness.repository);
    await harness.setWorkflowRuntimeStatus(
      "paused",
      new Date("2099-01-01T00:05:00.000Z"),
    );

    await expect(harness.repository.recoverInferenceJobs({
      limit: 10,
      maxAttempts: 5,
      now: new Date("2099-01-01T00:20:00.000Z"),
    })).resolves.toEqual({ expired: 0, recovered: 0 });
    await expect(harness.repository.findInferenceByExecutionKey(9, waiting.job.executionKey))
      .resolves.toMatchObject({ status: "pending" });

    await harness.setWorkflowRuntimeStatus(
      "active",
      new Date("2099-01-01T00:30:00.000Z"),
    );
    await expect(harness.repository.claimInferenceBatch({
      leaseExpiresAt: new Date("2099-01-01T00:31:00.000Z"),
      leaseOwner: "inference-worker-1",
      limit: 1,
      now: new Date("2099-01-01T00:30:00.000Z"),
    })).resolves.toEqual([
      expect.objectContaining({
        deadlineAt: new Date("2099-01-01T00:35:00.000Z"),
        id: waiting.job.id,
        status: "running",
      }),
    ]);
  });

  it("does not revive an Inference Job that expired before its Workflow was paused", async () => {
    const expired = await createInferenceWait(harness.repository, {
      deadlineAt: new Date("2099-01-01T00:01:00.000Z"),
      suffix: "expired-before-pause",
    });
    await harness.setWorkflowRuntimeStatus(
      "paused",
      new Date("2099-01-01T00:02:00.000Z"),
    );
    await harness.setWorkflowRuntimeStatus(
      "active",
      new Date("2099-01-01T00:30:00.000Z"),
    );

    await expect(harness.repository.recoverInferenceJobs({
      limit: 1,
      maxAttempts: 5,
      now: new Date("2099-01-01T00:30:00.000Z"),
    })).resolves.toEqual({ expired: 1, recovered: 0 });
    await expect(harness.repository.findInferenceByExecutionKey(9, expired.job.executionKey))
      .resolves.toMatchObject({ status: "failed" });
  });

  it("invalidates a running Inference lease while paused and retries after activation", async () => {
    const waiting = await createInferenceWait(harness.repository);
    const jobs = await harness.repository.claimInferenceBatch({
      leaseExpiresAt: new Date("2099-01-01T00:08:00.000Z"),
      leaseOwner: "inference-worker-1",
      limit: 1,
      now: OUTBOX_READY_AT,
    });
    await harness.setWorkflowRuntimeStatus(
      "paused",
      new Date("2099-01-01T00:05:00.000Z"),
    );

    await expect(harness.repository.completeInference({
      completedAt: new Date("2099-01-01T00:06:00.000Z"),
      id: jobs[0]!.id,
      leaseOwner: "inference-worker-1",
      result: { content: "stale result", type: "text" },
    })).resolves.toBe(false);
    await expect(harness.repository.findInferenceByExecutionKey(9, waiting.job.executionKey))
      .resolves.toMatchObject({ attempt: 0, status: "pending" });

    await harness.setWorkflowRuntimeStatus(
      "active",
      new Date("2099-01-01T00:30:00.000Z"),
    );
    await expect(harness.repository.claimInferenceBatch({
      leaseExpiresAt: new Date("2099-01-01T00:31:00.000Z"),
      leaseOwner: "inference-worker-2",
      limit: 1,
      now: new Date("2099-01-01T00:30:00.000Z"),
    })).resolves.toEqual([
      expect.objectContaining({
        attempt: 1,
        deadlineAt: new Date("2099-01-01T00:35:00.000Z"),
        id: waiting.job.id,
        status: "running",
      }),
    ]);
  });

  it("recovers an eligible Inference Job behind healthy lower-ID Jobs", async () => {
    await createInferenceWait(harness.repository, {
      deadlineAt: new Date("2099-01-01T01:00:00.000Z"),
      suffix: "healthy-1",
    });
    await createInferenceWait(harness.repository, {
      deadlineAt: new Date("2099-01-01T01:00:00.000Z"),
      suffix: "healthy-2",
    });
    const expired = await createInferenceWait(harness.repository, {
      deadlineAt: new Date("2099-01-01T00:01:00.000Z"),
      suffix: "expired",
    });

    await expect(harness.repository.recoverInferenceJobs({
      limit: 1,
      maxAttempts: 5,
      now: new Date("2099-01-01T00:02:00.000Z"),
    })).resolves.toEqual({ expired: 1, recovered: 0 });
    await expect(harness.repository.findInferenceByExecutionKey(9, expired.job.executionKey))
      .resolves.toMatchObject({ status: "failed" });
  });

  it("keeps an unclaimed Inference Job consistent while paused", async () => {
    const waiting = await createInferenceWait(harness.repository);
    await harness.setWorkflowRuntimeStatus("paused");
    await expect(harness.repository.findTask(9, waiting.task.id)).resolves.toMatchObject({
      status: "waiting_external",
      taskType: "inference",
    });
    await expect(harness.repository.reconcileRunTaskConsistency({
      inconsistentBefore: new Date("2099-01-01T00:01:00.000Z"),
      limit: 10,
      now: new Date("2099-01-01T00:02:00.000Z"),
    })).resolves.toMatchObject({
      inconsistentRunsFailed: 0,
      staleTasksCancelled: 0,
    });
    await harness.setWorkflowRuntimeStatus("active");
    await expect(harness.repository.claimInferenceBatch({
      leaseExpiresAt: new Date("2099-01-01T00:02:00.000Z"),
      leaseOwner: "inference-worker-1",
      limit: 10,
      now: new Date("2099-01-01T00:00:30.000Z"),
    })).resolves.toEqual([expect.objectContaining({ id: waiting.job.id })]);
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

  it("atomically admits only one Run for the tenant's final capacity slot", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      harness.repository.createRunWithInitialTask(createRunInput({
        activeRunLimit: 1,
        entryEventId: `capacity-event-${index}`,
        subjectId: `capacity-subject-${index}`,
      }))));

    expect(results.filter(result => result.kind === "success")).toHaveLength(1);
    expect(results.filter(result => result.kind === "capacity-rejected")).toHaveLength(7);
    const outbox = await harness.repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "publisher-1",
      limit: 10,
      now: OUTBOX_READY_AT,
    });
    expect(outbox).toHaveLength(1);
  });

  it("isolates active Run capacity between tenants", async () => {
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
    }))).resolves.toMatchObject({ kind: "success" });

    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
      subjectId: "tenant-10-customer",
      uid: 10,
      workflowId: "33",
    }))).resolves.toMatchObject({ kind: "success" });
  });

  it("shares one tenant capacity across Workflows and Workflow Types", async () => {
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
    }))).resolves.toMatchObject({ kind: "success" });

    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
      entryEventId: "wecom-event-1",
      subjectId: "wecom-customer-1",
      subjectType: "wecom_contact",
      workflowId: "32",
      workflowType: "wecom_sop",
    }))).resolves.toEqual({ kind: "capacity-rejected" });
  });

  it("counts active Runs from different Subjects as separate capacity slots", async () => {
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 2,
    }))).resolves.toMatchObject({ kind: "success" });
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 2,
      entryEventId: "event-2",
      subjectId: "customer-2",
    }))).resolves.toMatchObject({ kind: "success" });
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 2,
      entryEventId: "event-3",
      subjectId: "customer-3",
    }))).resolves.toEqual({ kind: "capacity-rejected" });
  });

  it.each(WORKFLOW_ACTIVE_RUN_STATUSES)(
    "counts a %s Run toward tenant capacity",
    async (status) => {
      const first = requireCreatedRun(await harness.repository.createRunWithInitialTask(createRunInput({
        activeRunLimit: 1,
      })));
      await harness.setRunStatus(first.run.id, status);

      await expect(harness.repository.createRunWithInitialTask(createRunInput({
        activeRunLimit: 1,
        entryEventId: `event-after-${status}`,
        subjectId: `customer-after-${status}`,
      }))).resolves.toEqual({ kind: "capacity-rejected" });
    },
  );

  it("deduplicates an admitted Entry before applying a full capacity limit", async () => {
    const input = createRunInput({ activeRunLimit: 1 });
    const first = requireCreatedRun(await harness.repository.createRunWithInitialTask(input));

    await expect(harness.repository.createRunWithInitialTask(input)).resolves.toMatchObject({
      deduplicated: true,
      kind: "success",
      run: { id: first.run.id },
    });
  });

  it("releases capacity only after a Run becomes terminal", async () => {
    const first = requireCreatedRun(await harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
    })));
    await harness.setRunStatus(first.run.id, "waiting");
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
      entryEventId: "event-2",
      subjectId: "customer-2",
    }))).resolves.toEqual({ kind: "capacity-rejected" });

    await harness.setWorkflowRuntimeStatus("paused");
    await harness.setWorkflowRuntimeStatus("active");
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
      entryEventId: "event-3",
      subjectId: "customer-3",
    }))).resolves.toEqual({ kind: "capacity-rejected" });

    await harness.setRunStatus(first.run.id, "completed");
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
      entryEventId: "event-4",
      subjectId: "customer-4",
    }))).resolves.toMatchObject({ deduplicated: false, kind: "success" });
  });

  it("applies limit changes to later admissions without changing existing Runs", async () => {
    const first = requireCreatedRun(await harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 2,
    })));
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
      entryEventId: "event-2",
      subjectId: "customer-2",
    }))).resolves.toEqual({ kind: "capacity-rejected" });
    await expect(harness.repository.findRun(9, first.run.id)).resolves.toMatchObject({
      status: "queued",
    });
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 2,
      entryEventId: "event-2",
      subjectId: "customer-2",
    }))).resolves.toMatchObject({ deduplicated: false, kind: "success" });
  });

  it("applies Entry Policy before tenant capacity", async () => {
    const first = requireCreatedRun(await harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
      entryPolicy: { mode: "never" },
    })));
    await harness.setRunStatus(first.run.id, "completed");
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 0,
      entryEventId: "event-2",
      entryPolicy: { mode: "never" },
    }))).resolves.toEqual({ kind: "entry-policy-rejected" });
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
    expect(repeatedOriginalSubject).toEqual({ kind: "active-run-rejected" });
  });

  it("persists one Wait Event subscription under the complete Subject identity", async () => {
    const waiting = await createEventWait(harness.repository);

    await expect(harness.repository.listMatchingEventSubscriptions(
      9,
      "chatai_contact",
      "message.received",
      "customer-1",
      null,
      OUTBOX_READY_AT,
    )).resolves.toEqual([
      expect.objectContaining({
        eventType: "message.received",
        runId: waiting.run.id,
        status: "waiting",
        subjectId: "customer-1",
        subjectType: "chatai_contact",
        taskId: waiting.task.id,
      }),
    ]);
    await expect(harness.repository.listMatchingEventSubscriptions(
      9,
      "wecom_contact",
      "message.received",
      "customer-1",
      null,
      OUTBOX_READY_AT,
    )).resolves.toEqual([]);
    await expect(harness.repository.findTask(9, waiting.task.id)).resolves.toMatchObject({
      dueAt: EVENT_WAIT_EXPIRES_AT,
      status: "pending",
      taskType: "wait-event",
      taskVersion: 3,
    });
    await expect(harness.repository.findRun(9, waiting.run.id)).resolves.toMatchObject({
      nextExecuteAt: EVENT_WAIT_EXPIRES_AT,
      status: "waiting",
    });
  });

  it("filters seat-specific Wait Event subscriptions before admission", async () => {
    const waiting = await createEventWait(harness.repository, 101);

    await expect(harness.repository.listMatchingEventSubscriptions(
      9,
      "chatai_contact",
      "message.received",
      "customer-1",
      202,
      OUTBOX_READY_AT,
    )).resolves.toEqual([]);
    await expect(harness.repository.listMatchingEventSubscriptions(
      9,
      "chatai_contact",
      "message.received",
      "customer-1",
      101,
      OUTBOX_READY_AT,
    )).resolves.toEqual([
      expect.objectContaining({ id: waiting.subscription.id, seatId: 101 }),
    ]);
  });

  it("rejects beginning a Wait Event when the Workflow boundary is unavailable", async () => {
    const created = requireCreatedRun(await harness.repository.createRunWithInitialTask(createRunInput({
      initialNodeId: "wait-event-1",
      initialNodeKind: "wait-event",
    })));
    const claimed = await harness.repository.claimTask({
      expectedTaskVersion: created.task.taskVersion,
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("Expected Wait Event task claim to succeed");
    await harness.setWorkflowRuntimeStatus("stopped");

    const inbox = {
      consumer: "workflow-task",
      expiresAt: new Date("2099-02-01T00:00:00.000Z"),
      messageId: `wait-event:${created.task.id}`,
    };
    await expect(harness.repository.beginEventWait({
      effectiveFrom: OUTBOX_READY_AT,
      eventType: "message.received",
      expectedRunLockVersion: created.run.lockVersion,
      expectedTaskVersion: claimed.task.taskVersion,
      expiresAt: EVENT_WAIT_EXPIRES_AT,
      inbox,
      now: OUTBOX_READY_AT,
      runId: created.run.id,
      seatId: null,
      taskId: created.task.id,
      uid: 9,
    })).resolves.toEqual({ action: "cancel", kind: "workflow-unavailable" });
    await expect(harness.repository.findEventSubscriptionByTask(9, created.task.id))
      .resolves.toBeNull();
    await expect(harness.repository.hasProcessedInboxMessage(inbox)).resolves.toBe(false);
  });

  it("allows only one event or timeout claimant to win a Wait Event subscription", async () => {
    const waiting = await createEventWait(harness.repository);
    const [triggered, timedOut] = await Promise.all([
      harness.repository.triggerEventSubscription({
        eventId: "message-event-1",
        eventOccurredAt: OUTBOX_READY_AT,
        projection: messageProjection(101, "第一条消息"),
        recordedAt: OUTBOX_READY_AT,
        resumeAt: EVENT_RESUME_AT,
        subscriptionId: waiting.subscription.id,
        uid: 9,
      }),
      harness.repository.timeoutEventSubscription({
        subscriptionId: waiting.subscription.id,
        timedOutAt: EVENT_WAIT_EXPIRES_AT,
        uid: 9,
      }),
    ]);

    expect([triggered, timedOut].filter(result => result.kind === "success")).toHaveLength(1);
    expect([triggered, timedOut].filter(result => result.kind === "conflict")).toHaveLength(1);
    const subscription = await harness.repository.findEventSubscriptionByTask(9, waiting.task.id);
    expect(["timed_out", "triggered"]).toContain(subscription?.status);
  });

  it("rejects Wait Event triggers outside the subscription interval", async () => {
    const waiting = await createEventWait(harness.repository);

    await expect(harness.repository.triggerEventSubscription({
      eventId: "late-message-event",
      eventOccurredAt: EVENT_WAIT_EXPIRES_AT,
      projection: messageProjection(102, "迟到消息"),
      recordedAt: EVENT_WAIT_EXPIRES_AT,
      resumeAt: new Date("2099-01-02T00:00:10.000Z"),
      subscriptionId: waiting.subscription.id,
      uid: 9,
    })).resolves.toEqual({ kind: "conflict" });
    await expect(harness.repository.findEventSubscriptionByTask(9, waiting.task.id))
      .resolves.toMatchObject({ status: "waiting" });
  });

  it("records a Wait Event while paused and dispatches it only after explicit resume", async () => {
    const waiting = await createEventWait(harness.repository);
    await harness.setWorkflowRuntimeStatus("paused");

    await expect(harness.repository.triggerEventSubscription({
      eventId: "message-event-1",
      eventOccurredAt: OUTBOX_READY_AT,
      projection: messageProjection(101, "暂停期间消息"),
      recordedAt: OUTBOX_READY_AT,
      resumeAt: EVENT_RESUME_AT,
      subscriptionId: waiting.subscription.id,
      uid: 9,
    })).resolves.toMatchObject({
      kind: "success",
      subscription: { status: "triggered" },
      task: { status: "suspended" },
    });
    await expect(harness.repository.reconcileEventSubscriptions({ limit: 10 }))
      .resolves.toMatchObject({ cancelled: 0, checked: 1 });
    await expect(harness.repository.dispatchDueTasks({
      limit: 10,
      now: EVENT_RESUME_AT,
    })).resolves.toEqual({ cancelled: 0, dispatched: 0, suspended: 0 });

    await harness.setWorkflowRuntimeStatus("active");
    await expect(harness.repository.dispatchDueTasks({
      limit: 10,
      now: EVENT_RESUME_AT,
    })).resolves.toEqual({ cancelled: 0, dispatched: 1, suspended: 0 });
  });

  it("latches only the first Wait Event and removes the subscription from matching", async () => {
    const waiting = await createEventWait(harness.repository);
    const occurredAt = new Date("2099-01-01T00:00:02.000Z");
    const recordedAt = new Date("2099-01-01T00:00:03.000Z");
    const resumeAt = new Date("2099-01-01T00:00:32.000Z");
    const first = await harness.repository.triggerEventSubscription({
      eventId: "message-event-1",
      eventOccurredAt: occurredAt,
      projection: messageProjection(101, "第一条消息"),
      recordedAt,
      resumeAt,
      subscriptionId: waiting.subscription.id,
      uid: 9,
    });
    const second = await harness.repository.triggerEventSubscription({
      eventId: "message-event-2",
      eventOccurredAt: new Date("2099-01-01T00:00:04.000Z"),
      projection: messageProjection(102, "第二条消息"),
      recordedAt: new Date("2099-01-01T00:00:05.000Z"),
      resumeAt: new Date("2099-01-01T00:00:34.000Z"),
      subscriptionId: waiting.subscription.id,
      uid: 9,
    });

    expect(first).toMatchObject({
      kind: "success",
      subscription: {
        resumeAt,
        status: "triggered",
        triggerEventId: "message-event-1",
        triggerOccurredAt: occurredAt,
        triggerProjection: messageProjection(101, "第一条消息"),
      },
      task: { dueAt: resumeAt },
    });
    expect(second).toEqual({ kind: "conflict" });
    await expect(harness.repository.listMatchingEventSubscriptions(
      9,
      "chatai_contact",
      "message.received",
      "customer-1",
      null,
      new Date("2099-01-01T00:00:04.000Z"),
    )).resolves.toEqual([]);
  });

  it("allows one Wait Event trigger across concurrent duplicate deliveries", async () => {
    const waiting = await createEventWait(harness.repository);
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      harness.repository.triggerEventSubscription({
        eventId: "message-event-concurrent",
        eventOccurredAt: OUTBOX_READY_AT,
        projection: messageProjection(103, "并发消息"),
        recordedAt: OUTBOX_READY_AT,
        resumeAt: EVENT_RESUME_AT,
        subscriptionId: waiting.subscription.id,
        uid: 9,
      })));

    expect(results.filter(result => result.kind === "success")).toHaveLength(1);
    expect(results.filter(result => result.kind === "conflict")).toHaveLength(7);
  });

  it("cancels Wait Event subscriptions when their Workflow stops", async () => {
    const waiting = await createEventWait(harness.repository);
    await harness.setWorkflowRuntimeStatus("stopped");

    await expect(harness.repository.cancelUnavailableWorkflowRuns({ limit: 10 }))
      .resolves.toMatchObject({ cancelled: 1 });
    await expect(harness.repository.findEventSubscriptionByTask(9, waiting.task.id))
      .resolves.toMatchObject({ status: "cancelled" });
    await expect(harness.repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "publisher-1",
      limit: 10,
      now: OUTBOX_READY_AT,
    })).resolves.toEqual([]);
  });

  it("reconciles an active subscription whose Run is already terminal", async () => {
    const waiting = await createEventWait(harness.repository);
    await harness.setRunStatus(waiting.run.id, "completed");

    await expect(harness.repository.reconcileEventSubscriptions({ limit: 10 }))
      .resolves.toMatchObject({ cancelled: 1, checked: 1, hasMore: false });
    await expect(harness.repository.findEventSubscriptionByTask(9, waiting.task.id))
      .resolves.toMatchObject({ status: "cancelled" });
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

  it("marks only Outbox rows held by the requested lease owner in one batch", async () => {
    await harness.repository.createRunWithInitialTask(createRunInput());
    await harness.repository.createRunWithInitialTask(createRunInput({
      entryEventId: "event-2",
      subjectId: "customer-2",
    }));
    const first = await harness.repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "publisher-1",
      limit: 1,
      now: OUTBOX_READY_AT,
    });
    const second = await harness.repository.claimOutboxBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "publisher-2",
      limit: 1,
      now: OUTBOX_READY_AT,
    });
    const ids = [first[0]!.id, second[0]!.id];

    await expect(harness.repository.markOutboxSentBatch({
      ids,
      leaseOwner: "publisher-1",
      sentAt: OUTBOX_READY_AT,
    })).resolves.toBe(1);
    await expect(harness.repository.markOutboxSentBatch({
      ids,
      leaseOwner: "publisher-2",
      sentAt: OUTBOX_READY_AT,
    })).resolves.toBe(1);
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
    await expect(harness.repository.markOutboxSentBatch({
      ids: [initialOutbox[0]!.id],
      leaseOwner: "publisher-initial",
      sentAt: OUTBOX_READY_AT,
    })).resolves.toBe(1);

    const claimed = await harness.repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: created.task.id,
      uid: 9,
    });
    if (claimed.kind !== "success") throw new Error("Expected initial task claim to succeed");
    const prepared = await harness.repository.prepareCapabilityExecution({
      expectedRunLockVersion: 1,
      expectedTaskVersion: claimed.task.taskVersion,
      executionKey: "9:1:start:1",
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
      executionKey: "9:1:start:1",
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
    await expect(harness.repository.scheduleCapabilityRetry(retryInput)).resolves.toMatchObject({
      kind: "success",
      task: { status: "pending", taskVersion: 3 },
    });
    await expect(harness.repository.scheduleCapabilityRetry(retryInput)).resolves.toEqual({
      kind: "already-processed",
    });

    await expect(harness.repository.dispatchDueTasks({
      limit: 10,
      now: OUTBOX_RETRY_AT,
    })).resolves.toEqual({ cancelled: 0, dispatched: 1, suspended: 0 });
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
        executionKey: "transaction-rollback",
        input: {},
        output: {},
      },
      runId: created.run.id,
      taskId: created.task.id,
      uid: 9,
    };
    await expect(harness.repository.commitNodeResult(commitInput)).resolves.toEqual({
      kind: "conflict",
    });
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
    await expect(harness.repository.createRunWithInitialTask(createRunInput({
      activeRunLimit: 1,
      entryEventId: "event-after-completion",
      subjectId: "customer-after-completion",
    }))).resolves.toMatchObject({ deduplicated: false, kind: "success" });
  });
}

export function createRunInput(
  overrides: Partial<WorkflowCreateRunInput> = {},
): WorkflowCreateRunInput {
  return {
    activeRunLimit: 10_000,
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

async function createEventWait(
  repository: WorkflowRuntimeRepository,
  seatId: number | null = null,
) {
  const created = requireCreatedRun(await repository.createRunWithInitialTask(createRunInput({
    initialNodeId: "wait-event-1",
    initialNodeKind: "wait-event",
  })));
  const claimed = await repository.claimTask({
    expectedTaskVersion: created.task.taskVersion,
    leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
    leaseOwner: "worker-1",
    taskId: created.task.id,
    uid: 9,
  });
  if (claimed.kind !== "success") throw new Error("Expected Wait Event task claim to succeed");
  const waiting = await repository.beginEventWait({
    effectiveFrom: OUTBOX_READY_AT,
    eventType: "message.received",
    expectedRunLockVersion: created.run.lockVersion,
    expectedTaskVersion: claimed.task.taskVersion,
    expiresAt: EVENT_WAIT_EXPIRES_AT,
    inbox: {
      consumer: "workflow-task",
      expiresAt: new Date("2099-02-01T00:00:00.000Z"),
      messageId: `wait-event:${created.task.id}`,
    },
    now: OUTBOX_READY_AT,
    runId: created.run.id,
    seatId,
    taskId: created.task.id,
    uid: 9,
  });
  if (waiting.kind !== "success") {
    throw new Error(`Expected Wait Event subscription to succeed, received ${waiting.kind}`);
  }
  return waiting;
}

async function createInferenceWait(
  repository: WorkflowRuntimeRepository,
  options: { deadlineAt?: Date; suffix?: string } = {},
) {
  const suffix = options.suffix ?? "default";
  const created = requireCreatedRun(await repository.createRunWithInitialTask(createRunInput({
    entryEventId: `inference-event-${suffix}`,
    initialNodeId: `llm-${suffix}`,
    initialNodeKind: "llm",
    subjectId: `customer-${suffix}`,
  })));
  const claimed = await repository.claimTask({
    expectedTaskVersion: created.task.taskVersion,
    leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
    leaseOwner: "task-worker-1",
    taskId: created.task.id,
    uid: 9,
  });
  if (claimed.kind !== "success") throw new Error("Expected Inference Task claim to succeed");
  const waiting = await repository.beginInference({
    contractVersion: 1,
    deadlineAt: options.deadlineAt ?? INFERENCE_DEADLINE,
    executionKey: `9:${created.run.id}:llm-${suffix}:1`,
    expectedRunLockVersion: created.run.lockVersion,
    expectedTaskVersion: claimed.task.taskVersion,
    inbox: {
      consumer: "workflow-task",
      expiresAt: new Date("2099-02-01T00:00:00.000Z"),
      messageId: `inference:${created.task.id}`,
    },
    now: OUTBOX_READY_AT,
    payload: {
      kind: "message-list",
      messageList: [{ content: [{ text: "Summarize", type: "text" }], role: "system" }],
      modelTarget: { kind: "catalog-model", modelId: "model-1" },
        reasoningEffort: "medium",
      responseFormat: { type: "text" },
    },
    runId: created.run.id,
    taskId: created.task.id,
    uid: 9,
  });
  if (waiting.kind !== "success") throw new Error("Expected Inference wait to succeed");
  return waiting;
}

function requireCreatedRun(
  result: Awaited<ReturnType<WorkflowRuntimeRepository["createRunWithInitialTask"]>>,
) {
  if (result.kind !== "success") {
    throw new Error(`Expected run creation to succeed, received ${result.kind}`);
  }
  return result;
}

function messageProjection(messageId: number, text: string) {
  return { messageId, messageType: "text", text };
}
