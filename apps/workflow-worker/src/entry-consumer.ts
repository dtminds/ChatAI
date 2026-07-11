import {
  WorkflowEntryCommandSchema,
  type WorkflowEntryCommand,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { matchWorkflowTrigger } from "@chatai/workflow-engine";
import type {
  WorkflowTriggerBindingReader,
  WorkflowTriggerBindingRecord,
} from "@chatai/workflow-runtime";
import type {
  WorkflowBroker,
  WorkflowBrokerMessage,
  WorkflowBrokerSubscription,
} from "./broker/types.js";
import { classifyEntryError } from "./error-policy.js";

type WorkflowEntryRuntimeService = {
  startRun(input: {
    entryEventId: string;
    expectedRevision: number;
    subjectId: string;
    trigger: Record<string, unknown>;
    uid: number;
    workflowId: string;
  }): Promise<unknown>;
};

export function createEntryConsumerHandler(input: {
  bindingReader: WorkflowTriggerBindingReader;
  runtimeService: WorkflowEntryRuntimeService;
}) {
  return async (message: WorkflowBrokerMessage) => {
    const command = parseEntryCommand(message.data);
    if (!command) {
      message.negativeAck();
      return;
    }

    try {
      const uid = parseSafeDatabaseId(command.uid);
      const bindings = await input.bindingReader.listActiveTriggerBindings(uid, command.eventType);
      for (const binding of bindings) {
        if (!matchWorkflowTrigger(binding.filter, command)) continue;
        try {
          await admitWorkflow(input.runtimeService, binding, command, uid);
        } catch (error) {
          if (classifyEntryError(error) === "nack") throw error;
        }
      }
      await message.ack();
    } catch (error) {
      message.negativeAck();
    }
  };
}

export function startEntryConsumer(input: {
  bindingReader: WorkflowTriggerBindingReader;
  broker: WorkflowBroker;
  deadLetterTopic?: string;
  maxRedeliverCount?: number;
  runtimeService: WorkflowEntryRuntimeService;
  subscription: string;
  topic: string;
}): Promise<WorkflowBrokerSubscription> {
  return input.broker.subscribe({
    deadLetterTopic: input.deadLetterTopic,
    handler: createEntryConsumerHandler(input),
    maxRedeliverCount: input.maxRedeliverCount,
    subscription: input.subscription,
    topic: input.topic,
    type: "Shared",
  });
}

async function admitWorkflow(
  runtimeService: WorkflowEntryRuntimeService,
  binding: WorkflowTriggerBindingRecord,
  command: WorkflowEntryCommand,
  uid: number,
) {
  await runtimeService.startRun({
    entryEventId: command.eventId,
    expectedRevision: binding.revision,
    subjectId: command.subjectId,
    trigger: {
      eventType: command.eventType,
      occurredAt: command.occurredAt,
      thirdUserId: command.thirdUserId,
      triggerPayload: structuredClone(command.triggerPayload),
    },
    uid,
    workflowId: binding.workflowId,
  });
}

function parseEntryCommand(data: Buffer): WorkflowEntryCommand | null {
  try {
    const value = JSON.parse(data.toString("utf8")) as unknown;
    return Value.Check(WorkflowEntryCommandSchema, value)
      ? structuredClone(value) as WorkflowEntryCommand
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
