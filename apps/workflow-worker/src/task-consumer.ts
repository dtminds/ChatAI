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
  runtimeService: WorkflowTaskRuntimeService;
  workerId: string;
}) {
  return async (message: WorkflowBrokerMessage) => {
    const command = parseTaskMessage(message.data);
    if (!command) {
      message.negativeAck();
      return;
    }

    try {
      await input.runtimeService.executeTask({
        messageId: command.messageId,
        now: input.now?.() ?? new Date(),
        taskId: command.taskId,
        taskVersion: command.taskVersion,
        uid: parseSafeDatabaseId(command.uid),
        workerId: input.workerId,
      });
      await message.ack();
    } catch (error) {
      if (classifyTaskError(error) === "ack") await message.ack();
      else message.negativeAck();
    }
  };
}

export function startTaskConsumer(input: {
  broker: WorkflowBroker;
  deadLetterTopic?: string;
  maxRedeliverCount?: number;
  runtimeService: WorkflowTaskRuntimeService;
  subscription: string;
  topic: string;
  workerId: string;
}): Promise<WorkflowBrokerSubscription> {
  return input.broker.subscribe({
    deadLetterTopic: input.deadLetterTopic,
    handler: createTaskConsumerHandler(input),
    maxRedeliverCount: input.maxRedeliverCount,
    subscription: input.subscription,
    topic: input.topic,
    type: "Shared",
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
