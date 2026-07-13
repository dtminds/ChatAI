import type { WorkflowReadiness } from "./health.js";

export type WorkflowWorkerLogger = {
  debug(value: unknown, message?: string): void;
  error(value: unknown, message?: string): void;
  info(value: unknown, message?: string): void;
  warn(value: unknown, message?: string): void;
};

type RoleHeartbeat = {
  completedAt: Date;
  durationMs: number;
  result: unknown;
};

export function logWorkflowRoleHeartbeat(
  logger: WorkflowWorkerLogger,
  role: "outbox" | "reconciler" | "scheduler",
  heartbeat: RoleHeartbeat,
) {
  const result = flattenResult(heartbeat.result);
  const fields = {
    ...result,
    durationMs: heartbeat.durationMs,
    event: "workflow.worker.role.completed",
    role,
  };

  if (requiresRecoveryWarning(role, result)) {
    logger.warn({
      ...fields,
      event: "workflow.worker.role.warning",
    }, "workflow worker role reported warning counters");
    return;
  }

  if (hasPositiveCount(result)) {
    logger.info(fields, "workflow worker role completed");
    return;
  }

  logger.debug({
    ...fields,
    event: "workflow.worker.role.idle",
  }, "workflow worker role idle");
}

export function logWorkflowReadinessTransition(
  logger: WorkflowWorkerLogger,
  previous: WorkflowReadiness,
  current: WorkflowReadiness,
) {
  const previousReady = isReady(previous);
  const ready = isReady(current);
  if (previousReady === ready) return false;

  const fields = {
    broker: current.broker,
    database: current.database,
    event: "workflow.worker.readiness.changed",
    roles: current.roles,
    status: ready ? "ready" : "not-ready",
  };
  if (ready) {
    logger.info(fields, "workflow worker readiness became ready");
  } else {
    logger.warn(fields, "workflow worker readiness degraded");
  }
  return true;
}

function flattenResult(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return {};
  return Object.fromEntries(Object.entries(result).filter(([key, value]) =>
    !key.toLowerCase().includes("cursor")
    && (
      value === null
      || typeof value === "boolean"
      || typeof value === "number"
      || typeof value === "string"
    ),
  ));
}

function hasPositiveCount(result: Record<string, unknown>) {
  return Object.entries(result).some(([key, value]) =>
    !key.endsWith("Checked") && typeof value === "number" && value > 0,
  );
}

function requiresRecoveryWarning(
  role: "outbox" | "reconciler" | "scheduler",
  result: Record<string, unknown>,
) {
  if (role === "outbox") return hasPositive(result, ["dead", "failed"]);
  if (role === "reconciler") {
    return hasPositive(result, [
      "outboxLeasesRecovered",
      "inconsistentRunsFailed",
      "staleTasksCancelled",
      "stalledTasksRepublished",
      "taskLeasesDead",
      "taskLeasesRecovered",
      "terminalRunTasksCancelled",
    ]);
  }
  return false;
}

function hasPositive(result: Record<string, unknown>, keys: string[]) {
  return keys.some(key => typeof result[key] === "number" && result[key] > 0);
}

function isReady(readiness: WorkflowReadiness) {
  return readiness.broker
    && readiness.database
    && Object.values(readiness.roles).every(Boolean);
}
