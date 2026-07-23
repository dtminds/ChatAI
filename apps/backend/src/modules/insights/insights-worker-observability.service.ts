import type {
  InsightsWorkerAnalysisState,
  InsightsWorkerPipeline,
  InsightsWorkerPipelineRuntime,
  InsightsWorkerSessionizationState,
  InsightsWorkerSummaryResponse,
  InsightsWorkerUidDetailResponse,
  InsightsWorkerUidItem,
  InsightsWorkerUidListResponse,
  InsightsWorkerUidState,
} from "@chatai/contracts";
import { NotFoundError } from "../../shared/errors.js";
import type {
  InsightsWorkerObservabilityRepository,
  WorkerCursorRow,
  WorkerJobRow,
  WorkerRuntimeStateRow,
  WorkerSessionAggregateRow,
} from "./insights-worker-observability.repository.js";

const PIPELINES: InsightsWorkerPipeline[] = [
  "discovery",
  "sessionization",
  "analysis",
];
const HEARTBEAT_OFFLINE_MS = 150_000;
const POSSIBLY_STALLED_MS = 15 * 60_000;
const OVERDUE_WITHOUT_JOB_BLOCKED_MS = 5 * 60_000;
const FAILED_WINDOW_MS = 24 * 60 * 60_000;
const ANALYSIS_JOB_TYPES = new Set(["analyze_session", "reanalyze_session"]);
const STATE_PRIORITY: Record<InsightsWorkerUidState, number> = {
  blocked: 0,
  error: 1,
  retrying: 2,
  processing: 3,
  queued: 4,
  idle: 5,
};

export type WorkerUidListQuery = {
  analysisState?: InsightsWorkerUidState;
  page?: number;
  pageSize?: number;
  sessionizationState?: InsightsWorkerUidState;
  state?: InsightsWorkerUidState;
  uid?: number;
};

type ObservationSnapshot = {
  archivedFailures: WorkerJobRow[];
  cursors: WorkerCursorRow[];
  hotJobs: WorkerJobRow[];
  items: InsightsWorkerUidItem[];
  observedAt: number;
  sessions: WorkerSessionAggregateRow[];
};

export class InsightsWorkerObservabilityService {
  constructor(
    private readonly repository: InsightsWorkerObservabilityRepository,
  ) {}

  async getSummary(): Promise<InsightsWorkerSummaryResponse> {
    const observedAt = await this.repository.getObservedAt();
    const [
      runtimeRows,
      globalCursor,
      sourceHeadAuditId,
      snapshot,
    ] = await Promise.all([
      this.repository.listRuntimeStates(),
      this.repository.getGlobalCursor(),
      this.repository.getGlobalSourceHeadAuditId(),
      this.loadSnapshot(observedAt),
    ]);
    const sessionizationJobs = snapshot.hotJobs.filter(
      (job) => job.jobType === "sessionize_uid"
        && (job.status === "pending" || job.status === "running"),
    );
    const analysisJobs = snapshot.hotJobs.filter(isActiveAnalysisJob);
    const failedAnalysisJobs = [
      ...snapshot.hotJobs,
      ...snapshot.archivedFailures,
    ].filter((job) =>
      ANALYSIS_JOB_TYPES.has(job.jobType)
      && job.status === "failed"
      && job.updateTime >= observedAt - FAILED_WINDOW_MS
    );
    const cursorAuditId = globalCursor?.cursorAuditId;
    const auditIdGap = cursorAuditId == null || sourceHeadAuditId == null
      ? undefined
      : Math.max(0, sourceHeadAuditId - cursorAuditId);

    return {
      analysisJobs: {
        expiredLease: analysisJobs.filter(
          (job) => job.status === "running"
            && job.leaseUntil != null
            && job.leaseUntil <= observedAt,
        ).length,
        failedLast24h: failedAnalysisJobs.length,
        pending: analysisJobs.filter((job) =>
          derivePendingState(job, observedAt) === "queued"
        ).length,
        retrying: analysisJobs.filter((job) =>
          derivePendingState(job, observedAt) === "retrying"
        ).length,
        running: analysisJobs.filter((job) =>
          job.status === "running"
            && (job.leaseUntil == null || job.leaseUntil > observedAt)
        ).length,
      },
      discovery: {
        ...(auditIdGap == null ? {} : { auditIdGap }),
        ...(cursorAuditId == null ? {} : { cursorAuditId }),
        hasBacklog: auditIdGap != null && auditIdGap > 0,
        ...(sourceHeadAuditId == null ? {} : { sourceHeadAuditId }),
      },
      observedAt,
      observedUids: countUidStates(snapshot.items),
      pipelines: derivePipelineRuntime(runtimeRows, observedAt),
      sessionizationJobs: {
        expiredLease: sessionizationJobs.filter(
          (job) => job.status === "running"
            && job.leaseUntil != null
            && job.leaseUntil <= observedAt,
        ).length,
        pending: sessionizationJobs.filter((job) =>
          derivePendingState(job, observedAt) === "queued"
        ).length,
        retrying: sessionizationJobs.filter((job) =>
          derivePendingState(job, observedAt) === "retrying"
        ).length,
        running: sessionizationJobs.filter((job) =>
          job.status === "running"
            && (job.leaseUntil == null || job.leaseUntil > observedAt)
        ).length,
      },
      sessions: {
        open: snapshot.sessions.reduce((sum, row) => sum + row.open, 0),
        overdue: snapshot.sessions.reduce((sum, row) => sum + row.overdue, 0),
      },
    };
  }

  async listUids(query: WorkerUidListQuery): Promise<InsightsWorkerUidListResponse> {
    const observedAt = await this.repository.getObservedAt();
    const snapshot = await this.loadSnapshot(observedAt);
    const page = normalizePositiveInteger(query.page, 1);
    const pageSize = Math.min(100, normalizePositiveInteger(query.pageSize, 50));
    const filtered = snapshot.items
      .filter((item) => query.uid == null || item.uid === query.uid)
      .filter((item) => query.state == null || item.overallState === query.state)
      .filter((item) =>
        query.sessionizationState == null
        || item.sessionization.state === query.sessionizationState
      )
      .filter((item) =>
        query.analysisState == null
        || item.analysis.state === query.analysisState
      )
      .sort((left, right) =>
        STATE_PRIORITY[left.overallState] - STATE_PRIORITY[right.overallState]
        || left.uid - right.uid
      );
    const total = filtered.length;
    const offset = (page - 1) * pageSize;

    return {
      items: filtered.slice(offset, offset + pageSize),
      observedAt,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getUidDetail(uid: number): Promise<InsightsWorkerUidDetailResponse> {
    const observedAt = await this.repository.getObservedAt();
    const snapshot = await this.loadSnapshot(observedAt);
    const item = snapshot.items.find((candidate) => candidate.uid === uid);

    if (!item) {
      throw new NotFoundError(
        "INSIGHTS_WORKER_UID_NOT_OBSERVED",
        "该 UID 尚未进入会话切片或洞察链路",
      );
    }

    const [sourceHead, recentSessions, recentErrors, recentRescans] = await Promise.all([
      this.repository.getUidSourceHead(uid),
      this.repository.listRecentSessions(uid, 20),
      this.repository.listRecentErrorJobs(uid, 20),
      this.repository.listRecentRescans(uid, 10),
    ]);
    const [hasPendingMessages, recentAnalysisRuns] = await Promise.all([
      item.cursor
        ? this.repository.hasPendingMessages(uid, {
            ...item.cursor,
            uid,
          })
        : Promise.resolve(undefined),
      this.repository.listRecentAnalysisRuns(
        recentSessions.map((session) => session.sessionId),
        20,
      ),
    ]);

    return {
      analysis: item.analysis,
      ...(item.cursor ? { cursor: item.cursor } : {}),
      ...(hasPendingMessages == null ? {} : { hasPendingMessages }),
      observedAt,
      overallState: item.overallState,
      recentAnalysisRuns,
      recentErrors: recentErrors
        .filter((job): job is WorkerJobRow & { errorCode: string } =>
          Boolean(job.errorCode)
        )
        .map((job) => ({
          errorCode: job.errorCode,
          jobId: job.jobId,
          jobType: job.jobType,
          occurredAt: job.updateTime,
          status: job.status,
        })),
      recentRescans: recentRescans.map((row) => ({
        analysisScope: normalizeAnalysisScope(row.analysisScope),
        status: normalizeRescanStatus(row.status),
        taskId: row.taskId,
        updateTime: row.updateTime,
      })),
      recentSessions,
      sessionization: item.sessionization,
      sessions: item.sessions,
      ...(sourceHead ? { sourceHead } : {}),
      uid,
    };
  }

  private async loadSnapshot(observedAt: number): Promise<ObservationSnapshot> {
    const [uids, cursors, hotJobs, archivedFailures, sessions] = await Promise.all([
      this.repository.listObservedUids(),
      this.repository.listUidCursors(),
      this.repository.listHotJobs(observedAt - FAILED_WINDOW_MS),
      this.repository.listFailedArchiveJobs(observedAt - FAILED_WINDOW_MS),
      this.repository.listSessionAggregates(observedAt),
    ]);
    const cursorByUid = new Map(cursors.map((row) => [row.uid, row]));
    const sessionsByUid = new Map(sessions.map((row) => [row.uid, row]));
    const hotJobsByUid = groupByUid(hotJobs);
    const failuresByUid = groupByUid(archivedFailures);
    const items = uids.map((uid) => deriveUidItem({
      archivedFailures: failuresByUid.get(uid) ?? [],
      cursor: cursorByUid.get(uid),
      hotJobs: hotJobsByUid.get(uid) ?? [],
      observedAt,
      sessions: sessionsByUid.get(uid),
      uid,
    }));

    return {
      archivedFailures,
      cursors,
      hotJobs,
      items,
      observedAt,
      sessions,
    };
  }
}

function deriveUidItem(input: {
  archivedFailures: WorkerJobRow[];
  cursor?: WorkerCursorRow;
  hotJobs: WorkerJobRow[];
  observedAt: number;
  sessions?: WorkerSessionAggregateRow;
  uid: number;
}): InsightsWorkerUidItem {
  const sessionizationJob = input.hotJobs.find(
    (job) => job.jobType === "sessionize_uid"
      && (job.status === "pending" || job.status === "running"),
  );
  const sessionization = deriveSessionizationState(
    sessionizationJob,
    input.sessions,
    input.observedAt,
  );
  const analysis = deriveAnalysisState(
    input.hotJobs,
    input.archivedFailures,
    input.observedAt,
  );
  const recentError = [...input.hotJobs, ...input.archivedFailures]
    .filter((job): job is WorkerJobRow & { errorCode: string } =>
      Boolean(job.errorCode) && job.status !== "succeeded"
    )
    .sort((left, right) => right.updateTime - left.updateTime)[0];
  const sessions = input.sessions ?? {
    open: 0,
    overdue: 0,
    uid: input.uid,
  };

  return {
    analysis,
    ...(input.cursor
      ? {
          cursor: {
            cursorAuditId: input.cursor.cursorAuditId,
            cursorMsgtime: input.cursor.cursorMsgtime,
            updateTime: input.cursor.updateTime,
          },
        }
      : {}),
    overallState: higherPriorityState(
      sessionization.state,
      analysis.state,
    ),
    ...(recentError
      ? {
          recentError: {
            errorCode: recentError.errorCode,
            occurredAt: recentError.updateTime,
          },
        }
      : {}),
    sessionization,
    sessions: {
      ...(sessions.earliestNextCloseAt == null
        ? {}
        : { earliestNextCloseAt: sessions.earliestNextCloseAt }),
      open: sessions.open,
      overdue: sessions.overdue,
    },
    uid: input.uid,
  };
}

function deriveSessionizationState(
  job: WorkerJobRow | undefined,
  sessions: WorkerSessionAggregateRow | undefined,
  observedAt: number,
): InsightsWorkerSessionizationState {
  if (job?.status === "running") {
    return {
      attempt: job.attempt,
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      jobId: job.jobId,
      ...(job.leaseUntil == null ? {} : { leaseUntil: job.leaseUntil }),
      maxAttempts: job.maxAttempts,
      queueAgeMs: Math.max(0, observedAt - job.runAfter),
      runAfter: job.runAfter,
      state: job.leaseUntil != null && job.leaseUntil <= observedAt
        ? "blocked"
        : "processing",
    };
  }

  if (job?.status === "pending") {
    return {
      attempt: job.attempt,
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      jobId: job.jobId,
      maxAttempts: job.maxAttempts,
      queueAgeMs: Math.max(0, observedAt - job.runAfter),
      runAfter: job.runAfter,
      state: derivePendingState(job, observedAt) ?? "queued",
    };
  }

  const overdueWithoutJob = sessions?.earliestNextCloseAt != null
    && sessions.earliestNextCloseAt <= observedAt - OVERDUE_WITHOUT_JOB_BLOCKED_MS;

  return {
    queueAgeMs: 0,
    state: overdueWithoutJob ? "blocked" : "idle",
  };
}

function deriveAnalysisState(
  hotJobs: WorkerJobRow[],
  archivedFailures: WorkerJobRow[],
  observedAt: number,
): InsightsWorkerAnalysisState {
  const active = hotJobs.filter(isActiveAnalysisJob);
  const failedLast24h = [...hotJobs, ...archivedFailures].filter((job) =>
    ANALYSIS_JOB_TYPES.has(job.jobType)
    && job.status === "failed"
    && job.updateTime >= observedAt - FAILED_WINDOW_MS
  ).length;
  const expired = active.some((job) =>
    job.status === "running"
    && job.leaseUntil != null
    && job.leaseUntil <= observedAt
  );
  const processing = active.filter((job) =>
    job.status === "running"
    && (job.leaseUntil == null || job.leaseUntil > observedAt)
  ).length;
  const retryingJobs = active.filter((job) =>
    derivePendingState(job, observedAt) === "retrying"
  );
  const queuedJobs = active.filter((job) =>
    derivePendingState(job, observedAt) === "queued"
  );
  const queueAgeMs = active
    .filter((job) => job.status === "pending")
    .reduce(
      (maxAge, job) => Math.max(maxAge, Math.max(0, observedAt - job.runAfter)),
      0,
    );
  const state: InsightsWorkerUidState = expired
    ? "blocked"
    : failedLast24h > 0
      ? "error"
      : processing > 0
        ? "processing"
        : retryingJobs.length > 0
          ? "retrying"
          : queuedJobs.length > 0
            ? "queued"
            : "idle";

  return {
    failedLast24h,
    pending: queuedJobs.length,
    processing,
    queueAgeMs,
    retrying: retryingJobs.length,
    state,
  };
}

function derivePipelineRuntime(
  rows: WorkerRuntimeStateRow[],
  observedAt: number,
): InsightsWorkerPipelineRuntime[] {
  const byPipeline = new Map(rows.map((row) => [row.pipeline, row]));

  return PIPELINES.map((pipeline) => {
    const row = byPipeline.get(pipeline);
    if (!row) {
      return {
        activity: "unknown",
        health: "unknown",
        pipeline,
      };
    }

    const offline = observedAt - row.reportedAt > HEARTBEAT_OFFLINE_MS;
    const latestCompletedAt = Math.max(
      row.lastSuccessAt ?? Number.NEGATIVE_INFINITY,
      row.lastFailureAt ?? Number.NEGATIVE_INFINITY,
    );
    const running = row.lastStartedAt != null
      && row.lastStartedAt > latestCompletedAt;
    const runningDurationMs = running
      ? Math.max(0, observedAt - (row.lastStartedAt ?? observedAt))
      : undefined;
    const stalled = runningDurationMs != null
      && runningDurationMs > POSSIBLY_STALLED_MS;
    const lastFailed = row.lastFailureAt != null
      && row.lastFailureAt > (row.lastSuccessAt ?? Number.NEGATIVE_INFINITY);
    const noCompleted = row.lastFailureAt == null && row.lastSuccessAt == null;

    return {
      activity: offline
        ? "unknown"
        : stalled
          ? "possibly_stalled"
          : running
            ? "running"
            : noCompleted
              ? "unknown"
              : "idle",
      health: offline
        ? "offline"
        : stalled || lastFailed
          ? "degraded"
          : noCompleted
            ? "unknown"
            : "healthy",
      ...(row.lastDurationMs == null ? {} : { lastDurationMs: row.lastDurationMs }),
      ...(row.lastErrorCode ? { lastErrorCode: row.lastErrorCode } : {}),
      ...(row.lastFailureAt == null ? {} : { lastFailureAt: row.lastFailureAt }),
      ...(row.lastStartedAt == null ? {} : { lastStartedAt: row.lastStartedAt }),
      ...(row.lastSuccessAt == null ? {} : { lastSuccessAt: row.lastSuccessAt }),
      pipeline,
      reportedAt: row.reportedAt,
      reportedBy: row.reportedBy,
      ...(runningDurationMs == null ? {} : { runningDurationMs }),
    };
  });
}

function derivePendingState(
  job: WorkerJobRow,
  observedAt: number,
): "queued" | "retrying" | undefined {
  if (job.status !== "pending") {
    return undefined;
  }

  return job.errorCode && job.runAfter > observedAt ? "retrying" : "queued";
}

function isActiveAnalysisJob(job: WorkerJobRow) {
  return ANALYSIS_JOB_TYPES.has(job.jobType)
    && (job.status === "pending" || job.status === "running");
}

function countUidStates(items: InsightsWorkerUidItem[]) {
  const counts = {
    blocked: 0,
    error: 0,
    idle: 0,
    processing: 0,
    queued: 0,
    retrying: 0,
    total: items.length,
  };
  for (const item of items) {
    counts[item.overallState] += 1;
  }

  return counts;
}

function higherPriorityState(
  left: InsightsWorkerUidState,
  right: InsightsWorkerUidState,
): InsightsWorkerUidState {
  return STATE_PRIORITY[left] <= STATE_PRIORITY[right] ? left : right;
}

function groupByUid(rows: WorkerJobRow[]) {
  const result = new Map<number, WorkerJobRow[]>();
  for (const row of rows) {
    const existing = result.get(row.uid);
    if (existing) {
      existing.push(row);
    } else {
      result.set(row.uid, [row]);
    }
  }
  return result;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? Math.floor(value as number)
    : fallback;
}

function normalizeAnalysisScope(value: string): "all" | "classification" | "qaFindings" {
  return value === "classification" || value === "qaFindings" ? value : "all";
}

function normalizeRescanStatus(
  value: string,
): "failed" | "partial" | "pending" | "running" | "succeeded" {
  if (
    value === "failed"
    || value === "partial"
    || value === "running"
    || value === "succeeded"
  ) {
    return value;
  }
  return "pending";
}
