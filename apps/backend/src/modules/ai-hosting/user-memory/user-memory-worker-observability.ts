import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema.js";
import type { AppLogger } from "../../../shared/logger.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const RUNTIME_KEY = "user_memory";

type RuntimeState = {
  lastDurationMs: number | null;
  lastErrorCode: string | null;
  lastFailureAt: Date | null;
  lastStartedAt: Date | null;
  lastSuccessAt: Date | null;
};

export class UserMemoryWorkerObservability {
  private flushPromise?: Promise<void>;
  private readonly state: RuntimeState = {
    lastDurationMs: null,
    lastErrorCode: null,
    lastFailureAt: null,
    lastStartedAt: null,
    lastSuccessAt: null,
  };
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly input: {
    db: Kysely<Database>;
    logger: AppLogger;
    now?: () => number;
    reportedBy: string;
  }) {}

  start() {
    this.input.logger.info({
      component: "agent-user-memory-worker",
      eventCode: "agent_user_memory_worker.started",
    }, "Agent 用户记忆 Worker 已启动");
    void this.flush();
    this.timer = setInterval(() => void this.flush(), HEARTBEAT_INTERVAL_MS);
    this.timer.unref();
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.flushPromise) await this.flushPromise;
    await this.persist().catch((error) => {
      this.input.logger.warn({ error }, "Agent user-memory worker final heartbeat failed");
    });
    this.input.logger.info({
      component: "agent-user-memory-worker",
      eventCode: "agent_user_memory_worker.stopped",
    }, "Agent 用户记忆 Worker 已停止");
  }

  tickStarted() {
    const startedAt = this.now();
    this.state.lastStartedAt = new Date(startedAt);
    return startedAt;
  }

  tickSucceeded(startedAt: number) {
    const completedAt = this.now();
    this.state.lastDurationMs = Math.max(0, completedAt - startedAt);
    this.state.lastErrorCode = null;
    this.state.lastSuccessAt = new Date(completedAt);
  }

  tickFailed(startedAt: number, error: unknown) {
    const completedAt = this.now();
    this.state.lastDurationMs = Math.max(0, completedAt - startedAt);
    this.state.lastErrorCode = getErrorCode(error);
    this.state.lastFailureAt = new Date(completedAt);
  }

  private flush() {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.persist()
      .catch((error) => {
        this.input.logger.warn({ error }, "Agent user-memory worker heartbeat failed");
      })
      .finally(() => {
        this.flushPromise = undefined;
      });
    return this.flushPromise;
  }

  private async persist() {
    const reportedAt = new Date(this.now());
    await this.input.db.insertInto("xy_wap_embed_user_memory_worker_state").values({
      runtime_key: RUNTIME_KEY,
      last_started_at: this.state.lastStartedAt,
      last_success_at: this.state.lastSuccessAt,
      last_failure_at: this.state.lastFailureAt,
      last_error_code: this.state.lastErrorCode,
      last_duration_ms: this.state.lastDurationMs,
      reported_by: this.input.reportedBy,
      reported_at: reportedAt,
    }).onDuplicateKeyUpdate({
      last_started_at: this.state.lastStartedAt,
      last_success_at: this.state.lastSuccessAt,
      last_failure_at: this.state.lastFailureAt,
      last_error_code: this.state.lastErrorCode,
      last_duration_ms: this.state.lastDurationMs,
      reported_by: this.input.reportedBy,
      reported_at: reportedAt,
    }).execute();
  }

  private now() {
    return this.input.now?.() ?? Date.now();
  }
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 128);
  }
  return error instanceof Error ? error.message.slice(0, 128) : "AGENT_USER_MEMORY_WORKER_FAILED";
}
