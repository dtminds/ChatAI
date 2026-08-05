import type {
  AgentUserMemoryObservabilityRun,
  AgentUserMemoryObservabilitySummaryResponse,
  AgentUserMemoryObservabilityTenantListResponse,
  AgentUserMemoryTenantState,
} from "@chatai/contracts";
import { sql, type Kysely, type Selectable } from "kysely";
import type { Database } from "../../../db/schema.js";

const ACTIVE_RUN_STATUSES = ["pending", "running", "waiting"];
const DELAY_THRESHOLD_MS = 5 * 60_000;
const HEARTBEAT_STALE_MS = 45_000;
const TREND_DAYS = 14;

type RunRow = Selectable<Database["xy_wap_embed_agent_user_memory_run"]>;
type ConfigRow = Selectable<Database["xy_wap_embed_agent_user_memory_config"]>;

export class UserMemoryObservabilityService {
  constructor(private readonly db: Kysely<Database>, private readonly now = () => Date.now()) {}

  async getSummary(): Promise<AgentUserMemoryObservabilitySummaryResponse> {
    const observedAt = this.now();
    const now = new Date(observedAt);
    const delayedBefore = new Date(observedAt - DELAY_THRESHOLD_MS);
    const last24HoursStart = new Date(observedAt - 24 * 60 * 60_000);
    const trendStart = new Date(observedAt - TREND_DAYS * 24 * 60 * 60_000);

    const [runtime, configTotals, activeTotals, periodTotals, trendRows] = await Promise.all([
      this.db.selectFrom("xy_wap_embed_user_memory_worker_state").selectAll().where("runtime_key", "=", "user_memory").executeTakeFirst(),
      this.db.selectFrom("xy_wap_embed_agent_user_memory_config").select([
        sql<number>`coalesce(sum(enabled = 1), 0)`.as("enabled_count"),
        sql<number>`coalesce(sum(enabled = 1 and next_run_at <= ${now}), 0)`.as("due_count"),
        sql<number>`coalesce(sum(enabled = 1 and next_run_at <= ${delayedBefore}), 0)`.as("delayed_count"),
        sql<Date | null>`min(case when enabled = 1 and next_run_at <= ${now} then next_run_at end)`.as("oldest_due_at"),
      ]).where("enabled", "=", 1).executeTakeFirstOrThrow(),
      this.db.selectFrom("xy_wap_embed_agent_user_memory_run").select([
        sql<number>`coalesce(sum(status in ('pending', 'running', 'waiting')), 0)`.as("active_count"),
        sql<number>`coalesce(sum(status = 'running' and lease_until <= ${now}), 0)`.as("expired_lease_count"),
        sql<Date | null>`min(case when run_after <= ${now} then run_after end)`.as("oldest_runnable_at"),
      ]).where("status", "in", ACTIVE_RUN_STATUSES).executeTakeFirstOrThrow(),
      this.db.selectFrom("xy_wap_embed_agent_user_memory_run").select([
        sql<number>`coalesce(sum(status = 'succeeded'), 0)`.as("succeeded_run_count"),
        sql<number>`coalesce(sum(status = 'partial'), 0)`.as("partial_run_count"),
        sql<number>`coalesce(sum(status = 'failed'), 0)`.as("failed_run_count"),
        sql<number>`coalesce(sum(status = 'canceled'), 0)`.as("canceled_run_count"),
        sql<number>`coalesce(sum(selected_customer_count), 0)`.as("selected_customer_count"),
        sql<number>`coalesce(sum(success_count), 0)`.as("success_count"),
        sql<number>`coalesce(sum(failure_count), 0)`.as("failure_count"),
        sql<number>`coalesce(sum(skipped_count), 0)`.as("skipped_count"),
        sql<number>`coalesce(sum(input_tokens), 0)`.as("input_tokens"),
        sql<number>`coalesce(sum(output_tokens), 0)`.as("output_tokens"),
      ]).where("status", "in", ["succeeded", "partial", "failed", "canceled"]).where("finished_at", ">=", last24HoursStart).executeTakeFirstOrThrow(),
      this.db.selectFrom("xy_wap_embed_agent_user_memory_run").select([
        "quota_date",
        sql<number>`coalesce(sum(selected_customer_count), 0)`.as("selected_customer_count"),
        sql<number>`coalesce(sum(success_count), 0)`.as("success_count"),
        sql<number>`coalesce(sum(failure_count), 0)`.as("failure_count"),
        sql<number>`coalesce(sum(skipped_count), 0)`.as("skipped_count"),
        sql<number>`coalesce(sum(input_tokens), 0)`.as("input_tokens"),
        sql<number>`coalesce(sum(output_tokens), 0)`.as("output_tokens"),
      ]).where("quota_date", ">=", trendStart).groupBy("quota_date").orderBy("quota_date", "asc").execute(),
    ]);

    const workerHealth = resolveWorkerHealth(runtime, observedAt);

    return {
      observedAt,
      worker: {
        health: workerHealth,
        ...(runtime?.reported_at ? { reportedAt: runtime.reported_at.getTime() } : {}),
        ...(runtime?.reported_by ? { reportedBy: runtime.reported_by } : {}),
        ...(runtime?.last_started_at ? { lastStartedAt: runtime.last_started_at.getTime() } : {}),
        ...(runtime?.last_success_at ? { lastSuccessAt: runtime.last_success_at.getTime() } : {}),
        ...(runtime?.last_failure_at ? { lastFailureAt: runtime.last_failure_at.getTime() } : {}),
        ...(runtime?.last_duration_ms != null ? { lastDurationMs: runtime.last_duration_ms } : {}),
        ...(runtime?.last_error_code ? { lastErrorCode: runtime.last_error_code } : {}),
      },
      totals: {
        enabledTenantCount: toNumber(configTotals.enabled_count),
        dueTenantCount: toNumber(configTotals.due_count),
        delayedTenantCount: toNumber(configTotals.delayed_count),
        activeRunCount: toNumber(activeTotals.active_count),
        expiredLeaseCount: toNumber(activeTotals.expired_lease_count),
        ...(configTotals.oldest_due_at ? { oldestDueAt: configTotals.oldest_due_at.getTime() } : {}),
        ...(activeTotals.oldest_runnable_at ? { oldestRunnableAt: activeTotals.oldest_runnable_at.getTime() } : {}),
      },
      last24Hours: {
        succeededRunCount: toNumber(periodTotals.succeeded_run_count),
        partialRunCount: toNumber(periodTotals.partial_run_count),
        failedRunCount: toNumber(periodTotals.failed_run_count),
        canceledRunCount: toNumber(periodTotals.canceled_run_count),
        selectedCustomerCount: toNumber(periodTotals.selected_customer_count),
        successCount: toNumber(periodTotals.success_count),
        failureCount: toNumber(periodTotals.failure_count),
        skippedCount: toNumber(periodTotals.skipped_count),
        inputTokens: toNumber(periodTotals.input_tokens),
        outputTokens: toNumber(periodTotals.output_tokens),
      },
      trend: trendRows.map((row) => ({
        date: formatDateOnly(row.quota_date),
        selectedCustomerCount: toNumber(row.selected_customer_count),
        successCount: toNumber(row.success_count),
        failureCount: toNumber(row.failure_count),
        skippedCount: toNumber(row.skipped_count),
        inputTokens: toNumber(row.input_tokens),
        outputTokens: toNumber(row.output_tokens),
      })),
    };
  }

  async listTenants(options: { page?: number; pageSize?: number; uid?: number }): Promise<AgentUserMemoryObservabilityTenantListResponse> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    let listQuery = this.db.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll();
    let countQuery = this.db.selectFrom("xy_wap_embed_agent_user_memory_config").select(({ fn }) => fn.countAll<number>().as("count"));
    if (options.uid != null) {
      listQuery = listQuery.where("uid", "=", options.uid);
      countQuery = countQuery.where("uid", "=", options.uid);
    }
    const [configs, countRow] = await Promise.all([
      listQuery.orderBy("uid", "desc").limit(pageSize).offset((page - 1) * pageSize).execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);
    const uids = configs.map((config) => config.uid);
    const activeIds = configs.flatMap((config) => config.active_run_id == null ? [] : [config.active_run_id]);
    const [activeRuns, recentRuns] = uids.length === 0 ? [[], []] : await Promise.all([
      activeIds.length === 0
        ? Promise.resolve([] as RunRow[])
        : this.db.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("id", "in", activeIds).execute(),
      this.db.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("id", "in",
        this.db.selectFrom("xy_wap_embed_agent_user_memory_run").select(({ fn }) => fn.max("id").as("id")).where("uid", "in", uids).groupBy("uid"),
      ).execute(),
    ]);
    const activeById = new Map(activeRuns.map((run) => [run.id, run]));
    const recentByUid = new Map(recentRuns.map((run) => [run.uid, run]));
    const now = this.now();

    return {
      page,
      pageSize,
      total: toNumber(countRow.count),
      items: configs.map((config) => {
        const activeRun = config.active_run_id == null ? undefined : activeById.get(config.active_run_id);
        const recentRun = recentByUid.get(config.uid);
        return {
          uid: config.uid,
          enabled: config.enabled === 1,
          state: resolveTenantState(config, activeRun, now),
          ...(config.next_run_at ? { nextRunAt: config.next_run_at.getTime() } : {}),
          ...(activeRun ? { activeRun: mapObservabilityRun(activeRun) } : {}),
          ...(recentRun ? { recentRun: mapObservabilityRun(recentRun) } : {}),
        };
      }),
    };
  }
}

export function resolveWorkerHealth(runtime: { reported_at: Date; last_failure_at: Date | null; last_success_at: Date | null } | undefined, now: number) {
  const runtimeReportedAt = runtime?.reported_at.getTime();
  const lastFailureAt = runtime?.last_failure_at?.getTime();
  const lastSuccessAt = runtime?.last_success_at?.getTime();
  return runtimeReportedAt == null || now - runtimeReportedAt > HEARTBEAT_STALE_MS
    ? "offline" as const
    : lastFailureAt != null && (lastSuccessAt == null || lastFailureAt > lastSuccessAt)
      ? "error" as const
      : "healthy" as const;
}

export function resolveTenantState(config: ConfigRow, activeRun: RunRow | undefined, now: number): AgentUserMemoryTenantState {
  if (config.enabled !== 1) return "disabled";
  if (config.active_run_id != null && !activeRun) return "warning";
  if (activeRun) {
    if (!ACTIVE_RUN_STATUSES.includes(activeRun.status)
      || (activeRun.status === "running" && activeRun.lease_until && activeRun.lease_until.getTime() <= now)
      || (activeRun.status === "pending" && activeRun.run_after && activeRun.run_after.getTime() <= now - DELAY_THRESHOLD_MS)) return "warning";
    return "running";
  }
  if (config.next_run_at && config.next_run_at.getTime() <= now) return "due";
  return "normal";
}

function mapObservabilityRun(row: RunRow): AgentUserMemoryObservabilityRun {
  return {
    id: row.id,
    status: row.status as AgentUserMemoryObservabilityRun["status"],
    phase: row.phase as AgentUserMemoryObservabilityRun["phase"],
    scheduledFor: row.scheduled_for.getTime(),
    selectedCustomerCount: row.selected_customer_count,
    successCount: row.success_count,
    failureCount: row.failure_count,
    skippedCount: row.skipped_count,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    updatedAt: row.update_time.getTime(),
    ...(row.started_at ? { startedAt: row.started_at.getTime() } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at.getTime() } : {}),
    ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
  };
}

function toNumber(value: number | bigint | string | null | undefined) {
  return Number(value ?? 0);
}

function formatDateOnly(value: Date | string) {
  if (typeof value === "string") return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
