import { describe, expect, it } from "vitest";
import { Kysely, MysqlDialect } from "kysely";
import {
  MysqlWorkflowRuntimeRepository,
  WORKFLOW_MYSQL_MIN_MAX_ALLOWED_PACKET_BYTES,
  WORKFLOW_MYSQL_WRITE_CHUNK_SIZE,
  WORKFLOW_RUNTIME_BATCH_LIMIT,
} from "../src/index.js";

describe("MysqlWorkflowRuntimeRepository", () => {
  it("stops definitions without synchronously scanning active Runs on entitlement loss", async () => {
    const db = createEntitlementLossDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.applyEntitlementLoss({
      opSubUserId: "19",
      transitionedAt: new Date("2026-07-10T00:00:00.000Z"),
      transition: "stop",
      uid: 9,
      workflowType: "chatai_sop",
    })).resolves.toEqual({ affectedDefinitions: 1 });

    expect(db.updates.xy_wap_embed_workflow_definition).toMatchObject({
      runtime_status: "stopped",
      status_reason: "entitlement_revoked",
    });
    expect(db.executedSelectTables).not.toContain("xy_wap_embed_workflow_run");
    expect(db.updates.xy_wap_embed_workflow_run).toBeUndefined();
    expect(db.updates.xy_wap_embed_workflow_task).toBeUndefined();
    expect(db.updates.xy_wap_embed_workflow_outbox).toBeUndefined();
  });

  it("locks the run and task before creating a capability execution ledger", async () => {
    const db = createCapabilityExecutionDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.prepareCapabilityExecution({
      expectedRunLockVersion: 1,
      expectedTaskVersion: 2,
      executionKey: "9:5:message:2",
      input: { subjectId: "customer-1" },
      now: new Date("2026-07-13T00:00:00.000Z"),
      runId: "5",
      taskId: "7",
      uid: 9,
    });

    expect(result).toMatchObject({
      execution: { executionKey: "9:5:message:2", status: "running" },
      kind: "success",
    });
    expect(db.lockOrder).toEqual(["run", "task", "execution"]);
    expect(db.inserts.xy_wap_embed_workflow_node_execution).toMatchObject({
      failure_kind: null,
      execution_key: "9:5:message:2",
      status: "running",
    });
  });

  it.each([
    { expectedStatus: "pending", runtimeStatus: "active" },
    { expectedStatus: "suspended", runtimeStatus: "paused" },
  ] as const)("persists a $expectedStatus capability retry for an $runtimeStatus Workflow", async ({
    expectedStatus,
    runtimeStatus,
  }) => {
    const db = createCapabilityExecutionDbMock({ executionStatus: "running", runtimeStatus });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);
    const dueAt = new Date("2026-07-13T00:00:05.000Z");

    const result = await repository.scheduleCapabilityRetry({
      dueAt,
      errorCode: "DOWNSTREAM_TEMPORARY",
      errorMessage: "可展示的下游错误",
      expectedRunLockVersion: 1,
      expectedTaskVersion: 2,
      failureKind: "unknown",
      executionKey: "9:5:message:2",
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-13T00:00:00.000Z"),
        messageId: "message-1",
      },
      now: new Date("2026-07-13T00:00:00.000Z"),
      runId: "5",
      taskId: "7",
      uid: 9,
    });

    expect(result).toMatchObject({ kind: "success", task: { status: expectedStatus, taskVersion: 3 } });
    expect(db.inserts.xy_wap_embed_workflow_inbox).toMatchObject({ message_id: "message-1" });
    expect(db.updates.xy_wap_embed_workflow_node_execution).toMatchObject({
      error_code: "DOWNSTREAM_TEMPORARY",
      failure_kind: "unknown",
      status: "retrying",
    });
    expect(db.updates.xy_wap_embed_workflow_task).toMatchObject({
      due_at: dueAt,
      lease_owner: null,
      status: expectedStatus,
      task_version: 3,
    });
    expect(db.updates.xy_wap_embed_workflow_run).toMatchObject({
      lock_version: 2,
      next_execute_at: dueAt,
    });
  });

  it("atomically marks the ledger, task, and run failed for a terminal capability error", async () => {
    const db = createCapabilityExecutionDbMock({ executionStatus: "running" });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.failCapabilityExecution({
      errorCode: "DOWNSTREAM_REJECTED",
      errorMessage: "可展示的下游错误",
      expectedRunLockVersion: 1,
      expectedTaskVersion: 2,
      failureKind: "terminal",
      executionKey: "9:5:message:2",
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-13T00:00:00.000Z"),
        messageId: "message-1",
      },
      now: new Date("2026-07-13T00:00:00.000Z"),
      runId: "5",
      taskId: "7",
      uid: 9,
    });

    expect(result).toMatchObject({
      kind: "success",
      run: { status: "failed" },
      task: { status: "dead" },
    });
    expect(db.updates.xy_wap_embed_workflow_node_execution).toMatchObject({
      failure_kind: "terminal",
      status: "failed",
    });
    expect(db.updates.xy_wap_embed_workflow_task).toMatchObject({ status: "dead" });
    expect(db.updates.xy_wap_embed_workflow_run).toMatchObject({
      status: "failed",
      terminal_reason: "DOWNSTREAM_REJECTED",
    });
    expect(db.updates.xy_wap_embed_workflow_capacity_guard).toBeDefined();
    expect(db.inserts.xy_wap_embed_workflow_metric).toEqual([
      expect.objectContaining({ failed_run_count: 1, total_run_count: 0 }),
    ]);
    expect(db.inserts.xy_wap_embed_workflow_daily_metric).toEqual([
      expect.objectContaining({ failed_count: 1, entered_count: 0 }),
    ]);
  });

  it("atomically fails a core node without persisting its rejected context", async () => {
    const db = createCapabilityExecutionDbMock({
      nodeId: "ratio-split-1",
      nodeKind: "ratio-split",
      sequence: 1,
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.commitNodeResult({
      context: { rejected: "context" },
      expectedRunLockVersion: 1,
      expectedTaskVersion: 2,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-13T00:00:00.000Z"),
        messageId: "message-1",
      },
      nodeExecution: {
        errorCode: "WORKFLOW_CONTEXT_TOO_LARGE",
        errorMessage: "流程数据异常，流程已停止",
        executionKey: "9:5:ratio-split-1:1",
        input: { subjectId: "customer-1" },
        output: {},
      },
      runId: "5",
      taskId: "7",
      uid: 9,
    });

    expect(result).toMatchObject({
      kind: "success",
      nextTask: null,
      run: { context: { trigger: {} }, status: "failed" },
    });
    expect(db.inserts.xy_wap_embed_workflow_node_execution).toMatchObject({
      error_code: "WORKFLOW_CONTEXT_TOO_LARGE",
      node_kind: "ratio-split",
      source_outlet_id: null,
      status: "failed",
    });
    expect(db.updates.xy_wap_embed_workflow_task).toMatchObject({
      last_error_code: "WORKFLOW_CONTEXT_TOO_LARGE",
      status: "dead",
    });
    expect(db.updates.xy_wap_embed_workflow_run).toMatchObject({
      context_json: JSON.stringify({ trigger: {} }),
      status: "failed",
      terminal_reason: "WORKFLOW_CONTEXT_TOO_LARGE",
    });
  });

  it("persists the selected Source Outlet for a completed Core node", async () => {
    const db = createCapabilityExecutionDbMock({
      nodeId: "ratio-split-1",
      nodeKind: "ratio-split",
      publishedExecutionSpec: {
        edges: [],
        entryNodeId: "start",
        nodes: [
          { config: {}, id: "start", kind: "start", nodeSchemaVersion: 1 },
          { config: {}, id: "end", kind: "end", nodeSchemaVersion: 1 },
        ],
        revision: 1,
        schemaVersion: 3,
        terminalNodeId: "end",
        workflowId: "31",
      },
      sequence: 1,
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.commitNodeResult({
      context: { outputs: { "ratio-split-1": {} }, trigger: {} },
      expectedRunLockVersion: 1,
      expectedTaskVersion: 2,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-13T00:00:00.000Z"),
        messageId: "message-1",
      },
      nodeExecution: {
        executionKey: "9:5:ratio-split-1:1",
        input: { subjectId: "customer-1" },
        output: {},
        sourceOutletId: "ratio-a",
      },
      runId: "5",
      sourceOutletId: "ratio-a",
      taskId: "7",
      uid: 9,
    });

    expect(result).toMatchObject({
      kind: "success",
      nextTask: null,
      run: {
        status: "cancelled",
        terminalReason: "flow_changed_current_node_deleted",
      },
    });
    expect(db.inserts.xy_wap_embed_workflow_node_execution).toMatchObject({
      node_kind: "ratio-split",
      source_outlet_id: "ratio-a",
      status: "completed",
    });
    expect(db.inserts.xy_wap_embed_workflow_metric).toEqual([
      expect.objectContaining({ cancelled_run_count: 1, total_run_count: 0 }),
    ]);
  });

  it("increments the completed Run metric when a Workflow reaches its terminal node", async () => {
    const db = createCapabilityExecutionDbMock({
      nodeId: "end",
      nodeKind: "end",
      sequence: 2,
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.commitNodeResult({
      context: { outputs: { end: {} }, trigger: {} },
      expectedRunLockVersion: 1,
      expectedTaskVersion: 2,
      inbox: {
        consumer: "workflow-task",
        expiresAt: new Date("2026-08-13T00:00:00.000Z"),
        messageId: "message-completed",
      },
      nodeExecution: {
        executionKey: "9:5:end:2",
        input: { subjectId: "customer-1" },
        output: {},
      },
      runId: "5",
      taskId: "7",
      uid: 9,
    });

    expect(result).toMatchObject({ kind: "success", run: { status: "completed" } });
    expect(db.inserts.xy_wap_embed_workflow_metric).toEqual([
      expect.objectContaining({ completed_run_count: 1, total_run_count: 0 }),
    ]);
    expect(db.inserts.xy_wap_embed_workflow_daily_metric).toEqual([
      expect.objectContaining({ completed_count: 1, entered_count: 0 }),
    ]);
  });

  it("locks runs before tasks while reconciling inconsistent runtime state", async () => {
    const db = createRunTaskConsistencyDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore: new Date("2026-07-10T00:01:00.000Z"),
      limit: 100,
      now: new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(result).toMatchObject({
      inconsistentRunsFailed: 1,
      runsChecked: 1,
      tasksChecked: 1,
      terminalRunTasksCancelled: 1,
    });
    expect(db.lockOrder).toEqual(["run", "task", "run", "task"]);
    expect(db.runUpdate).toMatchObject({
      status: "failed",
      terminal_reason: "WORKFLOW_RUNTIME_STATE_INCONSISTENT",
    });
    expect(db.taskUpdate).toMatchObject({
      lease_expires_at: null,
      lease_owner: null,
      status: "cancelled",
    });
  });

  it("returns null consistency cursors when there is no work", async () => {
    const repository = new MysqlWorkflowRuntimeRepository(createEmptyConsistencyDbMock() as never);

    await expect(repository.reconcileRunTaskConsistency({
      inconsistentBefore: new Date("2026-07-10T00:01:00.000Z"),
      limit: 100,
      now: new Date("2026-07-10T00:02:00.000Z"),
    })).resolves.toMatchObject({
      lastRunId: null,
      lastTaskId: null,
      runsChecked: 0,
      tasksChecked: 0,
    });
  });

  it("keeps a recently updated inconsistent run inside the grace period", async () => {
    const db = createRunTaskConsistencyDbMock({
      includeTerminalTask: false,
      runUpdatedAt: new Date("2026-07-10T00:01:30.000Z"),
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore: new Date("2026-07-10T00:01:00.000Z"),
      limit: 100,
      now: new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(result.inconsistentRunsFailed).toBe(0);
    expect(db.runUpdate).toEqual({});
    expect(db.taskUpdate).toEqual({});
  });

  it("removes a failed waiting run from its authoritative wait-node metric", async () => {
    const db = createWaitingConsistencyDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.reconcileRunTaskConsistency({
      inconsistentBefore: new Date("2026-07-10T00:01:00.000Z"),
      limit: 100,
      now: new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(result.inconsistentRunsFailed).toBe(1);
    expect(db.metricEvents).toEqual([
      expect.objectContaining({
        current_delta: -1,
        event_key: "1:runtime-state-inconsistent:wait-1",
        node_id: "wait-1",
      }),
    ]);
  });

  it("inserts the maximum inconsistent-run metric batch in fixed write chunks", async () => {
    const db = createWaitingConsistencyDbMock(WORKFLOW_RUNTIME_BATCH_LIMIT);
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.reconcileRunTaskConsistency({
      inconsistentBefore: new Date("2026-07-10T00:01:00.000Z"),
      limit: WORKFLOW_RUNTIME_BATCH_LIMIT,
      now: new Date("2026-07-10T00:02:00.000Z"),
    })).resolves.toMatchObject({
      inconsistentRunsFailed: WORKFLOW_RUNTIME_BATCH_LIMIT,
      runsChecked: WORKFLOW_RUNTIME_BATCH_LIMIT,
    });

    expect(db.metricEvents).toHaveLength(WORKFLOW_RUNTIME_BATCH_LIMIT);
    expect(db.metricInsertSizes).toEqual(Array.from(
      { length: WORKFLOW_RUNTIME_BATCH_LIMIT / WORKFLOW_MYSQL_WRITE_CHUNK_SIZE },
      () => WORKFLOW_MYSQL_WRITE_CHUNK_SIZE,
    ));
  });

  it("checks the workflow boundary in the same transaction before creating a run", async () => {
    const db = createRunDbMock({ bizStatus: 1, runtimeStatus: "stopped" });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.createRunWithInitialTask({
      activeRunLimit: 10_000,
      context: {},
      entryEventId: "event-1",
      entryPolicy: { mode: "never" },
      initialNodeId: "start",
      initialNodeKind: "start",
      occurredAt: new Date("2026-07-10T00:00:00.000Z"),
      revision: 1,
      shardId: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 8,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(result).toEqual({ action: "cancel", kind: "workflow-unavailable" });
    expect(db.definitionReadShareLocked).toBe(true);
    expect(db.isolationLevel).toBe("read committed");
    expect(db.runInsertCount).toBe(0);
  });

  it("rechecks event deduplication after locking the subject admission guard", async () => {
    const db = createConcurrentDuplicateRunDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.createRunWithInitialTask({
      activeRunLimit: 10_000,
      context: {},
      entryEventId: "event-1",
      entryPolicy: { mode: "never" },
      initialNodeId: "start",
      initialNodeKind: "start",
      occurredAt: new Date("2020-01-01T00:00:00.000Z"),
      revision: 1,
      shardId: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 8,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(result).toMatchObject({ deduplicated: true, kind: "success" });
    expect(db.runReadCount).toBe(2);
    expect(db.guardWriteLocked).toBe(true);
    expect(db.isolationLevel).toBe("read committed");
    expect(db.runShareLockCount).toBe(1);
    expect(db.taskReadLocked).toBe(true);
    expect(db.runInsertCount).toBe(0);
  });

  it("rejects another active Run after locking the subject admission guard", async () => {
    const db = createConcurrentDuplicateRunDbMock({ duplicateAfterGuard: false });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.createRunWithInitialTask({
      activeRunLimit: 10_000,
      context: {},
      entryEventId: "event-2",
      entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
      initialNodeId: "start",
      initialNodeKind: "start",
      occurredAt: new Date("2020-01-01T00:00:00.000Z"),
      revision: 1,
      shardId: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 8,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(result).toEqual({ kind: "active-run-rejected" });
    expect(db.runReadCount).toBe(3);
    expect(db.guardWriteLocked).toBe(true);
    expect(db.runShareLockCount).toBe(2);
    expect(db.taskReadLocked).toBe(false);
    expect(db.runInsertCount).toBe(0);
  });

  it("rejects admission when the tenant guard has no remaining capacity", async () => {
    const db = createFullCapacityGuardDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.createRunWithInitialTask({
      activeRunLimit: 1,
      context: {},
      entryEventId: "capacity-event-1",
      entryPolicy: { mode: "never" },
      initialNodeId: "start",
      initialNodeKind: "start",
      occurredAt: new Date("2026-07-10T00:00:00.000Z"),
      revision: 1,
      shardId: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 8,
      workflowId: "42",
      workflowType: "chatai_sop",
    })).resolves.toEqual({ kind: "capacity-rejected" });
  });

  it("uses a shared definition lock when claiming an execution task", async () => {
    const db = createClaimDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: "7",
      uid: 8,
    });

    expect(result.kind).toBe("success");
    expect(db.definitionReadShareLocked).toBe(true);
    expect(db.lockOrder).toEqual(["run", "task"]);
    expect(db.taskUpdate).toMatchObject({ attempt: 1 });
    expect(db.runUpdate).toMatchObject({ status: "running" });
  });

  it("locks the run before the task and rejects a claim after the run becomes terminal", async () => {
    const db = createClaimDbMock("active", "cancelled");
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: "7",
      uid: 8,
    });

    expect(result).toEqual({ kind: "conflict" });
    expect(db.lockOrder).toEqual(["run"]);
    expect(db.taskUpdate).toEqual({});
  });

  it("locks runs before tasks when recovering expired leases", async () => {
    const db = createLeaseRecoveryDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.recoverExpiredLeases({
      limit: 100,
      maxAttempts: 3,
      now: new Date("2026-07-10T00:02:00.000Z"),
    });

    expect(result).toEqual({ dead: 0, recovered: 1 });
    expect(db.lockOrder).toEqual(["run", "task"]);
  });

  it("releases expired-lease capacity once for each active Run", async () => {
    const db = createLeaseRecoveryDbMock({
      lockedRuns: [
        { id: "5", status: "running" },
        { id: "6", status: "completed" },
      ],
      runUpdateCount: 1,
      tasks: [
        leaseRecoveryTask({ id: "7", run_id: "5", sequence: 1 }),
        leaseRecoveryTask({ id: "8", run_id: "5", sequence: 2 }),
        leaseRecoveryTask({ id: "9", run_id: "6", sequence: 1 }),
      ],
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.recoverExpiredLeases({
      limit: 100,
      maxAttempts: 3,
      now: new Date("2026-07-10T00:02:00.000Z"),
    })).resolves.toEqual({ dead: 3, recovered: 0 });

    expect(db.capacityReleaseCounts).toEqual([1]);
  });

  it("does not expire an Inference Job whose lease was renewed after recovery scanning", async () => {
    const now = new Date("2026-07-10T00:02:00.000Z");
    const db = createInferenceRecoveryRaceDbMock({
      renewedLeaseExpiresAt: new Date("2026-07-10T00:03:00.000Z"),
      scannedLeaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.recoverInferenceJobs({
      limit: 100,
      maxAttempts: 1,
      now,
    })).resolves.toEqual({ expired: 0, recovered: 0 });
    expect(db.inferenceUpdateCount).toBe(0);
    expect(db.lockOrder).toEqual(["run", "task", "definition", "job"]);
    expect(db.candidateLimits).toEqual([100, 100, 100]);
    expect(db.candidatePredicates).toEqual([
      [["job.status", "in", ["pending", "retry_wait", "running"]], ["job.deadline_at", "<=", now]],
      [["job.status", "in", ["pending", "retry_wait"]], ["job.attempt", ">=", 1]],
      [["job.status", "=", "running"], ["job.lease_expires_at", "<=", now]],
    ]);
  });

  it("deduplicates split Inference recovery candidates and applies one numeric ID limit", async () => {
    const now = new Date("2026-07-10T00:02:00.000Z");
    const db = createInferenceRecoveryRaceDbMock({
      candidateIds: [["2", "10"], ["1", "2"], ["3"]],
      lockedJobs: false,
      renewedLeaseExpiresAt: new Date("2026-07-10T00:03:00.000Z"),
      scannedLeaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.recoverInferenceJobs({
      limit: 2,
      maxAttempts: 1,
      now,
    })).resolves.toEqual({ expired: 0, recovered: 0 });

    expect(db.candidateLimits).toEqual([2, 2, 2]);
    expect(db.lockedJobIds).toEqual(["1", "2"]);
  });

  it("splits Revision cleanup claim paths and applies one numeric ID limit", async () => {
    const now = new Date("2026-07-10T00:02:00.000Z");
    const leaseExpiresAt = new Date("2026-07-10T00:03:00.000Z");
    const db = createRevisionCleanupClaimDbMock({
      leasedIds: ["1", "3"],
      pendingIds: ["2", "10"],
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.claimRevisionCleanupBatch({
      leaseExpiresAt,
      leaseOwner: "cleanup-worker",
      limit: 2,
      maxAttempts: 3,
      now,
    })).resolves.toEqual([
      expect.objectContaining({ attempt: 2, id: "1", leaseOwner: "cleanup-worker", status: "leased" }),
      expect.objectContaining({ attempt: 2, id: "2", leaseOwner: "cleanup-worker", status: "leased" }),
    ]);

    expect(db.updates.slice(0, 2).map(update => update.wheres)).toEqual([
      [["attempt", ">=", 3], ["status", "=", "pending"], ["next_attempt_at", "<=", now]],
      [["attempt", ">=", 3], ["status", "=", "leased"], ["lease_expires_at", "<=", now]],
    ]);
    expect(db.selects.map(select => select.wheres)).toEqual([
      [["attempt", "<", 3], ["status", "=", "pending"], ["next_attempt_at", "<=", now]],
      [["attempt", "<", 3], ["status", "=", "leased"], ["lease_expires_at", "<=", now]],
    ]);
    expect(db.selects.map(select => ({ forUpdate: select.forUpdate, limit: select.limit, skipLocked: select.skipLocked })))
      .toEqual([
        { forUpdate: true, limit: 2, skipLocked: true },
        { forUpdate: true, limit: 2, skipLocked: true },
      ]);
    expect(db.updates[2]?.wheres).toEqual([["id", "in", ["1", "2"]]]);
  });

  it("dispatches a due-task batch without locking definitions and with one outbox insert", async () => {
    const db = createDispatchDueTasksDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.dispatchDueTasks({
      limit: 10,
      now: new Date("2026-07-10T00:01:00.000Z"),
    })).resolves.toEqual({ cancelled: 0, dispatched: 2, suspended: 0 });
    expect(db.scheduleIndexHints).toBe(1);
    expect(db.taskLockTargets).toEqual(["task"]);
    expect(db.definitionShareLocks).toBe(1);
    expect(db.taskUpdates).toBe(1);
    expect(db.outboxInsertSizes).toEqual([2]);
  });

  it("chunks a due-task outbox insert and clamps oversized scheduler limits", async () => {
    const overflow = 50;
    const db = createDispatchDueTasksDbMock(WORKFLOW_MYSQL_WRITE_CHUNK_SIZE + overflow);
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.dispatchDueTasks({
      limit: 1_000_000,
      now: new Date("2026-07-10T00:01:00.000Z"),
    })).resolves.toEqual({
      cancelled: 0,
      dispatched: WORKFLOW_MYSQL_WRITE_CHUNK_SIZE + overflow,
      suspended: 0,
    });
    expect(db.claimedLimits).toEqual([WORKFLOW_RUNTIME_BATCH_LIMIT]);
    expect(db.outboxInsertSizes).toEqual([WORKFLOW_MYSQL_WRITE_CHUNK_SIZE, overflow]);
  });

  it("keeps a MySQL outbox write chunk below one sixteenth of max_allowed_packet", () => {
    const now = new Date("2026-07-10T00:01:00.000Z");
    const compiler = new Kysely({ dialect: new MysqlDialect({ pool: {} as never }) });
    const compiled = compiler.insertInto("xy_wap_embed_workflow_outbox").values(
      Array.from({ length: WORKFLOW_MYSQL_WRITE_CHUNK_SIZE }, (_, index) => ({
        aggregate_id: String(1_000_000 + index),
        aggregate_type: "workflow_task",
        attempt: 0,
        event_type: "workflow.task.ready",
        lease_expires_at: null,
        lease_owner: null,
        next_attempt_at: now,
        payload_json: JSON.stringify({
          messageId: `workflow-task:${1_000_000 + index}:v1`,
          occurredAt: now.toISOString(),
          runId: String(2_000_000 + index),
          shardId: 255,
          taskId: String(1_000_000 + index),
          taskVersion: 1,
          uid: "9007199254740991",
        }),
        sent_at: null,
        status: "pending",
        task_version: 1,
        uid: 8,
      })),
    ).compile();
    const sqlBytes = Buffer.byteLength(compiled.sql, "utf8")
      + compiled.parameters.reduce((total, parameter) => (
        total + Buffer.byteLength(String(parameter ?? ""), "utf8")
      ), 0);
    expect(sqlBytes).toBeLessThan(WORKFLOW_MYSQL_MIN_MAX_ALLOWED_PACKET_BYTES / 16);
  });

  it("casts the unsigned current counter before applying a negative delta", async () => {
    const db = createMetricAggregationDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await repository.aggregateNodeMetricEvents({ limit: 100 });

    const compiler = new Kysely({ dialect: new MysqlDialect({ pool: {} as never }) });
    const compiled = (db.currentCountExpression as { compile(provider: Kysely<unknown>): { parameters: readonly unknown[]; sql: string } })
      .compile(compiler);
    expect(compiled.sql).toContain("CAST(current_count AS SIGNED)");
    expect(compiled.parameters.at(-1)).toBe(-1);
  });

  it("upserts the maximum node metric batch in fixed write chunks", async () => {
    const db = createMetricAggregationDbMock(WORKFLOW_RUNTIME_BATCH_LIMIT);
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.aggregateNodeMetricEvents({ limit: WORKFLOW_RUNTIME_BATCH_LIMIT }))
      .resolves.toBe(WORKFLOW_RUNTIME_BATCH_LIMIT);

    expect(db.metricInsertSizes).toEqual(Array.from(
      { length: WORKFLOW_RUNTIME_BATCH_LIMIT / WORKFLOW_MYSQL_WRITE_CHUNK_SIZE },
      () => WORKFLOW_MYSQL_WRITE_CHUNK_SIZE,
    ));
  });

  it("cleans terminal history in bounded batches without repeatedly selecting taskless runs", async () => {
    const db = createHistoryCleanupDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.cleanupWorkflowHistory({
      limit: 1,
      runBefore: new Date("2026-01-14T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-06-13T00:00:00.000Z"),
    })).resolves.toEqual({
      hasMore: true,
      nodeExecutionsDeleted: 1,
      outboxDeleted: 1,
      runsDeleted: 1,
      tasksDeleted: 1,
    });

    expect(db.usedTaskExistenceFilter).toBe(true);
    expect(db.taskExistenceWhereRefs).toEqual([
      ["cleanup_task.run_id", "=", "xy_wap_embed_workflow_run.id"],
    ]);
    expect(db.lockOrder).toEqual(["run", "outbox", "run"]);
    expect(db.outboxWhereCalls).not.toContainEqual(["outbox.status", "=", "leased"]);
    expect(db.deleteOrder).toEqual([
      "inference",
      "outbox",
      "subscription",
      "task",
      "execution",
      "run",
    ]);
    expect(db.runWhereCalls).toEqual(expect.arrayContaining([
      ["status", "in", ["cancelled", "completed", "failed"]],
      ["completed_at", "is not", null],
      ["completed_at", "<", new Date("2026-01-14T00:00:00.000Z")],
      ["completed_at", "<", new Date("2026-06-13T00:00:00.000Z")],
    ]));
  });

  it("keeps an expired run while it still owns a task", async () => {
    const db = createHistoryCleanupDbMock({
      remainingTasks: [{ run_id: "1" }],
      technicalRuns: [],
      userRuns: [{ id: "1" }],
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.cleanupWorkflowHistory({
      limit: 100,
      runBefore: new Date("2026-01-14T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-06-13T00:00:00.000Z"),
    })).resolves.toEqual({
      hasMore: true,
      nodeExecutionsDeleted: 0,
      outboxDeleted: 0,
      runsDeleted: 0,
      tasksDeleted: 0,
    });
    expect(db.deleteOrder).toEqual([]);
  });

  it("keeps task history while its outbox row is leased", async () => {
    const db = createHistoryCleanupDbMock({
      taskOutbox: [{ aggregate_id: "10", status: "leased" }],
      technicalRuns: [{ id: "1" }],
      userRuns: [],
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.cleanupWorkflowHistory({
      limit: 100,
      runBefore: new Date("2026-01-14T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-06-13T00:00:00.000Z"),
    })).resolves.toEqual({
      hasMore: true,
      nodeExecutionsDeleted: 0,
      outboxDeleted: 0,
      runsDeleted: 0,
      tasksDeleted: 0,
    });
    expect(db.deleteOrder).toEqual([]);
  });

  it("still deletes history when leftover outbox is pending rather than leased", async () => {
    const db = createHistoryCleanupDbMock({
      taskOutbox: [{ aggregate_id: "10", status: "pending" }],
      technicalRuns: [{ id: "1" }],
      userRuns: [],
    });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    await expect(repository.cleanupWorkflowHistory({
      limit: 100,
      runBefore: new Date("2026-01-14T00:00:00.000Z"),
      taskOutboxBefore: new Date("2026-06-13T00:00:00.000Z"),
    })).resolves.toEqual({
      hasMore: false,
      nodeExecutionsDeleted: 0,
      outboxDeleted: 1,
      runsDeleted: 0,
      tasksDeleted: 1,
    });
    expect(db.lockOrder).toEqual(["run", "outbox", "run"]);
    expect(db.outboxWhereCalls).not.toContainEqual(["outbox.status", "=", "leased"]);
    expect(db.deleteOrder).toEqual([
      "inference",
      "outbox",
      "subscription",
      "task",
    ]);
  });

  it("reads active current-revision trigger bindings across Subject Types", async () => {
    const db = createTriggerBindingDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.listActiveTriggerBindings(
      8,
      "contact.friend_added",
    );

    expect(result).toMatchObject([
      {
        eventType: "contact.friend_added",
        filter: {
          entryPolicy: { mode: "never" },
          eventType: "contact.friend_added",
          workUserIds: [201],
        },
        revision: 2,
        subjectType: "chatai_contact",
        workflowId: "42",
      },
      {
        eventType: "contact.friend_added",
        subjectType: "wecom_contact",
        workflowId: "43",
      },
    ]);
    expect(db.joinReferences).toEqual(expect.arrayContaining([
      ["definition.published_revision", "=", "binding.revision"],
    ]));
    expect(db.wheres).toEqual(expect.arrayContaining([
      ["binding.uid", "=", 8],
      ["binding.event_type", "=", "contact.friend_added"],
      ["binding.status", "=", 1],
      ["definition.biz_status", "=", 1],
      ["definition.runtime_status", "=", "active"],
    ]));
    expect(db.wheres).not.toContainEqual(["binding.subject_type", "=", 1]);
  });

  it("normalizes string BIGINT tenant ids at the runtime boundary", async () => {
    const db = createTriggerBindingDbMock({ uid: "8" });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const [binding] = await repository.listActiveTriggerBindings(
      8,
      "contact.friend_added",
    );

    expect(binding?.uid).toBe(8);
  });

  it.each([
    { action: "defer", expectedStatus: "suspended", runtimeStatus: "paused" },
    { action: "cancel", expectedStatus: "cancelled", runtimeStatus: "stopped" },
  ] as const)("persists $action at the task claim boundary", async ({
    action,
    expectedStatus,
    runtimeStatus,
  }) => {
    const db = createClaimDbMock(runtimeStatus);
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: "7",
      uid: 8,
    });

    expect(result).toEqual({ action, kind: "workflow-unavailable" });
    expect(db.taskUpdate).toMatchObject({ status: expectedStatus, task_version: 2 });
  });

  it("does not overwrite or count runs that become terminal before stop reconciliation", async () => {
    const db = createRuntimeDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.cancelWorkflowBatch({
      limit: 100,
      uid: 8,
      workflowId: "42",
    });

    expect(result).toMatchObject({ cancelled: 0, hasMore: false, lastRunId: "1" });
    expect(db.runUpdateWheres).toContainEqual([
      "status",
      "in",
      ["queued", "running", "waiting"],
    ]);
    expect(db.executionUpdateWheres).toContainEqual([
      "status",
      "in",
      ["running", "retrying"],
    ]);
  });

  it("fails the matching dispatched task when its outbox attempts are exhausted", async () => {
    const db = createOutboxDeadDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);
    const failedAt = new Date("2026-07-11T00:00:00.000Z");

    await expect(repository.markOutboxDead({
      failedAt,
      id: "11",
      leaseOwner: "publisher-1",
    })).resolves.toBe(true);

    expect(db.outboxUpdate).toMatchObject({ status: "dead" });
    expect(db.taskUpdate).toMatchObject({
      last_error_code: "WORKFLOW_OUTBOX_ATTEMPTS_EXHAUSTED",
      status: "dead",
      task_version: 3,
    });
    expect(db.runUpdate).toMatchObject({
      completed_at: failedAt,
      status: "failed",
      terminal_reason: "WORKFLOW_OUTBOX_ATTEMPTS_EXHAUSTED",
    });
    expect(db.lockOrder).toEqual(["run", "task", "outbox"]);
  });
});

function createEntitlementLossDbMock() {
  const updates: Record<string, Record<string, unknown>> = {};
  const db = {
    executedSelectTables: [] as string[],
    updates,
    deleteFrom() {
      const builder = {
        where() { return builder; },
        async executeTakeFirst() { return { numDeletedRows: 0n }; },
      };
      return builder;
    },
    selectFrom(table: string) {
      const builder = {
        forUpdate() { return builder; },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        where() { return builder; },
        async execute() {
          db.executedSelectTables.push(table);
          return table === "xy_wap_embed_workflow_definition" ? [{ id: "31" }] : [];
        },
      };
      return builder;
    },
    transaction() {
      return { execute: (operation: (trx: typeof db) => unknown) => operation(db) };
    },
    updateTable(table: string) {
      const builder = {
        set(values: Record<string, unknown>) {
          updates[table] = values;
          return builder;
        },
        where() { return builder; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: 1n }; },
      };
      return builder;
    },
  };
  return db;
}

function createInferenceRecoveryRaceDbMock(input: {
  candidateIds?: string[][];
  lockedJobs?: boolean;
  renewedLeaseExpiresAt: Date;
  scannedLeaseExpiresAt: Date;
}) {
  const deadlineAt = new Date("2026-07-10T00:10:00.000Z");
  const baseJob = {
    attempt: 1,
    deadline_at: deadlineAt,
    id: "11",
    lease_owner: "inference-worker-1",
    paused_at: null,
    run_id: "5",
    status: "running",
    task_id: "7",
    uid: 8,
    workflow_id: "42",
  };
  let candidateSelectCount = 0;
  let inferenceSelectCount = 0;
  const db = {
    candidateLimits: [] as number[],
    candidatePredicates: [] as unknown[][],
    inferenceUpdateCount: 0,
    jobLocked: false,
    lockedJobIds: [] as string[],
    lockOrder: [] as string[],
    selectFrom(table: string) {
      const candidateIndex = table === "xy_wap_embed_workflow_inference_job as job"
        ? candidateSelectCount++
        : -1;
      const predicates: unknown[] = [];
      if (candidateIndex >= 0) db.candidatePredicates[candidateIndex] = predicates;
      const builder = {
        forShare() {
          if (table === "xy_wap_embed_workflow_definition") db.lockOrder.push("definition");
          return builder;
        },
        forUpdate() {
          if (table.startsWith("xy_wap_embed_workflow_inference_job")) {
            db.jobLocked = true;
            db.lockOrder.push("job");
          } else if (table === "xy_wap_embed_workflow_run") {
            db.lockOrder.push("run");
          } else if (table === "xy_wap_embed_workflow_task") {
            db.lockOrder.push("task");
          }
          return builder;
        },
        innerJoin() { return builder; },
        limit(value: number) {
          if (candidateIndex >= 0) db.candidateLimits[candidateIndex] = value;
          return builder;
        },
        orderBy() { return builder; },
        select() { return builder; },
        selectAll() { return builder; },
        skipLocked() { return builder; },
        where(...args: unknown[]) {
          if (candidateIndex >= 0 && typeof args[0] === "string"
            && (args[0] === "job.status" || args[0] === "job.deadline_at"
              || args[0] === "job.attempt" || args[0] === "job.lease_expires_at")) {
            predicates.push(args);
          }
          if (table === "xy_wap_embed_workflow_inference_job"
            && args[0] === "id" && args[1] === "in") {
            db.lockedJobIds = args[2] as string[];
          }
          return builder;
        },
        async execute() {
          if (candidateIndex >= 0) {
            return (input.candidateIds?.[candidateIndex] ?? [baseJob.id]).map(id => ({
              ...baseJob,
              id,
              lease_expires_at: input.scannedLeaseExpiresAt,
            }));
          }
          if (table.startsWith("xy_wap_embed_workflow_inference_job")) {
            return input.lockedJobs === false ? [] : [{
              ...baseJob,
              lease_expires_at: db.jobLocked
                ? input.renewedLeaseExpiresAt
                : input.scannedLeaseExpiresAt,
            }];
          }
          return [];
        },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_inference_job") {
            inferenceSelectCount += 1;
            return inferenceSelectCount === 1
              ? { run_id: "5", task_id: "7", uid: 8 }
              : { ...baseJob, lease_expires_at: input.renewedLeaseExpiresAt };
          }
          return undefined;
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable(table: string) {
      const builder = {
        set() {
          if (table === "xy_wap_embed_workflow_inference_job") {
            db.inferenceUpdateCount += 1;
          }
          return builder;
        },
        where() { return builder; },
        async executeTakeFirst() { return { numUpdatedRows: 1n }; },
        async executeTakeFirstOrThrow() { return {}; },
      };
      return builder;
    },
  };
  return db;
}

function createRevisionCleanupClaimDbMock(input: { leasedIds: string[]; pendingIds: string[] }) {
  const now = new Date("2026-07-10T00:00:00.000Z");
  const row = (id: string, status: "leased" | "pending") => ({
    after_run_id: null,
    attempt: 1,
    create_time: now,
    id,
    last_error_code: null,
    lease_expires_at: status === "leased" ? now : null,
    lease_owner: status === "leased" ? "expired-worker" : null,
    next_attempt_at: now,
    node_id: "wait-1",
    node_kind: "wait",
    revision: 2,
    status,
    uid: 9,
    update_time: now,
    workflow_id: "31",
  });
  let selectCount = 0;
  const db = {
    selects: [] as Array<{
      forUpdate: boolean;
      limit: number | null;
      skipLocked: boolean;
      wheres: unknown[][];
    }>,
    updates: [] as Array<{ set: Record<string, unknown>; wheres: unknown[][] }>,
    selectFrom(table: string) {
      if (table !== "xy_wap_embed_workflow_revision_cleanup") {
        throw new Error(`Unexpected select from ${table}`);
      }
      const state = { forUpdate: false, limit: null as number | null, skipLocked: false, wheres: [] as unknown[][] };
      db.selects.push(state);
      const index = selectCount++;
      const builder = {
        forUpdate() { state.forUpdate = true; return builder; },
        limit(value: number) { state.limit = value; return builder; },
        orderBy() { return builder; },
        selectAll() { return builder; },
        skipLocked() { state.skipLocked = true; return builder; },
        where(...args: unknown[]) { state.wheres.push(args); return builder; },
        async execute() {
          return (index === 0 ? input.pendingIds : input.leasedIds)
            .map(id => row(id, index === 0 ? "pending" : "leased"));
        },
      };
      return builder;
    },
    transaction() {
      return { execute: async (operation: (transaction: typeof db) => unknown) => operation(db) };
    },
    updateTable(table: string) {
      if (table !== "xy_wap_embed_workflow_revision_cleanup") {
        throw new Error(`Unexpected update of ${table}`);
      }
      const state = { set: {} as Record<string, unknown>, wheres: [] as unknown[][] };
      db.updates.push(state);
      const builder = {
        set(values: Record<string, unknown>) { state.set = values; return builder; },
        where(...args: unknown[]) { state.wheres.push(args); return builder; },
        async executeTakeFirst() { return { numUpdatedRows: 1n }; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: 2n }; },
      };
      return builder;
    },
  };
  return db;
}

function createCapabilityExecutionDbMock(options: {
  executionStatus?: string;
  nodeId?: string;
  nodeKind?: string;
  publishedExecutionSpec?: Record<string, unknown>;
  runtimeStatus?: "active" | "paused";
  sequence?: number;
} = {}) {
  const nodeId = options.nodeId ?? "message";
  const nodeKind = options.nodeKind ?? "message";
  const sequence = options.sequence ?? 2;
  const run = {
    completed_at: null,
    context_json: JSON.stringify({ trigger: {} }),
    create_time: new Date("2026-07-13T00:00:00.000Z"),
    current_node_id: nodeId,
    entry_event_id: "event-1",
    id: "5",
    lock_version: 1,
    next_execute_at: new Date("2026-07-13T00:00:00.000Z"),
    revision: 1,
    sequence,
    shard_id: 7,
    status: "running",
    subject_id: "customer-1",
    subject_type: 1,
    terminal_reason: null,
    uid: 9,
    update_time: new Date("2026-07-13T00:00:00.000Z"),
    workflow_id: "31",
  };
  const task = {
    attempt: 1,
    bucket_time: new Date("2026-07-13T00:00:00.000Z"),
    create_time: new Date("2026-07-13T00:00:00.000Z"),
    due_at: new Date("2026-07-13T00:00:00.000Z"),
    id: "7",
    last_error_code: null,
    lease_expires_at: new Date("2026-07-13T00:01:00.000Z"),
    lease_owner: "worker-1",
    node_id: nodeId,
    node_kind: nodeKind,
    revision: 1,
    run_id: "5",
    sequence,
    shard_id: 7,
    status: "running",
    task_type: "execute",
    task_version: 2,
    uid: 9,
    update_time: new Date("2026-07-13T00:00:00.000Z"),
    workflow_id: "31",
  };
  const execution = options.executionStatus ? {
    completed_at: null,
    create_time: new Date("2026-07-13T00:00:00.000Z"),
    error_code: null,
    error_message: null,
    failure_kind: null,
    id: "11",
    execution_key: `9:5:${nodeId}:${sequence}`,
    input_snapshot_json: JSON.stringify({ subjectId: "customer-1" }),
    node_id: nodeId,
    node_kind: nodeKind,
    output_json: JSON.stringify({}),
    revision: 1,
    run_id: "5",
    sequence,
    source_outlet_id: null,
    started_at: new Date("2026-07-13T00:00:00.000Z"),
    status: options.executionStatus,
    uid: 9,
    update_time: new Date("2026-07-13T00:00:00.000Z"),
  } : undefined;
  const db = {
    inserts: {} as Record<string, Record<string, unknown>>,
    lockOrder: [] as string[],
    updates: {} as Record<string, Record<string, unknown>>,
    insertInto(table: string) {
      const builder = {
        onDuplicateKeyUpdate() { return builder; },
        values(values: Record<string, unknown>) {
          db.inserts[table] = values;
          return builder;
        },
        async executeTakeFirstOrThrow() { return {}; },
      };
      return builder;
    },
    selectFrom(table: string) {
      const builder = {
        forShare() {
          return builder;
        },
        forUpdate() {
          db.lockOrder.push(table === "xy_wap_embed_workflow_run"
            ? "run"
            : table === "xy_wap_embed_workflow_task" ? "task" : "execution");
          return builder;
        },
        select() { return builder; },
        selectAll() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_run") return run;
          if (table === "xy_wap_embed_workflow_task") return task;
          if (table === "xy_wap_embed_workflow_node_execution") return execution;
          if (table === "xy_wap_embed_workflow_definition") {
            return {
              biz_status: 1,
              published_revision: options.publishedExecutionSpec ? 1 : null,
              runtime_status: options.runtimeStatus ?? "active",
            };
          }
          if (table === "xy_wap_embed_workflow_revision" && options.publishedExecutionSpec) {
            return {
              execution_spec_json: JSON.stringify(options.publishedExecutionSpec),
              revision: 1,
            };
          }
          return undefined;
        },
      };
      return builder;
    },
    transaction() {
      return { execute: async (operation: (transaction: typeof db) => unknown) => operation(db) };
    },
    updateTable(table: string) {
      const builder = {
        set(values: Record<string, unknown>) {
          db.updates[table] = values;
          return builder;
        },
        where() { return builder; },
        async executeTakeFirst() { return { numUpdatedRows: 1n }; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: 1n }; },
      };
      return builder;
    },
  };
  return db;
}

function createRunDbMock(input: { bizStatus: number; runtimeStatus: string }) {
  const db = {
    definitionReadShareLocked: false,
    isolationLevel: null as string | null,
    runInsertCount: 0,
    insertInto(table: string) {
      if (table === "xy_wap_embed_workflow_run") db.runInsertCount += 1;
      throw new Error("Run insert must not occur for an unavailable workflow");
    },
    selectFrom(table: string) {
      const builder = {
        forShare() {
          if (table === "xy_wap_embed_workflow_definition") db.definitionReadShareLocked = true;
          return builder;
        },
        select() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          return { biz_status: input.bizStatus, runtime_status: input.runtimeStatus };
        },
      };
      return builder;
    },
    transaction() {
      const builder = {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
        setIsolationLevel(level: string) {
          db.isolationLevel = level;
          return builder;
        },
      };
      return builder;
    },
  };
  return db;
}

function createFullCapacityGuardDbMock() {
  const admittedAt = new Date("2026-07-10T00:00:00.000Z");
  const db = {
    insertInto(table: string) {
      if (table === "xy_wap_embed_workflow_run") {
        throw new Error("Run insert must not occur when tenant capacity is full");
      }
      const builder = {
        onDuplicateKeyUpdate() { return builder; },
        values() { return builder; },
        async executeTakeFirstOrThrow() { return { insertId: "1" }; },
      };
      return builder;
    },
    selectFrom(table: string) {
      const builder = {
        forShare() { return builder; },
        forUpdate() { return builder; },
        limit() { return builder; },
        select() { return builder; },
        selectAll() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_definition") {
            return {
              biz_status: 1,
              published_revision: 1,
              runtime_status: "active",
              workflow_type: 1,
            };
          }
          if (table === "xy_wap_embed_workflow_run") return undefined;
          return undefined;
        },
        async executeTakeFirstOrThrow() {
          if (table === "xy_wap_embed_workflow_entry_guard") {
            return { id: "3", total_entries: 0 };
          }
          throw new Error(`Unexpected required read from ${table}`);
        },
      };
      return builder;
    },
    selectNoFrom() {
      return {
        async executeTakeFirstOrThrow() { return { now: admittedAt }; },
      };
    },
    transaction() {
      const builder = {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
        setIsolationLevel() { return builder; },
      };
      return builder;
    },
    updateTable() {
      const builder = {
        set() { return builder; },
        where() { return builder; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: 0n }; },
      };
      return builder;
    },
  };
  return db;
}

function createConcurrentDuplicateRunDbMock(
  options: { duplicateAfterGuard?: boolean } = {},
) {
  const duplicateAfterGuard = options.duplicateAfterGuard ?? true;
  const admittedAt = new Date("2026-07-10T00:00:00.000Z");
  const run = {
    completed_at: null,
    context_json: "{}",
    create_time: admittedAt,
    current_node_id: "start",
    entry_event_id: "event-1",
    id: "5",
    lock_version: 1,
    next_execute_at: admittedAt,
    revision: 1,
    sequence: 1,
    shard_id: 1,
    status: "queued",
    subject_id: "customer-1",
    subject_type: 1,
    terminal_reason: null,
    uid: 8,
    update_time: admittedAt,
    workflow_id: "42",
  };
  const task = {
    attempt: 0,
    bucket_time: admittedAt,
    create_time: admittedAt,
    due_at: admittedAt,
    id: "7",
    last_error_code: null,
    lease_expires_at: null,
    lease_owner: null,
    node_id: "start",
    node_kind: "start",
    revision: 1,
    run_id: "5",
    sequence: 1,
    shard_id: 1,
    status: "dispatched",
    task_type: "execute",
    task_version: 1,
    uid: 8,
    update_time: admittedAt,
    workflow_id: "42",
  };
  const db = {
    guardWriteLocked: false,
    isolationLevel: null as string | null,
    runInsertCount: 0,
    runReadCount: 0,
    runShareLockCount: 0,
    taskReadLocked: false,
    insertInto(table: string) {
      if (table === "xy_wap_embed_workflow_run") db.runInsertCount += 1;
      const builder = {
        onDuplicateKeyUpdate() { return builder; },
        values() { return builder; },
        async executeTakeFirstOrThrow() { return { insertId: "1" }; },
      };
      return builder;
    },
    selectFrom(table: string) {
      const builder = {
        forShare() {
          if (table === "xy_wap_embed_workflow_run") {
            if (!db.guardWriteLocked) throw new Error("Run locking read must follow the guard lock");
            db.runShareLockCount += 1;
          }
          if (table === "xy_wap_embed_workflow_task") {
            db.taskReadLocked = db.guardWriteLocked;
          }
          return builder;
        },
        forUpdate() {
          if (table === "xy_wap_embed_workflow_entry_guard") db.guardWriteLocked = true;
          return builder;
        },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        selectAll() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_definition") {
            return {
              biz_status: 1,
              published_revision: 1,
              runtime_status: "active",
              workflow_type: 1,
            };
          }
          if (table === "xy_wap_embed_workflow_run") {
            db.runReadCount += 1;
            if (db.runReadCount === 1) return undefined;
            if (db.runReadCount === 2) return duplicateAfterGuard ? run : undefined;
            return run;
          }
          if (table === "xy_wap_embed_workflow_task") return task;
          return undefined;
        },
        async executeTakeFirstOrThrow() {
          if (table === "xy_wap_embed_workflow_entry_guard") {
            return { id: "3", total_entries: 1 };
          }
          throw new Error(`Unexpected required read from ${table}`);
        },
      };
      return builder;
    },
    selectNoFrom() {
      return {
        async executeTakeFirstOrThrow() { return { now: admittedAt }; },
      };
    },
    transaction() {
      const builder = {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
        setIsolationLevel(level: string) {
          db.isolationLevel = level;
          return builder;
        },
      };
      return builder;
    },
  };
  return db;
}

function createClaimDbMock(runtimeStatus = "active", runStatus = "waiting") {
  const task = {
    attempt: 0,
    bucket_time: new Date("2026-07-10T00:00:00.000Z"),
    create_time: new Date("2026-07-10T00:00:00.000Z"),
    due_at: new Date("2026-07-10T00:00:00.000Z"),
    id: "7",
    last_error_code: null,
    lease_expires_at: null,
    lease_owner: null,
    node_id: "start",
    node_kind: "start",
    revision: 1,
    run_id: "5",
    sequence: 1,
    shard_id: 1,
    status: "dispatched",
    task_type: "execute",
    task_version: 1,
    uid: 8,
    update_time: new Date("2026-07-10T00:00:00.000Z"),
    workflow_id: "42",
  };
  const db = {
    definitionReadShareLocked: false,
    lockOrder: [] as string[],
    runUpdate: {} as Record<string, unknown>,
    taskUpdate: {} as Record<string, unknown>,
    selectFrom(table: string) {
      const builder = {
        forShare() { return builder; },
        forUpdate() {
          db.lockOrder.push(table === "xy_wap_embed_workflow_run" ? "run" : "task");
          return builder;
        },
        forShare() {
          if (table === "xy_wap_embed_workflow_definition") db.definitionReadShareLocked = true;
          return builder;
        },
        select() { return builder; },
        selectAll() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_task") return task;
          if (table === "xy_wap_embed_workflow_run") {
            return { current_node_id: "start", revision: 1, sequence: 1, shard_id: 1, status: runStatus, workflow_id: "42" };
          }
          return { biz_status: 1, runtime_status: runtimeStatus };
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable(table: string) {
      const builder = {
        set(values: Record<string, unknown>) {
          if (table === "xy_wap_embed_workflow_task") db.taskUpdate = values;
          if (table === "xy_wap_embed_workflow_run") db.runUpdate = values;
          return builder;
        },
        where() { return builder; },
        async executeTakeFirst() { return { numUpdatedRows: 1n }; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: 1n }; },
      };
      return builder;
    },
  };
  return db;
}

function createTriggerBindingDbMock(options: { uid?: number | string } = {}) {
  const now = new Date("2026-07-10T00:00:00.000Z");
  const db = {
    joinReferences: [] as unknown[][],
    wheres: [] as unknown[][],
    selectFrom() {
      const builder = {
        innerJoin(_table: string, callback: (join: typeof joinBuilder) => unknown) {
          callback(joinBuilder);
          return builder;
        },
        select() { return builder; },
        where(...args: unknown[]) { db.wheres.push(args); return builder; },
        async execute() {
          const chataiBinding = {
            create_time: now,
            event_type: "contact.friend_added",
            filter_spec_json: JSON.stringify({
              entryPolicy: { mode: "never" },
              eventType: "contact.friend_added",
              sourceIds: ["qr-code-1"],
              workUserIds: [201],
            }),
            id: "9",
            revision: 2,
            status: 1,
            subject_type: 1,
            uid: options.uid ?? 8,
            update_time: now,
            workflow_id: "42",
          };
          return [
            chataiBinding,
            {
              ...chataiBinding,
              id: "10",
              subject_type: 2,
              workflow_id: "43",
            },
          ];
        },
      };
      const joinBuilder = {
        onRef(...args: unknown[]) { db.joinReferences.push(args); return joinBuilder; },
      };
      return builder;
    },
  };
  return db;
}

function leaseRecoveryTask(overrides: Partial<ReturnType<typeof leaseRecoveryTaskFixture>> = {}) {
  return { ...leaseRecoveryTaskFixture(), ...overrides };
}

function leaseRecoveryTaskFixture() {
  return {
    attempt: 3,
    id: "7",
    node_id: "wait-1",
    node_kind: "wait",
    revision: 1,
    run_id: "5",
    sequence: 1,
    shard_id: 1,
    uid: 8,
    workflow_id: "42",
  };
}

function createLeaseRecoveryDbMock(options: {
  lockedRuns?: Array<{ id: string; status: string }>;
  runUpdateCount?: number;
  tasks?: ReturnType<typeof leaseRecoveryTask>[];
} = {}) {
  const tasks = options.tasks ?? [leaseRecoveryTask({ attempt: 1 })];
  const db = {
    capacityReleaseCounts: [] as number[],
    lockOrder: [] as string[],
    insertInto() {
      const builder = {
        values() { return builder; },
        onDuplicateKeyUpdate() { return builder; },
        async executeTakeFirstOrThrow() { return {}; },
      };
      return builder;
    },
    selectFrom(table: string) {
      let locked = false;
      const builder = {
        forShare() { return builder; },
        forUpdate() {
          locked = true;
          db.lockOrder.push(table === "xy_wap_embed_workflow_run" ? "run" : "task");
          return builder;
        },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        skipLocked() { return builder; },
        where() { return builder; },
        async execute() {
          if (table === "xy_wap_embed_workflow_definition") {
            return [{ biz_status: 1, id: "31", runtime_status: "active", uid: 9 }];
          }
          if (table === "xy_wap_embed_workflow_run") {
            return options.lockedRuns ?? [{ id: "5", status: "running" }];
          }
          return locked || table === "xy_wap_embed_workflow_task" ? tasks : [];
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable(table: string) {
      const builder = {
        set() { return builder; },
        where(...args: unknown[]) {
          if (table === "xy_wap_embed_workflow_capacity_guard"
            && args[0] === "active_run_count" && args[1] === ">=") {
            db.capacityReleaseCounts.push(args[2] as number);
          }
          return builder;
        },
        async executeTakeFirst() {
          return { numUpdatedRows: BigInt(table === "xy_wap_embed_workflow_run"
            ? (options.runUpdateCount ?? 1)
            : 1) };
        },
        async executeTakeFirstOrThrow() {
          return { numUpdatedRows: BigInt(table === "xy_wap_embed_workflow_run"
            ? (options.runUpdateCount ?? 1)
            : 1) };
        },
      };
      return builder;
    },
  };
  return db;
}

function createMetricAggregationDbMock(eventCount = 1) {
  const now = new Date("2026-07-12T10:00:00.000Z");
  const db = {
    currentCountExpression: null as unknown,
    metricInsertSizes: [] as number[],
    insertInto() {
      const builder = {
        values(values: unknown) {
          db.metricInsertSizes.push(Array.isArray(values) ? values.length : 1);
          return builder;
        },
        onDuplicateKeyUpdate(values: Record<string, unknown>) {
          db.currentCountExpression = values.current_count;
          return builder;
        },
        async executeTakeFirstOrThrow() { return {}; },
      };
      return builder;
    },
    selectFrom() {
      const builder = {
        forUpdate() { return builder; },
        limit() { return builder; },
        orderBy() { return builder; },
        selectAll() { return builder; },
        skipLocked() { return builder; },
        where() { return builder; },
        async execute() {
          return Array.from({ length: eventCount }, (_, index) => ({
            completed_delta: 0,
            create_time: now,
            current_delta: index === 0 ? -1 : 1,
            entered_delta: 0,
            event_key: `5:metric:${index}`,
            id: String(index + 1),
            incomplete_delta: 0,
            node_id: `node-${index}`,
            passed_delta: 0,
            processed_at: null,
            revision: 1,
            run_id: "5",
            shard_id: 1,
            uid: 8,
            update_time: now,
            workflow_id: "42",
          }));
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable() {
      const builder = {
        set() { return builder; },
        where() { return builder; },
        async executeTakeFirstOrThrow() { return {}; },
      };
      return builder;
    },
  };
  return db;
}

function createHistoryCleanupDbMock(options: {
  remainingTasks?: Array<{ run_id: string }>;
  taskOutbox?: Array<{ aggregate_id: string; status: string }>;
  technicalRuns?: Array<{ id: string }>;
  userRuns?: Array<{ id: string }>;
} = {}) {
  const technicalRuns = options.technicalRuns ?? [{ id: "1" }, { id: "2" }];
  const userRuns = options.userRuns ?? [{ id: "1" }, { id: "2" }];
  let runSelectCount = 0;
  const db = {
    deleteOrder: [] as string[],
    lockOrder: [] as string[],
    outboxWhereCalls: [] as unknown[][],
    runWhereCalls: [] as unknown[][],
    taskExistenceWhereRefs: [] as unknown[][],
    usedTaskExistenceFilter: false,
    deleteFrom(table: string) {
      const builder = {
        where() { return builder; },
        async executeTakeFirst() {
          const label = table === "xy_wap_embed_workflow_outbox"
            ? "outbox"
            : table === "xy_wap_embed_workflow_inference_job"
              ? "inference"
            : table === "xy_wap_embed_workflow_event_subscription"
              ? "subscription"
            : table === "xy_wap_embed_workflow_task"
              ? "task"
              : table === "xy_wap_embed_workflow_node_execution"
                ? "execution"
                : "run";
          db.deleteOrder.push(label);
          return { numDeletedRows: 1n };
        },
      };
      return builder;
    },
    selectFrom(table: string) {
      const builder = {
        forUpdate() {
          db.lockOrder.push(table === "xy_wap_embed_workflow_run" || table.startsWith("xy_wap_embed_workflow_run ")
            ? "run"
            : table === "xy_wap_embed_workflow_task" || table.startsWith("xy_wap_embed_workflow_task ")
              ? "task"
              : "outbox");
          return builder;
        },
        distinct() { return builder; },
        innerJoin() { return builder; },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        skipLocked() { return builder; },
        where(...args: unknown[]) {
          if (table === "xy_wap_embed_workflow_run" && typeof args[0] === "function") {
            const subquery = {
              select() { return subquery; },
              whereRef(...whereRefArgs: unknown[]) {
                db.taskExistenceWhereRefs.push(whereRefArgs);
                return subquery;
              },
            };
            (args[0] as (helpers: Record<string, unknown>) => unknown)({
              exists: (value: unknown) => {
                db.usedTaskExistenceFilter = true;
                return value;
              },
              selectFrom: () => subquery,
            });
          } else if (table === "xy_wap_embed_workflow_run") {
            db.runWhereCalls.push(args);
          } else if (table.startsWith("xy_wap_embed_workflow_outbox")) {
            db.outboxWhereCalls.push(args);
          }
          return builder;
        },
        async execute() {
          if (table === "xy_wap_embed_workflow_run") {
            runSelectCount += 1;
            return runSelectCount === 1 ? technicalRuns : userRuns;
          }
          if (table === "xy_wap_embed_workflow_task") {
            return runSelectCount === 1 ? [] : (options.remainingTasks ?? []);
          }
          if (table === "xy_wap_embed_workflow_outbox"
            || table.startsWith("xy_wap_embed_workflow_outbox")) {
            return (options.taskOutbox ?? []).map(item => ({ run_id: "1", ...item }));
          }
          return options.remainingTasks ?? [];
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
  };
  return db;
}

function createRuntimeDbMock() {
  const db = {
    executionUpdateWheres: [] as unknown[][],
    runUpdateWheres: [] as unknown[][],
    insertInto() {
      const builder = {
        values() { return builder; },
        onDuplicateKeyUpdate() { return builder; },
        async executeTakeFirstOrThrow() { return {}; },
      };
      return builder;
    },
    selectFrom(table: string) {
      const builder = {
        forUpdate() { return builder; },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        where() { return builder; },
        async execute() {
          return table === "xy_wap_embed_workflow_run"
            ? [{ current_node_id: "start", id: "1", revision: 1, shard_id: 1, workflow_id: "42" }]
            : [];
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable(table: string) {
      const builder = {
        set() { return builder; },
        where(...args: unknown[]) {
          if (table === "xy_wap_embed_workflow_run") db.runUpdateWheres.push(args);
          if (table === "xy_wap_embed_workflow_node_execution") db.executionUpdateWheres.push(args);
          return builder;
        },
        async executeTakeFirst() {
          return { numUpdatedRows: table === "xy_wap_embed_workflow_run" ? 0n : 0n };
        },
      };
      return builder;
    },
  };
  return db;
}

function createRunTaskConsistencyDbMock(options: {
  includeTerminalTask?: boolean;
  runUpdatedAt?: Date;
} = {}) {
  const activeRun = {
    create_time: new Date("2026-07-10T00:00:00.000Z"),
    current_node_id: "start",
    id: "1",
    lock_version: 1,
    next_execute_at: new Date("2026-07-10T00:00:00.000Z"),
    revision: 1,
    sequence: 1,
    shard_id: 7,
    status: "running",
    uid: 9,
    update_time: options.runUpdatedAt ?? new Date("2026-07-10T00:00:00.000Z"),
    workflow_id: "31",
  };
  const terminalTask = {
    attempt: 0,
    due_at: new Date("2026-07-10T00:00:00.000Z"),
    id: "7",
    lease_expires_at: null,
    lease_owner: null,
    node_id: "end",
    node_kind: "end",
    revision: 1,
    run_id: "2",
    sequence: 2,
    shard_id: 7,
    status: "dispatched",
    task_type: "execute",
    task_version: 1,
    uid: 9,
    workflow_id: "31",
  };
  let runSelectCount = 0;
  let taskSelectCount = 0;
  const db = {
    lockOrder: [] as string[],
    runUpdate: {} as Record<string, unknown>,
    taskUpdate: {} as Record<string, unknown>,
    insertInto() {
      const builder = {
        values() { return builder; },
        onDuplicateKeyUpdate() { return builder; },
        async executeTakeFirstOrThrow() { return {}; },
      };
      return builder;
    },
    selectFrom(table: string) {
      const builder = {
        forShare() { return builder; },
        forUpdate() {
          db.lockOrder.push(table === "xy_wap_embed_workflow_run" ? "run" : "task");
          return builder;
        },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        selectAll() { return builder; },
        skipLocked() { return builder; },
        where() { return builder; },
        async execute() {
          if (table === "xy_wap_embed_workflow_run") {
            runSelectCount += 1;
            if (runSelectCount === 1) return [activeRun];
            return [{ id: "2", status: "completed" }];
          }
          if (table === "xy_wap_embed_workflow_task") {
            taskSelectCount += 1;
            if (taskSelectCount === 1) return [];
            return options.includeTerminalTask === false ? [] : [terminalTask];
          }
          if (table === "xy_wap_embed_workflow_definition") {
            return [{ biz_status: 1, id: "31", runtime_status: "active", uid: 9 }];
          }
          return [];
        },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_definition") {
            return { biz_status: 1, runtime_status: "active" };
          }
          return undefined;
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable(table: string) {
      const builder = {
        set(values: Record<string, unknown>) {
          if (table === "xy_wap_embed_workflow_run") db.runUpdate = values;
          if (table === "xy_wap_embed_workflow_task") db.taskUpdate = values;
          return builder;
        },
        where() { return builder; },
        async executeTakeFirst() { return { numUpdatedRows: 1n }; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: 1n }; },
      };
      return builder;
    },
  };
  return db;
}

function createWaitingConsistencyDbMock(runCount = 1) {
  const waitingRuns = Array.from({ length: runCount }, (_, index) => ({
    current_node_id: "wait-1",
    id: String(index + 1),
    lock_version: 2,
    next_execute_at: new Date("2026-07-11T00:00:00.000Z"),
    revision: 1,
    sequence: 2,
    shard_id: 7,
    status: "waiting",
    uid: 9,
    update_time: new Date("2026-07-10T00:00:00.000Z"),
    workflow_id: "31",
  }));
  const authoritativeWaitTasks = waitingRuns.map((run, index) => ({
    attempt: 0,
    bucket_time: new Date("2026-07-11T00:00:00.000Z"),
    create_time: new Date("2026-07-10T00:00:00.000Z"),
    due_at: new Date("2026-07-11T00:00:00.000Z"),
    id: String(index + 10_001),
    last_error_code: null,
    lease_expires_at: null,
    lease_owner: null,
    node_id: "wait-1",
    node_kind: "wait",
    revision: 1,
    run_id: run.id,
    sequence: 2,
    shard_id: 7,
    status: "pending",
    task_type: "execute",
    task_version: 1,
    uid: 9,
    update_time: new Date("2026-07-10T00:00:00.000Z"),
    workflow_id: "31",
  }));
  let runSelectCount = 0;
  let taskExecuteCount = 0;
  const db = {
    metricEvents: [] as Array<Record<string, unknown>>,
    metricInsertSizes: [] as number[],
    taskWhereCalls: [] as unknown[][],
    selectFrom(table: string) {
      const builder = {
        forShare() { return builder; },
        forUpdate() { return builder; },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        selectAll() { return builder; },
        skipLocked() { return builder; },
        where(...args: unknown[]) {
          if (table === "xy_wap_embed_workflow_task") db.taskWhereCalls.push(args);
          return builder;
        },
        async execute() {
          if (table === "xy_wap_embed_workflow_run") {
            runSelectCount += 1;
            return runSelectCount === 1 ? waitingRuns : [];
          }
          if (table === "xy_wap_embed_workflow_task") {
            taskExecuteCount += 1;
            if (taskExecuteCount === 1) return authoritativeWaitTasks;
            return [];
          }
          if (table === "xy_wap_embed_workflow_definition") {
            return [{ biz_status: 1, id: "31", runtime_status: "active", uid: 9 }];
          }
          return [];
        },
        async executeTakeFirst() { return undefined; },
      };
      return builder;
    },
    insertInto(table: string) {
      const builder = {
        values(values: Array<Record<string, unknown>>) {
          if (table === "xy_wap_embed_workflow_node_metric_event") {
            db.metricEvents.push(...values);
            db.metricInsertSizes.push(values.length);
          }
          return builder;
        },
        onDuplicateKeyUpdate() { return builder; },
        async executeTakeFirstOrThrow() { return {}; },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable() {
      const builder = {
        set() { return builder; },
        where() { return builder; },
        async executeTakeFirst() { return { numUpdatedRows: BigInt(runCount) }; },
      };
      return builder;
    },
  };
  return db;
}

function createEmptyConsistencyDbMock() {
  const db = {
    selectFrom() {
      const builder = {
        forUpdate() { return builder; },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        skipLocked() { return builder; },
        where() { return builder; },
        async execute() { return []; },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
  };
  return db;
}

function createOutboxDeadDbMock() {
  const outbox = {
    aggregate_id: "7",
    aggregate_type: "workflow_task",
    attempt: 5,
    create_time: new Date("2026-07-11T00:00:00.000Z"),
    event_type: "workflow.task.ready",
    id: "11",
    lease_expires_at: new Date("2026-07-11T00:01:00.000Z"),
    lease_owner: "publisher-1",
    next_attempt_at: new Date("2026-07-11T00:00:00.000Z"),
    payload_json: "{}",
    sent_at: null,
    status: "leased",
    task_version: 2,
    uid: 8,
    update_time: new Date("2026-07-11T00:00:00.000Z"),
  };
  const task = {
    id: "7",
    node_id: "start",
    node_kind: "start",
    revision: 1,
    run_id: "5",
    shard_id: 1,
    task_version: 2,
    workflow_id: "42",
  };
  const db = {
    lockOrder: [] as string[],
    outboxUpdate: {} as Record<string, unknown>,
    runUpdate: {} as Record<string, unknown>,
    taskUpdate: {} as Record<string, unknown>,
    selectFrom(table: string) {
      const builder = {
        forUpdate() {
          db.lockOrder.push(table === "xy_wap_embed_workflow_run"
            ? "run"
            : table === "xy_wap_embed_workflow_task" ? "task" : "outbox");
          return builder;
        },
        select() { return builder; },
        selectAll() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_outbox") return outbox;
          if (table === "xy_wap_embed_workflow_run") {
            return { current_node_id: "start", revision: 1, shard_id: 1, workflow_id: "42" };
          }
          return task;
        },
        limit() { return builder; },
        orderBy() { return builder; },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    insertInto() {
      const builder = {
        values() { return builder; },
        onDuplicateKeyUpdate() { return builder; },
        async executeTakeFirstOrThrow() { return {}; },
      };
      return builder;
    },
    updateTable(table: string) {
      const builder = {
        set(values: Record<string, unknown>) {
          if (table === "xy_wap_embed_workflow_outbox") db.outboxUpdate = values;
          if (table === "xy_wap_embed_workflow_task") db.taskUpdate = values;
          if (table === "xy_wap_embed_workflow_run") db.runUpdate = values;
          return builder;
        },
        where() { return builder; },
        async executeTakeFirst() { return { numUpdatedRows: 1n }; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: 1n }; },
      };
      return builder;
    },
  };
  return db;
}

function createDispatchDueTasksDbMock(taskCount = 2) {
  const now = new Date("2026-07-10T00:00:00.000Z");
  const taskRow = (id: string) => ({
    attempt: 0,
    bucket_time: now,
    create_time: now,
    due_at: now,
    id,
    last_error_code: null,
    lease_expires_at: null,
    lease_owner: null,
    node_id: "start",
    node_kind: "start",
    revision: 1,
    run_id: id === "7" ? "5" : "6",
    sequence: 1,
    shard_id: 1,
    status: "pending",
    task_type: "execute",
    task_version: 1,
    uid: 8,
    update_time: now,
    workflow_id: "42",
  });
  const claimedTasks = Array.from({ length: taskCount }, (_, index) => taskRow(String(7 + index)));
  const db = {
    claimedLimits: [] as number[],
    definitionShareLocks: 0,
    outboxInsertSizes: [] as number[],
    scheduleIndexHints: 0,
    taskLockTargets: [] as unknown[],
    taskUpdates: 0,
    insertInto(table: string) {
      const builder = {
        values(values: unknown) {
          if (table === "xy_wap_embed_workflow_outbox") {
            db.outboxInsertSizes.push(Array.isArray(values) ? values.length : 1);
          }
          return builder;
        },
        async executeTakeFirstOrThrow() { return {}; },
      };
      return builder;
    },
    selectFrom(table: string) {
      let locked = false;
      const builder = {
        forShare() {
          if (table === "xy_wap_embed_workflow_definition") db.definitionShareLocks += 1;
          return builder;
        },
        forUpdate(target?: unknown) {
          locked = true;
          if (table.startsWith("xy_wap_embed_workflow_task")) db.taskLockTargets.push(target);
          return builder;
        },
        innerJoin() { return builder; },
        leftJoin() { return builder; },
        limit(value?: number) {
          if (typeof value === "number") db.claimedLimits.push(value);
          return builder;
        },
        modifyFront() {
          if (table.startsWith("xy_wap_embed_workflow_task")) db.scheduleIndexHints += 1;
          return builder;
        },
        orderBy() { return builder; },
        select() { return builder; },
        selectAll() { return builder; },
        skipLocked() { return builder; },
        where() { return builder; },
        async execute() {
          if (table.startsWith("xy_wap_embed_workflow_task")) {
            return locked ? claimedTasks : [];
          }
          if (table === "xy_wap_embed_workflow_definition") {
            return [{ biz_status: 1, id: "42", runtime_status: "active", uid: 8 }];
          }
          return [];
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable(table: string) {
      const builder = {
        set() {
          if (table === "xy_wap_embed_workflow_task") db.taskUpdates += 1;
          return builder;
        },
        where() { return builder; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: BigInt(taskCount) }; },
      };
      return builder;
    },
  };
  return db;
}
