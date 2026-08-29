import {
  WorkflowTaskMessageSchema,
  type WorkflowTaskMessage,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
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

type WorkflowTaskRuntimeService = {
  executeTask(input: {
    messageId?: string;
    now: Date;
    taskId: string;
    taskVersion: number;
    uid: number;
    workerId: string;
  }): Promise<unknown>;
};

export function createTaskConsumerHandler(input: {
  now?: () => Date;
  observe?: (message: WorkflowBrokerMessage, result: WorkflowTaskConsumeObservation) => void;
  runtimeService: WorkflowTaskRuntimeService;
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

    try {
      const result = await input.runtimeService.executeTask({
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
  deadLetterTopic?: string;
  logger?: WorkflowWorkerLogger;
  maxInFlight: number;
  maxRedeliverCount?: number;
  runtimeService: WorkflowTaskRuntimeService;
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
  try {
    subscription = await input.broker.subscribe({
      deadLetterTopic: input.deadLetterTopic,
      handler: createTaskConsumerHandler({
        ...input,
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
      try {
        await subscription.close();
      } finally {
        observer?.close();
      }
    },
    isConnected: () => subscription.isConnected(),
  };
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
