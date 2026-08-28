import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Kysely, MysqlDialect, sql, type Transaction } from "kysely";
import mysql from "mysql2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  MysqlWorkflowRuntimeRepository,
  MysqlWorkflowLlmTestAttemptRepository,
  resumeMysqlWorkflowTasks,
  WORKFLOW_MYSQL_WRITE_CHUNK_SIZE,
  type WorkflowDatabase,
} from "../src/index.js";
import { runWorkflowRuntimeRepositoryContract } from "./support/runtime-repository-contract.js";
import { runWorkflowLlmTestAttemptRepositoryContract } from "./support/llm-test-attempt-repository-contract.js";

const WORKFLOW_TABLE_PATTERN = /CREATE TABLE IF NOT EXISTS (xy_wap_embed_workflow_[a-z_]+)[\s\S]*?\n\) COMMENT='[^']*';/g;

describe("MySQL workflow runtime repository contract", () => {
  const databaseName = `chatai_workflow_contract_${process.pid}_${randomBytes(6).toString("hex")}`;
  const connectionOptions = readMysqlTestConnectionOptions();
  const adminPool = mysql.createPool({
    ...connectionOptions,
    bigNumberStrings: true,
    connectionLimit: 2,
    supportBigNumbers: true,
    timezone: "+08:00",
  });
  let database: Kysely<WorkflowDatabase> | undefined;
  let workflowPool: ReturnType<typeof mysql.createPool> | undefined;
  let workflowTableNames: string[] = [];

  beforeAll(async () => {
    await adminPool.promise().query("SET GLOBAL time_zone = '+08:00'");
    await adminPool.promise().query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    workflowPool = mysql.createPool({
      ...connectionOptions,
      database: databaseName,
      bigNumberStrings: true,
      connectionLimit: 10,
      supportBigNumbers: true,
      timezone: "+08:00",
    });
    database = new Kysely<WorkflowDatabase>({
      dialect: new MysqlDialect({ pool: workflowPool }),
    });

    const schemaSql = await readFile(
      new URL("../../../docs/db/schema.sql", import.meta.url),
      "utf8",
    );
    const workflowTables = [...schemaSql.matchAll(WORKFLOW_TABLE_PATTERN)];
    if (workflowTables.length === 0) {
      throw new Error("No Workflow CREATE TABLE statements found in docs/db/schema.sql");
    }
    workflowTableNames = workflowTables.map((match) => match[1]!);
    for (const match of workflowTables) {
      await workflowPool.promise().query(match[0]);
    }
  });

  beforeEach(async () => {
    if (!database || !workflowPool) throw new Error("MySQL contract database is not initialized");
    for (const tableName of [...workflowTableNames].reverse()) {
      await workflowPool.promise().query(`TRUNCATE TABLE \`${tableName}\``);
    }
    const definition = {
      biz_status: 1,
      client_request_id: null,
      description: "",
      draft_json: "{}",
      draft_schema_version: 1,
      draft_semantic_hash: "draft-hash",
      draft_version: 1,
      id: "31",
      name: "Repository contract",
      op_sub_uid: "1",
      published_revision: 1,
      published_semantic_hash: "published-hash",
      runtime_status: "active",
      status_reason: null,
      uid: 9,
      workflow_type: 1,
    } as const;
    await database.insertInto("xy_wap_embed_workflow_definition").values([
      definition,
      {
        ...definition,
        id: "32",
        name: "WeCom repository contract",
        workflow_type: 2,
      },
      {
        ...definition,
        id: "33",
        name: "Tenant 10 repository contract",
        uid: 10,
      },
    ]).executeTakeFirstOrThrow();
  });

  afterAll(async () => {
    if (database) await database.destroy();
    await adminPool.promise().query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminPool.promise().end();
  });

  runWorkflowRuntimeRepositoryContract(() => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    const contractDatabase = database;
    const repository = new MysqlWorkflowRuntimeRepository(contractDatabase);
    return {
      repository,
      async setRunStatus(runId, status) {
        await contractDatabase.transaction().execute(async transaction => {
          await transaction.updateTable("xy_wap_embed_workflow_run")
            .set({ status })
            .where("uid", "=", 9)
            .where("id", "=", runId)
            .executeTakeFirstOrThrow();
          const activeRuns = await transaction.selectFrom("xy_wap_embed_workflow_run")
            .select(({ fn }) => fn.countAll<number>().as("count"))
            .where("uid", "=", 9)
            .where("status", "in", ["queued", "running", "waiting"])
            .executeTakeFirstOrThrow();
          await transaction.updateTable("xy_wap_embed_workflow_capacity_guard")
            .set({ active_run_count: Number(activeRuns.count) })
            .where("uid", "=", 9)
            .executeTakeFirstOrThrow();
        });
      },
      async setWorkflowRuntimeStatus(status, transitionedAt = new Date("2099-01-01T00:00:00.000Z")) {
        await contractDatabase.transaction().execute(async transaction => {
          await transaction.updateTable("xy_wap_embed_workflow_definition")
            .set({ runtime_status: status })
            .where("uid", "=", 9)
            .where("id", "=", "31")
            .executeTakeFirstOrThrow();
          await new MysqlWorkflowRuntimeRepository(transaction).transitionInferenceJobs({
            transitionedAt,
            transition: status === "paused" ? "pause" : status === "active" ? "resume" : "cancel",
            uid: 9,
            workflowIds: ["31"],
          });
          if (status === "active") {
            await resumeMysqlWorkflowTasks(transaction, { uid: 9, workflowIds: ["31"] });
          }
        });
      },
    };
  });

  it("claims global due Tasks concurrently without locking their shared Definition", async () => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    const dueAt = new Date("2099-01-01T00:01:00+08:00");
    const task = (input: { id: string; runId: string; shardId: number }) => ({
      attempt: 0,
      bucket_time: new Date("2099-01-01T00:01:00+08:00"),
      create_time: new Date("2099-01-01T00:00:00+08:00"),
      due_at: dueAt,
      id: input.id,
      last_error_code: null,
      lease_expires_at: null,
      lease_owner: null,
      node_id: `wait-${input.id}`,
      node_kind: "wait",
      revision: 1,
      run_id: input.runId,
      sequence: 1,
      shard_id: input.shardId,
      status: "pending",
      task_type: "wait",
      task_version: 1,
      uid: 9,
      update_time: new Date("2099-01-01T00:00:00+08:00"),
      workflow_id: "31",
    });
    await database.insertInto("xy_wap_embed_workflow_task").values([
      task({ id: "1001", runId: "2001", shardId: 7 }),
      task({ id: "1002", runId: "2002", shardId: 255 }),
    ]).executeTakeFirstOrThrow();
    const claimOneDueTask = (trx: Transaction<WorkflowDatabase>) => trx
      .selectFrom("xy_wap_embed_workflow_task as task")
      .modifyFront(sql`/*+ INDEX(task idx_workflow_task_schedule) */`)
      .select("task.id")
      .where("task.status", "=", "pending")
      .where("task.bucket_time", "<=", dueAt)
      .where("task.due_at", "<=", dueAt)
      .orderBy("task.bucket_time", "asc")
      .orderBy("task.due_at", "asc")
      .orderBy("task.id", "asc")
      .limit(1)
      .forUpdate("task")
      .skipLocked()
      .execute();

    let markFirstClaimed!: () => void;
    let releaseFirstClaim!: () => void;
    const firstClaimed = new Promise<void>(resolve => { markFirstClaimed = resolve; });
    const firstCanFinish = new Promise<void>(resolve => { releaseFirstClaim = resolve; });
    const firstClaim = database.transaction().execute(async trx => {
      const rows = await claimOneDueTask(trx);
      markFirstClaimed();
      await firstCanFinish;
      return rows;
    });

    await firstClaimed;
    let secondRows: Array<{ id: string }> = [];
    try {
      secondRows = await database.transaction().execute(claimOneDueTask);
    } finally {
      releaseFirstClaim();
    }
    const firstRows = await firstClaim;

    expect(firstRows).toEqual([{ id: "1001" }]);
    expect(secondRows).toEqual([{ id: "1002" }]);
  });

  it("claims the global lowest Revision cleanup IDs across pending and expired leases", async () => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    const now = new Date("2099-01-01T00:02:00+08:00");
    const expiredAt = new Date("2099-01-01T00:01:00+08:00");
    const nextAttemptAt = new Date("2099-01-01T00:00:00+08:00");
    const cleanup = (input: {
      attempt?: number;
      id: string;
      nodeId: string;
      status: "leased" | "pending";
    }) => ({
      after_run_id: null,
      attempt: input.attempt ?? 1,
      id: input.id,
      last_error_code: null,
      lease_expires_at: input.status === "leased" ? expiredAt : null,
      lease_owner: input.status === "leased" ? "expired-worker" : null,
      next_attempt_at: nextAttemptAt,
      node_id: input.nodeId,
      node_kind: "wait",
      revision: 2,
      status: input.status,
      uid: 9,
      workflow_id: "31",
    });
    await database.insertInto("xy_wap_embed_workflow_revision_cleanup").values([
      cleanup({ id: "2", nodeId: "wait-2", status: "pending" }),
      cleanup({ id: "10", nodeId: "wait-10", status: "pending" }),
      cleanup({ id: "1", nodeId: "wait-1", status: "leased" }),
      cleanup({ id: "3", nodeId: "wait-3", status: "leased" }),
      cleanup({ attempt: 3, id: "4", nodeId: "wait-4", status: "pending" }),
      cleanup({ attempt: 3, id: "5", nodeId: "wait-5", status: "leased" }),
    ]).executeTakeFirstOrThrow();

    const repository = new MysqlWorkflowRuntimeRepository(database);
    await expect(repository.claimRevisionCleanupBatch({
      leaseExpiresAt: new Date("2099-01-01T00:03:00+08:00"),
      leaseOwner: "cleanup-worker",
      limit: 2,
      maxAttempts: 3,
      now,
    })).resolves.toEqual([
      expect.objectContaining({ attempt: 2, id: "1", leaseOwner: "cleanup-worker", status: "leased" }),
      expect.objectContaining({ attempt: 2, id: "2", leaseOwner: "cleanup-worker", status: "leased" }),
    ]);

    const rows = await database.selectFrom("xy_wap_embed_workflow_revision_cleanup")
      .select(["id", "last_error_code", "lease_owner", "status"])
      .orderBy("id", "asc")
      .execute();
    expect(rows).toEqual([
      { id: "1", last_error_code: null, lease_owner: "cleanup-worker", status: "leased" },
      { id: "2", last_error_code: null, lease_owner: "cleanup-worker", status: "leased" },
      { id: "3", last_error_code: null, lease_owner: "expired-worker", status: "leased" },
      {
        id: "4",
        last_error_code: "WORKFLOW_REVISION_CLEANUP_ATTEMPTS_EXHAUSTED",
        lease_owner: null,
        status: "dead",
      },
      {
        id: "5",
        last_error_code: "WORKFLOW_REVISION_CLEANUP_ATTEMPTS_EXHAUSTED",
        lease_owner: null,
        status: "dead",
      },
      { id: "10", last_error_code: null, lease_owner: null, status: "pending" },
    ]);
  });

  it("uses the tenant guard counter as the Run admission authority", async () => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    await database.insertInto("xy_wap_embed_workflow_capacity_guard").values({
      active_run_count: 1,
      uid: 9,
    }).executeTakeFirstOrThrow();

    const repository = new MysqlWorkflowRuntimeRepository(database);
    await expect(repository.createRunWithInitialTask({
      activeRunLimit: 1,
      context: {},
      entryEventId: "capacity-guard-event",
      entryPolicy: { mode: "never" },
      initialNodeId: "start",
      initialNodeKind: "start",
      occurredAt: new Date("2099-01-01T00:00:00+08:00"),
      revision: 1,
      shardId: 0,
      subjectId: "capacity-guard-subject",
      subjectType: "chatai_contact",
      uid: 9,
      workflowId: "31",
      workflowType: "chatai_sop",
    })).resolves.toEqual({ kind: "capacity-rejected" });
  });

  it("maintains Workflow totals and daily terminal outcomes without double-counting", async () => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    const repository = new MysqlWorkflowRuntimeRepository(database);
    const createRun = async (suffix: string) => {
      const result = await repository.createRunWithInitialTask({
        activeRunLimit: 10_000,
        context: {},
        entryEventId: `metric-event-${suffix}`,
        entryPolicy: { mode: "never" },
        initialNodeId: "start",
        initialNodeKind: "start",
        occurredAt: new Date("2099-01-01T00:00:00+08:00"),
        revision: 1,
        shardId: 0,
        subjectId: `metric-subject-${suffix}`,
        subjectType: "chatai_contact",
        uid: 9,
        workflowId: "31",
        workflowType: "chatai_sop",
      });
      if (result.kind !== "success") throw new Error(`Run creation failed: ${result.kind}`);
      return result;
    };
    const completeRun = async (
      created: Awaited<ReturnType<typeof createRun>>,
      outcome: "completed" | "failed",
    ) => {
      await database!.updateTable("xy_wap_embed_workflow_run")
        .set({ status: "running" })
        .where("id", "=", created.run.id)
        .executeTakeFirstOrThrow();
      await database!.updateTable("xy_wap_embed_workflow_task")
        .set({ status: "running" })
        .where("id", "=", created.task.id)
        .executeTakeFirstOrThrow();
      await repository.commitNodeResult({
        context: {},
        expectedRunLockVersion: created.run.lockVersion,
        expectedTaskVersion: created.task.taskVersion,
        inbox: {
          consumer: "workflow-task",
          expiresAt: new Date("2099-02-01T00:00:00+08:00"),
          messageId: `metric-result-${created.run.id}`,
        },
        nodeExecution: {
          ...(outcome === "failed"
            ? { errorCode: "METRIC_TEST_FAILURE", errorMessage: "metric test failure" }
            : {}),
          executionKey: `metric-execution-${created.run.id}`,
          input: {},
          output: {},
        },
        runId: created.run.id,
        taskId: created.task.id,
        uid: 9,
      });
    };

    const completed = await createRun("completed");
    const failed = await createRun("failed");
    const cancelled = await createRun("cancelled");
    await completeRun(completed, "completed");
    await completeRun(failed, "failed");
    await repository.cancelWorkflowBatch({ limit: 10, uid: 9, workflowId: "31" });
    await repository.createRunWithInitialTask({
      activeRunLimit: 10_000,
      context: {},
      entryEventId: "metric-event-completed",
      entryPolicy: { mode: "never" },
      initialNodeId: "start",
      initialNodeKind: "start",
      occurredAt: new Date("2099-01-01T00:00:00+08:00"),
      revision: 1,
      shardId: 0,
      subjectId: "metric-subject-completed",
      subjectType: "chatai_contact",
      uid: 9,
      workflowId: "31",
      workflowType: "chatai_sop",
    });

    const metric = await database.selectFrom("xy_wap_embed_workflow_metric")
      .selectAll()
      .where("uid", "=", 9)
      .where("workflow_id", "=", "31")
      .executeTakeFirstOrThrow();
    const daily = await database.selectFrom("xy_wap_embed_workflow_daily_metric")
      .selectAll()
      .where("uid", "=", 9)
      .where("workflow_id", "=", "31")
      .executeTakeFirstOrThrow();

    expect({
      cancelledRunCount: Number(metric.cancelled_run_count),
      completedRunCount: Number(metric.completed_run_count),
      failedRunCount: Number(metric.failed_run_count),
      totalRunCount: Number(metric.total_run_count),
    }).toEqual({
      cancelledRunCount: 1,
      completedRunCount: 1,
      failedRunCount: 1,
      totalRunCount: 3,
    });
    expect(metric.last_run_at).not.toBeNull();
    expect({
      cancelledCount: Number(daily.cancelled_count),
      completedCount: Number(daily.completed_count),
      enteredCount: Number(daily.entered_count),
      failedCount: Number(daily.failed_count),
    }).toEqual({
      cancelledCount: 1,
      completedCount: 1,
      enteredCount: 3,
      failedCount: 1,
    });
    expect(cancelled.run.status).toBe("queued");
  });

  it("reconciles a drifted tenant capacity counter from active Runs", async () => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    const repository = new MysqlWorkflowRuntimeRepository(database);
    await repository.createRunWithInitialTask({
      activeRunLimit: 2,
      context: {},
      entryEventId: "capacity-reconcile-event",
      entryPolicy: { mode: "never" },
      initialNodeId: "start",
      initialNodeKind: "start",
      occurredAt: new Date("2099-01-01T00:00:00+08:00"),
      revision: 1,
      shardId: 0,
      subjectId: "capacity-reconcile-subject",
      subjectType: "chatai_contact",
      uid: 9,
      workflowId: "31",
      workflowType: "chatai_sop",
    });
    await database.updateTable("xy_wap_embed_workflow_capacity_guard")
      .set({ active_run_count: 2 })
      .where("uid", "=", 9)
      .executeTakeFirstOrThrow();

    await expect(repository.reconcileTenantCapacityCounts({ limit: 100 }))
      .resolves.toEqual({ checked: 1, corrected: 1, hasMore: false, lastUid: 9 });
    await expect(database.selectFrom("xy_wap_embed_workflow_capacity_guard")
      .select("active_run_count")
      .where("uid", "=", 9)
      .executeTakeFirstOrThrow())
      .resolves.toEqual({ active_run_count: 1 });
  });

  it("releases expired-lease capacity once per active Run", async () => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    const repository = new MysqlWorkflowRuntimeRepository(database);
    const createRun = async (suffix: string) => {
      const result = await repository.createRunWithInitialTask({
        activeRunLimit: 10_000,
        context: {},
        entryEventId: `lease-capacity-event-${suffix}`,
        entryPolicy: { mode: "never" },
        initialNodeId: "start",
        initialNodeKind: "start",
        occurredAt: new Date("2099-01-01T00:00:00+08:00"),
        revision: 1,
        shardId: 0,
        subjectId: `lease-capacity-subject-${suffix}`,
        subjectType: "chatai_contact",
        uid: 9,
        workflowId: "31",
        workflowType: "chatai_sop",
      });
      if (result.kind !== "success") throw new Error(`Run creation failed: ${result.kind}`);
      return result;
    };
    const expiring = await createRun("expiring");
    await createRun("surviving");
    const alreadyTerminal = await createRun("terminal");
    const expiredAt = new Date("2099-01-01T00:01:00+08:00");

    await database.updateTable("xy_wap_embed_workflow_task").set({
      attempt: 3,
      lease_expires_at: expiredAt,
      lease_owner: "worker-1",
      status: "running",
    }).where("id", "in", [expiring.task.id, alreadyTerminal.task.id]).executeTakeFirstOrThrow();
    const expiringTask = await database.selectFrom("xy_wap_embed_workflow_task")
      .selectAll()
      .where("id", "=", expiring.task.id)
      .executeTakeFirstOrThrow();
    const { create_time: _createTime, id: _id, update_time: _updateTime, ...duplicateTask } = expiringTask;
    await database.insertInto("xy_wap_embed_workflow_task").values({
      ...duplicateTask,
      sequence: 2,
    }).executeTakeFirstOrThrow();
    await database.updateTable("xy_wap_embed_workflow_run")
      .set({ status: "completed" })
      .where("id", "=", alreadyTerminal.run.id)
      .executeTakeFirstOrThrow();
    await database.updateTable("xy_wap_embed_workflow_capacity_guard")
      .set({ active_run_count: 2 })
      .where("uid", "=", 9)
      .executeTakeFirstOrThrow();

    await expect(repository.recoverExpiredLeases({
      limit: 100,
      maxAttempts: 3,
      now: new Date("2099-01-01T00:02:00+08:00"),
    })).resolves.toEqual({ dead: 3, recovered: 0 });
    await expect(database.selectFrom("xy_wap_embed_workflow_capacity_guard")
      .select("active_run_count")
      .where("uid", "=", 9)
      .executeTakeFirstOrThrow())
      .resolves.toEqual({ active_run_count: 1 });
    await expect(database.selectFrom("xy_wap_embed_workflow_run")
      .select(["id", "status"])
      .where("id", "in", [expiring.run.id, alreadyTerminal.run.id])
      .orderBy("id", "asc")
      .execute())
      .resolves.toEqual([
        { id: expiring.run.id, status: "failed" },
        { id: alreadyTerminal.run.id, status: "completed" },
      ]);
  });

  it("increments the daily capacity rejection metric once per Entry Inbox message", async () => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    const repository = new MysqlWorkflowRuntimeRepository(database);
    const input = {
      capacityRejectedCount: 3,
      consumer: "workflow-entry",
      expiresAt: new Date("2099-02-01T00:00:00+08:00"),
      messageId: "9:capacity-event-1",
      processedAt: new Date("2099-01-01T00:30:00+08:00"),
      uid: 9,
    };

    await expect(repository.recordProcessedInboxMessage(input)).resolves.toBe(true);
    await expect(repository.recordProcessedInboxMessage(input)).resolves.toBe(false);
    const metric = await database.selectFrom("xy_wap_embed_workflow_capacity_daily_metric")
      .select(["capacity_rejected_count", "metric_date"])
      .where("uid", "=", 9)
      .executeTakeFirstOrThrow();

    expect(Number(metric.capacity_rejected_count)).toBe(3);
    expect(metric.metric_date).toEqual(new Date("2099-01-01T00:00:00+08:00"));
  });

  describe("LLM test Attempt repository", () => {
    runWorkflowLlmTestAttemptRepositoryContract(() => {
      if (!database) throw new Error("MySQL contract database is not initialized");
      return new MysqlWorkflowLlmTestAttemptRepository(database);
    });
  });

  it("admits only one active Run for concurrent distinct events on the same Subject", async () => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    const repository = new MysqlWorkflowRuntimeRepository(database);
    const input = {
      activeRunLimit: 10_000,
      context: { trigger: { eventType: "workflow.direct_entry.requested" } },
      entryPolicy: { maxEntries: 10, mode: "lifetime_limit" as const },
      initialNodeId: "start",
      initialNodeKind: "start" as const,
      occurredAt: new Date("2026-08-24T08:30:15.123Z"),
      revision: 1,
      shardId: 7,
      subjectId: "customer-1",
      subjectType: "chatai_contact" as const,
      uid: 9,
      workflowId: "31",
      workflowType: "chatai_sop" as const,
    };

    const results = await Promise.all([
      repository.createRunWithInitialTask({ ...input, entryEventId: "event-1" }),
      repository.createRunWithInitialTask({ ...input, entryEventId: "event-2" }),
    ]);

    expect(results.filter(result => result.kind === "success")).toHaveLength(1);
    expect(results.filter(result => result.kind === "active-run-rejected")).toHaveLength(1);
    await expect(database.selectFrom("xy_wap_embed_workflow_run")
      .select("id")
      .where("uid", "=", 9)
      .where("workflow_id", "=", "31")
      .execute())
      .resolves.toHaveLength(1);
  });

  it("keeps a MySQL outbox write chunk below one sixteenth of max_allowed_packet", async () => {
    if (!workflowPool) throw new Error("MySQL contract database is not initialized");
    const [rows] = await workflowPool.promise().query(
      "SELECT @@SESSION.max_allowed_packet AS max_allowed_packet",
    );
    const maxAllowedPacket = Number((rows as Array<{ max_allowed_packet: number }>)[0]?.max_allowed_packet);
    expect(maxAllowedPacket).toBeGreaterThan(0);
    const now = new Date("2026-07-10T00:01:00.000Z");
    const compiled = new Kysely({ dialect: new MysqlDialect({ pool: {} as never }) })
      .insertInto("xy_wap_embed_workflow_outbox")
      .values(Array.from({ length: WORKFLOW_MYSQL_WRITE_CHUNK_SIZE }, (_, index) => ({
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
      })))
      .compile();
    const sqlBytes = Buffer.byteLength(compiled.sql, "utf8")
      + compiled.parameters.reduce((total, parameter) => (
        total + Buffer.byteLength(String(parameter ?? ""), "utf8")
      ), 0);
    expect(sqlBytes).toBeLessThan(maxAllowedPacket / 16);
  });

  it("aggregates node metrics in chunks without changing counter semantics", async () => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    const repository = new MysqlWorkflowRuntimeRepository(database);
    const eventCount = WORKFLOW_MYSQL_WRITE_CHUNK_SIZE * 2 + 1;
    await database.insertInto("xy_wap_embed_workflow_node_metric").values([
      {
        completed_count: 0,
        current_count: 0,
        entered_count: 0,
        incomplete_count: 0,
        node_id: "node-0",
        passed_count: 0,
        revision: 1,
        shard_id: 0,
        uid: 9,
        workflow_id: "31",
      },
      {
        completed_count: 0,
        current_count: 5,
        entered_count: 0,
        incomplete_count: 0,
        node_id: "node-1",
        passed_count: 0,
        revision: 1,
        shard_id: 1,
        uid: 9,
        workflow_id: "31",
      },
      {
        completed_count: 10,
        current_count: 5,
        entered_count: 10,
        incomplete_count: 0,
        node_id: "node-200",
        passed_count: 2,
        revision: 1,
        shard_id: 8,
        uid: 9,
        workflow_id: "31",
      },
    ]).executeTakeFirstOrThrow();
    for (let start = 0; start < eventCount; start += WORKFLOW_MYSQL_WRITE_CHUNK_SIZE) {
      const end = Math.min(start + WORKFLOW_MYSQL_WRITE_CHUNK_SIZE, eventCount);
      await database.insertInto("xy_wap_embed_workflow_node_metric_event").values(
        Array.from({ length: end - start }, (_, offset) => {
          const index = start + offset;
          return {
            completed_delta: index,
            current_delta: index <= 1 ? -1 : 1,
            entered_delta: 1,
            event_key: `metric-batch-${index}`,
            incomplete_delta: 0,
            node_id: `node-${index}`,
            passed_delta: index % 2,
            processed_at: null,
            revision: 1,
            run_id: String(1_000 + index),
            shard_id: index % 16,
            uid: 9,
            workflow_id: "31",
          };
        }),
      ).executeTakeFirstOrThrow();
    }

    await expect(repository.aggregateNodeMetricEvents({ limit: eventCount })).resolves.toBe(eventCount);
    await expect(repository.aggregateNodeMetricEvents({ limit: eventCount })).resolves.toBe(0);
    const [metrics, processedCount] = await Promise.all([
      database.selectFrom("xy_wap_embed_workflow_node_metric")
        .select(["completed_count", "current_count", "entered_count", "node_id", "passed_count"])
        .where("uid", "=", 9).where("workflow_id", "=", "31")
        .where("revision", "=", 1)
        .orderBy("node_id", "asc")
        .execute(),
      database.selectFrom("xy_wap_embed_workflow_node_metric_event")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("processed_at", "is not", null)
        .executeTakeFirstOrThrow(),
    ]);
    const metricByNodeId = new Map(metrics.map(metric => [metric.node_id, metric]));

    expect(metricByNodeId.get("node-0")).toEqual({
      completed_count: "0",
      current_count: "0",
      entered_count: "1",
      node_id: "node-0",
      passed_count: "0",
    });
    expect(metricByNodeId.get("node-1")).toEqual({
      completed_count: "1",
      current_count: "4",
      entered_count: "1",
      node_id: "node-1",
      passed_count: "1",
    });
    expect(metricByNodeId.get("node-200")).toEqual({
      completed_count: "210",
      current_count: "6",
      entered_count: "11",
      node_id: "node-200",
      passed_count: "2",
    });
    expect(metrics).toHaveLength(eventCount);
    expect(Number(processedCount.count)).toBe(eventCount);
  });
});

function readMysqlTestConnectionOptions() {
  return {
    host: readRequiredEnv("WORKFLOW_TEST_MYSQL_HOST"),
    password: readRequiredEnv("WORKFLOW_TEST_MYSQL_PASSWORD"),
    port: Number(readRequiredEnv("WORKFLOW_TEST_MYSQL_PORT")),
    user: readRequiredEnv("WORKFLOW_TEST_MYSQL_USER"),
  };
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the MySQL Repository Contract`);
  return value;
}
