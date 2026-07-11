import {
  WorkflowEntryEventType,
  WorkflowExecutionSpec,
  WorkflowNodeKind,
  WorkflowRuntimeStatus,
  WorkflowRunStatus,
  WorkflowStartConfig,
  WorkflowTaskMessageSchema,
  WorkflowTaskStatus,
  type WorkflowTaskMessage,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import {
  getWorkflowExecutionBoundaryDecision,
  transitionRun,
  transitionTask,
} from "@chatai/workflow-engine";
import type {
  WorkflowDatabase,
  WorkflowRunTable,
  WorkflowTaskTable,
} from "./db.js";
import type {
  WorkflowCommitNodeResultInput,
  WorkflowCreateRunInput,
  WorkflowOutboxRecord,
  WorkflowRunRecord,
  WorkflowRuntimeControlReader,
  WorkflowRuntimeRepository,
  WorkflowTaskRecord,
  WorkflowTriggerBindingReader,
  WorkflowTriggerBindingRecord,
} from "./types.js";

const RUN_TABLE = "xy_wap_embed_workflow_run" as const;
const ENTRY_GUARD_TABLE = "xy_wap_embed_workflow_entry_guard" as const;
const TASK_TABLE = "xy_wap_embed_workflow_task" as const;
const EXECUTION_TABLE = "xy_wap_embed_workflow_node_execution" as const;
const OUTBOX_TABLE = "xy_wap_embed_workflow_outbox" as const;
const INBOX_TABLE = "xy_wap_embed_workflow_inbox" as const;
const REVISION_TABLE = "xy_wap_embed_workflow_revision" as const;
const TRIGGER_BINDING_TABLE = "xy_wap_embed_workflow_trigger_binding" as const;
type RuntimeTransaction = Transaction<WorkflowDatabase>;

export class MysqlWorkflowRuntimeRepository implements
  WorkflowRuntimeControlReader,
  WorkflowRuntimeRepository,
  WorkflowTriggerBindingReader {
  constructor(private readonly db: Kysely<WorkflowDatabase>) {}

  async findDefinition(uid: number, workflowId: string) {
    const row = await this.db.selectFrom("xy_wap_embed_workflow_definition")
      .select(["biz_status", "published_revision", "runtime_status"])
      .where("uid", "=", uid)
      .where("id", "=", workflowId)
      .executeTakeFirst();
    return row ? {
      bizStatus: row.biz_status === 1 ? 1 as const : 0 as const,
      publishedRevision: row.published_revision,
      runtimeStatus: parseRuntimeStatus(row.runtime_status),
    } : null;
  }

  async findRevision(uid: number, workflowId: string, revision: number) {
    const row = await this.db.selectFrom(REVISION_TABLE)
      .select(["execution_spec_json", "revision"])
      .where("uid", "=", uid)
      .where("workflow_id", "=", workflowId)
      .where("revision", "=", revision)
      .executeTakeFirst();
    return row ? {
      executionSpec: parseJson(row.execution_spec_json) as WorkflowExecutionSpec,
      revision: row.revision,
    } : null;
  }

  async listActiveTriggerBindings(uid: number, eventType: WorkflowEntryEventType) {
    const rows = await this.db.selectFrom(`${TRIGGER_BINDING_TABLE} as binding`)
      .innerJoin("xy_wap_embed_workflow_definition as definition", join => join
        .onRef("definition.uid", "=", "binding.uid")
        .onRef("definition.id", "=", "binding.workflow_id")
        .onRef("definition.published_revision", "=", "binding.revision"))
      .select([
        "binding.create_time",
        "binding.event_type",
        "binding.filter_spec_json",
        "binding.id",
        "binding.revision",
        "binding.status",
        "binding.uid",
        "binding.update_time",
        "binding.workflow_id",
      ])
      .where("binding.uid", "=", uid)
      .where("binding.event_type", "=", eventType)
      .where("binding.status", "=", 1)
      .where("definition.biz_status", "=", 1)
      .where("definition.runtime_status", "=", "active")
      .execute();
    return rows.map(mapTriggerBinding);
  }

  async createRunWithInitialTask(input: WorkflowCreateRunInput) {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const definition = await trx.selectFrom("xy_wap_embed_workflow_definition")
          .select(["biz_status", "published_revision", "runtime_status"])
          .where("uid", "=", input.uid).where("id", "=", input.workflowId)
          .forShare().executeTakeFirst();
        const boundaryDecision = definition
          ? getWorkflowExecutionBoundaryDecision({
              bizStatus: definition.biz_status === 1 ? 1 : 0,
              runtimeStatus: parseRuntimeStatus(definition.runtime_status),
            })
          : "cancel";
        if (boundaryDecision !== "execute") {
          return { action: boundaryDecision, kind: "workflow-unavailable" as const };
        }
        if (definition?.published_revision !== input.revision) {
          return { kind: "conflict" as const };
        }

        const existing = await findRunAndInitialTaskByEntryEvent(
          trx,
          input.uid,
          input.workflowId,
          input.entryEventId,
        );
        if (existing) {
          return { deduplicated: true, kind: "success" as const, ...existing };
        }

        const admittedAt = await getDatabaseNow(trx);
        await trx.insertInto(ENTRY_GUARD_TABLE).values({
          subject_id: input.subjectId,
          total_entries: 0,
          uid: input.uid,
          workflow_id: input.workflowId,
        }).onDuplicateKeyUpdate({
          total_entries: sql<number>`total_entries`,
        }).executeTakeFirstOrThrow();
        const guard = await trx.selectFrom(ENTRY_GUARD_TABLE)
          .select(["id", "total_entries"])
          .where("uid", "=", input.uid)
          .where("workflow_id", "=", input.workflowId)
          .where("subject_id", "=", input.subjectId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        const concurrentDuplicate = await findRunAndInitialTaskByEntryEvent(
          trx,
          input.uid,
          input.workflowId,
          input.entryEventId,
        );
        if (concurrentDuplicate) {
          return { deduplicated: true, kind: "success" as const, ...concurrentDuplicate };
        }
        if (!await canEnterWorkflow(trx, input, guard.total_entries, admittedAt)) {
          return { kind: "entry-policy-rejected" as const };
        }

        const runInsert = await trx.insertInto(RUN_TABLE).values({
          completed_at: null,
          context_json: stringifyJson(input.context),
          current_node_id: input.initialNodeId,
          entry_event_id: input.entryEventId,
          lock_version: 1,
          create_time: admittedAt,
          next_execute_at: admittedAt,
          revision: input.revision,
          sequence: 1,
          shard_id: input.shardId,
          status: "queued",
          subject_id: input.subjectId,
          terminal_reason: null,
          uid: input.uid,
          update_time: admittedAt,
          workflow_id: input.workflowId,
        }).executeTakeFirstOrThrow();
        const runId = normalizeId(runInsert.insertId);
        const task = await insertTask(trx, {
          dueAt: admittedAt,
          nodeId: input.initialNodeId,
          nodeKind: input.initialNodeKind,
          runId,
          sequence: 1,
          shardId: input.shardId,
          status: "dispatched",
          taskType: "execute",
          uid: input.uid,
          workflowId: input.workflowId,
          revision: input.revision,
        });
        await insertTaskOutbox(trx, task, admittedAt);
        await trx.updateTable(ENTRY_GUARD_TABLE).set({
          total_entries: guard.total_entries + 1,
        }).where("id", "=", guard.id).executeTakeFirstOrThrow();
        return {
          deduplicated: false,
          kind: "success" as const,
          run: createRunRecord(runId, input, admittedAt),
          task,
        };
      });
    } catch (error) {
      if (!isDuplicateEntryError(error)) throw error;
      const run = await this.findRunByEntryEvent(input.uid, input.workflowId, input.entryEventId);
      if (!run) throw error;
      const task = await this.findInitialTask(input.uid, run.id);
      if (!task) throw new Error("Deduplicated workflow run has no initial task");
      return { deduplicated: true, kind: "success" as const, run, task };
    }
  }

  async claimTask(input: Parameters<WorkflowRuntimeRepository["claimTask"]>[0]) {
    return this.db.transaction().execute(async (trx) => {
      const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.taskId)
        .forUpdate().executeTakeFirst();
      if (!taskRow) return { kind: "not-found" as const };
      const task = mapTask(taskRow);
      if ((task.status !== "pending" && task.status !== "dispatched")
        || task.taskVersion !== input.expectedTaskVersion) return { kind: "conflict" as const };

      const definition = await trx.selectFrom("xy_wap_embed_workflow_definition")
        .select(["biz_status", "runtime_status"])
        .where("uid", "=", input.uid).where("id", "=", task.workflowId)
        .forShare().executeTakeFirst();
      const boundaryDecision = definition
        ? getWorkflowExecutionBoundaryDecision({
            bizStatus: definition.biz_status === 1 ? 1 : 0,
            runtimeStatus: parseRuntimeStatus(definition.runtime_status),
          })
        : "cancel";

      if (boundaryDecision !== "execute") {
        await trx.updateTable(TASK_TABLE).set({
          lease_expires_at: null,
          lease_owner: null,
          status: boundaryDecision === "defer" ? "pending" : "cancelled",
          task_version: task.taskVersion + 1,
        }).where("uid", "=", input.uid).where("id", "=", input.taskId)
          .where("task_version", "=", input.expectedTaskVersion).executeTakeFirstOrThrow();
        return { action: boundaryDecision, kind: "workflow-unavailable" as const };
      }

      await trx.updateTable(TASK_TABLE).set({
        attempt: task.attempt + 1,
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        status: "running",
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid).where("id", "=", input.taskId)
        .where("task_version", "=", input.expectedTaskVersion).executeTakeFirstOrThrow();
      await trx.updateTable(RUN_TABLE).set({
        status: "running",
      }).where("uid", "=", input.uid)
        .where("id", "=", task.runId)
        .where("status", "in", ["queued", "waiting"])
        .executeTakeFirst();
      return {
        kind: "success" as const,
        task: {
          ...task,
          attempt: task.attempt + 1,
          leaseExpiresAt: input.leaseExpiresAt,
          leaseOwner: input.leaseOwner,
          status: "running" as const,
          taskVersion: task.taskVersion + 1,
        },
      };
    });
  }

  async dispatchDueTasks(input: Parameters<WorkflowRuntimeRepository["dispatchDueTasks"]>[0]) {
    if (input.limit <= 0 || input.shardIds?.length === 0) {
      return { cancelled: 0, deferred: 0, dispatched: 0 };
    }
    return this.db.transaction().execute(async (trx) => {
      let query = trx.selectFrom(`${TASK_TABLE} as task`)
        .leftJoin("xy_wap_embed_workflow_definition as definition", join => join
          .onRef("definition.uid", "=", "task.uid")
          .onRef("definition.id", "=", "task.workflow_id"))
        .selectAll("task")
        .where("task.status", "=", "pending")
        .where("task.bucket_time", "<=", floorToMinute(input.now))
        .where("task.due_at", "<=", input.now)
        .where(eb => eb.or([
          eb("definition.id", "is", null),
          eb("definition.biz_status", "=", 0),
          eb("definition.runtime_status", "!=", "paused"),
        ]))
        .orderBy("task.bucket_time", "asc")
        .orderBy("task.due_at", "asc")
        .orderBy("task.id", "asc")
        .limit(input.limit)
        .forUpdate()
        .skipLocked();
      if (input.shardIds) query = query.where("task.shard_id", "in", input.shardIds);
      const rows = await query.execute();
      const result = { cancelled: 0, deferred: 0, dispatched: 0 };
      for (const row of rows) {
        const task = mapTask(row);
        const definition = await trx.selectFrom("xy_wap_embed_workflow_definition")
          .select(["biz_status", "runtime_status"])
          .where("uid", "=", task.uid)
          .where("id", "=", task.workflowId)
          .forShare()
          .executeTakeFirst();
        const decision = definition
          ? getWorkflowExecutionBoundaryDecision({
              bizStatus: definition.biz_status === 1 ? 1 : 0,
              runtimeStatus: parseRuntimeStatus(definition.runtime_status),
            })
          : "cancel";
        if (decision === "defer") {
          result.deferred += 1;
          continue;
        }
        const taskVersion = task.taskVersion + 1;
        if (decision === "cancel") {
          await trx.updateTable(TASK_TABLE).set({
            lease_expires_at: null,
            lease_owner: null,
            status: "cancelled",
            task_version: taskVersion,
          }).where("id", "=", task.id)
            .where("status", "=", "pending")
            .where("task_version", "=", task.taskVersion)
            .executeTakeFirstOrThrow();
          result.cancelled += 1;
          continue;
        }
        transitionTask(transitionTask(task.status, "leased"), "dispatched");
        await trx.updateTable(TASK_TABLE).set({
          status: "dispatched",
          task_version: taskVersion,
        }).where("id", "=", task.id)
          .where("status", "=", "pending")
          .where("task_version", "=", task.taskVersion)
          .executeTakeFirstOrThrow();
        await insertTaskOutbox(trx, { ...task, status: "dispatched", taskVersion }, input.now);
        result.dispatched += 1;
      }
      return result;
    });
  }

  async claimOutboxBatch(input: Parameters<WorkflowRuntimeRepository["claimOutboxBatch"]>[0]) {
    if (input.limit <= 0) return [];
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(OUTBOX_TABLE).selectAll()
        .where("status", "=", "pending")
        .where("next_attempt_at", "<=", input.now)
        .orderBy("next_attempt_at", "asc")
        .orderBy("id", "asc")
        .limit(input.limit)
        .forUpdate()
        .skipLocked()
        .execute();
      const ids = rows.map(row => row.id);
      if (ids.length === 0) return [];
      await trx.updateTable(OUTBOX_TABLE).set({
        attempt: sql<number>`attempt + 1`,
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        status: "leased",
      }).where("id", "in", ids)
        .where("status", "=", "pending")
        .executeTakeFirstOrThrow();
      return rows.map(row => mapOutbox({
        ...row,
        attempt: row.attempt + 1,
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        status: "leased",
      }));
    });
  }

  async markOutboxFailed(input: Parameters<WorkflowRuntimeRepository["markOutboxFailed"]>[0]) {
    const result = await this.db.updateTable(OUTBOX_TABLE).set({
      lease_expires_at: null,
      lease_owner: null,
      next_attempt_at: input.nextAttemptAt,
      status: "pending",
    }).where("id", "=", input.id)
      .where("status", "=", "leased")
      .where("lease_owner", "=", input.leaseOwner)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  async markOutboxDead(input: Parameters<WorkflowRuntimeRepository["markOutboxDead"]>[0]) {
    return this.db.transaction().execute(async (trx) => {
      const outboxRow = await trx.selectFrom(OUTBOX_TABLE).selectAll()
        .where("id", "=", input.id)
        .where("status", "=", "leased")
        .where("lease_owner", "=", input.leaseOwner)
        .forUpdate()
        .executeTakeFirst();
      if (!outboxRow) return false;
      await trx.updateTable(OUTBOX_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "dead",
      }).where("id", "=", input.id)
        .where("status", "=", "leased")
        .where("lease_owner", "=", input.leaseOwner)
        .executeTakeFirstOrThrow();
      return true;
    });
  }

  async markOutboxSent(input: Parameters<WorkflowRuntimeRepository["markOutboxSent"]>[0]) {
    const result = await this.db.updateTable(OUTBOX_TABLE).set({
      lease_expires_at: null,
      lease_owner: null,
      sent_at: input.sentAt,
      status: "sent",
    }).where("id", "=", input.id)
      .where("status", "=", "leased")
      .where("lease_owner", "=", input.leaseOwner)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  commitNodeResult(input: WorkflowCommitNodeResultInput) {
    return this.db.transaction().execute(async (trx) => {
      const processed = await trx.selectFrom(INBOX_TABLE).select("id")
        .where("consumer", "=", input.inbox.consumer)
        .where("message_id", "=", input.inbox.messageId)
        .executeTakeFirst();
      if (processed) return { kind: "already-processed" as const };

      const runRow = await trx.selectFrom(RUN_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.runId).forUpdate().executeTakeFirst();
      const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.taskId).forUpdate().executeTakeFirst();
      if (!runRow || !taskRow || normalizeId(taskRow.run_id) !== input.runId) {
        return { kind: "not-found" as const };
      }
      const run = mapRun(runRow);
      const task = mapTask(taskRow);
      if (run.lockVersion !== input.expectedRunLockVersion
        || task.taskVersion !== input.expectedTaskVersion
        || task.status !== "running") return { kind: "conflict" as const };

      const now = new Date();
      await trx.insertInto(EXECUTION_TABLE).values({
        completed_at: now,
        error_code: input.nodeExecution.errorCode ?? null,
        error_message: input.nodeExecution.errorMessage ?? null,
        idempotency_key: input.nodeExecution.idempotencyKey,
        input_snapshot_json: stringifyJson(input.nodeExecution.input),
        node_id: task.nodeId,
        node_kind: task.nodeKind,
        output_json: stringifyJson(input.nodeExecution.output),
        run_id: run.id,
        sequence: task.sequence,
        started_at: now,
        status: input.nodeExecution.errorCode ? "failed" : "completed",
        uid: input.uid,
      }).executeTakeFirstOrThrow();
      await trx.insertInto(INBOX_TABLE).values({
        consumer: input.inbox.consumer,
        expires_at: input.inbox.expiresAt,
        message_id: input.inbox.messageId,
        processed_at: now,
        uid: input.uid,
      }).executeTakeFirstOrThrow();
      await trx.updateTable(TASK_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: transitionTask(task.status, "completed"),
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid).where("id", "=", task.id)
        .where("task_version", "=", task.taskVersion).where("status", "=", "running")
        .executeTakeFirstOrThrow();

      const nextSequence = run.sequence + 1;
      let nextTask: WorkflowTaskRecord | null = null;
      if (input.nextTask) {
        const dispatchImmediately = input.nextTask.dispatchImmediately !== false
          && input.nextTask.taskType !== "wait";
        nextTask = await insertTask(trx, {
          dueAt: input.nextTask.dueAt,
          nodeId: input.nextTask.nodeId,
          nodeKind: input.nextTask.nodeKind,
          revision: run.revision,
          runId: run.id,
          sequence: nextSequence,
          shardId: run.shardId,
          status: dispatchImmediately ? "dispatched" : "pending",
          taskType: input.nextTask.taskType,
          uid: input.uid,
          workflowId: run.workflowId,
        });
        if (dispatchImmediately) await insertTaskOutbox(trx, nextTask, now);
      }

      const nextRun: WorkflowRunRecord = {
        ...run,
        context: input.context ? structuredClone(input.context) : run.context,
        currentNodeId: input.nextTask?.nodeId ?? run.currentNodeId,
        lockVersion: run.lockVersion + 1,
        nextExecuteAt: input.nextTask?.dueAt ?? null,
        sequence: input.nextTask ? nextSequence : run.sequence,
        status: transitionRun(
          run.status,
          input.nextTask
            ? input.nextTask.taskType === "wait" ? "waiting" : "running"
            : "completed",
        ),
      };
      await trx.updateTable(RUN_TABLE).set({
        completed_at: nextRun.status === "completed" ? now : null,
        context_json: stringifyJson(nextRun.context),
        current_node_id: nextRun.currentNodeId,
        lock_version: nextRun.lockVersion,
        next_execute_at: nextRun.nextExecuteAt,
        sequence: nextRun.sequence,
        status: nextRun.status,
      }).where("uid", "=", input.uid).where("id", "=", run.id)
        .where("lock_version", "=", run.lockVersion).executeTakeFirstOrThrow();
      return { kind: "success" as const, nextTask, run: nextRun };
    });
  }

  async recoverExpiredLeases(input: Parameters<WorkflowRuntimeRepository["recoverExpiredLeases"]>[0]) {
    if (input.limit <= 0) return { dead: 0, recovered: 0 };
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(TASK_TABLE).select(["attempt", "id", "run_id"])
        .where("status", "=", "running").where("lease_expires_at", "<=", input.now)
        .orderBy("lease_expires_at", "asc").orderBy("id", "asc").limit(input.limit)
        .forUpdate().skipLocked().execute();
      if (rows.length === 0) return { dead: 0, recovered: 0 };
      const deadRows = rows.filter(row => row.attempt >= input.maxAttempts);
      const recoverableRows = rows.filter(row => row.attempt < input.maxAttempts);
      const recoverableIds = recoverableRows.map(row => row.id);
      if (recoverableIds.length > 0) await trx.updateTable(TASK_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "pending",
        task_version: sql<number>`task_version + 1`,
      }).where("id", "in", recoverableIds).where("status", "=", "running")
        .where("lease_expires_at", "<=", input.now).executeTakeFirstOrThrow();
      const deadIds = deadRows.map(row => row.id);
      if (deadIds.length > 0) {
        await trx.updateTable(TASK_TABLE).set({
          last_error_code: "WORKFLOW_TASK_ATTEMPTS_EXHAUSTED",
          lease_expires_at: null,
          lease_owner: null,
          status: "dead",
          task_version: sql<number>`task_version + 1`,
        }).where("id", "in", deadIds).where("status", "=", "running")
          .where("lease_expires_at", "<=", input.now).executeTakeFirstOrThrow();
        const runIds = [...new Set(deadRows.map(row => row.run_id))];
        await trx.updateTable(RUN_TABLE).set({
          completed_at: input.now,
          lock_version: sql<number>`lock_version + 1`,
          next_execute_at: null,
          status: "failed",
          terminal_reason: "WORKFLOW_TASK_ATTEMPTS_EXHAUSTED",
        }).where("id", "in", runIds)
          .where("status", "in", ["queued", "running", "waiting"])
          .executeTakeFirstOrThrow();
      }
      return { dead: deadIds.length, recovered: recoverableIds.length };
    });
  }

  async republishStalledDispatchedTasks(
    input: Parameters<WorkflowRuntimeRepository["republishStalledDispatchedTasks"]>[0],
  ) {
    if (input.limit <= 0) return 0;
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(`${TASK_TABLE} as task`)
        .innerJoin(`${OUTBOX_TABLE} as outbox`, join => join
          .onRef("outbox.aggregate_id", "=", "task.id")
          .onRef("outbox.task_version", "=", "task.task_version"))
        .selectAll("task")
        .select("outbox.id as outbox_id")
        .where("task.status", "=", "dispatched")
        .where("outbox.aggregate_type", "=", "workflow_task")
        .where("outbox.status", "=", "sent")
        .where("outbox.sent_at", "<=", input.dispatchedBefore)
        .orderBy("outbox.sent_at", "asc")
        .orderBy("task.id", "asc")
        .limit(input.limit)
        .forUpdate()
        .skipLocked()
        .execute();
      for (const row of rows) {
        await trx.updateTable(OUTBOX_TABLE).set({ status: "republished" })
          .where("id", "=", row.outbox_id)
          .where("status", "=", "sent")
          .executeTakeFirstOrThrow();
        await insertTaskOutbox(trx, mapTask(row), input.now);
      }
      return rows.length;
    });
  }

  async cleanupExpiredInbox(input: Parameters<WorkflowRuntimeRepository["cleanupExpiredInbox"]>[0]) {
    if (input.limit <= 0) return 0;
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(INBOX_TABLE).select("id")
        .where("expires_at", "<=", input.now)
        .orderBy("expires_at", "asc")
        .orderBy("id", "asc")
        .limit(input.limit)
        .forUpdate()
        .skipLocked()
        .execute();
      const ids = rows.map(row => row.id);
      if (ids.length === 0) return 0;
      const result = await trx.deleteFrom(INBOX_TABLE).where("id", "in", ids).executeTakeFirst();
      return Number(result.numDeletedRows);
    });
  }

  async recoverExpiredOutboxLeases(
    input: Parameters<WorkflowRuntimeRepository["recoverExpiredOutboxLeases"]>[0],
  ) {
    if (input.limit <= 0) return 0;
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(OUTBOX_TABLE).select("id")
        .where("status", "=", "leased")
        .where("lease_expires_at", "<=", input.now)
        .orderBy("lease_expires_at", "asc")
        .orderBy("id", "asc")
        .limit(input.limit)
        .forUpdate()
        .skipLocked()
        .execute();
      const ids = rows.map(row => row.id);
      if (ids.length === 0) return 0;
      const update = await trx.updateTable(OUTBOX_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        next_attempt_at: input.now,
        status: "pending",
      }).where("id", "in", ids)
        .where("status", "=", "leased")
        .where("lease_expires_at", "<=", input.now)
        .executeTakeFirst();
      return Number(update.numUpdatedRows);
    });
  }

  async cancelWorkflowBatch(input: Parameters<WorkflowRuntimeRepository["cancelWorkflowBatch"]>[0]) {
    return this.db.transaction().execute(async (trx) => {
      let query = trx.selectFrom(RUN_TABLE).select("id")
        .where("uid", "=", input.uid).where("workflow_id", "=", input.workflowId)
        .where("status", "in", ["queued", "running", "waiting"])
        .orderBy("id", "asc").limit(input.limit + 1).forUpdate();
      if (input.afterRunId) query = query.where("id", ">", input.afterRunId);
      const rows = await query.execute();
      const selectedRows = rows.slice(0, input.limit);
      const runIds = selectedRows.map((row) => row.id);
      if (runIds.length === 0) {
        return { cancelled: 0, hasMore: false, lastRunId: null };
      }

      const runUpdate = await trx.updateTable(RUN_TABLE).set({
        completed_at: new Date(),
        lock_version: sql<number>`lock_version + 1`,
        next_execute_at: null,
        status: "cancelled",
        terminal_reason: "workflow_stopped",
      }).where("uid", "=", input.uid).where("id", "in", runIds)
        .where("status", "in", ["queued", "running", "waiting"])
        .executeTakeFirst();
      await trx.updateTable(TASK_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "cancelled",
        task_version: sql<number>`task_version + 1`,
      })
        .where("uid", "=", input.uid).where("run_id", "in", runIds)
        .where("status", "in", ["pending", "leased", "dispatched", "running"])
        .executeTakeFirst();
      return {
        cancelled: Number(runUpdate.numUpdatedRows),
        hasMore: rows.length > selectedRows.length,
        lastRunId: normalizeId(runIds.at(-1)),
      };
    });
  }

  async cancelUnavailableWorkflowRuns(
    input: Parameters<WorkflowRuntimeRepository["cancelUnavailableWorkflowRuns"]>[0],
  ) {
    if (input.limit <= 0) return { cancelled: 0, hasMore: false, lastRunId: null };
    return this.db.transaction().execute(async (trx) => {
      let query = trx.selectFrom(`${RUN_TABLE} as run`)
        .leftJoin("xy_wap_embed_workflow_definition as definition", join => join
          .onRef("definition.uid", "=", "run.uid")
          .onRef("definition.id", "=", "run.workflow_id"))
        .select("run.id")
        .where("run.status", "in", ["queued", "running", "waiting"])
        .where(eb => eb.or([
          eb("definition.id", "is", null),
          eb("definition.biz_status", "=", 0),
          eb("definition.runtime_status", "in", ["inactive", "stopped"]),
        ]))
        .orderBy("run.id", "asc")
        .limit(input.limit + 1)
        .forUpdate()
        .skipLocked();
      if (input.afterRunId) query = query.where("run.id", ">", input.afterRunId);
      const rows = await query.execute();
      const selected = rows.slice(0, input.limit);
      const runIds = selected.map(row => row.id);
      if (runIds.length === 0) return { cancelled: 0, hasMore: false, lastRunId: null };
      const now = new Date();
      const runUpdate = await trx.updateTable(RUN_TABLE).set({
        completed_at: now,
        lock_version: sql<number>`lock_version + 1`,
        next_execute_at: null,
        status: "cancelled",
        terminal_reason: "workflow_stopped",
      }).where("id", "in", runIds)
        .where("status", "in", ["queued", "running", "waiting"])
        .executeTakeFirst();
      await trx.updateTable(TASK_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "cancelled",
        task_version: sql<number>`task_version + 1`,
      }).where("run_id", "in", runIds)
        .where("status", "in", ["pending", "leased", "dispatched", "running"])
        .executeTakeFirst();
      return {
        cancelled: Number(runUpdate.numUpdatedRows),
        hasMore: rows.length > selected.length,
        lastRunId: normalizeId(runIds.at(-1)),
      };
    });
  }

  private async findRunByEntryEvent(uid: number, workflowId: string, entryEventId: string) {
    const row = await this.db.selectFrom(RUN_TABLE).selectAll()
      .where("uid", "=", uid).where("workflow_id", "=", workflowId)
      .where("entry_event_id", "=", entryEventId).executeTakeFirst();
    return row ? mapRun(row) : null;
  }

  private async findInitialTask(uid: number, runId: string) {
    const row = await this.db.selectFrom(TASK_TABLE).selectAll()
      .where("uid", "=", uid).where("run_id", "=", runId)
      .orderBy("sequence", "asc").limit(1).executeTakeFirst();
    return row ? mapTask(row) : null;
  }

  async findRun(uid: number, runId: string) {
    const row = await this.db.selectFrom(RUN_TABLE).selectAll()
      .where("uid", "=", uid).where("id", "=", runId).executeTakeFirst();
    return row ? mapRun(row) : null;
  }

  async findTask(uid: number, taskId: string) {
    const row = await this.db.selectFrom(TASK_TABLE).selectAll()
      .where("uid", "=", uid).where("id", "=", taskId).executeTakeFirst();
    return row ? mapTask(row) : null;
  }
}

async function insertTask(
  trx: RuntimeTransaction,
  input: Omit<WorkflowTaskRecord, "attempt" | "id" | "leaseExpiresAt" | "leaseOwner" | "taskVersion">,
) {
  const inserted = await trx.insertInto(TASK_TABLE).values({
    attempt: 0,
    bucket_time: floorToMinute(input.dueAt),
    due_at: input.dueAt,
    last_error_code: null,
    lease_expires_at: null,
    lease_owner: null,
    node_id: input.nodeId,
    node_kind: input.nodeKind,
    revision: input.revision,
    run_id: input.runId,
    sequence: input.sequence,
    shard_id: input.shardId,
    status: input.status,
    task_type: input.taskType,
    task_version: 1,
    uid: input.uid,
    workflow_id: input.workflowId,
  }).executeTakeFirstOrThrow();
  return { ...input, attempt: 0, id: normalizeId(inserted.insertId), leaseExpiresAt: null, leaseOwner: null, taskVersion: 1 };
}

function insertTaskOutbox(trx: RuntimeTransaction, task: WorkflowTaskRecord, now: Date) {
  const payload = createTaskMessage(task, now);
  return trx.insertInto(OUTBOX_TABLE).values({
    aggregate_id: task.id,
    aggregate_type: "workflow_task",
    attempt: 0,
    event_type: "workflow.task.ready",
    lease_expires_at: null,
    lease_owner: null,
    next_attempt_at: now,
    payload_json: stringifyJson(payload),
    sent_at: null,
    status: "pending",
    task_version: task.taskVersion,
    uid: task.uid,
  }).executeTakeFirstOrThrow();
}

function createTaskMessage(task: WorkflowTaskRecord, now: Date): WorkflowTaskMessage {
  return {
    messageId: `workflow-task:${task.id}:v${task.taskVersion}`,
    occurredAt: now.toISOString(),
    runId: task.runId,
    shardId: task.shardId,
    taskId: task.id,
    taskVersion: task.taskVersion,
    uid: String(task.uid),
  };
}

function mapOutbox(row: Selectable<WorkflowDatabase[typeof OUTBOX_TABLE]>): WorkflowOutboxRecord {
  const status = row.status;
  if (status !== "pending"
    && status !== "leased"
    && status !== "sent"
    && status !== "dead"
    && status !== "republished") {
    throw new Error(`Unknown workflow outbox status: ${status}`);
  }
  if (row.event_type !== "workflow.task.ready") {
    throw new Error(`Unknown workflow outbox event type: ${row.event_type}`);
  }
  const payload = parseJson(row.payload_json);
  if (!Value.Check(WorkflowTaskMessageSchema, payload)) {
    throw new Error("Workflow Outbox contains an invalid task message");
  }
  return {
    attempt: row.attempt,
    eventType: "workflow.task.ready",
    id: normalizeId(row.id),
    leaseExpiresAt: row.lease_expires_at ? toDate(row.lease_expires_at) : null,
    leaseOwner: row.lease_owner,
    nextAttemptAt: toDate(row.next_attempt_at),
    payload: structuredClone(payload) as WorkflowTaskMessage,
    sentAt: row.sent_at ? toDate(row.sent_at) : null,
    status,
    taskVersion: row.task_version,
    uid: normalizeTenantId(row.uid),
  };
}

function createRunRecord(id: string, input: WorkflowCreateRunInput, admittedAt: Date): WorkflowRunRecord {
  return {
    context: structuredClone(input.context),
    createdAt: admittedAt,
    currentNodeId: input.initialNodeId,
    entryEventId: input.entryEventId,
    id,
    lockVersion: 1,
    nextExecuteAt: admittedAt,
    revision: input.revision,
    sequence: 1,
    shardId: input.shardId,
    status: "queued",
    subjectId: input.subjectId,
    uid: input.uid,
    workflowId: input.workflowId,
  };
}

function mapRun(row: Selectable<WorkflowRunTable>): WorkflowRunRecord {
  return {
    context: parseJson(row.context_json),
    createdAt: row.create_time,
    currentNodeId: row.current_node_id,
    entryEventId: row.entry_event_id,
    id: normalizeId(row.id),
    lockVersion: row.lock_version,
    nextExecuteAt: row.next_execute_at,
    revision: row.revision,
    sequence: row.sequence,
    shardId: row.shard_id,
    status: parseRunStatus(row.status),
    subjectId: row.subject_id,
    uid: normalizeTenantId(row.uid),
    workflowId: normalizeId(row.workflow_id),
  };
}

async function getDatabaseNow(trx: RuntimeTransaction) {
  const row = await trx.selectNoFrom(sql<Date>`CURRENT_TIMESTAMP`.as("now"))
    .executeTakeFirstOrThrow();
  return row.now instanceof Date ? row.now : new Date(row.now);
}

async function canEnterWorkflow(
  trx: RuntimeTransaction,
  input: WorkflowCreateRunInput,
  totalEntries: number,
  admittedAt: Date,
) {
  if (input.entryPolicy.mode === "never") return totalEntries === 0;
  if (input.entryPolicy.mode === "lifetime_limit") {
    return totalEntries < input.entryPolicy.maxEntries;
  }
  const windowMilliseconds = input.entryPolicy.windowSize
    * (input.entryPolicy.windowUnit === "hour" ? 3_600_000 : 86_400_000);
  const cutoff = new Date(admittedAt.getTime() - windowMilliseconds);
  const row = await trx.selectFrom(RUN_TABLE)
    .select(({ fn }) => fn.countAll<number>().as("entry_count"))
    .where("uid", "=", input.uid)
    .where("workflow_id", "=", input.workflowId)
    .where("subject_id", "=", input.subjectId)
    .where("create_time", ">=", cutoff)
    .executeTakeFirstOrThrow();
  return Number(row.entry_count) < input.entryPolicy.maxEntries;
}

async function findRunAndInitialTaskByEntryEvent(
  trx: RuntimeTransaction,
  uid: number,
  workflowId: string,
  entryEventId: string,
) {
  const runRow = await trx.selectFrom(RUN_TABLE).selectAll()
    .where("uid", "=", uid)
    .where("workflow_id", "=", workflowId)
    .where("entry_event_id", "=", entryEventId)
    .executeTakeFirst();
  if (!runRow) return null;
  const run = mapRun(runRow);
  const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
    .where("uid", "=", uid)
    .where("run_id", "=", run.id)
    .orderBy("sequence", "asc")
    .limit(1)
    .executeTakeFirst();
  if (!taskRow) throw new Error("Deduplicated workflow run has no initial task");
  return { run, task: mapTask(taskRow) };
}

function mapTask(row: Selectable<WorkflowTaskTable>): WorkflowTaskRecord {
  return {
    attempt: row.attempt,
    dueAt: row.due_at,
    id: normalizeId(row.id),
    leaseExpiresAt: row.lease_expires_at,
    leaseOwner: row.lease_owner,
    nodeId: row.node_id,
    nodeKind: parseNodeKind(row.node_kind),
    revision: row.revision,
    runId: normalizeId(row.run_id),
    sequence: row.sequence,
    shardId: row.shard_id,
    status: parseTaskStatus(row.status),
    taskType: row.task_type,
    taskVersion: row.task_version,
    uid: normalizeTenantId(row.uid),
    workflowId: normalizeId(row.workflow_id),
  };
}

function mapTriggerBinding(row: Record<string, unknown>): WorkflowTriggerBindingRecord {
  return {
    createdAt: toDate(row.create_time),
    eventType: parseEntryEventType(row.event_type),
    filter: parseJson(row.filter_spec_json) as WorkflowStartConfig,
    id: normalizeId(row.id),
    revision: Number(row.revision),
    status: Number(row.status) === 1 ? 1 : 0,
    uid: normalizeTenantId(row.uid),
    updatedAt: toDate(row.update_time),
    workflowId: normalizeId(row.workflow_id),
  };
}

function parseNodeKind(value: string): WorkflowNodeKind {
  if (["start", "wait", "branch", "message", "tag", "coupon", "handoff", "end"].includes(value)) {
    return value as WorkflowNodeKind;
  }
  throw new Error(`Unknown workflow node kind: ${value}`);
}

function parseRunStatus(value: string): WorkflowRunStatus {
  if (["queued", "running", "waiting", "completed", "failed", "cancelled"].includes(value)) {
    return value as WorkflowRunStatus;
  }
  throw new Error(`Unknown workflow run status: ${value}`);
}

function parseTaskStatus(value: string): WorkflowTaskStatus {
  if (["pending", "leased", "dispatched", "running", "completed", "cancelled", "dead"].includes(value)) {
    return value as WorkflowTaskStatus;
  }
  throw new Error(`Unknown workflow task status: ${value}`);
}

function parseRuntimeStatus(value: string): WorkflowRuntimeStatus {
  if (value === "inactive" || value === "active" || value === "paused" || value === "stopped") {
    return value;
  }
  throw new Error(`Unknown workflow runtime status: ${value}`);
}

function parseEntryEventType(value: unknown): WorkflowEntryEventType {
  if (value === "contact.friend_added" || value === "customer.tag_added" || value === "message.received") {
    return value;
  }
  throw new Error(`Unknown workflow entry event type: ${String(value)}`);
}

function floorToMinute(value: Date) {
  const result = new Date(value);
  result.setUTCSeconds(0, 0);
  return result;
}

function parseJson(value: unknown) {
  return (typeof value === "string" ? JSON.parse(value) : structuredClone(value)) as Record<string, unknown>;
}
function stringifyJson(value: unknown) { return JSON.stringify(value); }
function normalizeId(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  throw new Error("Database returned an invalid BIGINT identifier");
}
function normalizeTenantId(value: unknown) {
  const normalized = typeof value === "string" ? Number(value) : value;
  if (typeof normalized === "number" && Number.isSafeInteger(normalized) && normalized > 0) return normalized;
  throw new Error("Database returned an invalid tenant identifier");
}
function toDate(value: unknown) {
  if (value instanceof Date) return value;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Database returned an invalid DATETIME value");
  return date;
}
function isDuplicateEntryError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY";
}
