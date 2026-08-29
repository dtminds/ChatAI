import type { Kysely } from "kysely";
import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import type { WorkflowObservabilityRole } from "@chatai/contracts";
import type { WorkflowWorkerLogger } from "./observability.js";

const HEARTBEAT_FLUSH_MS = 15_000;
const TABLE = "xy_wap_embed_workflow_worker_state" as const;

type RuntimeSnapshot = {
  lastDurationMs: number | null;
  lastErrorCode: string | null;
  lastFailureAt: Date | null;
  lastStartedAt: Date | null;
  lastSuccessAt: Date | null;
};

export type WorkflowWorkerRuntimeState = {
  close(): Promise<void>;
  markConsumer(role: "entry-consumer" | "task-consumer", connected: boolean): void;
  markFailed(role: WorkflowObservabilityRole, error: unknown): void;
  markStarted(role: WorkflowObservabilityRole): void;
  markSucceeded(role: WorkflowObservabilityRole, durationMs: number): void;
  start(): void;
};

export function createWorkflowWorkerRuntimeState(input: {
  db: Kysely<WorkflowDatabase>;
  flushIntervalMs?: number;
  logger: WorkflowWorkerLogger;
  now?: () => Date;
  reportedBy: string;
}): WorkflowWorkerRuntimeState {
  const states = new Map<WorkflowObservabilityRole, RuntimeSnapshot>();
  let flushPromise: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  return {
    start() {
      void flush();
      timer = setInterval(() => void flush(), input.flushIntervalMs ?? HEARTBEAT_FLUSH_MS);
      timer.unref();
    },
    async close() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      if (flushPromise) await flushPromise;
      await persist().catch((error) => {
        input.logger.warn({
          err: error,
          event: "workflow.worker.runtime_state.flush_failed",
        }, "workflow worker runtime state final flush failed");
      });
    },
    markStarted(role) {
      const state = ensure(role);
      state.lastStartedAt = now();
    },
    markSucceeded(role, durationMs) {
      const state = ensure(role);
      state.lastDurationMs = Math.max(0, durationMs);
      state.lastSuccessAt = now();
    },
    markFailed(role, error) {
      const state = ensure(role);
      state.lastErrorCode = getErrorCode(error);
      state.lastFailureAt = now();
    },
    markConsumer(role, connected) {
      if (connected) {
        this.markStarted(role);
        this.markSucceeded(role, 0);
        return;
      }
      this.markFailed(role, { code: "subscription_disconnected" });
    },
  };

  function ensure(role: WorkflowObservabilityRole) {
    const existing = states.get(role);
    if (existing) return existing;
    const created: RuntimeSnapshot = {
      lastDurationMs: null,
      lastErrorCode: null,
      lastFailureAt: null,
      lastStartedAt: null,
      lastSuccessAt: null,
    };
    states.set(role, created);
    return created;
  }

  function flush() {
    if (flushPromise) return flushPromise;
    flushPromise = persist()
      .catch((error) => {
        input.logger.warn({
          err: error,
          event: "workflow.worker.runtime_state.flush_failed",
        }, "workflow worker runtime state flush failed");
      })
      .finally(() => {
        flushPromise = undefined;
      });
    return flushPromise;
  }

  async function persist() {
    if (states.size === 0) return;
    const reportedAt = now();
    for (const [role, state] of states) {
      await input.db.insertInto(TABLE).values({
        last_duration_ms: state.lastDurationMs,
        last_error_code: state.lastErrorCode,
        last_failure_at: state.lastFailureAt,
        last_started_at: state.lastStartedAt,
        last_success_at: state.lastSuccessAt,
        reported_at: reportedAt,
        reported_by: input.reportedBy,
        role,
      }).onDuplicateKeyUpdate({
        last_duration_ms: state.lastDurationMs,
        last_error_code: state.lastErrorCode,
        last_failure_at: state.lastFailureAt,
        last_started_at: state.lastStartedAt,
        last_success_at: state.lastSuccessAt,
        reported_at: reportedAt,
        reported_by: input.reportedBy,
      }).execute();
    }
  }

  function now() {
    return input.now?.() ?? new Date();
  }
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 128);
  }
  return error instanceof Error ? error.message.slice(0, 128) : "WORKFLOW_WORKER_ROLE_FAILED";
}
