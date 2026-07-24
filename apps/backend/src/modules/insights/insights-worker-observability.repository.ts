import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";

const CURSOR_SOURCE = "xy_wap_embed_msg_audit_info";

export type WorkerRuntimeStateRow = {
  lastDurationMs?: number;
  lastErrorCode?: string;
  lastFailureAt?: number;
  lastStartedAt?: number;
  lastSuccessAt?: number;
  pipeline: string;
  reportedAt: number;
  reportedBy: string;
};

export type WorkerCursorRow = {
  cursorAuditId: number;
  cursorMsgtime: number;
  uid: number;
  updateTime: number;
};

export type WorkerJobRow = {
  analysisScope: string;
  attempt: number;
  errorCode?: string;
  jobId: string;
  jobType: string;
  leaseUntil?: number;
  maxAttempts: number;
  runAfter: number;
  status: string;
  targetId: string;
  uid: number;
  updateTime: number;
};

export type WorkerSessionAggregateRow = {
  earliestNextCloseAt?: number;
  open: number;
  overdue: number;
  uid: number;
};

export type WorkerRecentSessionRow = {
  closeReason?: string;
  endedAt?: number;
  nextCloseAt?: number;
  sessionId: string;
  startedAt: number;
  status: string;
};

export type WorkerAnalysisRunRow = {
  analysisScope: string;
  errorCode?: string;
  finishedAt?: number;
  mode: string;
  runId: string;
  sessionId: string;
  startedAt: number;
  status: string;
};

export type WorkerRescanRow = {
  analysisScope: string;
  status: string;
  taskId: string;
  updateTime: number;
};

export type WorkerSourceHead = {
  auditId: number;
  msgtime: number;
};

type RuntimeDbRow = {
  last_duration_ms: number | string | null;
  last_error_code: string | null;
  last_failure_at: Date | null;
  last_started_at: Date | null;
  last_success_at: Date | null;
  pipeline: string;
  reported_at: Date;
  reported_by: string;
};

type CursorDbRow = {
  cursor_audit_id: number | string;
  cursor_msgtime: number | string;
  uid: number | string;
  update_time: Date;
};

type JobDbRow = {
  analysis_scope: string;
  attempt_count: number | string;
  error_code: string | null;
  id: number | string;
  job_type: string;
  lease_until: Date | null;
  max_attempts: number | string;
  run_after: Date;
  status: string;
  target_id: string;
  uid: number | string;
  update_time: Date;
};

export class InsightsWorkerObservabilityRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async getObservedAt(): Promise<number> {
    const result = await sql<{ observed_at: Date }>`
      select current_timestamp(3) as observed_at
    `.execute(this.db);
    const observedAt = result.rows[0]?.observed_at;

    if (!observedAt) {
      throw new Error("INSIGHTS_WORKER_OBSERVED_AT_UNAVAILABLE");
    }

    return toMillis(observedAt);
  }

  async listRuntimeStates(): Promise<WorkerRuntimeStateRow[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_worker_runtime_state")
      .select([
        "last_duration_ms",
        "last_error_code",
        "last_failure_at",
        "last_started_at",
        "last_success_at",
        "pipeline",
        "reported_at",
        "reported_by",
      ])
      .execute() as RuntimeDbRow[];

    return rows.map((row) => ({
      ...(row.last_duration_ms == null
        ? {}
        : { lastDurationMs: toNumber(row.last_duration_ms) }),
      ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
      ...(row.last_failure_at
        ? { lastFailureAt: toMillis(row.last_failure_at) }
        : {}),
      ...(row.last_started_at
        ? { lastStartedAt: toMillis(row.last_started_at) }
        : {}),
      ...(row.last_success_at
        ? { lastSuccessAt: toMillis(row.last_success_at) }
        : {}),
      pipeline: row.pipeline,
      reportedAt: toMillis(row.reported_at),
      reportedBy: row.reported_by,
    }));
  }

  async getGlobalCursor(): Promise<WorkerCursorRow | undefined> {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_sync_cursor")
      .select([
        "cursor_audit_id",
        "cursor_msgtime",
        "uid",
        "update_time",
      ])
      .where("source", "=", CURSOR_SOURCE)
      .where("uid", "=", 0)
      .executeTakeFirst() as CursorDbRow | undefined;

    return row ? mapCursor(row) : undefined;
  }

  async getGlobalSourceHeadAuditId(): Promise<number | undefined> {
    const row = await this.db
      .selectFrom("xy_wap_embed_msg_audit_info")
      .select("id")
      .orderBy("id", "desc")
      .limit(1)
      .executeTakeFirst() as { id: number | string } | undefined;

    return row ? toNumber(row.id) : undefined;
  }

  async listObservedUids(): Promise<number[]> {
    const [cursorRows, jobRows, sessionRows] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_insight_sync_cursor")
        .select("uid")
        .where("source", "=", CURSOR_SOURCE)
        .where("uid", ">", 0)
        .execute(),
      this.db
        .selectFrom("xy_wap_embed_insight_job")
        .select("uid")
        .where("uid", ">", 0)
        .groupBy("uid")
        .execute(),
      this.db
        .selectFrom("xy_wap_embed_logical_session")
        .select("uid")
        .where("uid", ">", 0)
        .groupBy("uid")
        .execute(),
    ]);

    return Array.from(new Set(
      [...cursorRows, ...jobRows, ...sessionRows]
        .map((row) => toNumber(row.uid))
        .filter((uid) => uid > 0),
    )).sort((left, right) => left - right);
  }

  async listUidCursors(): Promise<WorkerCursorRow[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_sync_cursor")
      .select([
        "cursor_audit_id",
        "cursor_msgtime",
        "uid",
        "update_time",
      ])
      .where("source", "=", CURSOR_SOURCE)
      .where("uid", ">", 0)
      .execute() as CursorDbRow[];

    return rows.map(mapCursor);
  }

  async listHotJobs(failedSince: number): Promise<WorkerJobRow[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_job")
      .select([
        "analysis_scope",
        "attempt_count",
        "error_code",
        "id",
        "job_type",
        "lease_until",
        "max_attempts",
        "run_after",
        "status",
        "target_id",
        "uid",
        "update_time",
      ])
      .where("uid", ">", 0)
      .where((eb) => eb.or([
        eb("status", "in", ["pending", "running"]),
        eb.and([
          eb("status", "=", "failed"),
          eb("update_time", ">=", new Date(failedSince)),
        ]),
      ]))
      .execute() as JobDbRow[];

    return rows.map(mapJob);
  }

  async listFailedArchiveJobs(since: number): Promise<WorkerJobRow[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_job_archive")
      .select([
        "analysis_scope",
        "attempt_count",
        "error_code",
        "id",
        "job_type",
        "lease_until",
        "max_attempts",
        "run_after",
        "status",
        "target_id",
        "uid",
        "update_time",
      ])
      .where("uid", ">", 0)
      .where("status", "=", "failed")
      .where("update_time", ">=", new Date(since))
      .execute() as JobDbRow[];

    return rows.map(mapJob);
  }

  async listSessionAggregates(observedAt: number): Promise<WorkerSessionAggregateRow[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_logical_session")
      .select([
        "uid",
        sql<number>`count(*)`.as("open_count"),
        sql<number>`sum(case when next_close_at <= ${observedAt} then 1 else 0 end)`.as("overdue_count"),
        sql<number | null>`min(next_close_at)`.as("earliest_next_close_at"),
      ])
      .where("uid", ">", 0)
      .where("status", "=", "open")
      .groupBy("uid")
      .execute() as Array<{
        earliest_next_close_at: number | string | null;
        open_count: number | string;
        overdue_count: number | string;
        uid: number | string;
      }>;

    return rows.map((row) => ({
      ...(row.earliest_next_close_at == null
        ? {}
        : { earliestNextCloseAt: toNumber(row.earliest_next_close_at) }),
      open: toNumber(row.open_count),
      overdue: toNumber(row.overdue_count),
      uid: toNumber(row.uid),
    }));
  }

  async getUidSourceHead(uid: number): Promise<WorkerSourceHead | undefined> {
    const row = await this.db
      .selectFrom("xy_wap_embed_msg_audit_info")
      .select(["id", "msgtime"])
      .where("uid", "=", uid)
      .orderBy("msgtime", "desc")
      .orderBy("id", "desc")
      .limit(1)
      .executeTakeFirst() as {
        id: number | string;
        msgtime: Date | number | string;
      } | undefined;

    return row
      ? {
          auditId: toNumber(row.id),
          msgtime: toNumber(row.msgtime),
        }
      : undefined;
  }

  async hasPendingMessages(uid: number, cursor: WorkerCursorRow): Promise<boolean> {
    const row = await this.db
      .selectFrom("xy_wap_embed_msg_audit_info")
      .select("id")
      .where("uid", "=", uid)
      .where((eb) => eb.or([
        eb("msgtime", ">", cursor.cursorMsgtime),
        eb.and([
          eb("msgtime", "=", cursor.cursorMsgtime),
          eb("id", ">", cursor.cursorAuditId),
        ]),
      ]))
      .orderBy("msgtime", "asc")
      .orderBy("id", "asc")
      .limit(1)
      .executeTakeFirst();

    return row != null;
  }

  async listRecentSessions(uid: number, limit: number): Promise<WorkerRecentSessionRow[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_logical_session")
      .select([
        "close_reason",
        "ended_at",
        "id",
        "next_close_at",
        "started_at",
        "status",
      ])
      .where("uid", "=", uid)
      .orderBy("started_at", "desc")
      .limit(limit)
      .execute() as Array<{
        close_reason: string | null;
        ended_at: number | string | null;
        id: number | string;
        next_close_at: number | string | null;
        started_at: number | string;
        status: string;
      }>;

    return rows.map((row) => ({
      ...(row.close_reason ? { closeReason: row.close_reason } : {}),
      ...(row.ended_at == null ? {} : { endedAt: toNumber(row.ended_at) }),
      ...(row.next_close_at == null
        ? {}
        : { nextCloseAt: toNumber(row.next_close_at) }),
      sessionId: String(row.id),
      startedAt: toNumber(row.started_at),
      status: row.status,
    }));
  }

  async listRecentAnalysisRuns(
    sessionIds: string[],
    limit: number,
  ): Promise<WorkerAnalysisRunRow[]> {
    const ids = sessionIds.map(Number).filter(Number.isSafeInteger);
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_analysis_run")
      .select([
        "analysis_scope",
        "create_time",
        "error_code",
        "finished_at",
        "id",
        "mode",
        "session_id",
        "status",
      ])
      .where("session_id", "in", ids)
      .orderBy("create_time", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      analysisScope: row.analysis_scope,
      ...(row.error_code ? { errorCode: row.error_code } : {}),
      ...(row.finished_at ? { finishedAt: toMillis(row.finished_at) } : {}),
      mode: row.mode,
      runId: String(row.id),
      sessionId: String(row.session_id),
      startedAt: toMillis(row.create_time),
      status: row.status,
    }));
  }

  async listRecentErrorJobs(uid: number, limit: number): Promise<WorkerJobRow[]> {
    const selectFields = [
      "analysis_scope",
      "attempt_count",
      "error_code",
      "id",
      "job_type",
      "lease_until",
      "max_attempts",
      "run_after",
      "status",
      "target_id",
      "uid",
      "update_time",
    ] as const;
    const [hot, archived] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_insight_job")
        .select(selectFields)
        .where("uid", "=", uid)
        .where("error_code", "is not", null)
        .where("status", "!=", "succeeded")
        .orderBy("update_time", "desc")
        .limit(limit)
        .execute() as Promise<JobDbRow[]>,
      this.db
        .selectFrom("xy_wap_embed_insight_job_archive")
        .select(selectFields)
        .where("uid", "=", uid)
        .where("error_code", "is not", null)
        .where("status", "!=", "succeeded")
        .orderBy("update_time", "desc")
        .limit(limit)
        .execute() as Promise<JobDbRow[]>,
    ]);

    return [...hot, ...archived]
      .map(mapJob)
      .sort((left, right) => right.updateTime - left.updateTime)
      .slice(0, limit);
  }

  async listRecentRescans(uid: number, limit: number): Promise<WorkerRescanRow[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_rescan_task")
      .select(["analysis_scope", "id", "status", "update_time"])
      .where("uid", "=", uid)
      .orderBy("update_time", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      analysisScope: row.analysis_scope,
      status: row.status,
      taskId: String(row.id),
      updateTime: toMillis(row.update_time),
    }));
  }
}

function mapCursor(row: CursorDbRow): WorkerCursorRow {
  return {
    cursorAuditId: toNumber(row.cursor_audit_id),
    cursorMsgtime: toNumber(row.cursor_msgtime),
    uid: toNumber(row.uid),
    updateTime: toMillis(row.update_time),
  };
}

function mapJob(row: JobDbRow): WorkerJobRow {
  return {
    analysisScope: row.analysis_scope,
    attempt: toNumber(row.attempt_count),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    jobId: String(row.id),
    jobType: row.job_type,
    ...(row.lease_until ? { leaseUntil: toMillis(row.lease_until) } : {}),
    maxAttempts: toNumber(row.max_attempts),
    runAfter: toMillis(row.run_after),
    status: row.status,
    targetId: row.target_id,
    uid: toNumber(row.uid),
    updateTime: toMillis(row.update_time),
  };
}

function toMillis(value: Date | number | string): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }

  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) {
    return timestamp;
  }

  return toNumber(value);
}

function toNumber(value: Date | number | string): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}
