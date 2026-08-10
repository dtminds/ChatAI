import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { WorkflowSubjectTypeSchema } from "./policy.js";

export const WORKFLOW_ENTRY_EVENT_SCHEMA_VERSION = 1;
export const WORKFLOW_ENTRY_EVENT_MAX_BYTES = 64 * 1024;
export const WORKFLOW_ENTRY_PAYLOAD_MAX_BYTES = 32 * 1024;
export const WORKFLOW_ENTRY_JSON_MAX_DEPTH = 16;

export const WorkflowJsonValueSchema = Type.Recursive(Self => Type.Union([
  Type.Null(),
  Type.Boolean(),
  Type.Number(),
  Type.String(),
  Type.Array(Self),
  Type.Record(Type.String(), Self),
]));

export const WorkflowJsonObjectSchema = Type.Record(Type.String(), WorkflowJsonValueSchema);

export const WorkflowEntryEventNameSchema = Type.String({
  maxLength: 128,
  minLength: 1,
  pattern: "^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$",
});

export const WorkflowEntryEventSchema = Type.Object({
  eventId: Type.String({ maxLength: 128, minLength: 1 }),
  eventType: WorkflowEntryEventNameSchema,
  occurredAt: Type.String({
    pattern: "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{3}Z$",
  }),
  payload: WorkflowJsonObjectSchema,
  payloadVersion: Type.Integer({ maximum: 65_535, minimum: 1 }),
  schemaVersion: Type.Literal(WORKFLOW_ENTRY_EVENT_SCHEMA_VERSION),
  source: Type.String({ maxLength: 64, minLength: 1 }),
  subjectId: Type.String({ maxLength: 256, minLength: 1 }),
  subjectType: WorkflowSubjectTypeSchema,
  uid: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
}, { additionalProperties: false });

export type WorkflowJsonValue = Static<typeof WorkflowJsonValueSchema>;
export type WorkflowJsonObject = Static<typeof WorkflowJsonObjectSchema>;
export type WorkflowEntryEvent = Static<typeof WorkflowEntryEventSchema>;

export function createWorkflowEntryPartitionKey(
  event: Pick<WorkflowEntryEvent, "subjectId" | "subjectType" | "uid">,
) {
  return `${event.uid}:${event.subjectType}:${event.subjectId}`;
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
  if (!Value.Check(WorkflowEntryEventSchema, value)
    || !isUtcRfc3339Milliseconds(value.occurredAt)) {
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
  return { event: structuredClone(value) as WorkflowEntryEvent, kind: "accepted" };
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

function isUtcRfc3339Milliseconds(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
