import {
  WorkflowEntryEventType,
  WorkflowInferenceRequestSchema,
  WorkflowInferenceResultSchema,
  WorkflowJsonObjectSchema,
  WorkflowNodeKind,
  WorkflowRuntimeStatus,
  WorkflowRunStatus,
  WorkflowStatusReason,
  WorkflowTaskMessageSchema,
  WorkflowTaskStatus,
  WorkflowStoredExecutionSpec,
  WorkflowSubjectType,
  type WorkflowTaskMessage,
  type WorkflowTriggerBindingFilter,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import {
  getWorkflowExecutionBoundaryDecision,
  normalizeWorkflowExecutionSpec,
  transitionRun,
  transitionTask,
} from "@chatai/workflow-engine";
import { createNodeMetricDeltas, type WorkflowNodeMetricDelta } from "./node-metrics.js";
import { resolveWorkflowForwardRoute } from "./live-revision-routing.js";
import { isWorkflowTaskDeferReasonCode } from "./task-deferral.js";
import {
  WORKFLOW_MYSQL_WRITE_CHUNK_SIZE,
  WORKFLOW_RUNTIME_BATCH_LIMIT,
} from "./runtime-value-limits.js";
import {
  decodeWorkflowSubjectType,
  decodeWorkflowType,
  encodeWorkflowSubjectType,
  encodeWorkflowType,
} from "./persistence-codecs.js";
import type {
  DatabaseId,
  WorkflowDatabase,
  WorkflowEventSubscriptionEventTable,
  WorkflowEventSubscriptionTable,
  WorkflowInferenceJobTable,
  WorkflowRunTable,
  WorkflowTaskTable,
} from "./db.js";
import type {
  WorkflowCapabilityExecutionFailureInput,
  WorkflowBeginEventWaitInput,
  WorkflowBeginFixedWaitInput,
  WorkflowCommitNodeResultInput,
  WorkflowCreateRunInput,
  WorkflowEventSubscriptionEventRecord,
  WorkflowEventSubscriptionRecord,
  WorkflowInferenceJobRecord,
  WorkflowInferenceRepository,
  WorkflowOutboxRecord,
  WorkflowNodeMetricRecord,
  WorkflowNodeExecutionRecord,
  WorkflowRunRecord,
  WorkflowRevisionCleanupRecord,
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
const INFERENCE_JOB_TABLE = "xy_wap_embed_workflow_inference_job" as const;
const OUTBOX_TABLE = "xy_wap_embed_workflow_outbox" as const;
const INBOX_TABLE = "xy_wap_embed_workflow_inbox" as const;
const EVENT_SUBSCRIPTION_TABLE = "xy_wap_embed_workflow_event_subscription" as const;
const EVENT_SUBSCRIPTION_EVENT_TABLE = "xy_wap_embed_workflow_event_subscription_event" as const;
const REVISION_TABLE = "xy_wap_embed_workflow_revision" as const;
const TRIGGER_BINDING_TABLE = "xy_wap_embed_workflow_trigger_binding" as const;
const NODE_METRIC_EVENT_TABLE = "xy_wap_embed_workflow_node_metric_event" as const;
const NODE_METRIC_TABLE = "xy_wap_embed_workflow_node_metric" as const;
const REVISION_CLEANUP_TABLE = "xy_wap_embed_workflow_revision_cleanup" as const;
const ACTIVE_RUN_STATUSES = ["queued", "running", "waiting"] as const;
const ACTIVE_TASK_STATUSES = ["pending", "leased", "dispatched", "running"] as const;
const TERMINAL_RUN_STATUSES = ["cancelled", "completed", "failed"] as const;
const ENTITLEMENT_RUN_CANCEL_BATCH_SIZE = WORKFLOW_MYSQL_WRITE_CHUNK_SIZE;
const RUNTIME_STATE_INCONSISTENT = "WORKFLOW_RUNTIME_STATE_INCONSISTENT" as const;
type RuntimeTransaction = Transaction<WorkflowDatabase>;
type RuntimeDbExecutor = Kysely<WorkflowDatabase> | RuntimeTransaction;

export class MysqlWorkflowRuntimeRepository implements
  WorkflowRuntimeControlReader,
  WorkflowRuntimeRepository,
  WorkflowTriggerBindingReader {
  constructor(private readonly db: Kysely<WorkflowDatabase>) {}

  async applyEntitlementLoss(
    input: Parameters<WorkflowRuntimeControlReader["applyEntitlementLoss"]>[0],
  ) {
    const workflowIds = await this.db.transaction().execute(async (trx) => {
      const targetStatuses = input.transition === "pause"
        ? ["active"]
        : ["active", "inactive", "paused"];
      const definitions = await trx.selectFrom("xy_wap_embed_workflow_definition")
        .select("id")
        .where("uid", "=", input.uid)
        .where("workflow_type", "=", encodeWorkflowType(input.workflowType))
        .where("biz_status", "=", 1)
        .where("runtime_status", "in", targetStatuses)
        .forUpdate()
        .execute();
      if (definitions.length === 0) return [];

      const ids = definitions.map((definition) => definition.id);
      await trx.updateTable("xy_wap_embed_workflow_definition").set({
        op_sub_uid: input.opSubUserId,
        runtime_status: input.transition === "pause" ? "paused" : "stopped",
        status_reason: "entitlement_revoked",
      }).where("id", "in", ids).executeTakeFirstOrThrow();
      await transitionMysqlWorkflowInferenceJobs(trx, {
        transitionedAt: input.transitionedAt,
        transition: input.transition === "pause" ? "pause" : "cancel",
        uid: input.uid,
        workflowIds: ids.map(normalizeId),
      });
      return ids;
    });
    if (workflowIds.length === 0) return { affectedDefinitions: 0 };
    if (input.transition !== "pause") {
      await cancelMysqlEntitlementRuns(this.db, {
        now: input.transitionedAt,
        uid: input.uid,
        workflowIds,
      });
    }
    return { affectedDefinitions: workflowIds.length };
  }

  async findDefinition(uid: number, workflowId: string) {
    const row = await this.db.selectFrom("xy_wap_embed_workflow_definition")
      .select(["biz_status", "published_revision", "runtime_status", "status_reason", "workflow_type"])
      .where("uid", "=", uid)
      .where("id", "=", workflowId)
      .executeTakeFirst();
    return row ? {
      bizStatus: row.biz_status === 1 ? 1 as const : 0 as const,
      publishedRevision: row.published_revision,
      runtimeStatus: parseRuntimeStatus(row.runtime_status),
      statusReason: parseStatusReason(row.status_reason),
      workflowType: decodeWorkflowType(row.workflow_type),
    } : null;
  }

  async findRevision(uid: number, workflowId: string, revision: number) {
    const row = await this.db.selectFrom(REVISION_TABLE)
      .select(["execution_spec_json", "revision", "subject_type", "workflow_type"])
      .where("uid", "=", uid)
      .where("workflow_id", "=", workflowId)
      .where("revision", "=", revision)
      .executeTakeFirst();
    return row ? {
      executionSpec: normalizeWorkflowExecutionSpec(
        parseJson(row.execution_spec_json) as WorkflowStoredExecutionSpec,
      ),
      revision: row.revision,
      subjectType: decodeWorkflowSubjectType(row.subject_type),
      workflowType: decodeWorkflowType(row.workflow_type),
    } : null;
  }

  async listActiveTriggerBindings(
    uid: number,
    eventType: WorkflowEntryEventType,
  ) {
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
        "binding.subject_type",
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
          .select(["biz_status", "published_revision", "runtime_status", "workflow_type"])
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
        if (decodeWorkflowType(definition.workflow_type) !== input.workflowType) {
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
          subject_type: encodeWorkflowSubjectType(input.subjectType),
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
          .where("subject_type", "=", encodeWorkflowSubjectType(input.subjectType))
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
          subject_type: encodeWorkflowSubjectType(input.subjectType),
          terminal_reason: null,
          uid: input.uid,
          update_time: admittedAt,
          workflow_id: input.workflowId,
        }).executeTakeFirstOrThrow();
        const runId = normalizeId(runInsert.insertId);
        const task = await insertTask(trx, {
          createdAt: admittedAt,
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
      if (!isDuplicateKeyError(error)) throw error;
      const run = await this.findRunByEntryEvent(input.uid, input.workflowId, input.entryEventId);
      if (!run) throw error;
      const task = await this.findInitialTask(input.uid, run.id);
      if (!task) throw new Error("Deduplicated workflow run has no initial task");
      return { deduplicated: true, kind: "success" as const, run, task };
    }
  }

  async hasProcessedInboxMessage(input: { consumer: string; messageId: string }) {
    const row = await this.db.selectFrom(INBOX_TABLE).select("id")
      .where("consumer", "=", input.consumer)
      .where("message_id", "=", input.messageId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async recordProcessedInboxMessage(input: {
    consumer: string;
    expiresAt: Date;
    messageId: string;
    processedAt: Date;
    uid: number;
  }) {
    try {
      await this.db.insertInto(INBOX_TABLE).values({
        consumer: input.consumer,
        expires_at: input.expiresAt,
        message_id: input.messageId,
        processed_at: input.processedAt,
        uid: input.uid,
      }).executeTakeFirstOrThrow();
      return true;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      return false;
    }
  }

  beginEventWait(input: WorkflowBeginEventWaitInput) {
    return this.db.transaction().execute(async (trx) => {
      const processed = await trx.selectFrom(INBOX_TABLE).select("id")
        .where("consumer", "=", input.inbox.consumer)
        .where("message_id", "=", input.inbox.messageId)
        .executeTakeFirst();
      if (processed) return { kind: "already-processed" as const };

      const runRow = await trx.selectFrom(RUN_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", input.runId)
        .forUpdate()
        .executeTakeFirst();
      const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", input.taskId)
        .forUpdate()
        .executeTakeFirst();
      if (!runRow || !taskRow || normalizeId(taskRow.run_id) !== input.runId) {
        return { kind: "not-found" as const };
      }
      const run = mapRun(runRow);
      const task = mapTask(taskRow);
      if (run.lockVersion !== input.expectedRunLockVersion
        || run.status !== "running"
        || task.taskVersion !== input.expectedTaskVersion
        || task.status !== "running"
        || task.sequence !== run.sequence
        || task.revision !== run.revision
        || task.nodeId !== run.currentNodeId
        || task.nodeKind !== "wait-event"
        || input.expiresAt <= input.effectiveFrom) return { kind: "conflict" as const };

      const definition = await trx.selectFrom("xy_wap_embed_workflow_definition")
        .select(["biz_status", "runtime_status"])
        .where("uid", "=", input.uid)
        .where("id", "=", run.workflowId)
        .forShare()
        .executeTakeFirst();
      const boundaryDecision = definition
        ? getWorkflowExecutionBoundaryDecision({
            bizStatus: definition.biz_status === 1 ? 1 : 0,
            runtimeStatus: parseRuntimeStatus(definition.runtime_status),
          })
        : "cancel";
      if (boundaryDecision === "cancel") {
        return { action: "cancel" as const, kind: "workflow-unavailable" as const };
      }

      const inserted = await trx.insertInto(EVENT_SUBSCRIPTION_TABLE).values({
        collect_until: null,
        create_time: input.now,
        effective_from: input.effectiveFrom,
        event_type: input.eventType,
        expires_at: input.expiresAt,
        node_id: task.nodeId,
        revision: task.revision,
        run_id: run.id,
        seat_id: input.seatId,
        status: "waiting",
        subject_id: run.subjectId,
        subject_type: encodeWorkflowSubjectType(run.subjectType),
        task_id: task.id,
        trigger_event_id: null,
        uid: input.uid,
        update_time: input.now,
        workflow_id: run.workflowId,
      }).executeTakeFirstOrThrow();
      await trx.insertInto(INBOX_TABLE).values({
        consumer: input.inbox.consumer,
        expires_at: input.inbox.expiresAt,
        message_id: input.inbox.messageId,
        processed_at: input.now,
        uid: input.uid,
      }).executeTakeFirstOrThrow();
      await trx.updateTable(TASK_TABLE).set({
        bucket_time: floorToMinute(input.expiresAt),
        due_at: input.expiresAt,
        lease_expires_at: null,
        lease_owner: null,
        status: transitionTask(task.status, "pending"),
        task_type: "wait-event",
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid)
        .where("id", "=", task.id)
        .where("task_version", "=", task.taskVersion)
        .where("status", "=", "running")
        .executeTakeFirstOrThrow();
      await trx.updateTable(RUN_TABLE).set({
        lock_version: run.lockVersion + 1,
        next_execute_at: input.expiresAt,
        status: transitionRun(run.status, "waiting"),
        update_time: input.now,
      }).where("uid", "=", input.uid)
        .where("id", "=", run.id)
        .where("lock_version", "=", run.lockVersion)
        .where("status", "=", "running")
        .executeTakeFirstOrThrow();

      const subscription: WorkflowEventSubscriptionRecord = {
        collectUntil: null,
        createdAt: input.now,
        effectiveFrom: input.effectiveFrom,
        eventType: input.eventType,
        expiresAt: input.expiresAt,
        id: normalizeId(inserted.insertId),
        nodeId: task.nodeId,
        revision: task.revision,
        runId: run.id,
        seatId: input.seatId,
        status: "waiting",
        subjectId: run.subjectId,
        subjectType: run.subjectType,
        taskId: task.id,
        triggerEventId: null,
        uid: input.uid,
        updatedAt: input.now,
        workflowId: run.workflowId,
      };
      return {
        kind: "success" as const,
        run: {
          ...run,
          lockVersion: run.lockVersion + 1,
          nextExecuteAt: input.expiresAt,
          status: "waiting" as const,
        },
        subscription,
        task: {
          ...task,
          dueAt: input.expiresAt,
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "pending" as const,
          taskType: "wait-event",
          taskVersion: task.taskVersion + 1,
        },
      };
    });
  }

  beginFixedWait(input: WorkflowBeginFixedWaitInput) {
    return this.db.transaction().execute(async (trx) => {
      const processed = await trx.selectFrom(INBOX_TABLE).select("id")
        .where("consumer", "=", input.inbox.consumer)
        .where("message_id", "=", input.inbox.messageId)
        .executeTakeFirst();
      if (processed) return { kind: "already-processed" as const };
      const runRow = await trx.selectFrom(RUN_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.runId)
        .forUpdate().executeTakeFirst();
      const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.taskId)
        .forUpdate().executeTakeFirst();
      if (!runRow || !taskRow || normalizeId(taskRow.run_id) !== input.runId) {
        return { kind: "not-found" as const };
      }
      const run = mapRun(runRow);
      const task = mapTask(taskRow);
      if (run.lockVersion !== input.expectedRunLockVersion
        || run.status !== "running"
        || task.taskVersion !== input.expectedTaskVersion
        || task.status !== "running"
        || task.sequence !== run.sequence
        || task.revision !== run.revision
        || task.nodeId !== run.currentNodeId
        || task.nodeKind !== "wait"
        || task.taskType !== "execute"
        || input.dueAt <= input.now) return { kind: "conflict" as const };
      const definition = await trx.selectFrom("xy_wap_embed_workflow_definition")
        .select(["biz_status", "runtime_status"])
        .where("uid", "=", input.uid).where("id", "=", run.workflowId)
        .forShare().executeTakeFirst();
      const decision = definition
        ? getWorkflowExecutionBoundaryDecision({
            bizStatus: definition.biz_status === 1 ? 1 : 0,
            runtimeStatus: parseRuntimeStatus(definition.runtime_status),
          })
        : "cancel";
      if (decision === "cancel") {
        return { action: "cancel" as const, kind: "workflow-unavailable" as const };
      }
      await trx.insertInto(INBOX_TABLE).values({
        consumer: input.inbox.consumer,
        expires_at: input.inbox.expiresAt,
        message_id: input.inbox.messageId,
        processed_at: input.now,
        uid: input.uid,
      }).executeTakeFirstOrThrow();
      await trx.updateTable(TASK_TABLE).set({
        bucket_time: floorToMinute(input.dueAt),
        due_at: input.dueAt,
        lease_expires_at: null,
        lease_owner: null,
        status: transitionTask(task.status, "pending"),
        task_type: "wait",
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid).where("id", "=", task.id)
        .where("task_version", "=", task.taskVersion)
        .executeTakeFirstOrThrow();
      await trx.updateTable(RUN_TABLE).set({
        lock_version: run.lockVersion + 1,
        next_execute_at: input.dueAt,
        status: transitionRun(run.status, "waiting"),
      }).where("uid", "=", input.uid).where("id", "=", run.id)
        .where("lock_version", "=", run.lockVersion)
        .executeTakeFirstOrThrow();
      return {
        kind: "success" as const,
        run: {
          ...run,
          lockVersion: run.lockVersion + 1,
          nextExecuteAt: input.dueAt,
          status: "waiting" as const,
        },
        task: {
          ...task,
          dueAt: input.dueAt,
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "pending" as const,
          taskType: "wait",
          taskVersion: task.taskVersion + 1,
        },
      };
    });
  }

  async listMatchingEventSubscriptions(
    uid: number,
    subjectType: WorkflowSubjectType,
    eventType: WorkflowEntryEventType,
    subjectId: string,
    seatId: number | null,
    eventOccurredAt: Date,
    observedAt: Date,
  ) {
    let query = this.db.selectFrom(`${EVENT_SUBSCRIPTION_TABLE} as subscription`)
      .innerJoin("xy_wap_embed_workflow_definition as definition", join => join
        .onRef("definition.uid", "=", "subscription.uid")
        .onRef("definition.id", "=", "subscription.workflow_id"))
      .selectAll("subscription")
      .where("subscription.uid", "=", uid)
      .where("subscription.subject_type", "=", encodeWorkflowSubjectType(subjectType))
      .where("subscription.event_type", "=", eventType)
      .where("subscription.subject_id", "=", subjectId)
      .where(eb => eb.or([
        eb.and([
          eb("subscription.status", "=", "waiting"),
          eb("subscription.effective_from", "<=", eventOccurredAt),
          eb("subscription.expires_at", ">", eventOccurredAt),
        ]),
        eb.and([
          eb("subscription.status", "=", "triggered"),
          eb("subscription.collect_until", ">", observedAt),
        ]),
      ]))
      .where("definition.biz_status", "=", 1)
      .where("definition.runtime_status", "in", ["active", "paused"])
      .orderBy("subscription.id", "asc");
    query = seatId === null
      ? query.where("subscription.seat_id", "is", null)
      : query.where(eb => eb.or([
          eb("subscription.seat_id", "is", null),
          eb("subscription.seat_id", "=", seatId),
        ]));
    const rows = await query.execute();
    return rows.map(mapEventSubscription);
  }

  async findEventSubscriptionByTask(uid: number, taskId: string) {
    const row = await this.db.selectFrom(EVENT_SUBSCRIPTION_TABLE).selectAll()
      .where("uid", "=", uid)
      .where("task_id", "=", taskId)
      .executeTakeFirst();
    return row ? mapEventSubscription(row) : null;
  }

  async listEventSubscriptionEvents(uid: number, subscriptionId: string) {
    const rows = await this.db.selectFrom(EVENT_SUBSCRIPTION_EVENT_TABLE).selectAll()
      .where("uid", "=", uid)
      .where("subscription_id", "=", subscriptionId)
      .orderBy("occurred_at", "asc")
      .orderBy("id", "asc")
      .execute();
    return rows.map(mapEventSubscriptionEvent);
  }

  recordEventSubscriptionEvent(
    input: Parameters<WorkflowRuntimeRepository["recordEventSubscriptionEvent"]>[0],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const candidateRow = await trx.selectFrom(EVENT_SUBSCRIPTION_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", input.subscriptionId)
        .executeTakeFirst();
      if (!candidateRow) return { kind: "not-found" as const };
      const candidate = mapEventSubscription(candidateRow);

      const runRow = await trx.selectFrom(RUN_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", candidate.runId)
        .forUpdate()
        .executeTakeFirst();
      const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", candidate.taskId)
        .forUpdate()
        .executeTakeFirst();
      if (!runRow || !taskRow || normalizeId(taskRow.run_id) !== candidate.runId) {
        return { kind: "not-found" as const };
      }
      const subscriptionRow = await trx.selectFrom(EVENT_SUBSCRIPTION_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", input.subscriptionId)
        .forUpdate()
        .executeTakeFirst();
      if (!subscriptionRow) return { kind: "not-found" as const };
      const subscription = mapEventSubscription(subscriptionRow);
      if (subscription.runId !== candidate.runId || subscription.taskId !== candidate.taskId) {
        return { kind: "conflict" as const };
      }
      if (subscription.status !== "waiting" && subscription.status !== "triggered") {
        return { kind: "conflict" as const };
      }
      const run = mapRun(runRow);
      const task = mapTask(taskRow);
      const definition = await trx.selectFrom("xy_wap_embed_workflow_definition")
        .select(["biz_status", "runtime_status"])
        .where("uid", "=", input.uid)
        .where("id", "=", subscription.workflowId)
        .forShare()
        .executeTakeFirst();
      const boundaryDecision = definition
        ? getWorkflowExecutionBoundaryDecision({
            bizStatus: definition.biz_status === 1 ? 1 : 0,
            runtimeStatus: parseRuntimeStatus(definition.runtime_status),
          })
        : "cancel";
      if (boundaryDecision === "cancel") {
        await trx.updateTable(EVENT_SUBSCRIPTION_TABLE).set({
          status: "cancelled",
          update_time: input.recordedAt,
        })
          .where("id", "=", subscription.id)
          .where("status", "in", ["waiting", "triggered"])
          .executeTakeFirstOrThrow();
        return { action: "cancel" as const, kind: "workflow-unavailable" as const };
      }
      const existingEvent = await trx.selectFrom(EVENT_SUBSCRIPTION_EVENT_TABLE).select("id")
        .where("uid", "=", input.uid)
        .where("subscription_id", "=", subscription.id)
        .where("event_id", "=", input.eventId)
        .forShare()
        .executeTakeFirst();
      if (existingEvent) return { kind: "already-processed" as const };
      if ((task.status !== "pending"
          && task.status !== "leased"
          && task.status !== "dispatched"
          && task.status !== "running")
        || (run.status !== "waiting" && run.status !== "running")
        || run.currentNodeId !== subscription.nodeId
        || task.nodeId !== subscription.nodeId
        || task.nodeKind !== "wait-event"
        || task.taskType !== "wait-event") {
        return { kind: "conflict" as const };
      }

      const firstEvent = subscription.status === "waiting";
      const expectedDueAt = firstEvent ? subscription.expiresAt : subscription.collectUntil;
      if (!expectedDueAt
        || task.dueAt.getTime() !== expectedDueAt.getTime()
        || (firstEvent && (
          input.eventOccurredAt.getTime() < subscription.effectiveFrom.getTime()
          || input.eventOccurredAt.getTime() >= subscription.expiresAt.getTime()
          || input.collectUntil.getTime() <= input.recordedAt.getTime()
        ))
        || (!firstEvent && (
          input.recordedAt.getTime() >= expectedDueAt.getTime()
          || input.collectUntil.getTime() !== expectedDueAt.getTime()
        ))) return { kind: "conflict" as const };

      await trx.insertInto(EVENT_SUBSCRIPTION_EVENT_TABLE).values({
        create_time: input.recordedAt,
        event_id: input.eventId,
        occurred_at: input.eventOccurredAt,
        projection_json: stringifyJson(input.projection),
        subscription_id: subscription.id,
        uid: input.uid,
      }).executeTakeFirstOrThrow();

      if (!firstEvent) {
        return {
          firstEvent,
          kind: "success" as const,
          run,
          subscription,
          task,
        };
      }

      await trx.updateTable(EVENT_SUBSCRIPTION_TABLE).set({
        collect_until: input.collectUntil,
        status: "triggered",
        trigger_event_id: input.eventId,
        update_time: input.recordedAt,
      }).where("id", "=", subscription.id)
        .where("status", "=", "waiting")
        .executeTakeFirstOrThrow();
      await trx.updateTable(TASK_TABLE).set({
        bucket_time: floorToMinute(input.collectUntil),
        due_at: input.collectUntil,
        lease_expires_at: null,
        lease_owner: null,
        status: "pending",
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid)
        .where("id", "=", task.id)
        .where("task_version", "=", task.taskVersion)
        .where("status", "in", ["pending", "leased", "dispatched", "running"])
        .executeTakeFirstOrThrow();
      await trx.updateTable(RUN_TABLE).set({
        lock_version: run.lockVersion + 1,
        next_execute_at: input.collectUntil,
        status: "waiting",
      }).where("uid", "=", input.uid)
        .where("id", "=", run.id)
        .where("lock_version", "=", run.lockVersion)
        .where("status", "in", ["waiting", "running"])
        .executeTakeFirstOrThrow();

      return {
        firstEvent,
        kind: "success" as const,
        run: {
          ...run,
          lockVersion: run.lockVersion + 1,
          nextExecuteAt: input.collectUntil,
          status: "waiting" as const,
        },
        subscription: {
          ...subscription,
          collectUntil: input.collectUntil,
          status: "triggered" as const,
          triggerEventId: input.eventId,
          updatedAt: input.recordedAt,
        },
        task: {
          ...task,
          dueAt: input.collectUntil,
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "pending" as const,
          taskVersion: task.taskVersion + 1,
        },
      };
    });
  }

  timeoutEventSubscription(
    input: Parameters<WorkflowRuntimeRepository["timeoutEventSubscription"]>[0],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const row = await trx.selectFrom(EVENT_SUBSCRIPTION_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", input.subscriptionId)
        .forUpdate()
        .executeTakeFirst();
      if (!row) return { kind: "not-found" as const };
      const subscription = mapEventSubscription(row);
      if (subscription.status === "timed_out") return { kind: "already-processed" as const };
      if (subscription.status !== "waiting") return { kind: "conflict" as const };
      await trx.updateTable(EVENT_SUBSCRIPTION_TABLE).set({
        status: "timed_out",
        update_time: input.timedOutAt,
      })
        .where("id", "=", subscription.id)
        .where("status", "=", "waiting")
        .executeTakeFirstOrThrow();
      return {
        kind: "success" as const,
        subscription: {
          ...subscription,
          status: "timed_out" as const,
          updatedAt: input.timedOutAt,
        },
      };
    });
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
        .select(["current_node_id", "revision", "sequence", "shard_id", "status", "workflow_id"])
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
        || task.runId !== candidate.runId
        || task.sequence !== runRow.sequence
        || task.revision !== runRow.revision
        || task.nodeId !== runRow.current_node_id
        || task.workflowId !== normalizeId(runRow.workflow_id)
        || task.shardId !== runRow.shard_id) return { kind: "conflict" as const };

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
        last_error_code: null,
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        status: "running",
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid).where("id", "=", input.taskId)
        .where("task_version", "=", input.expectedTaskVersion).executeTakeFirstOrThrow();
      await trx.updateTable(RUN_TABLE).set({
        next_execute_at: null,
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
          lastErrorCode: null,
          leaseExpiresAt: input.leaseExpiresAt,
          leaseOwner: input.leaseOwner,
          status: "running" as const,
          taskVersion: task.taskVersion + 1,
        },
      };
    });
  }

  async deferTask(input: Parameters<WorkflowRuntimeRepository["deferTask"]>[0]) {
    const dueAt = floorToMinute(input.dueAt);
    return this.db.transaction().execute(async (trx) => {
      const candidateRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.taskId)
        .executeTakeFirst();
      if (!candidateRow) return { kind: "not-found" as const };
      const candidate = mapTask(candidateRow);
      if ((candidate.status !== "pending" && candidate.status !== "dispatched" && candidate.status !== "leased")
        || candidate.taskVersion !== input.expectedTaskVersion) return { kind: "conflict" as const };

      const runRow = await trx.selectFrom(RUN_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", candidate.runId)
        .forUpdate()
        .executeTakeFirst();
      if (!runRow || (runRow.status !== "queued" && runRow.status !== "running" && runRow.status !== "waiting")) {
        return { kind: "conflict" as const };
      }
      const run = mapRun(runRow);

      const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.taskId)
        .forUpdate().executeTakeFirst();
      if (!taskRow) return { kind: "not-found" as const };
      const task = mapTask(taskRow);
      if ((task.status !== "pending" && task.status !== "dispatched" && task.status !== "leased")
        || task.taskVersion !== input.expectedTaskVersion
        || task.runId !== candidate.runId
        || task.sequence !== run.sequence
        || task.revision !== run.revision
        || task.nodeId !== run.currentNodeId
        || task.workflowId !== run.workflowId
        || task.shardId !== run.shardId) return { kind: "conflict" as const };

      const nextRun = {
        ...run,
        lockVersion: run.lockVersion + 1,
        nextExecuteAt: input.dueAt,
        status: run.status === "waiting" ? "waiting" as const : transitionRun(run.status, "waiting"),
      };
      await trx.updateTable(TASK_TABLE).set({
        bucket_time: dueAt,
        due_at: input.dueAt,
        last_error_code: input.reasonCode,
        lease_expires_at: null,
        lease_owner: null,
        status: "pending",
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid)
        .where("id", "=", input.taskId)
        .where("task_version", "=", input.expectedTaskVersion)
        .where("status", "in", ["pending", "leased", "dispatched"])
        .executeTakeFirstOrThrow();
      await trx.updateTable(RUN_TABLE).set({
        lock_version: nextRun.lockVersion,
        next_execute_at: nextRun.nextExecuteAt,
        status: nextRun.status,
      }).where("uid", "=", input.uid)
        .where("id", "=", run.id)
        .where("lock_version", "=", run.lockVersion)
        .where("status", "in", ACTIVE_RUN_STATUSES)
        .executeTakeFirstOrThrow();
      return {
        kind: "success" as const,
        run: nextRun,
        task: {
          ...task,
          dueAt: input.dueAt,
          lastErrorCode: input.reasonCode,
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "pending" as const,
          taskVersion: task.taskVersion + 1,
        },
      };
    });
  }

  async dispatchDueTasks(input: Parameters<WorkflowRuntimeRepository["dispatchDueTasks"]>[0]) {
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0 || input.shardIds?.length === 0) {
      return { cancelled: 0, deferred: 0, dispatched: 0 };
    }
    return this.db.transaction().execute(async (trx) => {
      let deferredQuery = trx.selectFrom(`${TASK_TABLE} as task`)
        .innerJoin("xy_wap_embed_workflow_definition as definition", join => join
          .onRef("definition.uid", "=", "task.uid")
          .onRef("definition.id", "=", "task.workflow_id"))
        .select("task.id")
        .where("task.status", "=", "pending")
        .where("task.task_type", "!=", "inference")
        .where("task.bucket_time", "<=", floorToMinute(input.now))
        .where("task.due_at", "<=", input.now)
        .where("definition.biz_status", "=", 1)
        .where("definition.runtime_status", "=", "paused")
        .orderBy("task.bucket_time", "asc")
        .orderBy("task.due_at", "asc")
        .orderBy("task.id", "asc")
        .limit(limit);
      if (input.shardIds) {
        deferredQuery = deferredQuery.where("task.shard_id", "in", input.shardIds);
      }
      const deferred = (await deferredQuery.execute()).length;

      let query = trx.selectFrom(`${TASK_TABLE} as task`)
        .leftJoin("xy_wap_embed_workflow_definition as definition", join => join
          .onRef("definition.uid", "=", "task.uid")
          .onRef("definition.id", "=", "task.workflow_id"))
        .selectAll("task")
        .where("task.status", "=", "pending")
        .where("task.task_type", "!=", "inference")
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
        .limit(limit)
        .forUpdate()
        .skipLocked();
      if (input.shardIds) query = query.where("task.shard_id", "in", input.shardIds);
      const rows = await query.execute();
      const result = { cancelled: 0, deferred, dispatched: 0 };
      if (rows.length === 0) return result;
      const tasks = rows.map(mapTask);
      const definitionByKey = await loadDefinitionsForShare(trx, tasks.map(task => ({
        uid: task.uid,
        workflowId: task.workflowId,
      })));
      const cancelled: WorkflowTaskRecord[] = [];
      const dispatched: WorkflowTaskRecord[] = [];
      for (const task of tasks) {
        const definition = definitionByKey.get(definitionKey(task.uid, task.workflowId));
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
        if (decision === "cancel") cancelled.push(task);
        else dispatched.push(task);
      }
      if (cancelled.length > 0) {
        await trx.updateTable(TASK_TABLE).set({
          lease_expires_at: null,
          lease_owner: null,
          status: "cancelled",
          task_version: sql<number>`task_version + 1`,
        }).where("id", "in", cancelled.map(task => task.id))
          .where("status", "=", "pending")
          .executeTakeFirstOrThrow();
        const cancelledRunIds = [...new Set(cancelled.map(task => task.runId))];
        await cancelEventSubscriptions(trx, cancelledRunIds);
        await cancelInferenceJobs(trx, cancelledRunIds);
        result.cancelled = cancelled.length;
      }
      if (dispatched.length > 0) {
        transitionTask(transitionTask("pending", "leased"), "dispatched");
        await trx.updateTable(TASK_TABLE).set({
          status: "dispatched",
          task_version: sql<number>`task_version + 1`,
        }).where("id", "in", dispatched.map(task => task.id))
          .where("status", "=", "pending")
          .executeTakeFirstOrThrow();
        await insertTaskOutboxBatch(trx, dispatched.map(task => ({
          ...task,
          status: "dispatched" as const,
          taskVersion: task.taskVersion + 1,
        })), input.now);
        result.dispatched = dispatched.length;
      }
      return result;
    });
  }

  async prepareCapabilityExecution(
    input: Parameters<WorkflowRuntimeRepository["prepareCapabilityExecution"]>[0],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const state = await lockCapabilityExecutionState(trx, input);
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
        if (existing.executionKey !== input.executionKey
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
          .where("execution_key", "=", input.executionKey)
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
        execution_key: input.executionKey,
        input_snapshot_json: stringifyJson(input.input),
        node_id: task.nodeId,
        node_kind: task.nodeKind,
        output_json: stringifyJson({}),
        run_id: run.id,
        revision: task.revision,
        sequence: task.sequence,
        source_outlet_id: null,
        started_at: input.now,
        status: "running",
        uid: input.uid,
      }).executeTakeFirstOrThrow();
      return {
        execution: {
          errorCode: null,
          errorMessage: null,
          failureKind: null,
          executionKey: input.executionKey,
          input: structuredClone(input.input),
          nodeId: task.nodeId,
          nodeKind: task.nodeKind,
          output: {},
          runId: run.id,
          revision: task.revision,
          sequence: task.sequence,
          sourceOutletId: null,
          status: "running" as const,
          uid: input.uid,
        },
        kind: "success" as const,
      };
    });
  }

  async beginInference(input: Parameters<WorkflowRuntimeRepository["beginInference"]>[0]) {
    return this.db.transaction().execute(async (trx) => {
      const processed = await trx.selectFrom(INBOX_TABLE).select("id")
        .where("consumer", "=", input.inbox.consumer)
        .where("message_id", "=", input.inbox.messageId)
        .executeTakeFirst();
      if (processed) return { kind: "already-processed" as const };
      const runRow = await trx.selectFrom(RUN_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.runId)
        .forUpdate().executeTakeFirst();
      const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.taskId)
        .forUpdate().executeTakeFirst();
      if (!runRow || !taskRow) return { kind: "not-found" as const };
      const run = mapRun(runRow);
      const task = mapTask(taskRow);
      if (task.runId !== run.id) return { kind: "not-found" as const };
      if (run.lockVersion !== input.expectedRunLockVersion || run.status !== "running"
        || task.taskVersion !== input.expectedTaskVersion || task.status !== "running"
        || task.sequence !== run.sequence
        || task.revision !== run.revision
        || task.nodeId !== run.currentNodeId
        || (task.nodeKind !== "llm" && task.nodeKind !== "ai-intent")
        || input.deadlineAt <= input.now) return { kind: "conflict" as const };
      const definition = await trx.selectFrom("xy_wap_embed_workflow_definition")
        .select(["biz_status", "runtime_status"])
        .where("uid", "=", input.uid).where("id", "=", run.workflowId)
        .forShare().executeTakeFirst();
      const decision = definition ? getWorkflowExecutionBoundaryDecision({
        bizStatus: definition.biz_status === 1 ? 1 : 0,
        runtimeStatus: parseRuntimeStatus(definition.runtime_status),
      }) : "cancel";
      if (decision !== "execute") {
        return { action: decision, kind: "workflow-unavailable" as const };
      }
      const existingRow = await trx.selectFrom(INFERENCE_JOB_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("execution_key", "=", input.executionKey)
        .forUpdate()
        .executeTakeFirst();
      if (existingRow) {
        const existing = mapInferenceJob(existingRow);
        if (existing.taskId !== task.id) return { kind: "conflict" as const };
        await insertWorkflowInbox(trx, input.uid, input.inbox, input.now);
        await trx.updateTable(TASK_TABLE).set({
          bucket_time: floorToMinute(existing.deadlineAt),
          due_at: existing.deadlineAt,
          lease_expires_at: null,
          lease_owner: null,
          status: transitionTask(task.status, "pending"),
          task_type: "inference",
          task_version: task.taskVersion + 1,
        }).where("id", "=", task.id).where("task_version", "=", task.taskVersion)
          .where("status", "=", "running").executeTakeFirstOrThrow();
        await trx.updateTable(RUN_TABLE).set({
          lock_version: run.lockVersion + 1,
          next_execute_at: existing.deadlineAt,
          status: transitionRun(run.status, "waiting"),
        }).where("id", "=", run.id).where("lock_version", "=", run.lockVersion)
          .where("status", "=", "running").executeTakeFirstOrThrow();
        return {
          created: false,
          job: existing,
          kind: "success" as const,
          run: { ...run, lockVersion: run.lockVersion + 1, nextExecuteAt: existing.deadlineAt, status: "waiting" as const },
          task: {
            ...task,
            dueAt: existing.deadlineAt,
            leaseExpiresAt: null,
            leaseOwner: null,
            status: "pending" as const,
            taskType: "inference",
            taskVersion: task.taskVersion + 1,
          },
        };
      }
      const inserted = await trx.insertInto(INFERENCE_JOB_TABLE).values({
        attempt: 0,
        completed_at: null,
        contract_version: input.contractVersion,
        deadline_at: input.deadlineAt,
        error_code: null,
        error_message: null,
        execution_key: input.executionKey,
        failure_kind: null,
        lease_expires_at: null,
        lease_owner: null,
        next_attempt_at: input.now,
        node_id: task.nodeId,
        node_kind: task.nodeKind,
        payload_json: stringifyJson(input.payload),
        paused_at: null,
        result_json: null,
        run_id: run.id,
        sequence: task.sequence,
        started_at: null,
        status: "pending",
        task_id: task.id,
        uid: input.uid,
      }).executeTakeFirstOrThrow();
      await insertWorkflowInbox(trx, input.uid, input.inbox, input.now);
      await trx.updateTable(TASK_TABLE).set({
        bucket_time: floorToMinute(input.deadlineAt),
        due_at: input.deadlineAt,
        lease_expires_at: null,
        lease_owner: null,
        status: transitionTask(task.status, "pending"),
        task_type: "inference",
        task_version: task.taskVersion + 1,
      }).where("uid", "=", input.uid).where("id", "=", task.id)
        .where("task_version", "=", task.taskVersion).where("status", "=", "running")
        .executeTakeFirstOrThrow();
      await trx.updateTable(RUN_TABLE).set({
        lock_version: run.lockVersion + 1,
        next_execute_at: input.deadlineAt,
        status: transitionRun(run.status, "waiting"),
      }).where("uid", "=", input.uid).where("id", "=", run.id)
        .where("lock_version", "=", run.lockVersion).where("status", "=", "running")
        .executeTakeFirstOrThrow();
      const insertedId = inserted.insertId;
      if (insertedId === undefined) throw new Error("Inference Job insert did not return an ID");
      const row = await trx.selectFrom(INFERENCE_JOB_TABLE).selectAll()
        .where("id", "=", insertedId).executeTakeFirstOrThrow();
      return {
        created: true,
        job: mapInferenceJob(row),
        kind: "success" as const,
        run: { ...run, lockVersion: run.lockVersion + 1, nextExecuteAt: input.deadlineAt, status: "waiting" as const },
        task: {
          ...task,
          dueAt: input.deadlineAt,
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "pending" as const,
          taskType: "inference",
          taskVersion: task.taskVersion + 1,
        },
      };
    });
  }

  async findInferenceByExecutionKey(uid: number, executionKey: string) {
    const row = await this.db.selectFrom(INFERENCE_JOB_TABLE).selectAll()
      .where("uid", "=", uid).where("execution_key", "=", executionKey)
      .executeTakeFirst();
    return row ? mapInferenceJob(row) : null;
  }

  async claimInferenceBatch(input: Parameters<WorkflowRuntimeRepository["claimInferenceBatch"]>[0]) {
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return [];
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(`${INFERENCE_JOB_TABLE} as job`)
        .selectAll("job")
        .where("job.status", "in", ["pending", "retry_wait"])
        .where("job.next_attempt_at", "<=", input.now)
        .where("job.deadline_at", ">", input.now)
        .where("job.paused_at", "is", null)
        .where(({ exists, selectFrom }) => exists(
          selectFrom(`${RUN_TABLE} as inference_run`)
            .innerJoin("xy_wap_embed_workflow_definition as inference_definition", join => join
              .onRef("inference_definition.uid", "=", "inference_run.uid")
              .onRef("inference_definition.id", "=", "inference_run.workflow_id"))
            .select("inference_run.id")
            .whereRef("inference_run.uid", "=", "job.uid")
            .whereRef("inference_run.id", "=", "job.run_id")
            .where("inference_run.status", "=", "waiting")
            .where("inference_definition.biz_status", "=", 1)
            .where("inference_definition.runtime_status", "=", "active"),
        ))
        .orderBy("job.next_attempt_at", "asc").orderBy("job.id", "asc")
        .limit(limit).forUpdate().skipLocked().execute();
      if (rows.length === 0) return [];
      const ids = rows.map(row => row.id);
      await trx.updateTable(INFERENCE_JOB_TABLE).set({
        attempt: sql<number>`attempt + 1`,
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        started_at: sql<Date>`COALESCE(started_at, ${input.now})`,
        status: "running",
      }).where("id", "in", ids).where("status", "in", ["pending", "retry_wait"])
        .executeTakeFirstOrThrow();
      return rows.map(row => mapInferenceJob({
        ...row,
        attempt: row.attempt + 1,
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        started_at: row.started_at ?? input.now,
        status: "running",
      }));
    });
  }

  async renewInferenceLease(input: Parameters<WorkflowRuntimeRepository["renewInferenceLease"]>[0]) {
    const result = await this.db.updateTable(INFERENCE_JOB_TABLE).set({
      lease_expires_at: input.leaseExpiresAt,
    }).where("id", "=", input.id).where("status", "=", "running")
      .where("lease_owner", "=", input.leaseOwner).executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  async completeInference(input: Parameters<WorkflowRuntimeRepository["completeInference"]>[0]) {
    return this.finishInference({
      completedAt: input.completedAt,
      id: input.id,
      leaseOwner: input.leaseOwner,
      result: input.result,
      status: "succeeded",
    });
  }

  async retryInference(input: Parameters<WorkflowRuntimeRepository["retryInference"]>[0]) {
    const result = await this.db.updateTable(INFERENCE_JOB_TABLE).set({
      error_code: input.errorCode,
      error_message: input.errorMessage,
      failure_kind: input.failureKind,
      lease_expires_at: null,
      lease_owner: null,
      next_attempt_at: input.nextAttemptAt,
      status: "retry_wait",
    }).where("id", "=", input.id).where("status", "=", "running")
      .where("lease_owner", "=", input.leaseOwner)
      .where("deadline_at", ">", input.nextAttemptAt).executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  async failInference(input: Parameters<WorkflowRuntimeRepository["failInference"]>[0]) {
    return this.finishInference({
      completedAt: input.failedAt,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      failureKind: input.failureKind,
      id: input.id,
      leaseOwner: input.leaseOwner,
      status: "failed",
    });
  }

  async recoverInferenceJobs(input: Parameters<WorkflowRuntimeRepository["recoverInferenceJobs"]>[0]) {
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return { expired: 0, recovered: 0 };
    const scanned = await this.db.selectFrom(`${INFERENCE_JOB_TABLE} as job`)
      .innerJoin(`${RUN_TABLE} as inference_run`, join => join
        .onRef("inference_run.uid", "=", "job.uid")
        .onRef("inference_run.id", "=", "job.run_id"))
      .innerJoin("xy_wap_embed_workflow_definition as inference_definition", join => join
        .onRef("inference_definition.uid", "=", "inference_run.uid")
        .onRef("inference_definition.id", "=", "inference_run.workflow_id"))
      .select(["job.id", "job.run_id", "job.task_id", "inference_run.uid", "inference_run.workflow_id"])
      .where("job.status", "in", ["pending", "retry_wait", "running"])
      .where("job.paused_at", "is", null)
      .where("inference_definition.biz_status", "=", 1)
      .where("inference_definition.runtime_status", "=", "active")
      .where(eb => eb.or([
        eb("job.deadline_at", "<=", input.now),
        eb.and([
          eb("job.status", "in", ["pending", "retry_wait"]),
          eb("job.attempt", ">=", input.maxAttempts),
        ]),
        eb.and([
          eb("job.status", "=", "running"),
          eb("job.lease_expires_at", "<=", input.now),
        ]),
      ]))
      .orderBy("job.id", "asc").limit(limit).execute();
    if (scanned.length === 0) return { expired: 0, recovered: 0 };
    return this.db.transaction().execute(async (trx) => {
      const runIds = uniqueSortedIds(scanned.map(row => row.run_id));
      const taskIds = uniqueSortedIds(scanned.map(row => row.task_id));
      const jobIds = uniqueSortedIds(scanned.map(row => row.id));
      const runRows = await trx.selectFrom(RUN_TABLE).selectAll()
        .where("id", "in", runIds).orderBy("id", "asc").forUpdate().execute();
      const taskRows = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("id", "in", taskIds).orderBy("id", "asc").forUpdate().execute();
      const definitionByKey = await loadDefinitionsForShare(trx, scanned.map(row => ({
        uid: normalizeTenantId(row.uid),
        workflowId: normalizeId(row.workflow_id),
      })));
      const locked = await trx.selectFrom(INFERENCE_JOB_TABLE).selectAll()
        .where("id", "in", jobIds)
        .where("paused_at", "is", null)
        .where("status", "in", ["pending", "retry_wait", "running"])
        .orderBy("id", "asc").forUpdate().skipLocked().execute();
      const toFail: typeof locked = [];
      const toRecover: typeof locked = [];
      for (const row of locked) {
        const leaseExpired = row.status === "running"
          && row.lease_expires_at !== null
          && row.lease_expires_at <= input.now;
        const attemptsExhausted = row.attempt >= input.maxAttempts
          && (row.status !== "running" || leaseExpired);
        if (row.deadline_at <= input.now || attemptsExhausted) toFail.push(row);
        else if (leaseExpired) toRecover.push(row);
      }
      if (toRecover.length > 0) {
        await trx.updateTable(INFERENCE_JOB_TABLE).set({
          lease_expires_at: null,
          lease_owner: null,
          next_attempt_at: input.now,
          status: "pending",
        }).where("id", "in", toRecover.map(row => row.id))
          .where("status", "=", "running")
          .where("lease_expires_at", "<=", input.now)
          .executeTakeFirst();
      }
      if (toFail.length > 0) {
        const deadlineIds = toFail.filter(row => row.deadline_at <= input.now).map(row => row.id);
        const attemptIds = toFail.filter(row => row.deadline_at > input.now).map(row => row.id);
        if (deadlineIds.length > 0) {
          await trx.updateTable(INFERENCE_JOB_TABLE).set({
            completed_at: input.now,
            error_code: "WORKFLOW_INFERENCE_DEADLINE_EXCEEDED",
            error_message: "执行未完成",
            failure_kind: "unknown",
            lease_expires_at: null,
            lease_owner: null,
            status: "failed",
          }).where("id", "in", deadlineIds).executeTakeFirstOrThrow();
        }
        if (attemptIds.length > 0) {
          await trx.updateTable(INFERENCE_JOB_TABLE).set({
            completed_at: input.now,
            error_code: "WORKFLOW_INFERENCE_ATTEMPTS_EXHAUSTED",
            error_message: "执行未完成",
            failure_kind: "unknown",
            lease_expires_at: null,
            lease_owner: null,
            status: "failed",
          }).where("id", "in", attemptIds).executeTakeFirstOrThrow();
        }
        const runById = new Map(runRows.map(row => [normalizeId(row.id), row]));
        const taskById = new Map(taskRows.map(row => [normalizeId(row.id), row]));
        const waking: Array<{ decision: "cancel" | "defer" | "execute"; runId: string; task: WorkflowTaskRecord }> = [];
        for (const row of toFail) {
          const runRow = runById.get(normalizeId(row.run_id));
          const taskRow = taskById.get(normalizeId(row.task_id));
          if (!runRow || !taskRow) continue;
          const task = mapTask(taskRow);
          const run = mapRun(runRow);
          if (task.status !== "pending" || task.taskType !== "inference" || run.status !== "waiting") continue;
          const definition = definitionByKey.get(definitionKey(run.uid, run.workflowId));
          waking.push({
            decision: definition
              ? getWorkflowExecutionBoundaryDecision({
                  bizStatus: definition.biz_status === 1 ? 1 : 0,
                  runtimeStatus: parseRuntimeStatus(definition.runtime_status),
                })
              : "cancel",
            runId: run.id,
            task,
          });
        }
        const executeTasks = waking.filter(item => item.decision === "execute");
        const pendingTasks = waking.filter(item => item.decision !== "execute");
        const wakingRunIds = [...new Set(waking.map(item => item.runId))];
        if (executeTasks.length > 0) {
          await trx.updateTable(TASK_TABLE).set({
            bucket_time: floorToMinute(input.now),
            due_at: input.now,
            status: "dispatched",
            task_type: "execute",
            task_version: sql<number>`task_version + 1`,
          }).where("id", "in", executeTasks.map(item => item.task.id))
            .where("status", "=", "pending")
            .executeTakeFirstOrThrow();
          await insertTaskOutboxBatch(trx, executeTasks.map(item => ({
            ...item.task,
            dueAt: input.now,
            status: "dispatched" as const,
            taskType: "execute",
            taskVersion: item.task.taskVersion + 1,
          })), input.now);
        }
        if (pendingTasks.length > 0) {
          await trx.updateTable(TASK_TABLE).set({
            bucket_time: floorToMinute(input.now),
            due_at: input.now,
            status: "pending",
            task_type: "execute",
            task_version: sql<number>`task_version + 1`,
          }).where("id", "in", pendingTasks.map(item => item.task.id))
            .where("status", "=", "pending")
            .executeTakeFirstOrThrow();
        }
        if (wakingRunIds.length > 0) {
          await trx.updateTable(RUN_TABLE).set({
            lock_version: sql<number>`lock_version + 1`,
            next_execute_at: input.now,
            status: "running",
          }).where("id", "in", wakingRunIds)
            .where("status", "=", "waiting")
            .executeTakeFirstOrThrow();
        }
      }
      return { expired: toFail.length, recovered: toRecover.length };
    });
  }

  transitionInferenceJobs(
    input: Parameters<WorkflowRuntimeRepository["transitionInferenceJobs"]>[0],
  ) {
    return transitionMysqlWorkflowInferenceJobs(this.db, input);
  }

  private finishInference(input: {
    allowUnleased?: boolean;
    completedAt: Date;
    errorCode?: string;
    errorMessage?: string;
    failureKind?: "retryable" | "terminal" | "unknown";
    id: string;
    leaseOwner: string | null;
    recovery?: {
      maxAttempts: number;
      now: Date;
    };
    result?: import("@chatai/contracts").WorkflowInferenceResult;
    status: "failed" | "succeeded";
  }) {
    return this.db.transaction().execute(async (trx) => {
      const candidate = await trx.selectFrom(INFERENCE_JOB_TABLE).select(["run_id", "task_id", "uid"])
        .where("id", "=", input.id).executeTakeFirst();
      if (!candidate) return false;
      const runRow = await trx.selectFrom(RUN_TABLE).selectAll()
        .where("uid", "=", candidate.uid).where("id", "=", candidate.run_id)
        .forUpdate().executeTakeFirst();
      const taskRow = await trx.selectFrom(TASK_TABLE).selectAll()
        .where("uid", "=", candidate.uid).where("id", "=", candidate.task_id)
        .forUpdate().executeTakeFirst();
      const definition = runRow
        ? await trx.selectFrom("xy_wap_embed_workflow_definition")
            .select(["biz_status", "runtime_status"])
            .where("uid", "=", candidate.uid).where("id", "=", runRow.workflow_id)
            .forShare().executeTakeFirst()
        : undefined;
      let query = trx.selectFrom(INFERENCE_JOB_TABLE).selectAll()
        .where("id", "=", input.id);
      query = input.allowUnleased
        ? query.where("status", "in", ["pending", "retry_wait", "running"])
        : query.where("status", "=", "running");
      if (!input.allowUnleased) query = query.where("lease_owner", "=", input.leaseOwner);
      const row = await query.forUpdate().executeTakeFirst();
      if (!row) return false;
      if (input.recovery) {
        if (row.paused_at !== null) return false;
        const leaseExpired = row.status === "running"
          && row.lease_expires_at !== null
          && row.lease_expires_at <= input.recovery.now;
        const attemptsExhausted = row.attempt >= input.recovery.maxAttempts
          && (row.status !== "running" || leaseExpired);
        if (row.deadline_at > input.recovery.now && !attemptsExhausted) return false;
      }
      await trx.updateTable(INFERENCE_JOB_TABLE).set({
        completed_at: input.completedAt,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        failure_kind: input.failureKind ?? null,
        lease_expires_at: null,
        lease_owner: null,
        result_json: input.result ? stringifyJson(input.result) : null,
        status: input.status,
      }).where("id", "=", row.id).executeTakeFirstOrThrow();
      if (!taskRow || !runRow) return true;
      const task = mapTask(taskRow);
      const run = mapRun(runRow);
      if (task.status !== "pending" || task.taskType !== "inference" || run.status !== "waiting") {
        return true;
      }
      const decision = definition ? getWorkflowExecutionBoundaryDecision({
        bizStatus: definition.biz_status === 1 ? 1 : 0,
        runtimeStatus: parseRuntimeStatus(definition.runtime_status),
      }) : "cancel";
      const nextTaskVersion = task.taskVersion + 1;
      await trx.updateTable(TASK_TABLE).set({
        bucket_time: floorToMinute(input.completedAt),
        due_at: input.completedAt,
        status: decision === "execute" ? "dispatched" : "pending",
        task_type: "execute",
        task_version: nextTaskVersion,
      }).where("id", "=", task.id).where("task_version", "=", task.taskVersion)
        .where("status", "=", "pending").executeTakeFirstOrThrow();
      await trx.updateTable(RUN_TABLE).set({
        lock_version: run.lockVersion + 1,
        next_execute_at: input.completedAt,
        status: "running",
      }).where("id", "=", run.id).where("lock_version", "=", run.lockVersion)
        .where("status", "=", "waiting").executeTakeFirstOrThrow();
      if (decision === "execute") {
        await insertTaskOutbox(trx, {
          ...task,
          dueAt: input.completedAt,
          status: "dispatched",
          taskType: "execute",
          taskVersion: nextTaskVersion,
        }, input.completedAt);
      }
      return true;
    });
  }

  async scheduleCapabilityRetry(
    input: Parameters<WorkflowRuntimeRepository["scheduleCapabilityRetry"]>[0],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const state = await lockCapabilityFailureState(trx, input);
      if (state.kind !== "success") return state;
      const { run, task } = state;
      await insertWorkflowInbox(trx, input.uid, input.inbox, input.now);
      await updateCapabilityExecutionFailure(trx, input, "retrying");
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

  async failCapabilityExecution(
    input: Parameters<WorkflowRuntimeRepository["failCapabilityExecution"]>[0],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const state = await lockCapabilityFailureState(trx, input);
      if (state.kind !== "success") return state;
      const { run, task } = state;
      await insertWorkflowInbox(trx, input.uid, input.inbox, input.now);
      await updateCapabilityExecutionFailure(trx, input, "failed");
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
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return [];
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(OUTBOX_TABLE).selectAll()
        .where("status", "=", "pending")
        .where("next_attempt_at", "<=", input.now)
        .orderBy("next_attempt_at", "asc")
        .orderBy("id", "asc")
        .limit(limit)
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
        || run.status !== "running"
        || task.taskVersion !== input.expectedTaskVersion
        || task.status !== "running"
        || task.sequence !== run.sequence
        || task.revision !== run.revision
        || task.nodeId !== run.currentNodeId) return { kind: "conflict" as const };

      const failed = input.nodeExecution.errorCode !== undefined;
      const now = new Date();
      const existingExecution = await trx.selectFrom(EXECUTION_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("run_id", "=", run.id)
        .where("sequence", "=", task.sequence)
        .forUpdate()
        .executeTakeFirst();
      if (existingExecution
        && (existingExecution.execution_key !== input.nodeExecution.executionKey
          || existingExecution.revision !== task.revision
          || existingExecution.status !== "running")) {
        return { kind: "conflict" as const };
      }

      const nextContext = !failed && input.context
        ? structuredClone(input.context)
        : run.context;
      let boundaryDecision: "cancel" | "defer" | "execute" = "execute";
      let latestRevision: number | null = null;
      let forwardRoute: ReturnType<typeof resolveWorkflowForwardRoute> | null = null;
      if (!failed && input.sourceOutletId) {
        const definition = await trx.selectFrom("xy_wap_embed_workflow_definition")
          .select(["biz_status", "published_revision", "runtime_status"])
          .where("uid", "=", input.uid)
          .where("id", "=", run.workflowId)
          .forShare()
          .executeTakeFirst();
        boundaryDecision = definition
          ? getWorkflowExecutionBoundaryDecision({
              bizStatus: definition.biz_status === 1 ? 1 : 0,
              runtimeStatus: parseRuntimeStatus(definition.runtime_status),
            })
          : "cancel";
        if (boundaryDecision === "cancel") {
          return { action: "cancel" as const, kind: "workflow-unavailable" as const };
        }
        if (definition?.published_revision === null || definition?.published_revision === undefined) {
          return { kind: "conflict" as const };
        }
        const revisionRow = await trx.selectFrom(REVISION_TABLE)
          .select(["execution_spec_json", "revision"])
          .where("uid", "=", input.uid)
          .where("workflow_id", "=", run.workflowId)
          .where("revision", "=", definition.published_revision)
          .executeTakeFirst();
        if (!revisionRow) return { kind: "conflict" as const };
        latestRevision = revisionRow.revision;
        forwardRoute = resolveWorkflowForwardRoute({
          context: nextContext,
          currentNodeId: task.nodeId,
          currentNodeKind: task.nodeKind,
          latestSpec: normalizeWorkflowExecutionSpec(
            parseJson(revisionRow.execution_spec_json) as WorkflowStoredExecutionSpec,
          ),
          sourceOutletId: input.sourceOutletId,
        });
      }

      if (existingExecution) {
        await trx.updateTable(EXECUTION_TABLE).set({
          completed_at: now,
          error_code: input.nodeExecution.errorCode ?? null,
          error_message: input.nodeExecution.errorMessage ?? null,
          failure_kind: null,
          output_json: stringifyJson(input.nodeExecution.output),
          source_outlet_id: input.nodeExecution.sourceOutletId ?? null,
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
          execution_key: input.nodeExecution.executionKey,
          input_snapshot_json: stringifyJson(input.nodeExecution.input),
          node_id: task.nodeId,
          node_kind: task.nodeKind,
          output_json: stringifyJson(input.nodeExecution.output),
          revision: task.revision,
          run_id: run.id,
          sequence: task.sequence,
          source_outlet_id: input.nodeExecution.sourceOutletId ?? null,
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
      if (forwardRoute?.kind === "success" && latestRevision !== null) {
        const dispatchImmediately = boundaryDecision === "execute";
        nextTask = await insertTask(trx, {
          createdAt: now,
          dueAt: now,
          nodeId: forwardRoute.target.id,
          nodeKind: forwardRoute.target.kind,
          revision: latestRevision,
          runId: run.id,
          sequence: nextSequence,
          shardId: run.shardId,
          status: dispatchImmediately ? "dispatched" : "pending",
          taskType: "execute",
          uid: input.uid,
          workflowId: run.workflowId,
        });
        if (dispatchImmediately) await insertTaskOutbox(trx, nextTask, now);
      }

      const nextRun: WorkflowRunRecord = {
        ...run,
        context: nextContext,
        currentNodeId: forwardRoute?.kind === "success"
          ? forwardRoute.target.id
          : run.currentNodeId,
        lockVersion: run.lockVersion + 1,
        nextExecuteAt: forwardRoute?.kind === "success" ? now : null,
        revision: forwardRoute?.kind === "success" && latestRevision !== null
          ? latestRevision
          : run.revision,
        sequence: forwardRoute?.kind === "success" ? nextSequence : run.sequence,
        status: transitionRun(
          run.status,
          failed
            ? "failed"
            : forwardRoute?.kind === "flow-changed"
              ? "cancelled"
              : forwardRoute?.kind === "success"
                ? "running"
                : "completed",
        ),
        terminalReason: failed
          ? input.nodeExecution.errorCode ?? null
          : forwardRoute?.kind === "flow-changed"
            ? forwardRoute.reason
            : null,
      };
      await trx.updateTable(RUN_TABLE).set({
        completed_at: TERMINAL_RUN_STATUSES.includes(nextRun.status as typeof TERMINAL_RUN_STATUSES[number])
          ? now
          : null,
        context_json: stringifyJson(nextRun.context),
        current_node_id: nextRun.currentNodeId,
        lock_version: nextRun.lockVersion,
        next_execute_at: nextRun.nextExecuteAt,
        revision: nextRun.revision,
        sequence: nextRun.sequence,
        status: nextRun.status,
        terminal_reason: nextRun.terminalReason,
      }).where("uid", "=", input.uid).where("id", "=", run.id)
        .where("lock_version", "=", run.lockVersion).executeTakeFirstOrThrow();
      if (failed) {
        await insertNodeMetricEvents(trx, {
          eventKey: `${run.id}:${task.sequence}:failed`,
          runId: run.id,
          runRevision: task.revision,
          runShardId: run.shardId,
          uid: input.uid,
          workflowId: run.workflowId,
        }, createNodeMetricDeltas({
          kind: "left-incomplete",
          nodeId: task.nodeId,
          nodeKind: task.nodeKind,
        }));
      } else if (forwardRoute?.kind === "flow-changed") {
        await insertNodeMetricEvents(trx, {
          eventKey: `${run.id}:${task.sequence}:flow-changed`,
          runId: run.id,
          runRevision: task.revision,
          runShardId: run.shardId,
          uid: input.uid,
          workflowId: run.workflowId,
        }, createNodeMetricDeltas({
          kind: "left-incomplete",
          nodeId: task.nodeId,
          nodeKind: task.nodeKind,
        }));
      } else if (forwardRoute?.kind === "success" && latestRevision !== null) {
        const deltas = createNodeMetricDeltas({
          fromNodeId: task.nodeId,
          fromNodeKind: task.nodeKind,
          kind: "advanced",
          toNodeId: forwardRoute.target.id,
          toNodeKind: forwardRoute.target.kind,
        });
        await insertNodeMetricEvents(trx, {
          eventKey: `${run.id}:${task.sequence}:advanced:left`,
          runId: run.id,
          runRevision: task.revision,
          runShardId: run.shardId,
          uid: input.uid,
          workflowId: run.workflowId,
        }, deltas.filter(delta => delta.nodeId === task.nodeId));
        await insertNodeMetricEvents(trx, {
          eventKey: `${run.id}:${task.sequence}:advanced:entered`,
          runId: run.id,
          runRevision: latestRevision,
          runShardId: run.shardId,
          uid: input.uid,
          workflowId: run.workflowId,
        }, deltas.filter(delta => delta.nodeId === forwardRoute.target.id));
      } else {
        await insertNodeMetricEvents(trx, {
          eventKey: `${run.id}:${task.sequence}:completed`,
          runId: run.id,
          runRevision: task.revision,
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
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return { dead: 0, recovered: 0 };
    return this.db.transaction().execute(async (trx) => {
      const candidateRows = await trx.selectFrom(TASK_TABLE).select([
        "attempt", "id", "node_id", "node_kind", "revision", "run_id", "shard_id", "uid", "workflow_id",
      ])
        .where("status", "=", "running").where("lease_expires_at", "<=", input.now)
        .orderBy("lease_expires_at", "asc").orderBy("id", "asc").limit(limit)
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
        await trx.updateTable(EXECUTION_TABLE).set({
          completed_at: input.now,
          error_code: "WORKFLOW_TASK_ATTEMPTS_EXHAUSTED",
          error_message: "Workflow Task attempts exhausted",
          failure_kind: null,
          status: "failed",
        }).where(eb => eb.or(deadRows.map(row => eb.and([
          eb("uid", "=", row.uid),
          eb("run_id", "=", row.run_id),
          eb("sequence", "=", row.sequence),
        ]))))
          .where("status", "=", "running")
          .executeTakeFirst();
        await insertNodeMetricEventsBulk(trx, deadRows.map(row => ({
          context: {
            eventKey: `${normalizeId(row.run_id)}:${normalizeId(row.id)}:failed`,
            runId: normalizeId(row.run_id),
            runRevision: row.revision,
            runShardId: row.shard_id,
            uid: normalizeTenantId(row.uid),
            workflowId: normalizeId(row.workflow_id),
          },
          deltas: createNodeMetricDeltas({
            kind: "left-incomplete",
            nodeId: row.node_id,
            nodeKind: parseNodeKind(row.node_kind),
          }),
        })));
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
    const limit = boundBatchLimit(input.limit);
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
          || authoritativeTask.nodeId !== run.current_node_id
          || (run.status === "waiting" && (
            (authoritativeTask.taskType !== "wait" && authoritativeTask.taskType !== "wait-event"
              && authoritativeTask.taskType !== "inference"
              && !(authoritativeTask.taskType === "execute"
                && isWorkflowTaskDeferReasonCode(authoritativeTask.lastErrorCode)))
            || !sameTimestamp(authoritativeTask.dueAt, run.next_execute_at)
          ));
        if (!invalidAuthoritativeTask || toDate(run.update_time) > input.inconsistentBefore) continue;
        runsToFail.push(run);
        for (const task of runTasks) taskIdsToCancel.add(task.id);
      }

      for (const run of runsToFail) {
        const runId = normalizeId(run.id);
        const runTasks = tasks.filter(task => task.runId === runId);
        const activeMetricTask = runTasks.find(task => task.nodeId === run.current_node_id);
        if (!activeMetricTask) continue;
        await insertNodeMetricEvents(trx, {
          eventKey: `${runId}:runtime-state-inconsistent`,
          runId,
          runRevision: run.revision,
          runShardId: run.shard_id,
          uid: normalizeTenantId(run.uid),
          workflowId: normalizeId(run.workflow_id),
        }, createNodeMetricDeltas({
          kind: "left-incomplete",
          nodeId: activeMetricTask.nodeId,
          nodeKind: activeMetricTask.nodeKind,
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

  async reconcileEventSubscriptions(
    input: Parameters<WorkflowRuntimeRepository["reconcileEventSubscriptions"]>[0],
  ) {
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) {
      return { cancelled: 0, checked: 0, hasMore: false, lastSubscriptionId: null };
    }
    return this.db.transaction().execute(async (trx) => {
      let query = trx.selectFrom(EVENT_SUBSCRIPTION_TABLE).selectAll()
        .where("status", "in", ["waiting", "triggered"])
        .orderBy("id", "asc")
        .limit(limit + 1)
        .forUpdate()
        .skipLocked();
      if (input.afterSubscriptionId) {
        query = query.where("id", ">", input.afterSubscriptionId);
      }
      const candidates = await query.execute();
      const selected = candidates.slice(0, limit);
      if (selected.length === 0) {
        return { cancelled: 0, checked: 0, hasMore: false, lastSubscriptionId: null };
      }

      const runIds = [...new Set(selected.map(item => item.run_id))];
      const taskIds = [...new Set(selected.map(item => item.task_id))];
      const runs = await trx.selectFrom(RUN_TABLE).select(["current_node_id", "id", "status"])
        .where("id", "in", runIds)
        .execute();
      const tasks = await trx.selectFrom(TASK_TABLE)
        .select(["due_at", "id", "node_id", "node_kind", "run_id", "status", "task_type"])
        .where("id", "in", taskIds)
        .execute();
      const runById = new Map(runs.map(run => [normalizeId(run.id), run]));
      const taskById = new Map(tasks.map(task => [normalizeId(task.id), task]));
      const inconsistentIds = selected.filter(row => {
        const subscription = mapEventSubscription(row);
        const run = runById.get(subscription.runId);
        const task = taskById.get(subscription.taskId);
        const expectedDueAt = subscription.status === "triggered"
          ? subscription.collectUntil
          : subscription.expiresAt;
        return !run
          || !["queued", "running", "waiting"].includes(run.status)
          || run.current_node_id !== subscription.nodeId
          || !task
          || normalizeId(task.run_id) !== subscription.runId
          || task.node_id !== subscription.nodeId
          || task.node_kind !== "wait-event"
          || task.task_type !== "wait-event"
          || !["pending", "leased", "dispatched", "running"].includes(task.status)
          || !expectedDueAt
          || !sameTimestamp(task.due_at, expectedDueAt);
      }).map(row => row.id);
      let cancelled = 0;
      if (inconsistentIds.length > 0) {
        const update = await trx.updateTable(EVENT_SUBSCRIPTION_TABLE).set({ status: "cancelled" })
          .where("id", "in", inconsistentIds)
          .where("status", "in", ["waiting", "triggered"])
          .executeTakeFirst();
        cancelled = Number(update.numUpdatedRows);
      }
      return {
        cancelled,
        checked: selected.length,
        hasMore: candidates.length > selected.length,
        lastSubscriptionId: normalizeId(selected.at(-1)!.id),
      };
    });
  }

  async republishStalledDispatchedTasks(
    input: Parameters<WorkflowRuntimeRepository["republishStalledDispatchedTasks"]>[0],
  ) {
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return 0;
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
        .limit(limit)
        .forUpdate()
        .skipLocked()
        .execute();
      if (rows.length === 0) return 0;
      await trx.updateTable(OUTBOX_TABLE).set({ status: "republished" })
        .where("id", "in", rows.map(row => row.outbox_id))
        .where("status", "=", "sent")
        .executeTakeFirstOrThrow();
      await insertTaskOutboxBatch(trx, rows.map(mapTask), input.now);
      return rows.length;
    });
  }

  async cleanupExpiredInbox(input: Parameters<WorkflowRuntimeRepository["cleanupExpiredInbox"]>[0]) {
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return 0;
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(INBOX_TABLE).select("id")
        .where("expires_at", "<=", input.now)
        .orderBy("expires_at", "asc")
        .orderBy("id", "asc")
        .limit(limit)
        .forUpdate()
        .skipLocked()
        .execute();
      const ids = rows.map(row => row.id);
      if (ids.length === 0) return 0;
      const result = await trx.deleteFrom(INBOX_TABLE).where("id", "in", ids).executeTakeFirst();
      return Number(result.numDeletedRows);
    });
  }

  async claimRevisionCleanupBatch(
    input: Parameters<WorkflowRuntimeRepository["claimRevisionCleanupBatch"]>[0],
  ) {
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return [];
    return this.db.transaction().execute(async (trx) => {
      await trx.updateTable(REVISION_CLEANUP_TABLE).set({
        last_error_code: "WORKFLOW_REVISION_CLEANUP_ATTEMPTS_EXHAUSTED",
        lease_expires_at: null,
        lease_owner: null,
        status: "dead",
      }).where("attempt", ">=", input.maxAttempts)
        .where(eb => eb.or([
          eb.and([eb("status", "=", "pending"), eb("next_attempt_at", "<=", input.now)]),
          eb.and([eb("status", "=", "leased"), eb("lease_expires_at", "<=", input.now)]),
        ]))
        .executeTakeFirst();
      const rows = await trx.selectFrom(REVISION_CLEANUP_TABLE).selectAll()
        .where("attempt", "<", input.maxAttempts)
        .where(eb => eb.or([
          eb.and([eb("status", "=", "pending"), eb("next_attempt_at", "<=", input.now)]),
          eb.and([eb("status", "=", "leased"), eb("lease_expires_at", "<=", input.now)]),
        ]))
        .orderBy("id", "asc")
        .limit(limit)
        .forUpdate()
        .skipLocked()
        .execute();
      if (rows.length === 0) return [];
      const ids = rows.map(row => row.id);
      await trx.updateTable(REVISION_CLEANUP_TABLE).set({
        attempt: sql<number>`attempt + 1`,
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        status: "leased",
      }).where("id", "in", ids).executeTakeFirstOrThrow();
      return rows.map(row => mapRevisionCleanup({
        ...row,
        attempt: row.attempt + 1,
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        status: "leased",
      }));
    });
  }

  async processRevisionCleanupBatch(
    input: Parameters<WorkflowRuntimeRepository["processRevisionCleanupBatch"]>[0],
  ) {
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return { kind: "conflict" as const };
    const request = await this.db.selectFrom(REVISION_CLEANUP_TABLE).selectAll()
      .where("id", "=", input.cleanupId)
      .executeTakeFirst();
    if (!request) return { kind: "not-found" as const };
    if (request.status !== "leased" || request.lease_owner !== input.leaseOwner) {
      return { kind: "conflict" as const };
    }
    return this.db.transaction().execute(async (trx) => {
      let runQuery = trx.selectFrom(RUN_TABLE).selectAll()
        .where("uid", "=", normalizeTenantId(request.uid))
        .where("workflow_id", "=", request.workflow_id)
        .where("status", "in", ACTIVE_RUN_STATUSES)
        .where("current_node_id", "=", request.node_id)
        .orderBy("id", "asc")
        .limit(limit + 1)
        .forUpdate();
      // Cursor pagination must wait for locked Runs or it can advance past them permanently.
      if (request.after_run_id !== null) runQuery = runQuery.where("id", ">", request.after_run_id);
      const candidateRuns = await runQuery.execute();
      const selectedRuns = candidateRuns.slice(0, limit);
      const runIds = selectedRuns.map(run => run.id);
      const taskRows = runIds.length === 0
        ? []
        : await trx.selectFrom(TASK_TABLE).selectAll()
            .where("run_id", "in", runIds)
            .where("status", "in", ACTIVE_TASK_STATUSES)
            .orderBy("id", "asc")
            .forUpdate()
            .execute();
      const definition = await trx.selectFrom("xy_wap_embed_workflow_definition")
        .select("published_revision")
        .where("uid", "=", normalizeTenantId(request.uid))
        .where("id", "=", request.workflow_id)
        .forShare()
        .executeTakeFirst();
      const revision = definition?.published_revision === null || definition?.published_revision === undefined
        ? null
        : await trx.selectFrom(REVISION_TABLE)
            .select("execution_spec_json")
            .where("uid", "=", normalizeTenantId(request.uid))
            .where("workflow_id", "=", request.workflow_id)
            .where("revision", "=", definition.published_revision)
            .executeTakeFirst();
      if (!revision) return { kind: "conflict" as const };
      const cleanupRow = await trx.selectFrom(REVISION_CLEANUP_TABLE).selectAll()
        .where("id", "=", request.id)
        .forUpdate()
        .executeTakeFirst();
      if (!cleanupRow || cleanupRow.status !== "leased" || cleanupRow.lease_owner !== input.leaseOwner) {
        return { kind: "conflict" as const };
      }
      const latestSpec = normalizeWorkflowExecutionSpec(
        parseJson(revision.execution_spec_json) as WorkflowStoredExecutionSpec,
      );
      if (latestSpec.nodes.some(node => node.id === request.node_id)) {
        await trx.updateTable(REVISION_CLEANUP_TABLE).set({
          lease_expires_at: null,
          lease_owner: null,
          status: "obsolete",
        }).where("id", "=", request.id)
          .where("status", "=", "leased")
          .where("lease_owner", "=", input.leaseOwner)
          .executeTakeFirstOrThrow();
        return {
          cancelled: 0,
          hasMore: false,
          kind: "success" as const,
          status: "obsolete" as const,
        };
      }

      const nodeKind = parseRevisionCleanupNodeKind(request.node_kind);
      const expectedTaskType = nodeKind === "wait" ? "wait" : "wait-event";
      const taskByRunId = new Map(selectedRuns.flatMap(run => {
        const runId = normalizeId(run.id);
        const task = taskRows.find(candidate => normalizeId(candidate.run_id) === runId
          && candidate.sequence === run.sequence
          && candidate.node_id === request.node_id
          && candidate.node_kind === nodeKind
          && (candidate.task_type === "execute" || candidate.task_type === expectedTaskType));
        return task ? [[runId, task] as const] : [];
      }));
      const runsToCancel = selectedRuns.filter(run => {
        const task = taskByRunId.get(normalizeId(run.id));
        return task?.sequence === run.sequence
          && task.revision === run.revision
          && task.node_id === run.current_node_id;
      });
      const taskIds = runsToCancel.flatMap(run => {
        const task = taskByRunId.get(normalizeId(run.id));
        return task ? [task.id] : [];
      });
      if (taskIds.length > 0) {
        await trx.updateTable(TASK_TABLE).set({
          last_error_code: "flow_changed_current_node_deleted",
          lease_expires_at: null,
          lease_owner: null,
          status: "cancelled",
          task_version: sql<number>`task_version + 1`,
        }).where("id", "in", taskIds)
          .where("status", "in", ACTIVE_TASK_STATUSES)
          .executeTakeFirstOrThrow();
      }
      const cancelledRunIds = runsToCancel.map(run => run.id);
      if (cancelledRunIds.length > 0) {
        await trx.updateTable(EVENT_SUBSCRIPTION_TABLE).set({
          status: "cancelled",
          update_time: input.now,
        }).where("run_id", "in", cancelledRunIds)
          .where("status", "in", ["waiting", "triggered"])
          .executeTakeFirst();
        await insertNodeMetricEventsBulk(trx, runsToCancel.map(run => {
          const task = taskByRunId.get(normalizeId(run.id))!;
          return {
            context: {
              eventKey: `${normalizeId(run.id)}:revision-cleanup:${normalizeId(request.id)}`,
              runId: normalizeId(run.id),
              runRevision: task.revision,
              runShardId: run.shard_id,
              uid: normalizeTenantId(run.uid),
              workflowId: normalizeId(run.workflow_id),
            },
            deltas: createNodeMetricDeltas({
              kind: "left-incomplete" as const,
              nodeId: task.node_id,
              nodeKind,
            }),
          };
        }));
        await trx.updateTable(RUN_TABLE).set({
          completed_at: input.now,
          lock_version: sql<number>`lock_version + 1`,
          next_execute_at: null,
          status: "cancelled",
          terminal_reason: "flow_changed_current_node_deleted",
        }).where("id", "in", cancelledRunIds)
          .where("status", "in", ACTIVE_RUN_STATUSES)
          .executeTakeFirstOrThrow();
      }

      const hasMore = candidateRuns.length > selectedRuns.length;
      const nextStatus = hasMore ? "pending" as const : "done" as const;
      await trx.updateTable(REVISION_CLEANUP_TABLE).set({
        after_run_id: selectedRuns.at(-1)?.id ?? request.after_run_id,
        attempt: 0,
        last_error_code: null,
        lease_expires_at: null,
        lease_owner: null,
        next_attempt_at: input.now,
        status: nextStatus,
      }).where("id", "=", request.id)
        .where("status", "=", "leased")
        .where("lease_owner", "=", input.leaseOwner)
        .executeTakeFirstOrThrow();
      return {
        cancelled: runsToCancel.length,
        hasMore,
        kind: "success" as const,
        status: nextStatus,
      };
    });
  }

  async failRevisionCleanup(
    input: Parameters<WorkflowRuntimeRepository["failRevisionCleanup"]>[0],
  ) {
    const row = await this.db.selectFrom(REVISION_CLEANUP_TABLE)
      .select("attempt")
      .where("id", "=", input.cleanupId)
      .where("status", "=", "leased")
      .where("lease_owner", "=", input.leaseOwner)
      .executeTakeFirst();
    if (!row) return false;
    const result = await this.db.updateTable(REVISION_CLEANUP_TABLE).set({
      last_error_code: input.errorCode,
      lease_expires_at: null,
      lease_owner: null,
      next_attempt_at: input.nextAttemptAt,
      status: row.attempt >= input.maxAttempts ? "dead" : "pending",
    }).where("id", "=", input.cleanupId)
      .where("status", "=", "leased")
      .where("lease_owner", "=", input.leaseOwner)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  async cleanupWorkflowHistory(
    input: Parameters<WorkflowRuntimeRepository["cleanupWorkflowHistory"]>[0],
  ) {
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return emptyHistoryCleanupResult();
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
        .limit(limit + 1)
        .forUpdate()
        .skipLocked()
        .execute();
      const selectedRuns = runs.slice(0, limit);
      const runIds = selectedRuns.map(run => run.id);
      if (runIds.length === 0) {
        return { hasMore: false, outboxDeleted: 0, tasksDeleted: 0 };
      }
      const candidateOutbox = await trx.selectFrom(`${OUTBOX_TABLE} as outbox`)
        .innerJoin(`${TASK_TABLE} as task`, join => join
          .onRef("task.id", "=", "outbox.aggregate_id"))
        .select(["outbox.status", "task.run_id"])
        .where("outbox.aggregate_type", "=", "workflow_task")
        .where("task.run_id", "in", runIds)
        .orderBy("outbox.id", "asc")
        .forUpdate()
        .execute();
      const blockedRunIds = new Set(candidateOutbox
        .filter(item => item.status === "leased")
        .map(item => normalizeId(item.run_id)));
      const deletableRunIds = runIds.filter(runId => !blockedRunIds.has(normalizeId(runId)));
      if (deletableRunIds.length === 0) {
        return {
          hasMore: blockedRunIds.size > 0 || runs.length > selectedRuns.length,
          outboxDeleted: 0,
          tasksDeleted: 0,
        };
      }
      await trx.deleteFrom(INFERENCE_JOB_TABLE)
        .where("run_id", "in", deletableRunIds)
        .executeTakeFirst();
      const outboxDeleted = Number((await trx.deleteFrom(OUTBOX_TABLE)
        .where("aggregate_type", "=", "workflow_task")
        .where("aggregate_id", "in", trx.selectFrom(TASK_TABLE)
          .select("id")
          .where("run_id", "in", deletableRunIds))
        .executeTakeFirst()).numDeletedRows);
      await trx.deleteFrom(EVENT_SUBSCRIPTION_EVENT_TABLE)
        .where("subscription_id", "in", trx.selectFrom(EVENT_SUBSCRIPTION_TABLE)
          .select("id")
          .where("run_id", "in", deletableRunIds))
        .executeTakeFirst();
      await trx.deleteFrom(EVENT_SUBSCRIPTION_TABLE)
        .where("run_id", "in", deletableRunIds)
        .executeTakeFirst();
      const tasksDeleted = Number((await trx.deleteFrom(TASK_TABLE)
        .where("run_id", "in", deletableRunIds)
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
        .limit(limit + 1)
        .forUpdate()
        .skipLocked()
        .execute();
      const selectedRuns = runs.slice(0, limit);
      if (selectedRuns.length === 0) {
        return { hasMore: false, nodeExecutionsDeleted: 0, runsDeleted: 0 };
      }
      const runIds = selectedRuns.map(run => run.id);
      const remainingTasks = await trx.selectFrom(TASK_TABLE).select("run_id")
        .distinct()
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
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return 0;
    return this.db.transaction().execute(async (trx) => {
      const events = await trx.selectFrom(NODE_METRIC_EVENT_TABLE).selectAll()
        .where("processed_at", "is", null)
        .orderBy("id", "asc")
        .limit(limit)
        .forUpdate()
        .skipLocked()
        .execute();
      if (events.length === 0) return 0;
      const aggregated = new Map<string, {
        completed: number;
        current: number;
        entered: number;
        incomplete: number;
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
          incomplete: 0,
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
        current.incomplete += Number(event.incomplete_delta);
        current.passed += Number(event.passed_delta);
        aggregated.set(key, current);
      }
      for (const metric of aggregated.values()) {
        await trx.insertInto(NODE_METRIC_TABLE).values({
          completed_count: metric.completed,
          current_count: Math.max(0, metric.current),
          entered_count: metric.entered,
          incomplete_count: metric.incomplete,
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
          incomplete_count: sql<number>`incomplete_count + ${metric.incomplete}`,
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
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return 0;
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(NODE_METRIC_EVENT_TABLE).select("id")
        .where("processed_at", "is not", null)
        .where("processed_at", "<=", input.processedBefore)
        .orderBy("processed_at", "asc")
        .orderBy("id", "asc")
        .limit(limit)
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
      incomplete: Number(row.incomplete_count),
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
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return 0;
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom(OUTBOX_TABLE).select("id")
        .where("status", "=", "leased")
        .where("lease_expires_at", "<=", input.now)
        .orderBy("lease_expires_at", "asc")
        .orderBy("id", "asc")
        .limit(limit)
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
    const limit = boundBatchLimit(input.limit);
    return this.db.transaction().execute(async (trx) => {
      let query = trx.selectFrom(RUN_TABLE).select(["current_node_id", "id", "revision", "shard_id", "workflow_id"])
        .where("uid", "=", input.uid).where("workflow_id", "=", input.workflowId)
        .where("status", "in", ["queued", "running", "waiting"])
        .orderBy("id", "asc").limit(limit + 1).forUpdate();
      if (input.afterRunId) query = query.where("id", ">", input.afterRunId);
      const rows = await query.execute();
      const selectedRows = rows.slice(0, limit);
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
      await recordCancellationMetrics(trx, selectedRows.map(run => ({
        currentNodeId: run.current_node_id,
        id: run.id,
        revision: run.revision,
        shardId: run.shard_id,
        uid: input.uid,
        workflowId: run.workflow_id,
      })));
      await trx.updateTable(TASK_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "cancelled",
        task_version: sql<number>`task_version + 1`,
      })
        .where("uid", "=", input.uid).where("run_id", "in", runIds)
        .where("status", "in", ["pending", "leased", "dispatched", "running"])
        .executeTakeFirst();
      await cancelEventSubscriptions(trx, runIds);
      await cancelInferenceJobs(trx, runIds);
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
    const limit = boundBatchLimit(input.limit);
    if (limit <= 0) return { cancelled: 0, hasMore: false, lastRunId: null };
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
        .limit(limit + 1)
        .forUpdate()
        .skipLocked();
      if (input.afterRunId) query = query.where("run.id", ">", input.afterRunId);
      const rows = await query.execute();
      const selected = rows.slice(0, limit);
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
      await recordCancellationMetrics(trx, selected.map(run => ({
        currentNodeId: run.current_node_id,
        id: run.id,
        revision: run.revision,
        shardId: run.shard_id,
        uid: normalizeTenantId(run.uid),
        workflowId: run.workflow_id,
      })));
      await trx.updateTable(TASK_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "cancelled",
        task_version: sql<number>`task_version + 1`,
      }).where("run_id", "in", runIds)
        .where("status", "in", ["pending", "leased", "dispatched", "running"])
        .executeTakeFirst();
      await cancelEventSubscriptions(trx, runIds);
      await cancelInferenceJobs(trx, runIds);
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

export async function cancelMysqlEntitlementRuns(
  db: Kysely<WorkflowDatabase>,
  input: {
    now: Date;
    uid: number;
    workflowIds: DatabaseId[];
  },
) {
  if (input.workflowIds.length === 0) return;
  for (;;) {
    const cancelled = await db.transaction().execute(async (trx) => {
      const runs = await trx.selectFrom(RUN_TABLE).select("id")
        .where("uid", "=", input.uid)
        .where("workflow_id", "in", input.workflowIds)
        .where("status", "in", ACTIVE_RUN_STATUSES)
        .orderBy("id", "asc")
        .limit(ENTITLEMENT_RUN_CANCEL_BATCH_SIZE)
        .forUpdate()
        .execute();
      const runIds = runs.map(run => run.id);
      if (runIds.length === 0) return 0;
      await trx.updateTable(RUN_TABLE).set({
        completed_at: input.now,
        lock_version: sql<number>`lock_version + 1`,
        next_execute_at: null,
        status: "cancelled",
        terminal_reason: "entitlement_revoked",
      }).where("id", "in", runIds)
        .where("status", "in", ACTIVE_RUN_STATUSES)
        .executeTakeFirstOrThrow();
      await trx.updateTable(TASK_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "cancelled",
        task_version: sql<number>`task_version + 1`,
      }).where("run_id", "in", runIds)
        .where("status", "in", ACTIVE_TASK_STATUSES)
        .executeTakeFirstOrThrow();
      await cancelEventSubscriptions(trx, runIds);
      await cancelInferenceJobs(trx, runIds);
      await failRunningNodeExecutions(
        trx,
        runIds,
        input.now,
        "WORKFLOW_ENTITLEMENT_REVOKED",
        "Workflow entitlement was revoked",
      );
      await trx.updateTable(OUTBOX_TABLE).set({
        lease_expires_at: null,
        lease_owner: null,
        status: "dead",
      }).where("aggregate_type", "=", "workflow_task")
        .where("aggregate_id", "in", trx.selectFrom(TASK_TABLE)
          .select("id")
          .where("run_id", "in", runIds))
        .where("status", "in", ["pending", "leased", "republished"])
        .executeTakeFirstOrThrow();
      return runIds.length;
    });
    if (cancelled === 0) return;
  }
}

async function insertTask(
  trx: RuntimeTransaction,
  input: Omit<WorkflowTaskRecord, "attempt" | "id" | "lastErrorCode" | "leaseExpiresAt" | "leaseOwner" | "taskVersion">,
) {
  const inserted = await trx.insertInto(TASK_TABLE).values({
    attempt: 0,
    bucket_time: floorToMinute(input.dueAt),
    create_time: input.createdAt,
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
  return {
    ...input,
    attempt: 0,
    id: normalizeId(inserted.insertId),
    lastErrorCode: null,
    leaseExpiresAt: null,
    leaseOwner: null,
    taskVersion: 1,
  };
}

function insertTaskOutbox(trx: RuntimeTransaction, task: WorkflowTaskRecord, now: Date) {
  return insertTaskOutboxBatch(trx, [task], now);
}

async function insertTaskOutboxBatch(
  trx: RuntimeTransaction,
  tasks: WorkflowTaskRecord[],
  now: Date,
) {
  for (const chunk of writeChunks(tasks)) {
    await trx.insertInto(OUTBOX_TABLE).values(chunk.map(task => ({
      aggregate_id: task.id,
      aggregate_type: "workflow_task",
      attempt: 0,
      event_type: "workflow.task.ready",
      lease_expires_at: null,
      lease_owner: null,
      next_attempt_at: now,
      payload_json: stringifyJson(createTaskMessage(task, now)),
      sent_at: null,
      status: "pending",
      task_version: task.taskVersion,
      uid: task.uid,
    }))).executeTakeFirstOrThrow();
  }
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
  await insertNodeMetricEventsBulk(trx, [{ context, deltas }]);
}

async function insertNodeMetricEventsBulk(
  trx: RuntimeTransaction,
  items: Array<{
    context: {
      eventKey: string;
      runId: string;
      runRevision: number;
      runShardId: number;
      uid: number;
      workflowId: string;
    };
    deltas: WorkflowNodeMetricDelta[];
  }>,
) {
  const values = items.flatMap(({ context, deltas }) => deltas.map(delta => ({
    completed_delta: delta.completed,
    current_delta: delta.current,
    entered_delta: delta.entered,
    incomplete_delta: delta.incomplete,
    event_key: `${context.eventKey}:${delta.nodeId}`,
    node_id: delta.nodeId,
    passed_delta: delta.passed,
    processed_at: null,
    revision: context.runRevision,
    run_id: context.runId,
    shard_id: context.runShardId % 16,
    uid: context.uid,
    workflow_id: context.workflowId,
  })));
  if (values.length === 0) return;
  for (const chunk of writeChunks(values)) {
    await trx.insertInto(NODE_METRIC_EVENT_TABLE).values(chunk).onDuplicateKeyUpdate({
      event_key: sql<string>`event_key`,
    }).executeTakeFirstOrThrow();
  }
}

async function recordCancellationMetrics(
  trx: RuntimeTransaction,
  runs: Array<{
    currentNodeId: string;
    id: DatabaseId;
    revision: number;
    shardId: number;
    uid: number;
    workflowId: DatabaseId;
  }>,
) {
  if (runs.length === 0) return;
  const tasks = await trx.selectFrom(TASK_TABLE)
    .select(["node_id", "node_kind", "run_id", "sequence"])
    .where(eb => eb.or(runs.map(run => eb.and([
      eb("run_id", "=", run.id),
      eb("node_id", "=", run.currentNodeId),
    ]))))
    .orderBy("sequence", "desc")
    .execute();
  const latestByRunId = new Map<string, (typeof tasks)[number]>();
  for (const task of tasks) {
    const runId = normalizeId(task.run_id);
    if (!latestByRunId.has(runId)) latestByRunId.set(runId, task);
  }
  await insertNodeMetricEventsBulk(trx, runs.flatMap(run => {
    const task = latestByRunId.get(normalizeId(run.id));
    if (!task) return [];
    return [{
      context: {
        eventKey: `${normalizeId(run.id)}:cancelled`,
        runId: normalizeId(run.id),
        runRevision: run.revision,
        runShardId: run.shardId,
        uid: run.uid,
        workflowId: normalizeId(run.workflowId),
      },
      deltas: createNodeMetricDeltas({
        kind: "left-incomplete",
        nodeId: task.node_id,
        nodeKind: parseNodeKind(task.node_kind),
      }),
    }];
  }));
}

async function loadDefinitionsForShare(
  trx: RuntimeTransaction,
  keys: Array<{ uid: number; workflowId: string }>,
) {
  if (keys.length === 0) return new Map<string, { biz_status: number; runtime_status: string }>();
  const grouped = new Map<number, Set<string>>();
  for (const key of keys) {
    const workflowIds = grouped.get(key.uid) ?? new Set<string>();
    workflowIds.add(key.workflowId);
    grouped.set(key.uid, workflowIds);
  }
  const rows = await trx.selectFrom("xy_wap_embed_workflow_definition")
    .select(["biz_status", "id", "runtime_status", "uid"])
    .where(eb => eb.or([...grouped.entries()].map(([uid, workflowIds]) => eb.and([
      eb("uid", "=", uid),
      eb("id", "in", [...workflowIds]),
    ]))))
    .forShare()
    .execute();
  return new Map(rows.map(row => [
    definitionKey(normalizeTenantId(row.uid), normalizeId(row.id)),
    { biz_status: row.biz_status, runtime_status: row.runtime_status },
  ]));
}

function definitionKey(uid: number, workflowId: string) {
  return `${uid}:${workflowId}`;
}

function uniqueSortedIds(values: DatabaseId[]) {
  return [...new Set(values.map(value => normalizeId(value)))]
    .sort((first, second) => first < second ? -1 : first > second ? 1 : 0);
}

function boundBatchLimit(limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(Math.trunc(limit), WORKFLOW_RUNTIME_BATCH_LIMIT);
}

function writeChunks<T>(items: readonly T[]) {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += WORKFLOW_MYSQL_WRITE_CHUNK_SIZE) {
    chunks.push(items.slice(start, start + WORKFLOW_MYSQL_WRITE_CHUNK_SIZE));
  }
  return chunks;
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

function mapInferenceJob(
  row: Selectable<WorkflowInferenceJobTable>,
): WorkflowInferenceJobRecord {
  const payload = parseJson(row.payload_json);
  if (!Value.Check(WorkflowInferenceRequestSchema, payload)) {
    throw new Error("Database returned an invalid Workflow inference payload");
  }
  const result = row.result_json === null ? null : parseJson(row.result_json);
  if (result !== null && !Value.Check(WorkflowInferenceResultSchema, result)) {
    throw new Error("Database returned an invalid Workflow inference result");
  }
  const status = row.status;
  if (status !== "pending" && status !== "running" && status !== "retry_wait"
    && status !== "succeeded" && status !== "failed" && status !== "cancelled") {
    throw new Error(`Unknown Workflow inference job status: ${status}`);
  }
  if (row.node_kind !== "llm" && row.node_kind !== "ai-intent") {
    throw new Error(`Unknown Workflow inference node kind: ${row.node_kind}`);
  }
  return {
    attempt: row.attempt,
    contractVersion: row.contract_version,
    createdAt: toDate(row.create_time),
    deadlineAt: toDate(row.deadline_at),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    executionKey: row.execution_key,
    failureKind: parseCapabilityFailureKind(row.failure_kind),
    id: normalizeId(row.id),
    leaseExpiresAt: row.lease_expires_at ? toDate(row.lease_expires_at) : null,
    leaseOwner: row.lease_owner,
    nextAttemptAt: toDate(row.next_attempt_at),
    nodeId: row.node_id,
    nodeKind: row.node_kind,
    pausedAt: row.paused_at ? toDate(row.paused_at) : null,
    payload,
    result,
    runId: normalizeId(row.run_id),
    sequence: row.sequence,
    status,
    taskId: normalizeId(row.task_id),
    uid: normalizeTenantId(row.uid),
    updatedAt: toDate(row.update_time),
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
    subjectType: input.subjectType,
    terminalReason: null,
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
    subjectType: decodeWorkflowSubjectType(row.subject_type),
    terminalReason: row.terminal_reason,
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
    .where("subject_type", "=", encodeWorkflowSubjectType(input.subjectType))
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
    createdAt: row.create_time,
    dueAt: row.due_at,
    id: normalizeId(row.id),
    lastErrorCode: row.last_error_code,
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
    failureKind: parseCapabilityFailureKind(row.failure_kind),
    executionKey: row.execution_key,
    input: row.input_snapshot_json ? parseJson(row.input_snapshot_json) : {},
    nodeId: row.node_id,
    nodeKind: parseNodeKind(row.node_kind),
    output: row.output_json ? parseJson(row.output_json) : {},
    runId: normalizeId(row.run_id),
    revision: row.revision,
    sequence: row.sequence,
    sourceOutletId: row.source_outlet_id,
    status: parseNodeExecutionStatus(row.status),
    uid: normalizeTenantId(row.uid),
  };
}

function mapRevisionCleanup(
  row: Selectable<WorkflowDatabase[typeof REVISION_CLEANUP_TABLE]>,
): WorkflowRevisionCleanupRecord {
  const status = row.status;
  if (status !== "pending" && status !== "leased" && status !== "done"
    && status !== "obsolete" && status !== "dead") {
    throw new Error(`Unknown Workflow Revision cleanup status: ${status}`);
  }
  return {
    afterRunId: row.after_run_id === null ? null : normalizeId(row.after_run_id),
    attempt: row.attempt,
    id: normalizeId(row.id),
    lastErrorCode: row.last_error_code,
    leaseExpiresAt: row.lease_expires_at ? toDate(row.lease_expires_at) : null,
    leaseOwner: row.lease_owner,
    nextAttemptAt: toDate(row.next_attempt_at),
    nodeId: row.node_id,
    nodeKind: parseRevisionCleanupNodeKind(row.node_kind),
    revision: row.revision,
    status,
    uid: normalizeTenantId(row.uid),
    workflowId: normalizeId(row.workflow_id),
  };
}

function parseRevisionCleanupNodeKind(value: string): "wait" | "wait-event" {
  if (value === "wait" || value === "wait-event") return value;
  throw new Error(`Unknown Workflow Revision cleanup node kind: ${value}`);
}

async function lockCapabilityExecutionState(
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

async function lockCapabilityFailureState(
  trx: RuntimeTransaction,
  input: WorkflowCapabilityExecutionFailureInput,
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
  const state = await lockCapabilityExecutionState(trx, input);
  if (state.kind !== "success") return state;
  const executionRow = await trx.selectFrom(EXECUTION_TABLE).selectAll()
    .where("uid", "=", input.uid)
    .where("run_id", "=", input.runId)
    .where("sequence", "=", state.task.sequence)
    .where("execution_key", "=", input.executionKey)
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
  inbox: WorkflowCapabilityExecutionFailureInput["inbox"],
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

function updateCapabilityExecutionFailure(
  trx: RuntimeTransaction,
  input: WorkflowCapabilityExecutionFailureInput,
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
    .where("execution_key", "=", input.executionKey)
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

function cancelEventSubscriptions(trx: RuntimeTransaction, runIds: readonly DatabaseId[]) {
  if (runIds.length === 0) return Promise.resolve();
  return trx.updateTable(EVENT_SUBSCRIPTION_TABLE).set({ status: "cancelled" })
    .where("run_id", "in", runIds)
    .where("status", "in", ["waiting", "triggered"])
    .executeTakeFirst()
    .then(() => undefined);
}

function cancelInferenceJobs(trx: RuntimeTransaction, runIds: readonly DatabaseId[]) {
  if (runIds.length === 0) return Promise.resolve();
  return trx.updateTable(INFERENCE_JOB_TABLE).set({
    lease_expires_at: null,
    lease_owner: null,
    paused_at: null,
    status: "cancelled",
  }).where("run_id", "in", runIds)
    .where("status", "in", ["pending", "running", "retry_wait"])
    .executeTakeFirst()
    .then(() => undefined);
}

export async function transitionMysqlWorkflowInferenceJobs(
  db: RuntimeDbExecutor,
  input: Parameters<WorkflowInferenceRepository["transitionInferenceJobs"]>[0],
) {
  if (input.workflowIds.length === 0) return;
  const runIds = db.selectFrom(RUN_TABLE).select("id")
    .where("uid", "=", input.uid)
    .where("workflow_id", "in", input.workflowIds);
  if (input.transition === "cancel") {
    await db.updateTable(INFERENCE_JOB_TABLE).set({
      lease_expires_at: null,
      lease_owner: null,
      paused_at: null,
      status: "cancelled",
    }).where("uid", "=", input.uid)
      .where("run_id", "in", runIds)
      .where("status", "in", ["pending", "running", "retry_wait"])
      .executeTakeFirstOrThrow();
    return;
  }
  if (input.transition === "pause") {
    await db.updateTable(INFERENCE_JOB_TABLE).set({
      attempt: sql<number>`CASE WHEN status = 'running' THEN GREATEST(attempt - 1, 0) ELSE attempt END`,
      lease_expires_at: null,
      lease_owner: null,
      paused_at: input.transitionedAt,
      status: sql<string>`CASE WHEN status = 'running' THEN 'pending' ELSE status END`,
    }).where("uid", "=", input.uid)
      .where("run_id", "in", runIds)
      .where("status", "in", ["pending", "running", "retry_wait"])
      .where("deadline_at", ">", input.transitionedAt)
      .where("paused_at", "is", null)
      .executeTakeFirstOrThrow();
    return;
  }
  await db.updateTable(INFERENCE_JOB_TABLE).set({
    deadline_at: sql<Date>`TIMESTAMPADD(MICROSECOND, TIMESTAMPDIFF(MICROSECOND, paused_at, ${input.transitionedAt}), deadline_at)`,
    next_attempt_at: sql<Date>`TIMESTAMPADD(MICROSECOND, TIMESTAMPDIFF(MICROSECOND, paused_at, ${input.transitionedAt}), next_attempt_at)`,
    paused_at: null,
  }).where("uid", "=", input.uid)
    .where("run_id", "in", runIds)
    .where("status", "in", ["pending", "retry_wait"])
    .where("paused_at", "is not", null)
    .executeTakeFirstOrThrow();
}

function mapEventSubscription(
  row: Selectable<WorkflowEventSubscriptionTable>,
): WorkflowEventSubscriptionRecord {
  const status = row.status;
  if (status !== "waiting"
    && status !== "triggered"
    && status !== "timed_out"
    && status !== "cancelled") {
    throw new Error(`Unknown workflow event subscription status: ${status}`);
  }
  return {
    collectUntil: row.collect_until ? toDate(row.collect_until) : null,
    createdAt: toDate(row.create_time),
    effectiveFrom: toDate(row.effective_from),
    eventType: parseEntryEventType(row.event_type),
    expiresAt: toDate(row.expires_at),
    id: normalizeId(row.id),
    nodeId: row.node_id,
    revision: row.revision,
    runId: normalizeId(row.run_id),
    seatId: row.seat_id == null ? null : Number(row.seat_id),
    status,
    subjectId: row.subject_id,
    subjectType: decodeWorkflowSubjectType(row.subject_type),
    taskId: normalizeId(row.task_id),
    triggerEventId: row.trigger_event_id,
    uid: normalizeTenantId(row.uid),
    updatedAt: toDate(row.update_time),
    workflowId: normalizeId(row.workflow_id),
  };
}

function mapEventSubscriptionEvent(
  row: Selectable<WorkflowEventSubscriptionEventTable>,
): WorkflowEventSubscriptionEventRecord {
  const projection = parseJson(row.projection_json);
  if (!Value.Check(WorkflowJsonObjectSchema, projection)) {
    throw new Error("Invalid Workflow event subscription projection");
  }
  return {
    collectedAt: toDate(row.create_time),
    eventId: row.event_id,
    id: normalizeId(row.id),
    occurredAt: toDate(row.occurred_at),
    projection: structuredClone(projection),
    subscriptionId: normalizeId(row.subscription_id),
    uid: normalizeTenantId(row.uid),
  };
}

function mapTriggerBinding(row: Record<string, unknown>): WorkflowTriggerBindingRecord {
  return {
    createdAt: toDate(row.create_time),
    eventType: parseEntryEventType(row.event_type),
    filter: parseJson(row.filter_spec_json) as WorkflowTriggerBindingFilter,
    id: normalizeId(row.id),
    revision: Number(row.revision),
    status: Number(row.status) === 1 ? 1 : 0,
    subjectType: decodeWorkflowSubjectType(row.subject_type),
    uid: normalizeTenantId(row.uid),
    updatedAt: toDate(row.update_time),
    workflowId: normalizeId(row.workflow_id),
  };
}

function parseNodeKind(value: string): WorkflowNodeKind {
  if ([
    "start",
    "wait",
    "wait-event",
    "branch",
    "ratio-split",
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
    "audience-filter",
    "end",
  ].includes(value)) {
    return value as WorkflowNodeKind;
  }
  throw new Error(`Unknown workflow node kind: ${value}`);
}

function parseCapabilityFailureKind(value: string | null) {
  if (value === null || value === "retryable" || value === "terminal" || value === "unknown") return value;
  throw new Error(`Unknown workflow capability failure kind: ${value}`);
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

function parseStatusReason(value: string | null): WorkflowStatusReason {
  if (value === null || value === "entitlement_revoked") return value;
  throw new Error(`Unknown workflow status reason: ${value}`);
}

function parseEntryEventType(value: unknown): WorkflowEntryEventType {
  if (value === "contact.friend_added" || value === "contact.tag_added" || value === "message.received") {
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
function isDuplicateKeyError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY";
}
