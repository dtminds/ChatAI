import { sql, type Kysely } from "kysely";
import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import type {
  WorkflowObservabilityListState,
  WorkflowObservabilityRole,
  WorkflowObservabilityTaskDistribution,
  WorkflowObservabilityTransition,
  WorkflowRuntimeStatus,
} from "@chatai/contracts";
import { WORKFLOW_ACTIVE_RUN_STATUSES, WORKFLOW_OBSERVABILITY_ROLES } from "@chatai/contracts";

const TASK_TABLE = "xy_wap_embed_workflow_task" as const;
const DEFINITION_TABLE = "xy_wap_embed_workflow_definition" as const;
const TRANSITION_TABLE = "xy_wap_embed_workflow_task_transition" as const;
const METRIC_TABLE = "xy_wap_embed_workflow_metric" as const;
const RUN_TABLE = "xy_wap_embed_workflow_run" as const;
const OUTBOX_TABLE = "xy_wap_embed_workflow_outbox" as const;
const INFERENCE_TABLE = "xy_wap_embed_workflow_inference_job" as const;
const WORKER_STATE_TABLE = "xy_wap_embed_workflow_worker_state" as const;
const ACTIVE_TASK_STATUSES = [
  "pending",
  "suspended",
  "waiting_external",
  "leased",
  "dispatched",
  "running",
] as const;
const TASK_STATUSES = [
  "pending",
  "suspended",
  "waiting_external",
  "leased",
  "dispatched",
  "running",
  "completed",
  "cancelled",
  "dead",
] as const;

const dueBacklogSql = sql<boolean>`
  status = 'pending'
  and bucket_time <= date_format(current_timestamp, '%Y-%m-%d %H:%i:00')
  and due_at <= current_timestamp
`;
const stalledDispatchedSql = sql<boolean>`
  status = 'dispatched'
  and update_time <= date_sub(current_timestamp, interval 5 minute)
`;
const expiredLeaseSql = sql<boolean>`
  status = 'running'
  and lease_expires_at <= current_timestamp
`;

export type WorkflowObservabilityListQuery = {
  page: number;
  pageSize: number;
  state: WorkflowObservabilityListState;
  uid?: number;
  workflowId?: string;
};

export type WorkerStateRow = {
  lastDurationMs?: number;
  lastErrorCode?: string;
  lastFailureAt?: number;
  lastStartedAt?: number;
  lastSuccessAt?: number;
  reportedAt: number;
  reportedBy: string;
  role: WorkflowObservabilityRole;
};

export type TaskQueueCounts = {
  dispatched: number;
  dueBacklog: number;
  expiredLease: number;
  oldestDueAt?: number;
  pending: number;
  running: number;
  stalledDispatched: number;
  suspended: number;
};

export type TransitionCounts = {
  dead: number;
  leased: number;
  pending: number;
};

export type WorkflowListRow = {
  activeRunCount: number;
  activeTaskCount: number;
  dueBacklogCount: number;
  lastRunAt?: number;
  name: string;
  oldestDueAt?: number;
  runtimeStatus: WorkflowRuntimeStatus;
  totalRunCount: number;
  transition?: WorkflowObservabilityTransition;
  uid: number;
  workflowId: string;
};

export class WorkflowObservabilityRepository {
  constructor(private readonly db: Kysely<WorkflowDatabase>) {}

  async getObservedAt() {
    const result = await sql<{ observed_at: Date }>`
      select current_timestamp(3) as observed_at
    `.execute(this.db);
    const observedAt = result.rows[0]?.observed_at;
    if (!observedAt) throw new Error("WORKFLOW_OBSERVED_AT_UNAVAILABLE");
    return toMillis(observedAt);
  }

  async listWorkerStates(): Promise<WorkerStateRow[]> {
    const rows = await this.db.selectFrom(WORKER_STATE_TABLE).selectAll().execute();
    return rows.flatMap((row) => {
      if (!isWorkerRole(row.role)) return [];
      return [{
        ...(row.last_duration_ms == null ? {} : { lastDurationMs: row.last_duration_ms }),
        ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
        ...(row.last_failure_at ? { lastFailureAt: toMillis(row.last_failure_at) } : {}),
        ...(row.last_started_at ? { lastStartedAt: toMillis(row.last_started_at) } : {}),
        ...(row.last_success_at ? { lastSuccessAt: toMillis(row.last_success_at) } : {}),
        reportedAt: toMillis(row.reported_at),
        reportedBy: row.reported_by,
        role: row.role,
      }];
    });
  }

  async getTaskQueueCounts(): Promise<TaskQueueCounts> {
    const [pending, due, dispatched, running, stalled, expired, suspended] = await Promise.all([
      this.countTasks("pending"),
      this.db.selectFrom(TASK_TABLE).select([
        sql<number>`count(*)`.as("count"),
        sql<Date | null>`min(due_at)`.as("oldest_due_at"),
      ]).where(dueBacklogSql).executeTakeFirstOrThrow(),
      this.countTasks("dispatched"),
      this.countTasks("running"),
      this.db.selectFrom(TASK_TABLE).select(sql<number>`count(*)`.as("count"))
        .where(stalledDispatchedSql).executeTakeFirstOrThrow(),
      this.db.selectFrom(TASK_TABLE).select(sql<number>`count(*)`.as("count"))
        .where(expiredLeaseSql).executeTakeFirstOrThrow(),
      this.countTasks("suspended"),
    ]);
    return {
      dispatched,
      dueBacklog: toCount(due.count),
      expiredLease: toCount(expired.count),
      ...(due.oldest_due_at ? { oldestDueAt: toMillis(due.oldest_due_at) } : {}),
      pending,
      running,
      stalledDispatched: toCount(stalled.count),
      suspended,
    };
  }

  async getTransitionCounts(): Promise<TransitionCounts> {
    const rows = await this.db.selectFrom(`${TRANSITION_TABLE} as transition`)
      .innerJoin(`${DEFINITION_TABLE} as definition`, (join) =>
        join.onRef("transition.uid", "=", "definition.uid")
          .onRef("transition.workflow_id", "=", "definition.id"))
      .select(["transition.status as status", sql<number>`count(*)`.as("count")])
      .where("definition.biz_status", "=", 1)
      .where("transition.status", "in", ["pending", "leased", "dead"])
      .groupBy("transition.status")
      .execute();
    const byStatus = Object.fromEntries(rows.map((row) => [row.status, toCount(row.count)]));
    return {
      dead: byStatus.dead ?? 0,
      leased: byStatus.leased ?? 0,
      pending: byStatus.pending ?? 0,
    };
  }

  async getOutboxPending() {
    const row = await this.db.selectFrom(OUTBOX_TABLE).select([
      sql<number>`count(*)`.as("count"),
      sql<Date | null>`min(next_attempt_at)`.as("oldest_pending_at"),
    ]).where("status", "=", "pending").executeTakeFirstOrThrow();
    return {
      pending: toCount(row.count),
      ...(row.oldest_pending_at ? { oldestPendingAt: toMillis(row.oldest_pending_at) } : {}),
    };
  }

  async getInferenceCounts() {
    const [pending, retryWait, expired] = await Promise.all([
      this.countInference("pending"),
      this.countInference("retry_wait"),
      this.db.selectFrom(INFERENCE_TABLE).select(sql<number>`count(*)`.as("count"))
        .where("status", "=", "running")
        .where(sql<boolean>`lease_expires_at <= current_timestamp`)
        .executeTakeFirstOrThrow(),
    ]);
    return {
      expiredLease: toCount(expired.count),
      pending,
      retryWait,
    };
  }

  async listWorkflows(query: WorkflowObservabilityListQuery): Promise<{
    items: WorkflowListRow[];
    total: number;
  }> {
    const offset = (query.page - 1) * query.pageSize;
    const keys = await this.listWorkflowKeys(query, offset);
    if (keys.items.length === 0) return { items: [], total: keys.total };
    const [definitions, taskRows, transitions, metrics, runRows] = await Promise.all([
      this.db.selectFrom(DEFINITION_TABLE)
        .select(["id", "uid", "name", "runtime_status"])
        .where(definitionKeyPredicate(keys.items))
        .execute(),
      this.db.selectFrom(TASK_TABLE)
        .select([
          "uid",
          "workflow_id",
          "status",
          sql<number>`count(*)`.as("count"),
          sql<number>`sum(case when status = 'pending' and bucket_time <= date_format(current_timestamp, '%Y-%m-%d %H:%i:00') and due_at <= current_timestamp then 1 else 0 end)`.as("due_count"),
          sql<Date | null>`min(case when status = 'pending' and bucket_time <= date_format(current_timestamp, '%Y-%m-%d %H:%i:00') and due_at <= current_timestamp then due_at end)`.as("oldest_due_at"),
        ])
        .where(workflowKeyPredicate(keys.items))
        .groupBy(["uid", "workflow_id", "status"])
        .execute(),
      this.db.selectFrom(TRANSITION_TABLE)
        .selectAll()
        .where(workflowKeyPredicate(keys.items))
        .execute(),
      this.db.selectFrom(METRIC_TABLE)
        .select(["uid", "workflow_id", "total_run_count", "last_run_at"])
        .where(workflowKeyPredicate(keys.items))
        .execute(),
      this.db.selectFrom(RUN_TABLE)
        .select(["uid", "workflow_id", sql<number>`count(*)`.as("count")])
        .where(workflowKeyPredicate(keys.items))
        .where("status", "in", [...WORKFLOW_ACTIVE_RUN_STATUSES])
        .groupBy(["uid", "workflow_id"])
        .execute(),
    ]);
    const definitionByKey = new Map(definitions.map((row) => [
      workflowKey(row.uid, row.id),
      row,
    ]));
    const transitionByKey = new Map(transitions.map((row) => [
      workflowKey(row.uid, row.workflow_id),
      mapTransition(row),
    ]));
    const metricByKey = new Map(metrics.map((row) => [workflowKey(row.uid, row.workflow_id), row]));
    const runByKey = new Map(runRows.map((row) => [
      workflowKey(row.uid, row.workflow_id),
      toCount(row.count),
    ]));
    const taskByKey = new Map<string, { active: number; due: number; oldestDueAt?: number }>();
    for (const row of taskRows) {
      const key = workflowKey(row.uid, row.workflow_id);
      const current = taskByKey.get(key) ?? { active: 0, due: 0 };
      if (ACTIVE_TASK_STATUSES.includes(row.status as typeof ACTIVE_TASK_STATUSES[number])) {
        current.active += toCount(row.count);
      }
      if (row.status === "pending") {
        current.due += toCount(row.due_count);
        if (row.oldest_due_at) current.oldestDueAt = toMillis(row.oldest_due_at);
      }
      taskByKey.set(key, current);
    }
    return {
      items: keys.items.flatMap((item) => {
        const definition = definitionByKey.get(workflowKey(item.uid, item.workflowId));
        if (!definition) return [];
        const tasks = taskByKey.get(workflowKey(item.uid, item.workflowId));
        const metric = metricByKey.get(workflowKey(item.uid, item.workflowId));
        const transition = transitionByKey.get(workflowKey(item.uid, item.workflowId));
        return [{
          activeRunCount: runByKey.get(workflowKey(item.uid, item.workflowId)) ?? 0,
          activeTaskCount: tasks?.active ?? 0,
          dueBacklogCount: tasks?.due ?? 0,
          ...(metric?.last_run_at ? { lastRunAt: toMillis(metric.last_run_at) } : {}),
          name: definition.name,
          ...(tasks?.oldestDueAt == null ? {} : { oldestDueAt: tasks.oldestDueAt }),
          runtimeStatus: parseRuntimeStatus(definition.runtime_status),
          totalRunCount: toCount(metric?.total_run_count),
          ...(transition ? { transition } : {}),
          uid: item.uid,
          workflowId: normalizeId(item.workflowId),
        }];
      }),
      total: keys.total,
    };
  }

  async getWorkflowDetail(workflowId: string) {
    const definition = await this.db.selectFrom(DEFINITION_TABLE)
      .select(["id", "uid", "name", "runtime_status", "status_reason"])
      .where("id", "=", workflowId)
      .where("biz_status", "=", 1)
      .executeTakeFirst();
    if (!definition) return undefined;
    const key = { uid: definition.uid, workflowId: definition.id };
    const [taskRows, transition, runCount, due] = await Promise.all([
      this.db.selectFrom(TASK_TABLE)
        .select(["status", sql<number>`count(*)`.as("count")])
        .where("uid", "=", key.uid)
        .where("workflow_id", "=", key.workflowId)
        .groupBy("status")
        .execute(),
      this.db.selectFrom(TRANSITION_TABLE).selectAll()
        .where("uid", "=", key.uid)
        .where("workflow_id", "=", key.workflowId)
        .executeTakeFirst(),
      this.db.selectFrom(RUN_TABLE).select(sql<number>`count(*)`.as("count"))
        .where("uid", "=", key.uid)
        .where("workflow_id", "=", key.workflowId)
        .where("status", "in", [...WORKFLOW_ACTIVE_RUN_STATUSES])
        .executeTakeFirstOrThrow(),
      this.db.selectFrom(TASK_TABLE).select([
        sql<number>`count(*)`.as("count"),
        sql<Date | null>`min(due_at)`.as("oldest_due_at"),
      ]).where("uid", "=", key.uid).where("workflow_id", "=", key.workflowId)
        .where(dueBacklogSql)
        .executeTakeFirstOrThrow(),
    ]);
    const taskDistribution = Object.fromEntries(
      TASK_STATUSES.map((status) => [status, 0]),
    ) as WorkflowObservabilityTaskDistribution;
    for (const row of taskRows) {
      if (row.status in taskDistribution) {
        taskDistribution[row.status as keyof WorkflowObservabilityTaskDistribution] = toCount(row.count);
      }
    }
    return {
      activeRunCount: toCount(runCount.count),
      dueBacklogCount: toCount(due.count),
      name: definition.name,
      ...(due.oldest_due_at ? { oldestDueAt: toMillis(due.oldest_due_at) } : {}),
      runtimeStatus: parseRuntimeStatus(definition.runtime_status),
      ...(definition.status_reason ? { statusReason: definition.status_reason } : {}),
      taskDistribution,
      ...(transition ? { transition: mapTransition(transition) } : {}),
      uid: definition.uid,
      workflowId: normalizeId(definition.id),
    };
  }

  private async countTasks(status: string) {
    const row = await this.db.selectFrom(TASK_TABLE)
      .select(sql<number>`count(*)`.as("count"))
      .where("status", "=", status)
      .executeTakeFirstOrThrow();
    return toCount(row.count);
  }

  private async countInference(status: string) {
    const row = await this.db.selectFrom(INFERENCE_TABLE)
      .select(sql<number>`count(*)`.as("count"))
      .where("status", "=", status)
      .executeTakeFirstOrThrow();
    return toCount(row.count);
  }

  private async listWorkflowKeys(query: WorkflowObservabilityListQuery, offset: number) {
    if (query.state === "backlog") return this.listBacklogKeys(query, offset);
    if (query.state === "transitioning" || query.state === "dead") {
      return this.listTransitionKeys(query, offset, query.state === "dead" ? ["dead"] : ["pending", "leased"]);
    }
    let listQuery = this.db.selectFrom(DEFINITION_TABLE)
      .select(["id as workflow_id", "uid"])
      .where("biz_status", "=", 1);
    let countQuery = this.db.selectFrom(DEFINITION_TABLE)
      .select(sql<number>`count(*)`.as("count"))
      .where("biz_status", "=", 1);
    if (query.uid != null) {
      listQuery = listQuery.where("uid", "=", query.uid);
      countQuery = countQuery.where("uid", "=", query.uid);
    }
    if (query.workflowId) {
      listQuery = listQuery.where("id", "=", query.workflowId);
      countQuery = countQuery.where("id", "=", query.workflowId);
    }
    const [rows, count] = await Promise.all([
      listQuery.orderBy("id", "desc").limit(query.pageSize).offset(offset).execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);
    return {
      items: rows.map((row) => ({ uid: row.uid, workflowId: row.workflow_id })),
      total: toCount(count.count),
    };
  }

  private async listBacklogKeys(query: WorkflowObservabilityListQuery, offset: number) {
    let listQuery = this.db.selectFrom(`${TASK_TABLE} as task`)
      .innerJoin(`${DEFINITION_TABLE} as definition`, (join) =>
        join.onRef("task.uid", "=", "definition.uid")
          .onRef("task.workflow_id", "=", "definition.id"))
      .select([
        "task.uid as uid",
        "task.workflow_id as workflow_id",
      ])
      .where("definition.biz_status", "=", 1)
      .where(sql<boolean>`
        task.status = 'pending'
        and task.bucket_time <= date_format(current_timestamp, '%Y-%m-%d %H:%i:00')
        and task.due_at <= current_timestamp
      `)
      .groupBy(["task.uid", "task.workflow_id"]);
    let countQuery = this.db.selectFrom(`${TASK_TABLE} as task`)
      .innerJoin(`${DEFINITION_TABLE} as definition`, (join) =>
        join.onRef("task.uid", "=", "definition.uid")
          .onRef("task.workflow_id", "=", "definition.id"))
      .select(sql<number>`count(distinct task.uid, task.workflow_id)`.as("count"))
      .where("definition.biz_status", "=", 1)
      .where(sql<boolean>`
        task.status = 'pending'
        and task.bucket_time <= date_format(current_timestamp, '%Y-%m-%d %H:%i:00')
        and task.due_at <= current_timestamp
      `);
    if (query.uid != null) {
      listQuery = listQuery.where("task.uid", "=", query.uid);
      countQuery = countQuery.where("task.uid", "=", query.uid);
    }
    if (query.workflowId) {
      listQuery = listQuery.where("task.workflow_id", "=", query.workflowId);
      countQuery = countQuery.where("task.workflow_id", "=", query.workflowId);
    }
    const [rows, count] = await Promise.all([
      listQuery.orderBy(sql`min(task.due_at)`, "asc")
        .orderBy("task.uid", "asc")
        .orderBy("task.workflow_id", "asc")
        .limit(query.pageSize)
        .offset(offset)
        .execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);
    return {
      items: rows.map((row) => ({ uid: row.uid, workflowId: row.workflow_id })),
      total: toCount(count.count),
    };
  }

  private async listTransitionKeys(
    query: WorkflowObservabilityListQuery,
    offset: number,
    statuses: string[],
  ) {
    let listQuery = this.db.selectFrom(`${TRANSITION_TABLE} as transition`)
      .innerJoin(`${DEFINITION_TABLE} as definition`, (join) =>
        join.onRef("transition.uid", "=", "definition.uid")
          .onRef("transition.workflow_id", "=", "definition.id"))
      .select(["transition.uid as uid", "transition.workflow_id as workflow_id"])
      .where("definition.biz_status", "=", 1)
      .where("transition.status", "in", statuses);
    let countQuery = this.db.selectFrom(`${TRANSITION_TABLE} as transition`)
      .innerJoin(`${DEFINITION_TABLE} as definition`, (join) =>
        join.onRef("transition.uid", "=", "definition.uid")
          .onRef("transition.workflow_id", "=", "definition.id"))
      .select(sql<number>`count(*)`.as("count"))
      .where("definition.biz_status", "=", 1)
      .where("transition.status", "in", statuses);
    if (query.uid != null) {
      listQuery = listQuery.where("transition.uid", "=", query.uid);
      countQuery = countQuery.where("transition.uid", "=", query.uid);
    }
    if (query.workflowId) {
      listQuery = listQuery.where("transition.workflow_id", "=", query.workflowId);
      countQuery = countQuery.where("transition.workflow_id", "=", query.workflowId);
    }
    const [rows, count] = await Promise.all([
      listQuery.orderBy("transition.update_time", "desc")
        .orderBy("transition.id", "desc")
        .limit(query.pageSize)
        .offset(offset)
        .execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);
    return {
      items: rows.map((row) => ({ uid: row.uid, workflowId: row.workflow_id })),
      total: toCount(count.count),
    };
  }
}

function definitionKeyPredicate(keys: Array<{ uid: number; workflowId: unknown }>) {
  return sql<boolean>`(uid, id) in (${sql.join(keys.map((key) =>
    sql`(${sql.lit(key.uid)}, ${sql.lit(Number(key.workflowId))})`))})`;
}

function workflowKeyPredicate(keys: Array<{ uid: number; workflowId: unknown }>) {
  return sql<boolean>`(uid, workflow_id) in (${sql.join(keys.map((key) =>
    sql`(${sql.lit(key.uid)}, ${sql.lit(Number(key.workflowId))})`))})`;
}

function workflowKey(uid: number, workflowId: unknown) {
  return `${uid}:${normalizeId(workflowId)}`;
}

function mapTransition(row: {
  attempt: number;
  last_error_code: string | null;
  next_attempt_at: Date;
  status: string;
  target_status: string;
  update_time: Date;
}): WorkflowObservabilityTransition {
  return {
    attempt: row.attempt,
    ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
    nextAttemptAt: toMillis(row.next_attempt_at),
    status: row.status as WorkflowObservabilityTransition["status"],
    targetStatus: row.target_status as WorkflowObservabilityTransition["targetStatus"],
    updateTime: toMillis(row.update_time),
  };
}

function isWorkerRole(value: string): value is WorkflowObservabilityRole {
  return (WORKFLOW_OBSERVABILITY_ROLES as readonly string[]).includes(value);
}

function parseRuntimeStatus(value: string): WorkflowRuntimeStatus {
  if (value === "inactive" || value === "active" || value === "paused" || value === "stopped") {
    return value;
  }
  return "inactive";
}

function toCount(value: number | bigint | string | null | undefined) {
  return Number(value ?? 0);
}

function toMillis(value: Date) {
  return value.getTime();
}

function normalizeId(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  throw new Error("Database returned an invalid BIGINT identifier");
}
