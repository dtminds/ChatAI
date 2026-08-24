import {
  WORKFLOW_INBOX_RETENTION_DAYS,
  WorkflowEntryEventTypeSchema,
  type WorkflowEntryEnvelopeValidationCode,
  type WorkflowEntryEvent,
  type WorkflowEntryEventType,
  type WorkflowSubjectType,
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
import { WorkflowRuntimeError } from "@chatai/workflow-runtime";
import type {
  WorkflowBroker,
  WorkflowBrokerMessage,
  WorkflowBrokerSubscription,
} from "./broker/types.js";
import { classifyEntryError } from "./error-policy.js";
import {
  createWorkflowEntryConsumeObserver,
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
    subjectType: WorkflowSubjectType;
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
    subjectType: WorkflowSubjectType;
    trigger: Record<string, unknown>;
    uid: number;
    workflowId: string;
  }): Promise<
    | { deduplicated: boolean; kind: "success" }
    | { kind: "capacity-rejected" }
    | { kind: "entry-policy-rejected" }
  >;
};

export type WorkflowEntryConsumeResultCode =
  | WorkflowEntryEnvelopeValidationCode
  | WorkflowEventCatalogErrorCode
  | "admitted"
  | "capacity_rejected"
  | "deduplicated"
  | "entry_policy_rejected"
  | "invalid_json"
  | "no_match"
  | "runtime_rejected"
  | "temporary_failure";

export type WorkflowEntryConsumeResult = {
  capacityRejectedCount?: number;
  code: WorkflowEntryConsumeResultCode;
  disposition: "ack" | "nack";
  errorCode?: string;
  errorName?: "Error" | "UnknownError" | "WorkflowRuntimeError";
  failureStage?: WorkflowEntryFailureStage;
};

export type WorkflowEntryFailureStage =
  | "ack"
  | "dlq_publish"
  | "inbox_check"
  | "inbox_record"
  | "routing_read"
  | "runtime_admission";

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

    let failureStage: WorkflowEntryFailureStage = "inbox_check";
    try {
      const observedAt = input.now?.() ?? new Date();
      const inboxMessageId = createEntryInboxMessageId(parsed.event);
      if (await input.inboxRepository.hasProcessedInboxMessage({
        consumer: WORKFLOW_ENTRY_INBOX_CONSUMER,
        messageId: inboxMessageId,
      })) {
        failureStage = "ack";
        await message.ack();
        return { code: "deduplicated", disposition: "ack" };
      }
      const entryEventType = getEntryEventType(parsed.event.eventType);
      if (!entryEventType) {
        return rejectPermanentEntry(message, "unknown_event_type", input.publishToDeadLetter);
      }
      const projectedSubjects = listProjectedSubjects(catalogResult.projection);
      failureStage = "routing_read";
      const [bindings, subscriptions] = await Promise.all([
        input.bindingReader.listActiveTriggerBindings(
          parsed.event.uid,
          entryEventType,
        ),
        Promise.all(projectedSubjects.map(subject =>
          input.subscriptionReader.listMatchingEventSubscriptions(
            parsed.event.uid,
            subject.subjectType,
            entryEventType,
            subject.subjectId,
            subject.seatId,
            new Date(parsed.event.occurredAt),
            observedAt,
          ))).then(results => results.flat()),
      ]);
      let admitted = 0;
      let capacityRejected = 0;
      let deduplicated = 0;
      let entryPolicyRejected = 0;
      let runtimeRejected = 0;
      failureStage = "runtime_admission";
      for (const binding of bindings) {
        if (!matchWorkflowTrigger(binding.filter, catalogResult.projection)) continue;
        const subject = getProjectedSubject(catalogResult.projection, binding.subjectType);
        if (!subject) continue;
        try {
          const result = await admitWorkflow(
            input.runtimeService,
            binding,
            parsed.event,
            catalogResult.projection,
            subject,
          );
          if (result.kind === "capacity-rejected") capacityRejected += 1;
          else if (result.kind === "entry-policy-rejected") entryPolicyRejected += 1;
          else if (result.deduplicated) deduplicated += 1;
          else admitted += 1;
        } catch (error) {
          if (classifyEntryError(error) === "nack") throw error;
          runtimeRejected += 1;
        }
      }
      for (const subscription of subscriptions) {
        try {
          const result = await input.runtimeService.recordWaitEvent({
            eventId: parsed.event.eventId,
            eventOccurredAt: new Date(parsed.event.occurredAt),
            eventType: entryEventType,
            match: catalogResult.projection.match,
            projection: catalogResult.projection.variables,
            recordedAt: observedAt,
            subscription,
            subjectId: subscription.subjectId,
            subjectType: subscription.subjectType,
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
      const processedAt = observedAt;
      failureStage = "inbox_record";
      await input.inboxRepository.recordProcessedInboxMessage({
        capacityRejectedCount: capacityRejected,
        consumer: WORKFLOW_ENTRY_INBOX_CONSUMER,
        expiresAt: new Date(
          processedAt.getTime() + WORKFLOW_INBOX_RETENTION_DAYS * 86_400_000,
        ),
        messageId: inboxMessageId,
        processedAt,
        uid: parsed.event.uid,
      });
      failureStage = "ack";
      await message.ack();
      const capacityResult = capacityRejected > 0
        ? { capacityRejectedCount: capacityRejected }
        : {};
      if (admitted > 0) return { code: "admitted", disposition: "ack", ...capacityResult };
      if (deduplicated > 0) return { code: "deduplicated", disposition: "ack", ...capacityResult };
      if (entryPolicyRejected > 0) {
        return { code: "entry_policy_rejected", disposition: "ack", ...capacityResult };
      }
      if (capacityRejected > 0) {
        return {
          capacityRejectedCount: capacityRejected,
          code: "capacity_rejected",
          disposition: "ack",
        };
      }
      if (runtimeRejected > 0) {
        return { code: "runtime_rejected", disposition: "ack", ...capacityResult };
      }
      return { code: "no_match", disposition: "ack" };
    } catch (error) {
      message.negativeAck();
      return createTemporaryFailure(error, failureStage);
    }
  };
}

export async function startEntryConsumer(input: {
  bindingReader: WorkflowTriggerBindingReader;
  broker: WorkflowBroker;
  deadLetterTopic?: string;
  eventCatalog: WorkflowEventCatalog;
  inboxRepository: WorkflowInboxRepository;
  logger?: WorkflowWorkerLogger;
  maxInFlight: number;
  maxRedeliverCount?: number;
  now?: () => Date;
  runtimeService: WorkflowEntryRuntimeService;
  subscriptionReader: WorkflowEventSubscriptionReader;
  subscription: string;
  topic: string;
}): Promise<WorkflowBrokerSubscription> {
  const deadLetterTopic = input.deadLetterTopic;
  const observer = input.logger
    ? createWorkflowEntryConsumeObserver({ deadLetterTopic, logger: input.logger })
    : undefined;
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
  let subscription: WorkflowBrokerSubscription;
  try {
    subscription = await input.broker.subscribe({
      deadLetterTopic,
      handler: async message => {
        const result = await handler(message);
        observer?.record(message, result);
      },
      maxInFlight: input.maxInFlight,
      maxRedeliverCount: input.maxRedeliverCount,
      subscription: input.subscription,
      topic: input.topic,
      type: "Shared",
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

const WORKFLOW_ENTRY_INBOX_CONSUMER = "workflow-entry";

function createEntryInboxMessageId(event: Pick<WorkflowEntryEvent, "eventId" | "uid">) {
  return `${event.uid}:${event.eventId}`;
}

function getEntryEventType(eventType: string): WorkflowEntryEventType | null {
  return Value.Check(WorkflowEntryEventTypeSchema, eventType)
    ? eventType as WorkflowEntryEventType
    : null;
}

async function admitWorkflow(
  runtimeService: WorkflowEntryRuntimeService,
  binding: WorkflowTriggerBindingRecord,
  event: WorkflowEntryEvent,
  projection: WorkflowTriggerProjection,
  subject: { subjectId: string; subjectType: WorkflowSubjectType },
) {
  return runtimeService.startRun({
    entryEventId: event.eventId,
    expectedRevision: binding.revision,
    subjectId: subject.subjectId,
    subjectType: subject.subjectType,
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

function listProjectedSubjects(projection: WorkflowTriggerProjection) {
  const subjects: Array<{
    seatId: number | null;
    subjectId: string;
    subjectType: WorkflowSubjectType;
  }> = [];
  if (projection.subjects.chatai_contact) {
    subjects.push({
      seatId: projection.subjects.chatai_contact.seatId,
      subjectId: projection.subjects.chatai_contact.subjectId,
      subjectType: "chatai_contact",
    });
  }
  if (projection.subjects.wecom_contact) {
    subjects.push({
      seatId: null,
      subjectId: projection.subjects.wecom_contact.subjectId,
      subjectType: "wecom_contact",
    });
  }
  return subjects;
}

function getProjectedSubject(
  projection: WorkflowTriggerProjection,
  subjectType: WorkflowSubjectType,
) {
  return listProjectedSubjects(projection).find(subject => subject.subjectType === subjectType) ?? null;
}

async function rejectPermanentEntry(
  message: WorkflowBrokerMessage,
  code: WorkflowEntryConsumeResultCode,
  publishToDeadLetter: ((
    message: WorkflowBrokerMessage,
    code: WorkflowEntryConsumeResultCode,
  ) => Promise<void>) | undefined,
): Promise<WorkflowEntryConsumeResult> {
  let failureStage: WorkflowEntryFailureStage = "dlq_publish";
  try {
    if (!publishToDeadLetter) throw new Error("Workflow Entry DLQ is not configured");
    await publishToDeadLetter(message, code);
    failureStage = "ack";
    await message.ack();
    return { code, disposition: "ack" };
  } catch (error) {
    message.negativeAck();
    return createTemporaryFailure(error, failureStage);
  }
}

function createTemporaryFailure(
  error: unknown,
  failureStage: WorkflowEntryFailureStage,
): WorkflowEntryConsumeResult {
  return {
    code: "temporary_failure",
    disposition: "nack",
    errorCode: getStableErrorCode(error),
    errorName: error instanceof WorkflowRuntimeError
      ? "WorkflowRuntimeError"
      : error instanceof Error
        ? "Error"
        : "UnknownError",
    failureStage,
  };
}

function getStableErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "UNEXPECTED_ERROR";
  }
  const code = Reflect.get(error, "code");
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,127}$/.test(code)
    ? code
    : "UNEXPECTED_ERROR";
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
