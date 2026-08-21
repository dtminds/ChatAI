import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { WorkflowUtcInstantSchema } from "./utc-instant.js";

export const WORKFLOW_ENTRY_EVENT_SCHEMA_VERSION = 1;
export const WORKFLOW_ENTRY_EVENT_MAX_BYTES = 64 * 1024;
export const WORKFLOW_ENTRY_PAYLOAD_MAX_BYTES = 32 * 1024;
export const WORKFLOW_ENTRY_JSON_MAX_DEPTH = 16;
export const WORKFLOW_MESSAGE_RECEIVED_TEXT_MAX_LENGTH = 1_000;

export const WorkflowJsonValueSchema = Type.Recursive(Self => Type.Union([
  Type.Null(),
  Type.Boolean(),
  Type.Number(),
  Type.String(),
  Type.Array(Self),
  Type.Record(Type.String(), Self),
]));

export const WorkflowJsonObjectSchema = Type.Record(Type.String(), WorkflowJsonValueSchema);

const WorkflowPositiveSafeIntegerSchema = Type.Integer({
  maximum: Number.MAX_SAFE_INTEGER,
  minimum: 1,
});
const WorkflowThirdExternalUserIdSchema = Type.String({ maxLength: 128, minLength: 1 });
const WorkflowEventSourceIdSchema = Type.String({ maxLength: 128, minLength: 1 });

const WorkflowWeComContactIdentitySchema = {
  externalUserId: WorkflowPositiveSafeIntegerSchema,
  workUserId: WorkflowPositiveSafeIntegerSchema,
} as const;

const WorkflowChatAiContactIdentitySchema = {
  seatId: WorkflowPositiveSafeIntegerSchema,
  thirdExternalUserId: WorkflowThirdExternalUserIdSchema,
} as const;

export const WorkflowContactFriendAddedPayloadSchema = Type.Union([
  Type.Object({
    ...WorkflowWeComContactIdentitySchema,
    sourceId: Type.Optional(WorkflowEventSourceIdSchema),
  }, { additionalProperties: false }),
  Type.Object({
    ...WorkflowWeComContactIdentitySchema,
    ...WorkflowChatAiContactIdentitySchema,
    sourceId: Type.Optional(WorkflowEventSourceIdSchema),
  }, { additionalProperties: false }),
]);

export const WorkflowContactTagAddedPayloadSchema = Type.Union([
  Type.Object({
    ...WorkflowWeComContactIdentitySchema,
    tagId: WorkflowPositiveSafeIntegerSchema,
  }, { additionalProperties: false }),
  Type.Object({
    ...WorkflowWeComContactIdentitySchema,
    ...WorkflowChatAiContactIdentitySchema,
    tagId: WorkflowPositiveSafeIntegerSchema,
  }, { additionalProperties: false }),
]);

export const WorkflowMessageReceivedPayloadSchema = Type.Object({
  externalUserId: Type.Optional(WorkflowPositiveSafeIntegerSchema),
  messageId: WorkflowPositiveSafeIntegerSchema,
  ...WorkflowChatAiContactIdentitySchema,
  text: Type.Optional(Type.String({ maxLength: WORKFLOW_MESSAGE_RECEIVED_TEXT_MAX_LENGTH })),
  workUserId: WorkflowPositiveSafeIntegerSchema,
}, { additionalProperties: false });

export const WorkflowEntryEventSourceSchema = Type.Union([
  Type.Literal("wecom"),
  Type.Literal("chatai"),
]);

export const WorkflowEntryEventNameSchema = Type.String({
  maxLength: 128,
  minLength: 1,
  pattern: "^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$",
});

export const WorkflowEntryEventSchema = Type.Object({
  eventId: Type.String({ maxLength: 128, minLength: 1 }),
  eventType: WorkflowEntryEventNameSchema,
  occurredAt: WorkflowUtcInstantSchema,
  payload: WorkflowJsonObjectSchema,
  payloadVersion: Type.Integer({ maximum: 65_535, minimum: 1 }),
  schemaVersion: Type.Literal(WORKFLOW_ENTRY_EVENT_SCHEMA_VERSION),
  source: WorkflowEntryEventSourceSchema,
  uid: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
}, { additionalProperties: false });

export type WorkflowJsonValue = Static<typeof WorkflowJsonValueSchema>;
export type WorkflowJsonObject = Static<typeof WorkflowJsonObjectSchema>;
export type WorkflowEntryEvent = Static<typeof WorkflowEntryEventSchema>;
export type WorkflowEntryEventSource = Static<typeof WorkflowEntryEventSourceSchema>;
export type WorkflowContactFriendAddedPayload = Static<
  typeof WorkflowContactFriendAddedPayloadSchema
>;
export type WorkflowContactTagAddedPayload = Static<typeof WorkflowContactTagAddedPayloadSchema>;
export type WorkflowMessageReceivedPayload = Static<typeof WorkflowMessageReceivedPayloadSchema>;

export function createWorkflowEntryPartitionKey(event: WorkflowEntryEvent) {
  if (event.eventType === "contact.friend_added"
    && Value.Check(WorkflowContactFriendAddedPayloadSchema, event.payload)) {
    return `${event.uid}:wecom_contact:${event.payload.externalUserId}`;
  }
  if (event.eventType === "contact.tag_added"
    && Value.Check(WorkflowContactTagAddedPayloadSchema, event.payload)) {
    return `${event.uid}:wecom_contact:${event.payload.externalUserId}`;
  }
  if (event.eventType === "message.received"
    && Value.Check(WorkflowMessageReceivedPayloadSchema, event.payload)) {
    return `${event.uid}:chatai_contact:${event.payload.thirdExternalUserId}`;
  }
  throw new Error(`Unsupported Workflow Entry Event partition key: ${event.eventType}`);
}

export type WorkflowEntryEnvelopeValidationCode =
  | "envelope_invalid"
  | "envelope_too_large"
  | "json_too_deep"
  | "payload_too_large"
  | "unsupported_schema_version";

export type WorkflowEntryEnvelopeValidationResult =
  | { event: WorkflowEntryEvent; kind: "accepted" }
  | { code: WorkflowEntryEnvelopeValidationCode; kind: "rejected" };

export function validateWorkflowEntryEvent(
  value: unknown,
  options: { encodedByteLength?: number } = {},
): WorkflowEntryEnvelopeValidationResult {
  if (options.encodedByteLength !== undefined
    && options.encodedByteLength > WORKFLOW_ENTRY_EVENT_MAX_BYTES) {
    return { code: "envelope_too_large", kind: "rejected" };
  }
  if (!isRecord(value)) return { code: "envelope_invalid", kind: "rejected" };
  if (value.schemaVersion !== WORKFLOW_ENTRY_EVENT_SCHEMA_VERSION) {
    return { code: "unsupported_schema_version", kind: "rejected" };
  }
  const envelopeBytes = getWorkflowJsonEncodedByteLength(value);
  if (envelopeBytes === null) return { code: "envelope_invalid", kind: "rejected" };
  let event: WorkflowEntryEvent;
  try {
    event = Value.Decode(
      WorkflowEntryEventSchema,
      structuredClone(value),
    ) as WorkflowEntryEvent;
  } catch {
    return { code: "envelope_invalid", kind: "rejected" };
  }
  if (getWorkflowJsonDepth(value) > WORKFLOW_ENTRY_JSON_MAX_DEPTH) {
    return { code: "json_too_deep", kind: "rejected" };
  }
  const payloadBytes = getWorkflowJsonEncodedByteLength(value.payload);
  if (payloadBytes === null) return { code: "envelope_invalid", kind: "rejected" };
  if (payloadBytes > WORKFLOW_ENTRY_PAYLOAD_MAX_BYTES) {
    return { code: "payload_too_large", kind: "rejected" };
  }
  if (Math.max(options.encodedByteLength ?? 0, envelopeBytes) > WORKFLOW_ENTRY_EVENT_MAX_BYTES) {
    return { code: "envelope_too_large", kind: "rejected" };
  }
  return { event, kind: "accepted" };
}

export function getWorkflowJsonEncodedByteLength(value: unknown): number | null {
  try {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? null : new TextEncoder().encode(encoded).byteLength;
  } catch {
    return null;
  }
}

export function getWorkflowJsonDepth(value: unknown): number {
  const stack: Array<{ depth: number; exiting?: boolean; value: unknown }> = [{ depth: 0, value }];
  const ancestors = new WeakSet<object>();
  let maximumDepth = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!Array.isArray(current.value) && !isRecord(current.value)) continue;
    if (current.exiting) {
      ancestors.delete(current.value);
      continue;
    }
    if (ancestors.has(current.value)) return Number.POSITIVE_INFINITY;
    ancestors.add(current.value);
    const depth = current.depth + 1;
    maximumDepth = Math.max(maximumDepth, depth);
    stack.push({ depth: current.depth, exiting: true, value: current.value });
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value);
    for (const child of children) stack.push({ depth, value: child });
  }
  return maximumDepth;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
