import {
  WORKFLOW_INBOX_RETENTION_DAYS,
  WORKFLOW_DIRECT_ENTRY_EVENT_TYPE,
  WorkflowDirectEntryPayloadSchema,
  WorkflowEntryEventTypeSchema,
  WorkflowMessageReceivedPayloadSchema,
  type WorkflowEntryEnvelopeValidationCode,
  type WorkflowEntryEvent,
  type WorkflowEntryEventType,
  type WorkflowDirectEntryPayload,
  type WorkflowMessage,
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
import { fitWorkflowMessageOutput, WorkflowRuntimeError } from "@chatai/workflow-runtime";
import type {
  WorkflowBroker,
  WorkflowBrokerMessage,
  WorkflowBrokerSubscription,
} from "./broker/types.js";
import { classifyEntryError } from "./error-policy.js";
import type { WorkflowEntryMessageReader } from "./message-query-port.js";
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
    | { kind: "success" }
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
    | { kind: "active-run-rejected" }
    | { kind: "entry-policy-rejected" }
  >;
  startDirectRun(input: {
    entryEventId: string;
    expectedRevision: number;
    occurredAt: string;
    payload: import("@chatai/contracts").WorkflowDirectEntryPayload;
    payloadVersion: number;
    source: string;
    uid: number;
  }): Promise<
    | { deduplicated: boolean; kind: "success" }
    | { kind: "capacity-rejected" }
    | { kind: "active-run-rejected" }
    | { kind: "entry-policy-rejected" }
  >;
};

export type WorkflowEntryConsumeResultCode =
  | WorkflowEntryEnvelopeValidationCode
  | WorkflowEventCatalogErrorCode
  | "admitted"
  | "capacity_rejected"
  | "active_run_exists"
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
  | "message_hydration"
  | "routing_read"
  | "runtime_admission";

export function createEntryConsumerHandler(input: {
  bindingReader: WorkflowTriggerBindingReader;
  eventCatalog: WorkflowEventCatalog;
  inboxRepository: WorkflowInboxRepository;
  messageReader?: WorkflowEntryMessageReader;
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
    if (parsed.event.eventType === WORKFLOW_DIRECT_ENTRY_EVENT_TYPE) {
      if (parsed.event.payloadVersion !== 1) {
        return rejectPermanentEntry(message, "unsupported_payload_version", input.publishToDeadLetter);
      }
      if (!Value.Check(WorkflowDirectEntryPayloadSchema, parsed.event.payload)) {
        return rejectPermanentEntry(message, "payload_invalid", input.publishToDeadLetter);
      }
      return consumeDirectEntry(message, {
        ...parsed.event,
        payload: parsed.event.payload as WorkflowDirectEntryPayload,
      }, input);
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
          ))).then(results => results.flat()),
      ]);
      failureStage = "message_hydration";
      const projection = await hydrateMessageReceivedProjection({
        bindings,
        event: parsed.event,
        messageReader: input.messageReader,
        projection: catalogResult.projection,
        subscriptions,
      });
      let admitted = 0;
      let capacityRejected = 0;
      let activeRunRejected = 0;
      let deduplicated = 0;
      let entryPolicyRejected = 0;
      let runtimeRejected = 0;
      failureStage = "runtime_admission";
      for (const binding of bindings) {
        if (!matchWorkflowTrigger(binding.filter, projection)) continue;
        const subject = getProjectedSubject(projection, binding.subjectType);
        if (!subject) continue;
        try {
          const result = await admitWorkflow(
            input.runtimeService,
            binding,
            parsed.event,
            projection,
            subject,
          );
          if (result.kind === "capacity-rejected") capacityRejected += 1;
          else if (result.kind === "active-run-rejected") activeRunRejected += 1;
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
            match: projection.match,
            projection: projection.variables,
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
      if (activeRunRejected > 0) {
        return { code: "active_run_exists", disposition: "ack", ...capacityResult };
      }
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

async function consumeDirectEntry(
  message: WorkflowBrokerMessage,
  event: WorkflowEntryEvent & {
    payload: WorkflowDirectEntryPayload;
  },
  input: {
    bindingReader: WorkflowTriggerBindingReader;
    inboxRepository: WorkflowInboxRepository;
    now?: () => Date;
    runtimeService: WorkflowEntryRuntimeService;
  },
): Promise<WorkflowEntryConsumeResult> {
  let failureStage: WorkflowEntryFailureStage = "inbox_check";
  try {
    const observedAt = input.now?.() ?? new Date();
    const inboxMessageId = createEntryInboxMessageId(event);
    if (await input.inboxRepository.hasProcessedInboxMessage({
      consumer: WORKFLOW_ENTRY_INBOX_CONSUMER,
      messageId: inboxMessageId,
    })) {
      failureStage = "ack";
      await message.ack();
      return { code: "deduplicated", disposition: "ack" };
    }

    failureStage = "routing_read";
    const bindings = await input.bindingReader.listActiveTriggerBindings(
      event.uid,
      WORKFLOW_DIRECT_ENTRY_EVENT_TYPE,
    );
    const matchedBinding = bindings.find(binding => binding.workflowId === event.payload.workflowId
      && binding.filter.eventType === WORKFLOW_DIRECT_ENTRY_EVENT_TYPE
      && binding.filter.workUserIds.includes(event.payload.workUserId));

    let code: WorkflowEntryConsumeResultCode = "no_match";
    if (matchedBinding) {
      failureStage = "runtime_admission";
      try {
        const result = await input.runtimeService.startDirectRun({
          entryEventId: event.eventId,
          expectedRevision: matchedBinding.revision,
          occurredAt: event.occurredAt,
          payload: event.payload,
          payloadVersion: event.payloadVersion,
          source: event.source,
          uid: event.uid,
        });
        code = result.kind === "capacity-rejected"
          ? "capacity_rejected"
          : result.kind === "active-run-rejected"
          ? "active_run_exists"
          : result.kind === "entry-policy-rejected"
          ? "entry_policy_rejected"
          : result.deduplicated
            ? "deduplicated"
            : "admitted";
      } catch (error) {
        if (classifyEntryError(error) === "nack") throw error;
        code = "runtime_rejected";
      }
    }

    failureStage = "inbox_record";
    await recordEntryInbox(
      input.inboxRepository,
      event,
      observedAt,
      inboxMessageId,
      code === "capacity_rejected" ? 1 : 0,
    );
    failureStage = "ack";
    await message.ack();
    return code === "capacity_rejected"
      ? { capacityRejectedCount: 1, code, disposition: "ack" }
      : { code, disposition: "ack" };
  } catch (error) {
    message.negativeAck();
    return createTemporaryFailure(error, failureStage);
  }
}

async function recordEntryInbox(
  inboxRepository: WorkflowInboxRepository,
  event: Pick<WorkflowEntryEvent, "uid">,
  processedAt: Date,
  messageId: string,
  capacityRejectedCount: number,
) {
  await inboxRepository.recordProcessedInboxMessage({
    capacityRejectedCount,
    consumer: WORKFLOW_ENTRY_INBOX_CONSUMER,
    expiresAt: new Date(
      processedAt.getTime() + WORKFLOW_INBOX_RETENTION_DAYS * 86_400_000,
    ),
    messageId,
    processedAt,
    uid: event.uid,
  });
}

export async function startEntryConsumer(input: {
  bindingReader: WorkflowTriggerBindingReader;
  broker: WorkflowBroker;
  deadLetterTopic?: string;
  eventCatalog: WorkflowEventCatalog;
  inboxRepository: WorkflowInboxRepository;
  messageReader: WorkflowEntryMessageReader;
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
    messageReader: input.messageReader,
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

async function hydrateMessageReceivedProjection(input: {
  bindings: WorkflowTriggerBindingRecord[];
  event: WorkflowEntryEvent;
  messageReader?: WorkflowEntryMessageReader;
  projection: WorkflowTriggerProjection;
  subscriptions: WorkflowEventSubscriptionRecord[];
}): Promise<WorkflowTriggerProjection> {
  if (input.event.eventType !== "message.received") return input.projection;
  if (!Value.Check(WorkflowMessageReceivedPayloadSchema, input.event.payload)) {
    throw new WorkflowRuntimeError(
      "WORKFLOW_ENTRY_MESSAGE_PAYLOAD_INVALID",
      "Workflow Entry 消息标识无效",
      500,
    );
  }
  if (!hasMessageHydrationCandidate(input.bindings, input.projection, input.subscriptions)) {
    return input.projection;
  }
  if (!input.messageReader) {
    throw new WorkflowRuntimeError(
      "WORKFLOW_ENTRY_MESSAGE_READER_UNAVAILABLE",
      "Workflow Entry 消息读取器不可用",
      503,
    );
  }
  const message = await input.messageReader.findById({
    messageId: input.event.payload.messageId,
    seatId: input.event.payload.seatId,
    thirdExternalUserId: input.event.payload.thirdExternalUserId,
    uid: input.event.uid,
    workUserId: input.event.payload.workUserId,
  });
  if (!message || message.id !== input.event.payload.messageId) {
    throw new WorkflowRuntimeError(
      "WORKFLOW_ENTRY_MESSAGE_UNAVAILABLE",
      "Workflow Entry 消息暂不可用",
      503,
    );
  }
  const visibleMessage = fitWorkflowMessageOutput(message, candidate => ({ message: candidate })).message;
  return {
    ...input.projection,
    match: {
      ...input.projection.match,
      text: renderMessageText(message),
    },
    variables: {
      ...input.projection.variables,
      message: visibleMessage,
    },
  };
}

function hasMessageHydrationCandidate(
  bindings: WorkflowTriggerBindingRecord[],
  projection: WorkflowTriggerProjection,
  subscriptions: WorkflowEventSubscriptionRecord[],
) {
  if (subscriptions.length > 0) return true;
  const seatId = projection.match.seatId;
  return typeof seatId === "number" && bindings.some(binding =>
    binding.subjectType === "chatai_contact"
    && binding.filter.eventType === "message.received"
    && binding.filter.seatIds.includes(seatId));
}

function renderMessageText(message: WorkflowMessage) {
  return message.parts
    .filter((part): part is Extract<WorkflowMessage["parts"][number], { type: "text" }> =>
      part.type === "text")
    .map(part => part.text)
    .join("");
}

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
