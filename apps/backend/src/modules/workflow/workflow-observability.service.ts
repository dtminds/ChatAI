import type {
  WorkflowObservabilityHealth,
  WorkflowObservabilityListState,
  WorkflowObservabilityRole,
  WorkflowObservabilitySummaryResponse,
  WorkflowObservabilityWorker,
  WorkflowObservabilityWorkflowDetailResponse,
  WorkflowObservabilityWorkflowListResponse,
} from "@chatai/contracts";
import { NotFoundError } from "../../shared/errors.js";
import type {
  WorkerStateRow,
  WorkflowObservabilityRepository,
} from "./workflow-observability.repository.js";

const HEARTBEAT_OFFLINE_MS = 150_000;
const POSSIBLY_STALLED_MS = 15 * 60_000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const ROLES = [
  "scheduler",
  "task-consumer",
  "entry-consumer",
  "inference",
  "outbox",
  "reconciler",
] as const satisfies readonly WorkflowObservabilityRole[];

export type WorkflowObservabilityListInput = {
  page?: number;
  pageSize?: number;
  state?: WorkflowObservabilityListState;
  uid?: number;
  workflowId?: string;
};

export class WorkflowObservabilityService {
  constructor(private readonly repository: WorkflowObservabilityRepository) {}

  async getSummary(): Promise<WorkflowObservabilitySummaryResponse> {
    const observedAt = await this.repository.getObservedAt();
    const [workerRows, tasks, transitions, outbox, inference] = await Promise.all([
      this.repository.listWorkerStates(),
      this.repository.getTaskQueueCounts(),
      this.repository.getTransitionCounts(),
      this.repository.getOutboxPending(),
      this.repository.getInferenceCounts(),
    ]);
    return {
      deadTransitionCount: transitions.dead,
      inference,
      observedAt,
      outbox,
      tasks,
      transitions,
      workers: deriveWorkers(workerRows, observedAt),
    };
  }

  async listWorkflows(
    input: WorkflowObservabilityListInput,
  ): Promise<WorkflowObservabilityWorkflowListResponse> {
    const page = normalizePositiveInteger(input.page, 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, normalizePositiveInteger(input.pageSize, DEFAULT_PAGE_SIZE));
    const state = input.state ?? "all";
    const observedAt = await this.repository.getObservedAt();
    const result = await this.repository.listWorkflows({
      page,
      pageSize,
      state,
      uid: input.uid,
      workflowId: input.workflowId,
    });
    return {
      items: result.items,
      observedAt,
      page,
      pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
    };
  }

  async getWorkflowDetail(workflowId: string): Promise<WorkflowObservabilityWorkflowDetailResponse> {
    const observedAt = await this.repository.getObservedAt();
    const detail = await this.repository.getWorkflowDetail(workflowId);
    if (!detail) {
      throw new NotFoundError("WORKFLOW_NOT_FOUND", "内容已不存在");
    }
    return { observedAt, ...detail };
  }
}

export function deriveWorkers(
  rows: WorkerStateRow[],
  observedAt: number,
): WorkflowObservabilityWorker[] {
  const byRole = new Map(rows.map((row) => [row.role, row]));
  return ROLES.map((role) => deriveWorker(role, byRole.get(role), observedAt));
}

function deriveWorker(
  role: WorkflowObservabilityRole,
  row: WorkerStateRow | undefined,
  observedAt: number,
): WorkflowObservabilityWorker {
  if (!row) return { health: "unknown", role };
  const offline = observedAt - row.reportedAt > HEARTBEAT_OFFLINE_MS;
  const latestCompletedAt = Math.max(
    row.lastSuccessAt ?? Number.NEGATIVE_INFINITY,
    row.lastFailureAt ?? Number.NEGATIVE_INFINITY,
  );
  const running = row.lastStartedAt != null && row.lastStartedAt > latestCompletedAt;
  const runningDurationMs = running
    ? Math.max(0, observedAt - (row.lastStartedAt ?? observedAt))
    : undefined;
  const stalled = runningDurationMs != null && runningDurationMs > POSSIBLY_STALLED_MS;
  const lastFailed = row.lastFailureAt != null
    && row.lastFailureAt > (row.lastSuccessAt ?? Number.NEGATIVE_INFINITY);
  const noCompleted = row.lastFailureAt == null && row.lastSuccessAt == null;
  const health: WorkflowObservabilityHealth = offline
    ? "offline"
    : stalled || lastFailed
      ? "degraded"
      : noCompleted
        ? "unknown"
        : "healthy";
  return {
    health,
    ...(row.lastDurationMs == null ? {} : { lastDurationMs: row.lastDurationMs }),
    ...(row.lastErrorCode ? { lastErrorCode: row.lastErrorCode } : {}),
    ...(row.lastFailureAt == null ? {} : { lastFailureAt: row.lastFailureAt }),
    ...(row.lastStartedAt == null ? {} : { lastStartedAt: row.lastStartedAt }),
    ...(row.lastSuccessAt == null ? {} : { lastSuccessAt: row.lastSuccessAt }),
    reportedAt: row.reportedAt,
    reportedBy: row.reportedBy,
    role,
    ...(runningDurationMs == null ? {} : { runningDurationMs }),
  };
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? Math.floor(value as number)
    : fallback;
}
