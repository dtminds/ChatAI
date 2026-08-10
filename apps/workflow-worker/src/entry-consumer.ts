import {
  WORKFLOW_INBOX_RETENTION_DAYS,
  WorkflowEntryEventTypeSchema,
  type WorkflowEntryEnvelopeValidationCode,
  type WorkflowEntryEvent,
  type WorkflowEntryEventType,
  validateWorkflowEntryEvent,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import {
  matchWorkflowTrigger,
  type WorkflowEventCatalog,
  type WorkflowEventCatalogErrorCode,
  type WorkflowTriggerProjection,
} from "@chatai/workflow-engine";
import type {
  WorkflowEventSubscriptionReader,
  WorkflowEventSubscriptionRecord,
  WorkflowInboxRepository,
  WorkflowTriggerBindingReader,
  WorkflowTriggerBindingRecord,
} from "@chatai/workflow-runtime";
import type {
  WorkflowBroker,
  WorkflowBrokerMessage,
  WorkflowBrokerSubscription,
} from "./broker/types.js";
import { classifyEntryError } from "./error-policy.js";
import {
  logWorkflowEntryConsumeResult,
  type WorkflowWorkerLogger,
} from "./observability.js";

type WorkflowEntryRuntimeService = {
  recordWaitEvent(input: {
    eventId: string;
    eventOccurredAt: Date;
    eventType: WorkflowEntryEventType;
    match: WorkflowTriggerProjection["match"];
    projection: WorkflowTriggerProjection["variables"];
    recordedAt: Date;
    subscription: WorkflowEventSubscriptionRecord;
    subjectId: string;
    subjectType: WorkflowEntryEvent["subjectType"];
    uid: number;
  }): Promise<
    | { firstEvent: boolean; kind: "success" }
    | {
        kind:
          | "already-processed"
          | "conflict"
          | "not-found"
          | "not-matched";
      }
  >;
  startRun(input: {
    entryEventId: string;
    expectedRevision: number;
    subjectId: string;
    subjectType: WorkflowEntryEvent["subjectType"];
    trigger: Record<string, unknown>;
    uid: number;
    workflowId: string;
  }): Promise<
    | { deduplicated: boolean; kind: "success" }
    | { kind: "entry-policy-rejected" }
  >;
};

export type WorkflowEntryConsumeResultCode =
  | WorkflowEntryEnvelopeValidationCode
  | WorkflowEventCatalogErrorCode
  | "admitted"
  | "deduplicated"
  | "entry_policy_rejected"
  | "invalid_json"
  | "no_match"
  | "runtime_rejected"
  | "temporary_failure";

export type WorkflowEntryConsumeResult = {
  code: WorkflowEntryConsumeResultCode;
  disposition: "ack" | "nack";
};

export function createEntryConsumerHandler(input: {
  bindingReader: WorkflowTriggerBindingReader;
  eventCatalog: WorkflowEventCatalog;
  inboxRepository: WorkflowInboxRepository;
  now?: () => Date;
  publishToDeadLetter?: (
    message: WorkflowBrokerMessage,
    code: WorkflowEntryConsumeResultCode,
  ) => Promise<void>;
  runtimeService: WorkflowEntryRuntimeService;
  subscriptionReader: WorkflowEventSubscriptionReader;
}) {
  return async (message: WorkflowBrokerMessage): Promise<WorkflowEntryConsumeResult> => {
    const parsed = parseEntryEvent(message.data);
    if (parsed.kind === "rejected") {
      return rejectPermanentEntry(message, parsed.code, input.publishToDeadLetter);
    }
    const catalogResult = input.eventCatalog.project(parsed.event);
    if (catalogResult.kind === "rejected") {
      return rejectPermanentEntry(message, catalogResult.code, input.publishToDeadLetter);
    }

    try {
      const observedAt = input.now?.() ?? new Date();
      const inboxMessageId = createEntryInboxMessageId(parsed.event);
      if (await input.inboxRepository.hasProcessedInboxMessage({
        consumer: WORKFLOW_ENTRY_INBOX_CONSUMER,
        messageId: inboxMessageId,
      })) {
        await message.ack();
        return { code: "deduplicated", disposition: "ack" };
      }
      const subscriptionEventType = getSubscriptionEventType(parsed.event.eventType);
      const [bindings, subscriptions] = await Promise.all([
        input.bindingReader.listActiveTriggerBindings(
          parsed.event.uid,
          parsed.event.subjectType,
          parsed.event.eventType,
        ),
        subscriptionEventType
          ? input.subscriptionReader.listMatchingEventSubscriptions(
              parsed.event.uid,
              parsed.event.subjectType,
              subscriptionEventType,
              parsed.event.subjectId,
              new Date(parsed.event.occurredAt),
              observedAt,
            )
          : Promise.resolve([]),
      ]);
      let admitted = 0;
      let deduplicated = 0;
      let entryPolicyRejected = 0;
      let runtimeRejected = 0;
      for (const binding of bindings) {
        if (!matchWorkflowTrigger(binding.filter, catalogResult.projection)) continue;
        try {
          const result = await admitWorkflow(
            input.runtimeService,
            binding,
            parsed.event,
            catalogResult.projection,
          );
          if (result.kind === "entry-policy-rejected") entryPolicyRejected += 1;
          else if (result.deduplicated) deduplicated += 1;
          else admitted += 1;
        } catch (error) {
          if (classifyEntryError(error) === "nack") throw error;
          runtimeRejected += 1;
        }
      }
      if (subscriptionEventType) {
        for (const subscription of subscriptions) {
          try {
            const result = await input.runtimeService.recordWaitEvent({
              eventId: parsed.event.eventId,
              eventOccurredAt: new Date(parsed.event.occurredAt),
              eventType: subscriptionEventType,
              match: catalogResult.projection.match,
              projection: catalogResult.projection.variables,
              recordedAt: observedAt,
              subscription,
              subjectId: parsed.event.subjectId,
              subjectType: parsed.event.subjectType,
              uid: parsed.event.uid,
            });
            if (result.kind === "success") admitted += 1;
            else if (result.kind === "already-processed"
              || result.kind === "conflict"
              || result.kind === "not-found") deduplicated += 1;
            else if (result.kind !== "not-matched") runtimeRejected += 1;
          } catch (error) {
            if (classifyEntryError(error) === "nack") throw error;
            runtimeRejected += 1;
          }
        }
      }
      const processedAt = observedAt;
      await input.inboxRepository.recordProcessedInboxMessage({
        consumer: WORKFLOW_ENTRY_INBOX_CONSUMER,
        expiresAt: new Date(
          processedAt.getTime() + WORKFLOW_INBOX_RETENTION_DAYS * 86_400_000,
        ),
        messageId: inboxMessageId,
        processedAt,
        uid: parsed.event.uid,
      });
      await message.ack();
      if (admitted > 0) return { code: "admitted", disposition: "ack" };
      if (deduplicated > 0) return { code: "deduplicated", disposition: "ack" };
      if (entryPolicyRejected > 0) {
        return { code: "entry_policy_rejected", disposition: "ack" };
      }
      if (runtimeRejected > 0) return { code: "runtime_rejected", disposition: "ack" };
      return { code: "no_match", disposition: "ack" };
    } catch {
      message.negativeAck();
      return { code: "temporary_failure", disposition: "nack" };
    }
  };
}

export function startEntryConsumer(input: {
  bindingReader: WorkflowTriggerBindingReader;
  broker: WorkflowBroker;
  deadLetterTopic?: string;
  eventCatalog: WorkflowEventCatalog;
  inboxRepository: WorkflowInboxRepository;
  logger?: WorkflowWorkerLogger;
  maxRedeliverCount?: number;
  now?: () => Date;
  runtimeService: WorkflowEntryRuntimeService;
  subscriptionReader: WorkflowEventSubscriptionReader;
  subscription: string;
  topic: string;
}): Promise<WorkflowBrokerSubscription> {
  const deadLetterTopic = input.deadLetterTopic;
  const handler = createEntryConsumerHandler({
    bindingReader: input.bindingReader,
    eventCatalog: input.eventCatalog,
    inboxRepository: input.inboxRepository,
    now: input.now,
    publishToDeadLetter: deadLetterTopic
      ? async (message, code) => {
          await input.broker.publish({
            data: Buffer.from(message.data),
            key: message.key ?? undefined,
            properties: {
              ...message.properties,
              workflowEntryOriginalTopic: message.topic,
              workflowEntryResultCode: code,
            },
            topic: deadLetterTopic,
          });
        }
      : undefined,
    runtimeService: input.runtimeService,
    subscriptionReader: input.subscriptionReader,
  });
  return input.broker.subscribe({
    deadLetterTopic,
    handler: async message => {
      const result = await handler(message);
      if (input.logger) logWorkflowEntryConsumeResult(input.logger, result);
    },
    maxRedeliverCount: input.maxRedeliverCount,
    subscription: input.subscription,
    topic: input.topic,
    type: "Shared",
  });
}

const WORKFLOW_ENTRY_INBOX_CONSUMER = "workflow-entry";

function createEntryInboxMessageId(event: Pick<WorkflowEntryEvent, "eventId" | "uid">) {
  return `${event.uid}:${event.eventId}`;
}

function getSubscriptionEventType(eventType: string): WorkflowEntryEventType | null {
  return Value.Check(WorkflowEntryEventTypeSchema, eventType)
    ? eventType as WorkflowEntryEventType
    : null;
}

async function admitWorkflow(
  runtimeService: WorkflowEntryRuntimeService,
  binding: WorkflowTriggerBindingRecord,
  event: WorkflowEntryEvent,
  projection: WorkflowTriggerProjection,
) {
  return runtimeService.startRun({
    entryEventId: event.eventId,
    expectedRevision: binding.revision,
    subjectId: event.subjectId,
    subjectType: event.subjectType,
    trigger: {
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      payloadVersion: event.payloadVersion,
      projection: structuredClone(projection.variables),
      source: event.source,
    },
    uid: event.uid,
    workflowId: binding.workflowId,
  });
}

async function rejectPermanentEntry(
  message: WorkflowBrokerMessage,
  code: WorkflowEntryConsumeResultCode,
  publishToDeadLetter: ((
    message: WorkflowBrokerMessage,
    code: WorkflowEntryConsumeResultCode,
  ) => Promise<void>) | undefined,
): Promise<WorkflowEntryConsumeResult> {
  try {
    if (!publishToDeadLetter) throw new Error("Workflow Entry DLQ is not configured");
    await publishToDeadLetter(message, code);
    await message.ack();
    return { code, disposition: "ack" };
  } catch {
    message.negativeAck();
    return { code: "temporary_failure", disposition: "nack" };
  }
}

function parseEntryEvent(data: Buffer):
  | { event: WorkflowEntryEvent; kind: "accepted" }
  | { code: WorkflowEntryEnvelopeValidationCode | "invalid_json"; kind: "rejected" } {
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) as unknown;
    return validateWorkflowEntryEvent(value, { encodedByteLength: data.byteLength });
  } catch {
    return { code: "invalid_json", kind: "rejected" };
  }
}
