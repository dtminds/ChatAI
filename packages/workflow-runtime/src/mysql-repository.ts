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
import { createNodeMetricDeltas, type WorkflowNodeMetricDelta } from "./node-metrics.js";
import type {
  DatabaseId,
  WorkflowDatabase,
  WorkflowRunTable,
  WorkflowTaskTable,
} from "./db.js";
import type {
  WorkflowActionExecutionFailureInput,
  WorkflowCommitNodeResultInput,
  WorkflowCreateRunInput,
  WorkflowOutboxRecord,
  WorkflowNodeMetricRecord,
  WorkflowNodeExecutionRecord,
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
const NODE_METRIC_EVENT_TABLE = "xy_wap_embed_workflow_node_metric_event" as const;
const NODE_METRIC_TABLE = "xy_wap_embed_workflow_node_metric" as const;
const ACTIVE_RUN_STATUSES = ["queued", "running", "waiting"] as const;
const ACTIVE_TASK_STATUSES = ["pending", "leased", "dispatched", "running"] as const;
const TERMINAL_RUN_STATUSES = ["cancelled", "completed", "failed"] as const;
const RUNTIME_STATE_INCONSISTENT = "WORKFLOW_RUNTIME_STATE_INCONSISTENT" as const;
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
        await insertNodeMetricEvents(trx, {
          eventKey: `${runId}:entered`,
          runId,
          runRevision: input.revision,
          runShardId: input.shardId,
          uid: input.uid,
          workflowId: input.workflowId,
        }, createNodeMetricDeltas({
          kind: "entered",
          nodeId: input.initialNodeId,
          nodeKind: input.initialNodeKind,
        }));
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
      const candidateRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.taskId)
        .executeTakeFirst();
      if (!candidateRow) return { kind: "not-found" as const };
      const candidate = mapTask(candidateRow);
      if ((candidate.status !== "pending" && candidate.status !== "dispatched")
        || candidate.taskVersion !== input.expectedTaskVersion) return { kind: "conflict" as const };

      const runRow = await trx.selectFrom(RUN_TABLE)
        .select(["current_node_id", "revision", "shard_id", "status", "workflow_id"])
        .where("uid", "=", input.uid)
        .where("id", "=", candidate.runId)
        .forUpdate()
        .executeTakeFirst();
      if (!runRow || !["queued", "running", "waiting"].includes(runRow.status)) {
        return { kind: "conflict" as const };
      }

      const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.taskId)
        .forUpdate().executeTakeFirst();
      if (!taskRow) return { kind: "not-found" as const };
      const task = mapTask(taskRow);
      if ((task.status !== "pending" && task.status !== "dispatched")
        || task.taskVersion !== input.expectedTaskVersion
        || task.runId !== candidate.runId) return { kind: "conflict" as const };

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
      if (runRow.current_node_id !== task.nodeId) {
        const previousTask = await trx.selectFrom(TASK_TABLE).select(["node_id", "node_kind"])
          .where("uid", "=", input.uid)
          .where("run_id", "=", task.runId)
          .where("sequence", "=", task.sequence - 1)
          .executeTakeFirst();
        if (previousTask) {
          await insertNodeMetricEvents(trx, {
            eventKey: `${task.runId}:${task.sequence}:activated`,
            runId: task.runId,
            runRevision: runRow.revision,
            runShardId: runRow.shard_id,
            uid: input.uid,
            workflowId: normalizeId(runRow.workflow_id),
          }, createNodeMetricDeltas({
            fromNodeId: previousTask.node_id,
            fromNodeKind: parseNodeKind(previousTask.node_kind),
            kind: "advanced",
            toNodeId: task.nodeId,
            toNodeKind: task.nodeKind,
          }));
          await trx.updateTable(RUN_TABLE).set({ current_node_id: task.nodeId })
            .where("uid", "=", input.uid)
            .where("id", "=", task.runId)
            .where("current_node_id", "=", runRow.current_node_id)
            .executeTakeFirst();
        }
      }
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

  async prepareActionExecution(
    input: Parameters<WorkflowRuntimeRepository["prepareActionExecution"]>[0],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const state = await lockActionExecutionState(trx, input);
      if (state.kind !== "success") return state;
      const { run, task } = state;
      const existingRow = await trx.selectFrom(EXECUTION_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("run_id", "=", input.runId)
        .where("sequence", "=", task.sequence)
        .forUpdate()
        .executeTakeFirst();
      if (existingRow) {
        const existing = mapNodeExecution(existingRow);
        if (existing.idempotencyKey !== input.idempotencyKey
          || existing.nodeId !== task.nodeId
          || existing.nodeKind !== task.nodeKind
          || existing.status === "completed"
          || existing.status === "failed") return { kind: "conflict" as const };
        await trx.updateTable(EXECUTION_TABLE).set({
          completed_at: null,
          error_code: null,
          error_message: null,
          failure_kind: null,
          status: "running",
        }).where("uid", "=", input.uid)
          .where("run_id", "=", input.runId)
          .where("sequence", "=", task.sequence)
          .where("idempotency_key", "=", input.idempotencyKey)
          .executeTakeFirstOrThrow();
        return {
          execution: {
            ...existing,
            errorCode: null,
            errorMessage: null,
            failureKind: null,
            status: "running" as const,
          },
          kind: "success" as const,
        };
      }
      await trx.insertInto(EXECUTION_TABLE).values({
        completed_at: null,
        error_code: null,
        error_message: null,
        failure_kind: null,
        idempotency_key: input.idempotencyKey,
        input_snapshot_json: stringifyJson(input.input),
        node_id: task.nodeId,
        node_kind: task.nodeKind,
        output_json: stringifyJson({}),
        run_id: run.id,
        sequence: task.sequence,
        started_at: input.now,
        status: "running",
        uid: input.uid,
      }).executeTakeFirstOrThrow();
      return {
        execution: {
          errorCode: null,
          errorMessage: null,
          failureKind: null,
          idempotencyKey: input.idempotencyKey,
          input: structuredClone(input.input),
          nodeId: task.nodeId,
          nodeKind: task.nodeKind,
          output: {},
          runId: run.id,
          sequence: task.sequence,
          status: "running" as const,
          uid: input.uid,
        },
        kind: "success" as const,
      };
    });
  }

  async scheduleActionRetry(
    input: Parameters<WorkflowRuntimeRepository["scheduleActionRetry"]>[0],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const state = await lockActionFailureState(trx, input);
      if (state.kind !== "success") return state;
      const { run, task } = state;
      await insertWorkflowInbox(trx, input.uid, input.inbox, input.now);
      await updateActionExecutionFailure(trx, input, "retrying");
      await trx.updateTable(TASK_TABLE).set({
        bucket_time: floorToMinute(input.dueAt),
        due_at: input.dueAt,
        last_error_code: input.errorCode,
        lease_expires_at: null,
        lease_owner: null,
        status: transitionTask(task.status, "pending"),
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid)
        .where("id", "=", task.id)
        .where("status", "=", "running")
        .where("task_version", "=", input.expectedTaskVersion)
        .executeTakeFirstOrThrow();
      await trx.updateTable(RUN_TABLE).set({
        lock_version: run.lockVersion + 1,
        next_execute_at: input.dueAt,
      }).where("uid", "=", input.uid)
        .where("id", "=", run.id)
        .where("lock_version", "=", input.expectedRunLockVersion)
        .where("status", "=", "running")
        .executeTakeFirstOrThrow();
      return {
        kind: "success" as const,
        task: {
          ...task,
          dueAt: input.dueAt,
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "pending" as const,
          taskVersion: task.taskVersion + 1,
        },
      };
    });
  }

  async failActionExecution(
    input: Parameters<WorkflowRuntimeRepository["failActionExecution"]>[0],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const state = await lockActionFailureState(trx, input);
      if (state.kind !== "success") return state;
      const { run, task } = state;
      await insertWorkflowInbox(trx, input.uid, input.inbox, input.now);
      await updateActionExecutionFailure(trx, input, "failed");
      await insertNodeMetricEvents(trx, {
        eventKey: `${run.id}:${task.id}:failed`,
        runId: run.id,
        runRevision: run.revision,
        runShardId: run.shardId,
        uid: input.uid,
        workflowId: run.workflowId,
      }, createNodeMetricDeltas({
        kind: "left-incomplete",
        nodeId: task.nodeId,
        nodeKind: task.nodeKind,
      }));
      await trx.updateTable(TASK_TABLE).set({
        last_error_code: input.errorCode,
        lease_expires_at: null,
        lease_owner: null,
        status: transitionTask(task.status, "dead"),
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid)
        .where("id", "=", task.id)
        .where("status", "=", "running")
        .where("task_version", "=", input.expectedTaskVersion)
        .executeTakeFirstOrThrow();
      const nextRun = {
        ...run,
        lockVersion: run.lockVersion + 1,
        nextExecuteAt: null,
        status: transitionRun(run.status, "failed"),
      };
      await trx.updateTable(RUN_TABLE).set({
        completed_at: input.now,
        lock_version: nextRun.lockVersion,
        next_execute_at: null,
        status: nextRun.status,
        terminal_reason: input.errorCode,
      }).where("uid", "=", input.uid)
        .where("id", "=", run.id)
        .where("lock_version", "=", input.expectedRunLockVersion)
        .where("status", "=", "running")
        .executeTakeFirstOrThrow();
      return {
        kind: "success" as const,
        run: nextRun,
        task: {
          ...task,
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "dead" as const,
          taskVersion: task.taskVersion + 1,
        },
      };
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
        .executeTakeFirst();
      if (!outboxRow) return false;
      const candidateTask = await trx.selectFrom(TASK_TABLE).select([
        "id", "node_id", "node_kind", "revision", "run_id", "shard_id", "task_version", "workflow_id",
      ])
        .where("uid", "=", outboxRow.uid)
        .where("id", "=", outboxRow.aggregate_id)
        .where("status", "=", "dispatched")
        .where("task_version", "=", outboxRow.task_version)
        .executeTakeFirst();
      const runRow = candidateTask
        ? await trx.selectFrom(RUN_TABLE)
            .select(["current_node_id", "revision", "shard_id", "workflow_id"])
            .where("uid", "=", outboxRow.uid)
            .where("id", "=", candidateTask.run_id)
            .forUpdate()
            .executeTakeFirst()
        : undefined;
      const taskRow = candidateTask
        ? await trx.selectFrom(TASK_TABLE).select([
            "id", "node_id", "node_kind", "revision", "run_id", "shard_id", "task_version", "workflow_id",
          ])
            .where("uid", "=", outboxRow.uid)
            .where("id", "=", outboxRow.aggregate_id)
            .where("run_id", "=", candidateTask.run_id)
            .where("status", "=", "dispatched")
            .where("task_version", "=", outboxRow.task_version)
            .forUpdate()
            .executeTakeFirst()
        : undefined;
      const lockedOutbox = await trx.selectFrom(OUTBOX_TABLE).select("id")
        .where("id", "=", input.id)
        .where("status", "=", "leased")
        .where("lease_owner", "=", input.leaseOwner)
        .forUpdate()
        .executeTakeFirst();
      if (!lockedOutbox) return false;
      await trx.updateTable(OUTBOX_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "dead",
      }).where("id", "=", input.id)
        .where("status", "=", "leased")
        .where("lease_owner", "=", input.leaseOwner)
        .executeTakeFirstOrThrow();
      if (taskRow) {
        const metricTask = runRow && runRow.current_node_id !== taskRow.node_id
          ? await trx.selectFrom(TASK_TABLE).select(["node_id", "node_kind"])
              .where("uid", "=", outboxRow.uid)
              .where("run_id", "=", taskRow.run_id)
              .where("node_id", "=", runRow.current_node_id)
              .orderBy("sequence", "desc")
              .limit(1)
              .executeTakeFirst()
          : taskRow;
        if (runRow && metricTask) {
          await insertNodeMetricEvents(trx, {
            eventKey: `${normalizeId(taskRow.run_id)}:${normalizeId(taskRow.id)}:failed`,
            runId: normalizeId(taskRow.run_id),
            runRevision: runRow.revision,
            runShardId: runRow.shard_id,
            uid: outboxRow.uid,
            workflowId: normalizeId(runRow.workflow_id),
          }, createNodeMetricDeltas({
            kind: "left-incomplete",
            nodeId: metricTask.node_id,
            nodeKind: parseNodeKind(metricTask.node_kind),
          }));
        }
        await trx.updateTable(TASK_TABLE).set({
          last_error_code: "WORKFLOW_OUTBOX_ATTEMPTS_EXHAUSTED",
          status: "dead",
          task_version: taskRow.task_version + 1,
        }).where("id", "=", taskRow.id)
          .where("status", "=", "dispatched")
          .where("task_version", "=", taskRow.task_version)
          .executeTakeFirstOrThrow();
        await trx.updateTable(RUN_TABLE).set({
          completed_at: input.failedAt,
          lock_version: sql<number>`lock_version + 1`,
          next_execute_at: null,
          status: "failed",
          terminal_reason: "WORKFLOW_OUTBOX_ATTEMPTS_EXHAUSTED",
        }).where("uid", "=", outboxRow.uid)
          .where("id", "=", taskRow.run_id)
          .where("status", "in", ["queued", "running", "waiting"])
          .executeTakeFirstOrThrow();
      }
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

      const failed = input.nodeExecution.errorCode !== undefined;
      if (failed && input.nextTask) return { kind: "conflict" as const };
      const now = new Date();
      const existingExecution = await trx.selectFrom(EXECUTION_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("run_id", "=", run.id)
        .where("sequence", "=", task.sequence)
        .forUpdate()
        .executeTakeFirst();
      if (existingExecution) {
        if (existingExecution.idempotency_key !== input.nodeExecution.idempotencyKey
          || existingExecution.status !== "running") return { kind: "conflict" as const };
        await trx.updateTable(EXECUTION_TABLE).set({
          completed_at: now,
          error_code: input.nodeExecution.errorCode ?? null,
          error_message: input.nodeExecution.errorMessage ?? null,
          failure_kind: null,
          output_json: stringifyJson(input.nodeExecution.output),
          status: failed ? "failed" : "completed",
        }).where("uid", "=", input.uid)
          .where("run_id", "=", run.id)
          .where("sequence", "=", task.sequence)
          .where("status", "=", "running")
          .executeTakeFirstOrThrow();
      } else {
        await trx.insertInto(EXECUTION_TABLE).values({
          completed_at: now,
          error_code: input.nodeExecution.errorCode ?? null,
          error_message: input.nodeExecution.errorMessage ?? null,
          failure_kind: null,
          idempotency_key: input.nodeExecution.idempotencyKey,
          input_snapshot_json: stringifyJson(input.nodeExecution.input),
          node_id: task.nodeId,
          node_kind: task.nodeKind,
          output_json: stringifyJson(input.nodeExecution.output),
          run_id: run.id,
          sequence: task.sequence,
          started_at: now,
          status: failed ? "failed" : "completed",
          uid: input.uid,
        }).executeTakeFirstOrThrow();
      }
      await trx.insertInto(INBOX_TABLE).values({
        consumer: input.inbox.consumer,
        expires_at: input.inbox.expiresAt,
        message_id: input.inbox.messageId,
        processed_at: now,
        uid: input.uid,
      }).executeTakeFirstOrThrow();
      await trx.updateTable(TASK_TABLE).set({
        last_error_code: input.nodeExecution.errorCode ?? null,
        lease_expires_at: null,
        lease_owner: null,
        status: transitionTask(task.status, failed ? "dead" : "completed"),
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid).where("id", "=", task.id)
        .where("task_version", "=", task.taskVersion).where("status", "=", "running")
        .executeTakeFirstOrThrow();

      const nextSequence = run.sequence + 1;
      let nextTask: WorkflowTaskRecord | null = null;
      if (!failed && input.nextTask) {
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
        context: !failed && input.context ? structuredClone(input.context) : run.context,
        currentNodeId: !failed && input.nextTask && input.nextTask.taskType !== "wait"
          ? input.nextTask.nodeId
          : run.currentNodeId,
        lockVersion: run.lockVersion + 1,
        nextExecuteAt: !failed ? input.nextTask?.dueAt ?? null : null,
        sequence: !failed && input.nextTask ? nextSequence : run.sequence,
        status: transitionRun(
          run.status,
          failed
            ? "failed"
            : input.nextTask
              ? input.nextTask.taskType === "wait" ? "waiting" : "running"
              : "completed",
        ),
      };
      await trx.updateTable(RUN_TABLE).set({
        completed_at: nextRun.status === "completed" || nextRun.status === "failed" ? now : null,
        context_json: stringifyJson(nextRun.context),
        current_node_id: nextRun.currentNodeId,
        lock_version: nextRun.lockVersion,
        next_execute_at: nextRun.nextExecuteAt,
        sequence: nextRun.sequence,
        status: nextRun.status,
        terminal_reason: input.nodeExecution.errorCode ?? null,
      }).where("uid", "=", input.uid).where("id", "=", run.id)
        .where("lock_version", "=", run.lockVersion).executeTakeFirstOrThrow();
      if (failed) {
        await insertNodeMetricEvents(trx, {
          eventKey: `${run.id}:${task.sequence}:failed`,
          runId: run.id,
          runRevision: run.revision,
          runShardId: run.shardId,
          uid: input.uid,
          workflowId: run.workflowId,
        }, createNodeMetricDeltas({
          kind: "left-incomplete",
          nodeId: task.nodeId,
          nodeKind: task.nodeKind,
        }));
      } else if (input.nextTask && input.nextTask.taskType !== "wait") {
        await insertNodeMetricEvents(trx, {
          eventKey: `${run.id}:${task.sequence}:advanced`,
          runId: run.id,
          runRevision: run.revision,
          runShardId: run.shardId,
          uid: input.uid,
          workflowId: run.workflowId,
        }, createNodeMetricDeltas({
          fromNodeId: task.nodeId,
          fromNodeKind: task.nodeKind,
          kind: "advanced",
          toNodeId: input.nextTask.nodeId,
          toNodeKind: input.nextTask.nodeKind,
        }));
      } else if (!input.nextTask) {
        await insertNodeMetricEvents(trx, {
          eventKey: `${run.id}:${task.sequence}:completed`,
          runId: run.id,
          runRevision: run.revision,
          runShardId: run.shardId,
          uid: input.uid,
          workflowId: run.workflowId,
        }, createNodeMetricDeltas({
          kind: "completed",
          nodeId: task.nodeId,
          nodeKind: task.nodeKind,
        }));
      }
      return { kind: "success" as const, nextTask, run: nextRun };
    });
  }

  async recoverExpiredLeases(input: Parameters<WorkflowRuntimeRepository["recoverExpiredLeases"]>[0]) {
    if (input.limit <= 0) return { dead: 0, recovered: 0 };
    return this.db.transaction().execute(async (trx) => {
      const candidateRows = await trx.selectFrom(TASK_TABLE).select([
        "attempt", "id", "node_id", "node_kind", "revision", "run_id", "shard_id", "uid", "workflow_id",
      ])
        .where("status", "=", "running").where("lease_expires_at", "<=", input.now)
        .orderBy("lease_expires_at", "asc").orderBy("id", "asc").limit(input.limit)
        .execute();
      if (candidateRows.length === 0) return { dead: 0, recovered: 0 };
      const runIds = [...new Set(candidateRows.map(row => row.run_id))];
      await trx.selectFrom(RUN_TABLE).select("id")
        .where("id", "in", runIds)
        .orderBy("id", "asc")
        .forUpdate()
        .execute();
      const rows = await trx.selectFrom(TASK_TABLE).select([
        "attempt", "id", "node_id", "node_kind", "revision", "run_id", "sequence", "shard_id", "uid", "workflow_id",
      ])
        .where("id", "in", candidateRows.map(row => row.id))
        .where("status", "=", "running").where("lease_expires_at", "<=", input.now)
        .orderBy("lease_expires_at", "asc").orderBy("id", "asc")
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
        for (const row of deadRows) {
          await trx.updateTable(EXECUTION_TABLE).set({
            completed_at: input.now,
            error_code: "WORKFLOW_TASK_ATTEMPTS_EXHAUSTED",
            error_message: "Workflow Task attempts exhausted",
            failure_kind: null,
            status: "failed",
          }).where("uid", "=", row.uid)
            .where("run_id", "=", row.run_id)
            .where("sequence", "=", row.sequence)
            .where("status", "=", "running")
            .executeTakeFirst();
          await insertNodeMetricEvents(trx, {
            eventKey: `${normalizeId(row.run_id)}:${normalizeId(row.id)}:failed`,
            runId: normalizeId(row.run_id),
            runRevision: row.revision,
            runShardId: row.shard_id,
            uid: normalizeTenantId(row.uid),
            workflowId: normalizeId(row.workflow_id),
          }, createNodeMetricDeltas({
            kind: "left-incomplete",
            nodeId: row.node_id,
            nodeKind: parseNodeKind(row.node_kind),
          }));
        }
        await trx.updateTable(TASK_TABLE).set({
          last_error_code: "WORKFLOW_TASK_ATTEMPTS_EXHAUSTED",
          lease_expires_at: null,
          lease_owner: null,
          status: "dead",
          task_version: sql<number>`task_version + 1`,
        }).where("id", "in", deadIds).where("status", "=", "running")
          .where("lease_expires_at", "<=", input.now).executeTakeFirstOrThrow();
        const deadRunIds = [...new Set(deadRows.map(row => row.run_id))];
        await trx.updateTable(RUN_TABLE).set({
          completed_at: input.now,
          lock_version: sql<number>`lock_version + 1`,
          next_execute_at: null,
          status: "failed",
          terminal_reason: "WORKFLOW_TASK_ATTEMPTS_EXHAUSTED",
        }).where("id", "in", deadRunIds)
          .where("status", "in", ["queued", "running", "waiting"])
          .executeTakeFirstOrThrow();
      }
      return { dead: deadIds.length, recovered: recoverableIds.length };
    });
  }

  async reconcileRunTaskConsistency(
    input: Parameters<WorkflowRuntimeRepository["reconcileRunTaskConsistency"]>[0],
  ) {
    const limit = Math.max(0, input.limit);
    if (limit === 0) return emptyRunTaskConsistencyResult();

    const runResult = await this.db.transaction().execute(async (trx) => {
      let runQuery = trx.selectFrom(RUN_TABLE).select([
        "current_node_id",
        "id",
        "lock_version",
        "next_execute_at",
        "revision",
        "sequence",
        "shard_id",
        "status",
        "uid",
        "update_time",
        "workflow_id",
      ])
        .where("status", "in", ACTIVE_RUN_STATUSES)
        .orderBy("id", "asc")
        .limit(limit + 1)
        .forUpdate()
        .skipLocked();
      if (input.afterRunId) runQuery = runQuery.where("id", ">", input.afterRunId);
      const candidateRuns = await runQuery.execute();
      const runs = candidateRuns.slice(0, limit);
      const runIds = runs.map(run => run.id);
      const taskRows = runIds.length === 0
        ? []
        : await trx.selectFrom(TASK_TABLE).selectAll()
            .where("run_id", "in", runIds)
            .where("status", "in", ACTIVE_TASK_STATUSES)
            .orderBy("run_id", "asc")
            .orderBy("sequence", "asc")
            .orderBy("id", "asc")
            .forUpdate()
            .execute();
      const tasks = taskRows.map(mapTask);
      const taskIdsToCancel = new Set<string>();
      const runsToFail: typeof runs = [];
      const definitionKeys = new Map<string, { uid: number; workflowIds: Array<string | number | bigint> }>();
      for (const run of runs) {
        const uid = normalizeTenantId(run.uid);
        const key = String(uid);
        const group = definitionKeys.get(key) ?? { uid, workflowIds: [] };
        group.workflowIds.push(run.workflow_id);
        definitionKeys.set(key, group);
      }
      const definitions = definitionKeys.size === 0
        ? []
        : await trx.selectFrom("xy_wap_embed_workflow_definition")
            .select(["biz_status", "id", "runtime_status", "uid"])
            .where(eb => eb.or([...definitionKeys.values()].map(group => eb.and([
              eb("uid", "=", group.uid),
              eb("id", "in", group.workflowIds),
            ]))))
            .forShare()
            .execute();
      const definitionByKey = new Map(definitions.map(definition => [
        `${normalizeTenantId(definition.uid)}:${normalizeId(definition.id)}`,
        definition,
      ]));

      for (const run of runs) {
        const definition = definitionByKey.get(
          `${normalizeTenantId(run.uid)}:${normalizeId(run.workflow_id)}`,
        );
        const boundaryDecision = definition
          ? getWorkflowExecutionBoundaryDecision({
              bizStatus: definition.biz_status === 1 ? 1 : 0,
              runtimeStatus: parseRuntimeStatus(definition.runtime_status),
            })
          : "cancel";
        if (boundaryDecision === "cancel") continue;

        const runId = normalizeId(run.id);
        const runTasks = tasks.filter(task => task.runId === runId);
        const authoritativeTask = runTasks.find(task => task.sequence === run.sequence);
        for (const task of runTasks) {
          if (task !== authoritativeTask) taskIdsToCancel.add(task.id);
        }
        const invalidAuthoritativeTask = !authoritativeTask
          || authoritativeTask.uid !== normalizeTenantId(run.uid)
          || authoritativeTask.workflowId !== normalizeId(run.workflow_id)
          || authoritativeTask.revision !== run.revision
          || authoritativeTask.shardId !== run.shard_id
          || (run.status !== "waiting" && authoritativeTask.nodeId !== run.current_node_id)
          || (run.status === "waiting" && (
            authoritativeTask.taskType !== "wait"
            || !sameTimestamp(authoritativeTask.dueAt, run.next_execute_at)
          ));
        if (!invalidAuthoritativeTask || toDate(run.update_time) > input.inconsistentBefore) continue;
        runsToFail.push(run);
        for (const task of runTasks) taskIdsToCancel.add(task.id);
      }

      const waitingRuns = runsToFail.filter(run => run.status === "waiting");
      const completedWaitTasks = waitingRuns.length === 0
        ? []
        : await trx.selectFrom(TASK_TABLE).select(["node_id", "node_kind", "run_id", "sequence"])
            .where(eb => eb.or(waitingRuns.map(run => eb.and([
              eb("uid", "=", normalizeTenantId(run.uid)),
              eb("run_id", "=", run.id),
              eb("sequence", "=", run.sequence - 1),
              eb("node_id", "=", run.current_node_id),
            ]))))
            .where("status", "=", "completed")
            .where("node_kind", "=", "wait")
            .execute();
      const completedWaitTaskByRunId = new Map(completedWaitTasks.map(task => [
        normalizeId(task.run_id),
        { nodeId: task.node_id, nodeKind: parseNodeKind(task.node_kind) },
      ]));
      for (const run of runsToFail) {
        const runId = normalizeId(run.id);
        const runTasks = tasks.filter(task => task.runId === runId);
        const activeMetricTask = runTasks.find(task => task.nodeId === run.current_node_id);
        const metricTask = activeMetricTask
          ? { nodeId: activeMetricTask.nodeId, nodeKind: activeMetricTask.nodeKind }
          : completedWaitTaskByRunId.get(runId);
        if (!metricTask) continue;
        await insertNodeMetricEvents(trx, {
          eventKey: `${runId}:runtime-state-inconsistent`,
          runId,
          runRevision: run.revision,
          runShardId: run.shard_id,
          uid: normalizeTenantId(run.uid),
          workflowId: normalizeId(run.workflow_id),
        }, createNodeMetricDeltas({
          kind: "left-incomplete",
          nodeId: metricTask.nodeId,
          nodeKind: metricTask.nodeKind,
        }));
      }

      let staleTasksCancelled = 0;
      if (taskIdsToCancel.size > 0) {
        const update = await trx.updateTable(TASK_TABLE).set({
          last_error_code: RUNTIME_STATE_INCONSISTENT,
          lease_expires_at: null,
          lease_owner: null,
          status: "cancelled",
          task_version: sql<number>`task_version + 1`,
        }).where("id", "in", [...taskIdsToCancel])
          .where("status", "in", ACTIVE_TASK_STATUSES)
          .executeTakeFirst();
        staleTasksCancelled = Number(update.numUpdatedRows);
      }

      let inconsistentRunsFailed = 0;
      if (runsToFail.length > 0) {
        const update = await trx.updateTable(RUN_TABLE).set({
          completed_at: input.now,
          lock_version: sql<number>`lock_version + 1`,
          next_execute_at: null,
          status: "failed",
          terminal_reason: RUNTIME_STATE_INCONSISTENT,
        }).where("id", "in", runsToFail.map(run => run.id))
          .where("status", "in", ACTIVE_RUN_STATUSES)
          .where("update_time", "<=", input.inconsistentBefore)
          .executeTakeFirst();
        inconsistentRunsFailed = Number(update.numUpdatedRows);
      }

      return {
        hasMoreRuns: candidateRuns.length > runs.length,
        inconsistentRunsFailed,
        lastRunId: runs.length > 0 ? normalizeId(runs.at(-1)!.id) : null,
        runsChecked: runs.length,
        staleTasksCancelled,
      };
    });

    let taskQuery = this.db.selectFrom(TASK_TABLE).select(["id", "run_id"])
      .where("status", "in", ACTIVE_TASK_STATUSES)
      .orderBy("id", "asc")
      .limit(limit + 1);
    if (input.afterTaskId) taskQuery = taskQuery.where("id", ">", input.afterTaskId);
    const candidateTasks = await taskQuery.execute();
    const selectedTaskCandidates = candidateTasks.slice(0, limit);

    const taskResult = await this.db.transaction().execute(async (trx) => {
      const candidateRunIds = [...new Set(selectedTaskCandidates.map(task => task.run_id))];
      const runs = candidateRunIds.length === 0
        ? []
        : await trx.selectFrom(RUN_TABLE).select(["id", "status"])
            .where("id", "in", candidateRunIds)
            .orderBy("id", "asc")
            .forUpdate()
            .execute();
      const runStatusById = new Map(runs.map(run => [normalizeId(run.id), parseRunStatus(run.status)]));
      const candidateTaskIds = selectedTaskCandidates.map(task => task.id);
      const tasks = candidateTaskIds.length === 0
        ? []
        : await trx.selectFrom(TASK_TABLE).select(["id", "run_id"])
            .where("id", "in", candidateTaskIds)
            .where("status", "in", ACTIVE_TASK_STATUSES)
            .orderBy("id", "asc")
            .forUpdate()
            .execute();
      const terminalTaskIds = tasks.filter(task => {
        const runStatus = runStatusById.get(normalizeId(task.run_id));
        return !runStatus || !isActiveRunStatus(runStatus);
      }).map(task => task.id);
      if (terminalTaskIds.length === 0) return { terminalRunTasksCancelled: 0 };
      const update = await trx.updateTable(TASK_TABLE).set({
        last_error_code: RUNTIME_STATE_INCONSISTENT,
        lease_expires_at: null,
        lease_owner: null,
        status: "cancelled",
        task_version: sql<number>`task_version + 1`,
      }).where("id", "in", terminalTaskIds)
        .where("status", "in", ACTIVE_TASK_STATUSES)
        .executeTakeFirst();
      return { terminalRunTasksCancelled: Number(update.numUpdatedRows) };
    });

    return {
      ...runResult,
      hasMoreTasks: candidateTasks.length > selectedTaskCandidates.length,
      lastTaskId: selectedTaskCandidates.length > 0
        ? normalizeId(selectedTaskCandidates.at(-1)!.id)
        : null,
      tasksChecked: selectedTaskCandidates.length,
      ...taskResult,
    };
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

  async cleanupWorkflowHistory(
    input: Parameters<WorkflowRuntimeRepository["cleanupWorkflowHistory"]>[0],
  ) {
    if (input.limit <= 0) return emptyHistoryCleanupResult();
    const technical = await this.db.transaction().execute(async (trx) => {
      const runs = await trx.selectFrom(RUN_TABLE).select("id")
        .where("status", "in", TERMINAL_RUN_STATUSES)
        .where("completed_at", "is not", null)
        .where("completed_at", "<", input.taskOutboxBefore)
        .where(({ exists, selectFrom }) => exists(
          selectFrom(`${TASK_TABLE} as cleanup_task`)
            .select("cleanup_task.id")
            .whereRef("cleanup_task.run_id", "=", `${RUN_TABLE}.id`),
        ))
        .orderBy("completed_at", "asc")
        .orderBy("id", "asc")
        .limit(input.limit + 1)
        .forUpdate()
        .skipLocked()
        .execute();
      const selectedRuns = runs.slice(0, input.limit);
      const runIds = selectedRuns.map(run => run.id);
      if (runIds.length === 0) return { hasMore: false, outboxDeleted: 0, tasksDeleted: 0 };
      const tasks = await trx.selectFrom(TASK_TABLE).select(["id", "run_id"])
        .where("run_id", "in", runIds)
        .orderBy("id", "asc")
        .forUpdate()
        .execute();
      const taskIds = tasks.map(task => task.id);
      const taskOutbox = taskIds.length === 0 ? [] : await trx.selectFrom(OUTBOX_TABLE)
        .select(["aggregate_id", "status"])
        .where("aggregate_type", "=", "workflow_task")
        .where("aggregate_id", "in", taskIds)
        .orderBy("id", "asc")
        .forUpdate()
        .execute();
      const leasedTaskIds = new Set(taskOutbox
        .filter(item => item.status === "leased")
        .map(item => normalizeId(item.aggregate_id)));
      const blockedRunIds = new Set(tasks
        .filter(task => leasedTaskIds.has(normalizeId(task.id)))
        .map(task => normalizeId(task.run_id)));
      const deletableTaskIds = tasks
        .filter(task => !blockedRunIds.has(normalizeId(task.run_id)))
        .map(task => task.id);
      const outboxDeleted = deletableTaskIds.length === 0 ? 0 : Number((await trx.deleteFrom(OUTBOX_TABLE)
        .where("aggregate_type", "=", "workflow_task")
        .where("aggregate_id", "in", deletableTaskIds)
        .executeTakeFirst()).numDeletedRows);
      const tasksDeleted = deletableTaskIds.length === 0 ? 0 : Number((await trx.deleteFrom(TASK_TABLE)
        .where("id", "in", deletableTaskIds)
        .executeTakeFirst()).numDeletedRows);
      return {
        hasMore: blockedRunIds.size > 0 || runs.length > selectedRuns.length,
        outboxDeleted,
        tasksDeleted,
      };
    });
    const userVisible = await this.db.transaction().execute(async (trx) => {
      const runs = await trx.selectFrom(RUN_TABLE).select("id")
        .where("status", "in", TERMINAL_RUN_STATUSES)
        .where("completed_at", "is not", null)
        .where("completed_at", "<", input.runBefore)
        .orderBy("completed_at", "asc")
        .orderBy("id", "asc")
        .limit(input.limit + 1)
        .forUpdate()
        .skipLocked()
        .execute();
      const selectedRuns = runs.slice(0, input.limit);
      if (selectedRuns.length === 0) {
        return { hasMore: false, nodeExecutionsDeleted: 0, runsDeleted: 0 };
      }
      const runIds = selectedRuns.map(run => run.id);
      const remainingTasks = await trx.selectFrom(TASK_TABLE).select("run_id")
        .where("run_id", "in", runIds)
        .execute();
      const blockedRunIds = new Set(remainingTasks.map(task => normalizeId(task.run_id)));
      const deletableRunIds = runIds.filter(runId => !blockedRunIds.has(normalizeId(runId)));
      if (deletableRunIds.length === 0) {
        return {
          hasMore: blockedRunIds.size > 0 || runs.length > selectedRuns.length,
          nodeExecutionsDeleted: 0,
          runsDeleted: 0,
        };
      }
      const nodeExecutionsDeleted = Number((await trx.deleteFrom(EXECUTION_TABLE)
        .where("run_id", "in", deletableRunIds)
        .executeTakeFirst()).numDeletedRows);
      const runsDeleted = Number((await trx.deleteFrom(RUN_TABLE)
        .where("id", "in", deletableRunIds)
        .where("status", "in", TERMINAL_RUN_STATUSES)
        .where("completed_at", "is not", null)
        .where("completed_at", "<", input.runBefore)
        .executeTakeFirst()).numDeletedRows);
      return {
        hasMore: blockedRunIds.size > 0 || runs.length > selectedRuns.length,
        nodeExecutionsDeleted,
        runsDeleted,
      };
    });
    return {
      hasMore: technical.hasMore || userVisible.hasMore,
      nodeExecutionsDeleted: userVisible.nodeExecutionsDeleted,
      outboxDeleted: technical.outboxDeleted,
      runsDeleted: userVisible.runsDeleted,
      tasksDeleted: technical.tasksDeleted,
    };
  }

  async aggregateNodeMetricEvents(
    input: Parameters<WorkflowRuntimeRepository["aggregateNodeMetricEvents"]>[0],
  ) {
    if (input.limit <= 0) return 0;
    return this.db.transaction().execute(async (trx) => {
      const events = await trx.selectFrom(NODE_METRIC_EVENT_TABLE).selectAll()
        .where("processed_at", "is", null)
        .orderBy("id", "asc")
        .limit(input.limit)
        .forUpdate()
        .skipLocked()
        .execute();
      if (events.length === 0) return 0;
      const aggregated = new Map<string, {
        completed: number;
        current: number;
        entered: number;
        nodeId: string;
        passed: number;
        revision: number;
        shardId: number;
        uid: number;
        workflowId: string;
      }>();
      for (const event of events) {
        const key = `${event.uid}:${event.workflow_id}:${event.revision}:${event.node_id}:${event.shard_id}`;
        const current = aggregated.get(key) ?? {
          completed: 0,
          current: 0,
          entered: 0,
          nodeId: event.node_id,
          passed: 0,
          revision: event.revision,
          shardId: event.shard_id,
          uid: event.uid,
          workflowId: normalizeId(event.workflow_id),
        };
        current.completed += Number(event.completed_delta);
        current.current += Number(event.current_delta);
        current.entered += Number(event.entered_delta);
        current.passed += Number(event.passed_delta);
        aggregated.set(key, current);
      }
      for (const metric of aggregated.values()) {
        await trx.insertInto(NODE_METRIC_TABLE).values({
          completed_count: metric.completed,
          current_count: Math.max(0, metric.current),
          entered_count: metric.entered,
          node_id: metric.nodeId,
          passed_count: metric.passed,
          revision: metric.revision,
          shard_id: metric.shardId,
          uid: metric.uid,
          workflow_id: metric.workflowId,
        }).onDuplicateKeyUpdate({
          completed_count: sql<number>`completed_count + ${metric.completed}`,
          current_count: sql<number>`GREATEST(0, CAST(current_count AS SIGNED) + ${metric.current})`,
          entered_count: sql<number>`entered_count + ${metric.entered}`,
          passed_count: sql<number>`passed_count + ${metric.passed}`,
        }).executeTakeFirstOrThrow();
      }
      const processedAt = new Date();
      await trx.updateTable(NODE_METRIC_EVENT_TABLE).set({ processed_at: processedAt })
        .where("id", "in", events.map(event => event.id))
        .where("processed_at", "is", null)
        .executeTakeFirstOrThrow();
      return events.length;
    });
  }

  async cleanupProcessedNodeMetricEvents(
    input: Parameters<WorkflowRuntimeRepository["cleanupProcessedNodeMetricEvents"]>[0],
  ) {
    if (input.limit <= 0) return 0;
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(NODE_METRIC_EVENT_TABLE).select("id")
        .where("processed_at", "is not", null)
        .where("processed_at", "<=", input.processedBefore)
        .orderBy("processed_at", "asc")
        .orderBy("id", "asc")
        .limit(input.limit)
        .forUpdate()
        .skipLocked()
        .execute();
      if (rows.length === 0) return 0;
      const result = await trx.deleteFrom(NODE_METRIC_EVENT_TABLE)
        .where("id", "in", rows.map(row => row.id))
        .where("processed_at", "is not", null)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    });
  }

  async listNodeMetrics(uid: number, workflowId: string, revision: number) {
    const rows = await this.db.selectFrom(NODE_METRIC_TABLE).selectAll()
      .where("uid", "=", uid)
      .where("workflow_id", "=", workflowId)
      .where("revision", "=", revision)
      .execute();
    return rows.map(row => ({
      completed: Number(row.completed_count),
      current: Number(row.current_count),
      entered: Number(row.entered_count),
      nodeId: row.node_id,
      passed: Number(row.passed_count),
      revision: row.revision,
      shardId: row.shard_id,
      uid: normalizeTenantId(row.uid),
      updatedAt: toDate(row.update_time),
      workflowId: normalizeId(row.workflow_id),
    } satisfies WorkflowNodeMetricRecord));
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
      let query = trx.selectFrom(RUN_TABLE).select(["current_node_id", "id", "revision", "shard_id", "workflow_id"])
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

      const now = new Date();
      const runUpdate = await trx.updateTable(RUN_TABLE).set({
        completed_at: now,
        lock_version: sql<number>`lock_version + 1`,
        next_execute_at: null,
        status: "cancelled",
        terminal_reason: "workflow_stopped",
      }).where("uid", "=", input.uid).where("id", "in", runIds)
        .where("status", "in", ["queued", "running", "waiting"])
        .executeTakeFirst();
      const runTasks = await trx.selectFrom(TASK_TABLE).select(["node_id", "node_kind", "run_id", "sequence"])
        .where("uid", "=", input.uid).where("run_id", "in", runIds)
        .orderBy("sequence", "desc")
        .execute();
      for (const run of selectedRows) {
        const task = runTasks.find(item => normalizeId(item.run_id) === normalizeId(run.id)
          && item.node_id === run.current_node_id);
        if (!task) continue;
        await insertNodeMetricEvents(trx, {
          eventKey: `${normalizeId(run.id)}:cancelled`,
          runId: normalizeId(run.id),
          runRevision: run.revision,
          runShardId: run.shard_id,
          uid: input.uid,
          workflowId: normalizeId(run.workflow_id),
        }, createNodeMetricDeltas({
          kind: "left-incomplete",
          nodeId: task.node_id,
          nodeKind: parseNodeKind(task.node_kind),
        }));
      }
      await trx.updateTable(TASK_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "cancelled",
        task_version: sql<number>`task_version + 1`,
      })
        .where("uid", "=", input.uid).where("run_id", "in", runIds)
        .where("status", "in", ["pending", "leased", "dispatched", "running"])
        .executeTakeFirst();
      await failRunningNodeExecutions(trx, runIds, now, "WORKFLOW_RUN_CANCELLED", "Workflow run was cancelled");
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
        .select(["run.current_node_id", "run.id", "run.revision", "run.shard_id", "run.uid", "run.workflow_id"])
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
      const runTasks = await trx.selectFrom(TASK_TABLE).select(["node_id", "node_kind", "run_id", "sequence"])
        .where("run_id", "in", runIds)
        .orderBy("sequence", "desc")
        .execute();
      for (const run of selected) {
        const task = runTasks.find(item => normalizeId(item.run_id) === normalizeId(run.id)
          && item.node_id === run.current_node_id);
        if (!task) continue;
        await insertNodeMetricEvents(trx, {
          eventKey: `${normalizeId(run.id)}:cancelled`,
          runId: normalizeId(run.id),
          runRevision: run.revision,
          runShardId: run.shard_id,
          uid: normalizeTenantId(run.uid),
          workflowId: normalizeId(run.workflow_id),
        }, createNodeMetricDeltas({
          kind: "left-incomplete",
          nodeId: task.node_id,
          nodeKind: parseNodeKind(task.node_kind),
        }));
      }
      await trx.updateTable(TASK_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "cancelled",
        task_version: sql<number>`task_version + 1`,
      }).where("run_id", "in", runIds)
        .where("status", "in", ["pending", "leased", "dispatched", "running"])
        .executeTakeFirst();
      await failRunningNodeExecutions(trx, runIds, now, "WORKFLOW_RUN_CANCELLED", "Workflow run was cancelled");
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

async function insertNodeMetricEvents(
  trx: RuntimeTransaction,
  context: {
    eventKey: string;
    runId: string;
    runRevision: number;
    runShardId: number;
    uid: number;
    workflowId: string;
  },
  deltas: WorkflowNodeMetricDelta[],
) {
  if (deltas.length === 0) return;
  await trx.insertInto(NODE_METRIC_EVENT_TABLE).values(deltas.map(delta => ({
    completed_delta: delta.completed,
    current_delta: delta.current,
    entered_delta: delta.entered,
    event_key: `${context.eventKey}:${delta.nodeId}`,
    node_id: delta.nodeId,
    passed_delta: delta.passed,
    processed_at: null,
    revision: context.runRevision,
    run_id: context.runId,
    shard_id: context.runShardId % 16,
    uid: context.uid,
    workflow_id: context.workflowId,
  }))).onDuplicateKeyUpdate({
    event_key: sql<string>`event_key`,
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

function emptyRunTaskConsistencyResult() {
  return {
    hasMoreRuns: false,
    hasMoreTasks: false,
    inconsistentRunsFailed: 0,
    lastRunId: null,
    lastTaskId: null,
    runsChecked: 0,
    staleTasksCancelled: 0,
    tasksChecked: 0,
    terminalRunTasksCancelled: 0,
  };
}

function emptyHistoryCleanupResult() {
  return {
    hasMore: false,
    nodeExecutionsDeleted: 0,
    outboxDeleted: 0,
    runsDeleted: 0,
    tasksDeleted: 0,
  };
}

function sameTimestamp(first: Date, second: Date | null) {
  return second !== null && toDate(first).getTime() === toDate(second).getTime();
}

function isActiveRunStatus(status: WorkflowRunStatus) {
  return status === "queued" || status === "running" || status === "waiting";
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

function mapNodeExecution(row: Selectable<WorkflowDatabase[typeof EXECUTION_TABLE]>): WorkflowNodeExecutionRecord {
  return {
    errorCode: row.error_code,
    errorMessage: row.error_message,
    failureKind: parseActionFailureKind(row.failure_kind),
    idempotencyKey: row.idempotency_key,
    input: row.input_snapshot_json ? parseJson(row.input_snapshot_json) : {},
    nodeId: row.node_id,
    nodeKind: parseNodeKind(row.node_kind),
    output: row.output_json ? parseJson(row.output_json) : {},
    runId: normalizeId(row.run_id),
    sequence: row.sequence,
    status: parseNodeExecutionStatus(row.status),
    uid: normalizeTenantId(row.uid),
  };
}

async function lockActionExecutionState(
  trx: RuntimeTransaction,
  input: {
    expectedRunLockVersion: number;
    expectedTaskVersion: number;
    runId: string;
    taskId: string;
    uid: number;
  },
): Promise<
  | { kind: "conflict" | "not-found" }
  | { kind: "success"; run: WorkflowRunRecord; task: WorkflowTaskRecord }
> {
  const runRow = await trx.selectFrom(RUN_TABLE).selectAll()
    .where("uid", "=", input.uid)
    .where("id", "=", input.runId)
    .forUpdate()
    .executeTakeFirst();
  if (!runRow) return { kind: "not-found" as const };
  const run = mapRun(runRow);
  if (run.lockVersion !== input.expectedRunLockVersion || run.status !== "running") {
    return { kind: "conflict" as const };
  }
  const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
    .where("uid", "=", input.uid)
    .where("id", "=", input.taskId)
    .forUpdate()
    .executeTakeFirst();
  if (!taskRow || normalizeId(taskRow.run_id) !== input.runId) return { kind: "not-found" as const };
  const task = mapTask(taskRow);
  if (task.taskVersion !== input.expectedTaskVersion || task.status !== "running") {
    return { kind: "conflict" as const };
  }
  return { kind: "success", run, task };
}

async function lockActionFailureState(
  trx: RuntimeTransaction,
  input: WorkflowActionExecutionFailureInput,
): Promise<
  | { kind: "already-processed" | "conflict" | "not-found" }
  | {
      execution: WorkflowNodeExecutionRecord;
      kind: "success";
      run: WorkflowRunRecord;
      task: WorkflowTaskRecord;
    }
> {
  const processed = await trx.selectFrom(INBOX_TABLE).select("id")
    .where("consumer", "=", input.inbox.consumer)
    .where("message_id", "=", input.inbox.messageId)
    .executeTakeFirst();
  if (processed) return { kind: "already-processed" as const };
  const state = await lockActionExecutionState(trx, input);
  if (state.kind !== "success") return state;
  const executionRow = await trx.selectFrom(EXECUTION_TABLE).selectAll()
    .where("uid", "=", input.uid)
    .where("run_id", "=", input.runId)
    .where("sequence", "=", state.task.sequence)
    .where("idempotency_key", "=", input.idempotencyKey)
    .forUpdate()
    .executeTakeFirst();
  if (!executionRow) return { kind: "not-found" as const };
  const execution = mapNodeExecution(executionRow);
  if (execution.status !== "running") return { kind: "conflict" as const };
  return { ...state, execution };
}

function insertWorkflowInbox(
  trx: RuntimeTransaction,
  uid: number,
  inbox: WorkflowActionExecutionFailureInput["inbox"],
  now: Date,
) {
  return trx.insertInto(INBOX_TABLE).values({
    consumer: inbox.consumer,
    expires_at: inbox.expiresAt,
    message_id: inbox.messageId,
    processed_at: now,
    uid,
  }).executeTakeFirstOrThrow();
}

function updateActionExecutionFailure(
  trx: RuntimeTransaction,
  input: WorkflowActionExecutionFailureInput,
  status: "failed" | "retrying",
) {
  return trx.updateTable(EXECUTION_TABLE).set({
    completed_at: status === "failed" ? input.now : null,
    error_code: input.errorCode,
    error_message: input.errorMessage,
    failure_kind: input.failureKind,
    status,
  }).where("uid", "=", input.uid)
    .where("run_id", "=", input.runId)
    .where("idempotency_key", "=", input.idempotencyKey)
    .where("status", "=", "running")
    .executeTakeFirstOrThrow();
}

function failRunningNodeExecutions(
  trx: RuntimeTransaction,
  runIds: DatabaseId[],
  completedAt: Date,
  errorCode: string,
  errorMessage: string,
) {
  return trx.updateTable(EXECUTION_TABLE).set({
    completed_at: completedAt,
    error_code: errorCode,
    error_message: errorMessage,
    failure_kind: null,
    status: "failed",
  }).where("run_id", "in", runIds)
    .where("status", "in", ["running", "retrying"])
    .executeTakeFirst();
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
  if ([
    "start",
    "wait",
    "branch",
    "message",
    "message-query",
    "tag",
    "coupon",
    "handoff",
    "agent",
    "llm",
    "order-query",
    "tag-query",
    "customer-update",
    "ai-collect",
    "ai-intent",
    "end",
  ].includes(value)) {
    return value as WorkflowNodeKind;
  }
  throw new Error(`Unknown workflow node kind: ${value}`);
}

function parseActionFailureKind(value: string | null) {
  if (value === null || value === "retryable" || value === "terminal" || value === "unknown") return value;
  throw new Error(`Unknown workflow action failure kind: ${value}`);
}

function parseNodeExecutionStatus(value: string) {
  if (value === "completed" || value === "failed" || value === "retrying" || value === "running") return value;
  throw new Error(`Unknown workflow node execution status: ${value}`);
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
