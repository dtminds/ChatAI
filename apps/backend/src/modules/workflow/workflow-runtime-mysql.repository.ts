import type {
  WorkflowNodeKind,
  WorkflowRunStatus,
  WorkflowTaskStatus,
} from "@chatai/contracts";
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
} from "./workflow-db.js";
import type {
  WorkflowCommitNodeResultInput,
  WorkflowCreateRunInput,
  WorkflowRunRecord,
  WorkflowRuntimeRepository,
  WorkflowTaskRecord,
} from "./workflow-runtime-types.js";

const RUN_TABLE = "xy_wap_embed_workflow_run" as const;
const TASK_TABLE = "xy_wap_embed_workflow_task" as const;
const EXECUTION_TABLE = "xy_wap_embed_workflow_node_execution" as const;
const OUTBOX_TABLE = "xy_wap_embed_workflow_outbox" as const;
const INBOX_TABLE = "xy_wap_embed_workflow_inbox" as const;
type RuntimeTransaction = Transaction<WorkflowDatabase>;

export class MysqlWorkflowRuntimeRepository implements WorkflowRuntimeRepository {
  constructor(private readonly db: Kysely<WorkflowDatabase>) {}

  async createRunWithInitialTask(input: WorkflowCreateRunInput) {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const definition = await trx.selectFrom("xy_wap_embed_workflow_definition")
          .select(["biz_status", "published_revision", "runtime_status"])
          .where("uid", "=", input.uid).where("id", "=", input.workflowId)
          .forUpdate().executeTakeFirst();
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

        const runInsert = await trx.insertInto(RUN_TABLE).values({
          completed_at: null,
          context_json: stringifyJson(input.context),
          current_node_id: input.initialNodeId,
          entry_event_id: input.entryEventId,
          lock_version: 1,
          next_execute_at: input.occurredAt,
          revision: input.revision,
          sequence: 1,
          shard_id: input.shardId,
          status: "queued",
          subject_id: input.subjectId,
          terminal_reason: null,
          uid: input.uid,
          workflow_id: input.workflowId,
        }).executeTakeFirstOrThrow();
        const runId = normalizeId(runInsert.insertId);
        const task = await insertTask(trx, {
          dueAt: input.occurredAt,
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
        await insertTaskOutbox(trx, task, input.occurredAt);
        return {
          deduplicated: false,
          kind: "success" as const,
          run: createRunRecord(runId, input),
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
        .forUpdate().executeTakeFirst();
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
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        status: "running",
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid).where("id", "=", input.taskId)
        .where("task_version", "=", input.expectedTaskVersion).executeTakeFirstOrThrow();
      return {
        kind: "success" as const,
        task: {
          ...task,
          leaseExpiresAt: input.leaseExpiresAt,
          leaseOwner: input.leaseOwner,
          status: "running" as const,
          taskVersion: task.taskVersion + 1,
        },
      };
    });
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
    const rows = await this.db.selectFrom(TASK_TABLE).select("id")
      .where("status", "=", "running").where("lease_expires_at", "<=", input.now)
      .orderBy("lease_expires_at", "asc").orderBy("id", "asc").limit(input.limit).execute();
    const taskIds = rows.map((row) => row.id);
    if (taskIds.length === 0) return 0;
    const update = await this.db.updateTable(TASK_TABLE).set({
      lease_expires_at: null,
      lease_owner: null,
      status: "pending",
      task_version: sql<number>`task_version + 1`,
    }).where("id", "in", taskIds).where("status", "=", "running")
      .where("lease_expires_at", "<=", input.now).executeTakeFirst();
    return Number(update.numUpdatedRows);
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
      await trx.updateTable(TASK_TABLE).set({ status: "cancelled", task_version: sql<number>`task_version + 1` })
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
  return trx.insertInto(OUTBOX_TABLE).values({
    aggregate_id: task.id,
    aggregate_type: "workflow_task",
    attempt: 0,
    event_type: "workflow.task.ready",
    next_attempt_at: now,
    payload_json: stringifyJson({ taskId: task.id, taskVersion: task.taskVersion, uid: String(task.uid) }),
    sent_at: null,
    status: "pending",
    uid: task.uid,
  }).executeTakeFirstOrThrow();
}

function createRunRecord(id: string, input: WorkflowCreateRunInput): WorkflowRunRecord {
  return {
    context: structuredClone(input.context),
    currentNodeId: input.initialNodeId,
    entryEventId: input.entryEventId,
    id,
    lockVersion: 1,
    nextExecuteAt: input.occurredAt,
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
    uid: row.uid,
    workflowId: normalizeId(row.workflow_id),
  };
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
    uid: row.uid,
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

function parseRuntimeStatus(value: string) {
  if (value === "inactive" || value === "active" || value === "paused" || value === "stopped") {
    return value;
  }
  throw new Error(`Unknown workflow runtime status: ${value}`);
}

function floorToMinute(value: Date) {
  const result = new Date(value);
  result.setUTCSeconds(0, 0);
  return result;
}

function parseJson(value: string) { return JSON.parse(value) as Record<string, unknown>; }
function stringifyJson(value: unknown) { return JSON.stringify(value); }
function normalizeId(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  throw new Error("Database returned an invalid BIGINT identifier");
}
function isDuplicateEntryError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY";
}
