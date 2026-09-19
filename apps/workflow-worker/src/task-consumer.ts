import {
  WorkflowTaskMessageSchema,
  type WorkflowTaskMessage,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import {
  type WorkflowTaskCapacityLease,
  type WorkflowTaskCapacityPort,
} from "@chatai/workflow-runtime";
import type {
  WorkflowBroker,
  WorkflowBrokerMessage,
  WorkflowBrokerSubscription,
} from "./broker/types.js";
import { classifyTaskError } from "./error-policy.js";
import {
  createWorkflowTaskConsumeObserver,
  type WorkflowTaskConsumeObservation,
  type WorkflowWorkerLogger,
} from "./observability.js";

const CAPACITY_UNAVAILABLE_PROBE_DELAY_MS = 30_000;

type WorkflowTaskRuntimeService = {
  executeTask(input: {
    capacityLease?: WorkflowTaskCapacityLease;
    capacityLeaseDurationMs?: number;
    messageId?: string;
    now: Date;
    taskId: string;
    taskVersion: number;
    uid: number;
    workerId: string;
  }): Promise<unknown>;
};

export function createTaskConsumerHandler(input: {
  capacityLeaseDurationMs?: number;
  capacityWaitSignal?: AbortSignal;
  now?: () => Date;
  observe?: (message: WorkflowBrokerMessage, result: WorkflowTaskConsumeObservation) => void;
  runtimeService: WorkflowTaskRuntimeService;
  taskCapacityPort?: WorkflowTaskCapacityPort;
  workerId: string;
}) {
  return async (message: WorkflowBrokerMessage) => {
    const command = parseTaskMessage(message.data);
    if (!command) {
      message.negativeAck();
      input.observe?.(message, {
        code: "invalid_task_message",
        disposition: "nack",
      });
      return;
    }

    let capacityLease: WorkflowTaskCapacityLease | undefined;
    try {
      capacityLease = input.taskCapacityPort
        ? (await waitForTaskCapacity({
            capacityLeaseDurationMs: input.capacityLeaseDurationMs ?? 60_000,
            command,
            now: input.now ?? (() => new Date()),
            port: input.taskCapacityPort,
            signal: input.capacityWaitSignal,
          })) ?? undefined
        : undefined;
      if (input.taskCapacityPort && !capacityLease) return;
      if (input.capacityWaitSignal?.aborted) return;
      const result = await input.runtimeService.executeTask({
        ...(capacityLease ? { capacityLease } : {}),
        ...(input.taskCapacityPort
          ? { capacityLeaseDurationMs: input.capacityLeaseDurationMs ?? 60_000 }
          : {}),
        messageId: command.messageId,
        now: input.now?.() ?? new Date(),
        taskId: command.taskId,
        taskVersion: command.taskVersion,
        uid: parseSafeDatabaseId(command.uid),
        workerId: input.workerId,
      });
      await message.ack();
      input.observe?.(message, createTaskObservation(command, result));
    } catch (error) {
      const disposition = classifyTaskError(error);
      const errorCode = getErrorCode(error);
      if (disposition === "ack") await message.ack();
      else message.negativeAck();
      input.observe?.(message, {
        code: disposition === "ack" ? "acked_boundary" : "temporary_failure",
        command: pickTaskIdentity(command),
        disposition,
        ...(disposition === "nack" ? { error } : {}),
        ...(errorCode ? { errorCode } : {}),
      });
    } finally {
      if (capacityLease && input.taskCapacityPort) {
        await input.taskCapacityPort.release({
          lease: capacityLease,
          uid: parseSafeDatabaseId(command.uid),
        });
      }
    }
  };
}

function createTaskObservation(
  command: WorkflowTaskMessage,
  result: unknown,
): WorkflowTaskConsumeObservation {
  if (!result || typeof result !== "object" || !("kind" in result)) {
    return { code: "completed", command: pickTaskIdentity(command), disposition: "ack" };
  }
  const outcome = result as Record<string, unknown>;
  if (outcome.kind === "deferred") {
    const code = outcome.reasonCode === "WORKFLOW_MESSAGE_RATE_LIMITED"
      ? "rate_limited"
      : outcome.reasonCode === "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED"
        ? "tenant_capacity_limited"
        : outcome.reasonCode === "WORKFLOW_TASK_CAPACITY_UNAVAILABLE"
          ? "capacity_unavailable"
          : "deferred";
    return {
      code,
      command: pickTaskIdentity(command),
      disposition: "ack",
      retryAt: outcome.retryAt,
    };
  }
  if (outcome.kind !== "retry-scheduled"
    && outcome.kind !== "failed"
    && outcome.kind !== "node-failed") {
    return { code: "completed", command: pickTaskIdentity(command), disposition: "ack" };
  }
  return {
    code: outcome.kind === "retry-scheduled"
      ? "retry_scheduled"
      : outcome.kind === "node-failed"
        ? "node_failed"
        : "capability_failed",
    command: pickTaskIdentity(command),
    ...(typeof outcome.diagnosticMessage === "string"
      ? { diagnosticMessage: outcome.diagnosticMessage.slice(0, 1_024) }
      : {}),
    disposition: "ack",
    ...(typeof outcome.errorCode === "string" ? { errorCode: outcome.errorCode } : {}),
    ...(typeof outcome.failureKind === "string" ? { failureKind: outcome.failureKind } : {}),
    ...(typeof outcome.nodeId === "string" ? { nodeId: outcome.nodeId } : {}),
    ...(typeof outcome.nodeKind === "string" ? { nodeKind: outcome.nodeKind } : {}),
    ...(outcome.kind === "retry-scheduled" ? { retryAt: outcome.retryAt } : {}),
  };
}

export async function startTaskConsumer(input: {
  broker: WorkflowBroker;
  capacityLeaseDurationMs?: number;
  deadLetterTopic?: string;
  logger?: WorkflowWorkerLogger;
  maxInFlight: number;
  maxRedeliverCount?: number;
  runtimeService: WorkflowTaskRuntimeService;
  taskCapacityPort?: WorkflowTaskCapacityPort;
  subscription: string;
  topic: string;
  workerId: string;
}): Promise<WorkflowBrokerSubscription> {
  const observer = input.logger
    ? createWorkflowTaskConsumeObserver({
        deadLetterTopic: input.deadLetterTopic,
        logger: input.logger,
      })
    : undefined;
  let subscription: WorkflowBrokerSubscription;
  const capacityWaitController = new AbortController();
  let nextCapacityProbeAt = 0;
  try {
    subscription = await input.broker.subscribe({
      ackTimeoutMs: 0,
      beforeReceive: async () => {
        if (!input.taskCapacityPort) return true;
        const now = Date.now();
        if (now < nextCapacityProbeAt) return false;
        const availability = await input.taskCapacityPort.availability();
        if (availability.kind === "unavailable") {
          nextCapacityProbeAt = Date.now() + CAPACITY_UNAVAILABLE_PROBE_DELAY_MS;
          return false;
        }
        nextCapacityProbeAt = 0;
        return availability.available > 0 || (availability.reserved ?? 0) > 0;
      },
      deadLetterTopic: input.deadLetterTopic,
      handler: createTaskConsumerHandler({
        ...input,
        capacityWaitSignal: capacityWaitController.signal,
        observe: (message, result) => observer?.record(message, result),
      }),
      maxInFlight: input.maxInFlight,
      maxRedeliverCount: input.maxRedeliverCount,
      subscription: input.subscription,
      topic: input.topic,
    });
  } catch (error) {
    observer?.close();
    throw error;
  }
  return {
    async close() {
      capacityWaitController.abort();
      try {
        await subscription.close();
      } finally {
        observer?.close();
      }
    },
    isConnected: () => subscription.isConnected(),
  };
}

async function waitForTaskCapacity(input: {
  capacityLeaseDurationMs: number;
  command: WorkflowTaskMessage;
  now: () => Date;
  port: WorkflowTaskCapacityPort;
  signal?: AbortSignal;
}): Promise<WorkflowTaskCapacityLease | null> {
  const uid = parseSafeDatabaseId(input.command.uid);
  while (!input.signal?.aborted) {
    const admission = await input.port.acquire({
      leaseDurationMs: input.capacityLeaseDurationMs,
      now: input.now(),
      taskId: input.command.taskId,
      taskVersion: input.command.taskVersion,
      uid,
    });
    if (admission.kind === "allowed") {
      if (input.signal?.aborted) {
        await input.port.release({ lease: admission.lease, uid });
        return null;
      }
      return admission.lease;
    }
    if (input.signal?.aborted) return null;
    const retryDelayMs = admission.reasonCode === "WORKFLOW_TASK_CAPACITY_UNAVAILABLE"
      ? Math.max(1_000, admission.retryAt.getTime() - Date.now())
      : Math.max(250, Math.min(
          1_000,
          admission.retryAt.getTime() - Date.now(),
        ));
    await waitForCapacityRetry(retryDelayMs, input.signal);
  }
  return null;
}

function waitForCapacityRetry(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>(resolve => {
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    timer.unref?.();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function parseTaskMessage(data: Buffer): WorkflowTaskMessage | null {
  try {
    const value = JSON.parse(data.toString("utf8")) as unknown;
    return Value.Check(WorkflowTaskMessageSchema, value)
      ? structuredClone(value) as WorkflowTaskMessage
      : null;
  } catch {
    return null;
  }
}

function parseSafeDatabaseId(value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("Workflow uid exceeds runtime range");
  return parsed;
}

function pickTaskIdentity(command: WorkflowTaskMessage) {
  return {
    runId: command.runId,
    taskId: command.taskId,
    taskVersion: command.taskVersion,
    uid: command.uid,
  };
}

function getErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}
