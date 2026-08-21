import type { WorkflowReadiness } from "./health.js";
import type { WorkflowEntryConsumeResult } from "./entry-consumer.js";

export type WorkflowWorkerLogger = {
  debug(value: unknown, message?: string): void;
  error(value: unknown, message?: string): void;
  info(value: unknown, message?: string): void;
  warn(value: unknown, message?: string): void;
};

const MESSAGE_SUMMARY_INTERVAL_MS = 60_000;
const MESSAGE_ERROR_SAMPLE_LIMIT = 3;

type MessageMetadata = {
  id: string;
  redeliveryCount: number;
  topic: string;
};

type ReporterOptions = {
  intervalMs?: number;
  sampleLimit?: number;
};

export function createWorkflowEntryConsumeObserver(input: {
  deadLetterTopic?: string;
  logger: WorkflowWorkerLogger;
  options?: ReporterOptions;
}) {
  let counters = createEntryCounters();
  let failedSamples = 0;
  let rejectedSamples = 0;
  const sampleLimit = input.options?.sampleLimit ?? MESSAGE_ERROR_SAMPLE_LIMIT;
  const timer = setInterval(flush, input.options?.intervalMs ?? MESSAGE_SUMMARY_INTERVAL_MS);
  timer.unref();

  return {
    close() {
      clearInterval(timer);
      flush();
    },
    flush,
    record(message: MessageMetadata, result: WorkflowEntryConsumeResult) {
      counters.received += 1;
      const bucket = getEntryCounterBucket(result);
      counters[bucket] += 1;
      if (result.disposition === "nack") {
        if (failedSamples < sampleLimit) {
          failedSamples += 1;
          input.logger.warn({
            code: result.code,
            ...(input.deadLetterTopic ? { deadLetterTopic: input.deadLetterTopic } : {}),
            disposition: result.disposition,
            ...(result.errorCode ? { errorCode: result.errorCode } : {}),
            ...(result.errorName ? { errorName: result.errorName } : {}),
            event: "workflow.entry.consume.failed",
            ...(result.failureStage ? { failureStage: result.failureStage } : {}),
            messageId: message.id,
            redeliveryCount: message.redeliveryCount,
            role: "entry-consumer",
            topic: message.topic,
          }, "workflow entry message processing failed");
        }
        return;
      }
      if (bucket === "rejected" || bucket === "runtimeRejected") {
        if (rejectedSamples < sampleLimit) {
          rejectedSamples += 1;
          input.logger.warn({
            code: result.code,
            ...(bucket === "rejected" && input.deadLetterTopic
              ? { deadLetterTopic: input.deadLetterTopic }
              : {}),
            disposition: result.disposition,
            event: "workflow.entry.consume.rejected",
            messageId: message.id,
            redeliveryCount: message.redeliveryCount,
            role: "entry-consumer",
            topic: message.topic,
          }, "workflow entry message rejected");
        }
      }
    },
  };

  function flush() {
    if (counters.received === 0) return;
    input.logger.info({
      ...counters,
      event: "workflow.entry.consume.summary",
      role: "entry-consumer",
    }, "workflow entry consume summary");
    counters = createEntryCounters();
    failedSamples = 0;
    rejectedSamples = 0;
  }
}

export type WorkflowTaskConsumeObservation = {
  code:
    | "acked_boundary"
    | "capability_failed"
    | "completed"
    | "invalid_task_message"
    | "node_failed"
    | "retry_scheduled"
    | "temporary_failure";
  command?: {
    runId: string;
    taskId: string;
    taskVersion: number;
    uid: string;
  };
  diagnosticMessage?: string;
  disposition: "ack" | "nack";
  error?: unknown;
  errorCode?: string;
  failureKind?: string;
  nodeId?: string;
  nodeKind?: string;
  retryAt?: unknown;
};

export function createWorkflowTaskConsumeObserver(input: {
  deadLetterTopic?: string;
  logger: WorkflowWorkerLogger;
  options?: ReporterOptions;
}) {
  let counters = createTaskCounters();
  let capabilityFailedSamples = 0;
  let failedSamples = 0;
  let invalidSamples = 0;
  let nodeFailedSamples = 0;
  let retryScheduledSamples = 0;
  const sampleLimit = input.options?.sampleLimit ?? MESSAGE_ERROR_SAMPLE_LIMIT;
  const timer = setInterval(flush, input.options?.intervalMs ?? MESSAGE_SUMMARY_INTERVAL_MS);
  timer.unref();

  return {
    close() {
      clearInterval(timer);
      flush();
    },
    flush,
    record(message: MessageMetadata, result: WorkflowTaskConsumeObservation) {
      counters.received += 1;
      const bucket = getTaskCounterBucket(result.code);
      counters[bucket] += 1;
      if (result.code === "invalid_task_message") {
        if (invalidSamples < sampleLimit) {
          invalidSamples += 1;
          input.logger.warn(createTaskSampleFields(
            input.deadLetterTopic,
            message,
            result,
            "workflow.task.consume.rejected",
          ), "workflow task message rejected");
        }
        return;
      }
      if (result.code === "temporary_failure") {
        if (failedSamples < sampleLimit) {
          failedSamples += 1;
          input.logger.warn(createTaskSampleFields(
            input.deadLetterTopic,
            message,
            result,
            "workflow.task.consume.failed",
          ), "workflow task message processing failed");
        }
        return;
      }
      if (result.code === "retry_scheduled"
        || result.code === "capability_failed"
        || result.code === "node_failed") {
        const samples = result.code === "retry_scheduled"
          ? retryScheduledSamples
          : result.code === "node_failed"
            ? nodeFailedSamples
            : capabilityFailedSamples;
        if (samples < sampleLimit) {
          if (result.code === "retry_scheduled") retryScheduledSamples += 1;
          else if (result.code === "node_failed") nodeFailedSamples += 1;
          else capabilityFailedSamples += 1;
          const event = result.code === "retry_scheduled"
            ? "workflow.capability.retry.scheduled"
            : result.code === "node_failed"
              ? "workflow.node.failed"
              : "workflow.capability.failed";
          input.logger.warn(createTaskSampleFields(
            input.deadLetterTopic,
            message,
            result,
            event,
          ), event.replaceAll(".", " "));
        }
      }
    },
  };

  function flush() {
    if (counters.received === 0) return;
    input.logger.info({
      ...counters,
      event: "workflow.task.consume.summary",
      role: "task-consumer",
    }, "workflow task consume summary");
    counters = createTaskCounters();
    capabilityFailedSamples = 0;
    failedSamples = 0;
    invalidSamples = 0;
    nodeFailedSamples = 0;
    retryScheduledSamples = 0;
  }
}

type RoleHeartbeat = {
  completedAt: Date;
  durationMs: number;
  result: unknown;
};

export function logWorkflowRoleHeartbeat(
  logger: WorkflowWorkerLogger,
  role: "inference" | "outbox" | "reconciler" | "scheduler",
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
  role: "inference" | "outbox" | "reconciler" | "scheduler",
  result: Record<string, unknown>,
) {
  if (role === "outbox") return hasPositive(result, ["dead", "failed"]);
  if (role === "inference") return hasPositive(result, ["failed", "retried"]);
  if (role === "reconciler") {
    return hasPositive(result, [
      "outboxLeasesRecovered",
      "revisionCleanupFailed",
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

function createEntryCounters() {
  return {
    admitted: 0,
    deduplicated: 0,
    entryPolicyRejected: 0,
    nacked: 0,
    noMatch: 0,
    received: 0,
    rejected: 0,
    runtimeRejected: 0,
  };
}

function getEntryCounterBucket(result: WorkflowEntryConsumeResult):
  Exclude<keyof ReturnType<typeof createEntryCounters>, "received"> {
  if (result.disposition === "nack") return "nacked";
  if (result.code === "admitted") return "admitted";
  if (result.code === "deduplicated") return "deduplicated";
  if (result.code === "entry_policy_rejected") return "entryPolicyRejected";
  if (result.code === "no_match") return "noMatch";
  if (result.code === "runtime_rejected") return "runtimeRejected";
  return "rejected";
}

function createTaskCounters() {
  return {
    ackedBoundary: 0,
    capabilityFailed: 0,
    completed: 0,
    invalid: 0,
    nacked: 0,
    nodeFailed: 0,
    received: 0,
    retryScheduled: 0,
  };
}

function getTaskCounterBucket(code: WorkflowTaskConsumeObservation["code"]):
  Exclude<keyof ReturnType<typeof createTaskCounters>, "received"> {
  if (code === "acked_boundary") return "ackedBoundary";
  if (code === "capability_failed") return "capabilityFailed";
  if (code === "completed") return "completed";
  if (code === "invalid_task_message") return "invalid";
  if (code === "node_failed") return "nodeFailed";
  if (code === "retry_scheduled") return "retryScheduled";
  return "nacked";
}

function createTaskSampleFields(
  deadLetterTopic: string | undefined,
  message: MessageMetadata,
  result: WorkflowTaskConsumeObservation,
  event: string,
) {
  return {
    code: result.code,
    ...(result.command ?? {}),
    ...(deadLetterTopic ? { deadLetterTopic } : {}),
    ...(result.diagnosticMessage
      ? { diagnosticMessage: result.diagnosticMessage.slice(0, 1_024) }
      : {}),
    disposition: result.disposition,
    ...(result.error ? { err: result.error } : {}),
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    event,
    ...(result.failureKind ? { failureKind: result.failureKind } : {}),
    messageId: message.id,
    ...(result.nodeId ? { nodeId: result.nodeId } : {}),
    ...(result.nodeKind ? { nodeKind: result.nodeKind } : {}),
    redeliveryCount: message.redeliveryCount,
    ...(result.retryAt ? { retryAt: result.retryAt } : {}),
    role: "task-consumer",
    topic: message.topic,
  };
}
