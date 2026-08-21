import {
  getWorkflowJsonDepth,
  getWorkflowJsonEncodedByteLength,
  WORKFLOW_ENTRY_JSON_MAX_DEPTH,
  WorkflowContactFriendAddedPayloadSchema,
  WorkflowContactTagAddedPayloadSchema,
  WorkflowEntryEventNameSchema,
  WorkflowMessageReceivedPayloadSchema,
  type WorkflowEntryEvent,
  type WorkflowJsonObject,
  WorkflowJsonObjectSchema,
  type WorkflowSubjectType,
  WorkflowSubjectTypeSchema,
} from "@chatai/contracts";
import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const WORKFLOW_TRIGGER_PROJECTION_MAX_BYTES = 32 * 1024;

export const WorkflowEventSubjectCandidatesSchema = Type.Object({
  chatai_contact: Type.Optional(Type.Object({
    seatId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    subjectId: Type.String({ maxLength: 128, minLength: 1 }),
  }, { additionalProperties: false })),
  wecom_contact: Type.Optional(Type.Object({
    subjectId: Type.String({ maxLength: 128, minLength: 1 }),
  }, { additionalProperties: false })),
}, { additionalProperties: false });

export const WorkflowTriggerProjectionSchema = Type.Object({
  eventType: WorkflowEntryEventNameSchema,
  match: WorkflowJsonObjectSchema,
  subjects: WorkflowEventSubjectCandidatesSchema,
  variables: WorkflowJsonObjectSchema,
}, { additionalProperties: false });

export type WorkflowEventSubjectCandidates = Static<typeof WorkflowEventSubjectCandidatesSchema>;
export type WorkflowTriggerProjection = Static<typeof WorkflowTriggerProjectionSchema>;

export type WorkflowEventCatalogDefinition<TPayloadSchema extends TSchema = TSchema> = {
  eventType: string;
  payloadSchema: TPayloadSchema;
  payloadVersion: number;
  project(event: Omit<WorkflowEntryEvent, "payload"> & {
    payload: Static<TPayloadSchema>;
  }): {
    match: WorkflowJsonObject;
    subjects: WorkflowEventSubjectCandidates;
    variables: WorkflowJsonObject;
  };
  subjectTypes: readonly WorkflowSubjectType[];
};

export type WorkflowEventCatalogErrorCode =
  | "payload_invalid"
  | "projection_invalid"
  | "unknown_event_type"
  | "unsupported_payload_version";

export type WorkflowEventCatalogResult =
  | { kind: "accepted"; projection: WorkflowTriggerProjection }
  | { code: WorkflowEventCatalogErrorCode; kind: "rejected" };

export type WorkflowEventCatalog = {
  project(event: WorkflowEntryEvent): WorkflowEventCatalogResult;
  supports(eventType: string, subjectType: WorkflowSubjectType): boolean;
};

export const EMPTY_WORKFLOW_EVENT_CATALOG = createWorkflowEventCatalog([]);

export const WORKFLOW_EVENT_CATALOG = createWorkflowEventCatalog([
  defineWorkflowEventCatalogDefinition({
    eventType: "contact.friend_added",
    payloadSchema: WorkflowContactFriendAddedPayloadSchema,
    payloadVersion: 1,
    project: event => ({
      match: {
        ...(event.payload.sourceId === undefined ? {} : { sourceId: event.payload.sourceId }),
        workUserId: event.payload.workUserId,
      },
      subjects: createContactSubjectCandidates(event.payload),
      variables: structuredClone(event.payload) as WorkflowJsonObject,
    }),
    subjectTypes: ["chatai_contact", "wecom_contact"],
  }),
  defineWorkflowEventCatalogDefinition({
    eventType: "contact.tag_added",
    payloadSchema: WorkflowContactTagAddedPayloadSchema,
    payloadVersion: 1,
    project: event => ({
      match: {
        tagId: event.payload.tagId,
        workUserId: event.payload.workUserId,
      },
      subjects: createContactSubjectCandidates(event.payload),
      variables: structuredClone(event.payload) as WorkflowJsonObject,
    }),
    subjectTypes: ["chatai_contact", "wecom_contact"],
  }),
  defineWorkflowEventCatalogDefinition({
    eventType: "message.received",
    payloadSchema: WorkflowMessageReceivedPayloadSchema,
    payloadVersion: 1,
    project: event => ({
      match: {
        seatId: event.payload.seatId,
        ...(event.payload.text === undefined ? {} : { text: event.payload.text }),
      },
      subjects: {
        chatai_contact: {
          seatId: event.payload.seatId,
          subjectId: event.payload.thirdExternalUserId,
        },
      },
      variables: structuredClone(event.payload) as WorkflowJsonObject,
    }),
    subjectTypes: ["chatai_contact"],
  }),
]);

export function createWorkflowEventCatalog(
  definitions: readonly WorkflowEventCatalogDefinition[],
): WorkflowEventCatalog {
  const definitionsByType = new Map<string, Map<number, WorkflowEventCatalogDefinition>>();
  for (const definition of definitions) {
    assertDefinition(definition);
    const byVersion = definitionsByType.get(definition.eventType) ?? new Map();
    if (byVersion.has(definition.payloadVersion)) {
      throw new Error(
        `Duplicate Workflow Event Catalog definition: ${definition.eventType}@${definition.payloadVersion}`,
      );
    }
    byVersion.set(definition.payloadVersion, definition);
    definitionsByType.set(definition.eventType, byVersion);
  }

  return {
    project(event) {
      const byVersion = definitionsByType.get(event.eventType);
      if (!byVersion) return { code: "unknown_event_type", kind: "rejected" };
      const definition = byVersion.get(event.payloadVersion);
      if (!definition) return { code: "unsupported_payload_version", kind: "rejected" };
      if (!Value.Check(definition.payloadSchema, event.payload)) {
        return { code: "payload_invalid", kind: "rejected" };
      }
      try {
        const projected = definition.project(structuredClone(event) as Parameters<
          WorkflowEventCatalogDefinition["project"]
        >[0]);
        const projection = {
          eventType: event.eventType,
          match: structuredClone(projected.match),
          subjects: structuredClone(projected.subjects),
          variables: structuredClone(projected.variables),
        };
        const byteLength = getWorkflowJsonEncodedByteLength(projection);
        if (byteLength === null || byteLength > WORKFLOW_TRIGGER_PROJECTION_MAX_BYTES) {
          return { code: "projection_invalid", kind: "rejected" };
        }
        if (!Value.Check(WorkflowTriggerProjectionSchema, projection)
          || Object.keys(projection.subjects).some(subjectType =>
            !definition.subjectTypes.includes(subjectType as WorkflowSubjectType))
          || getWorkflowJsonDepth(projection) > WORKFLOW_ENTRY_JSON_MAX_DEPTH) {
          return { code: "projection_invalid", kind: "rejected" };
        }
        return { kind: "accepted", projection };
      } catch {
        return { code: "projection_invalid", kind: "rejected" };
      }
    },
    supports(eventType, subjectType) {
      const definitions = definitionsByType.get(eventType);
      return definitions !== undefined
        && [...definitions.values()].some(definition =>
          definition.subjectTypes.includes(subjectType));
    },
  };
}

function createContactSubjectCandidates(payload: {
  externalUserId: number;
  seatId?: number;
  thirdExternalUserId?: string;
}) {
  return {
    ...(payload.seatId !== undefined && payload.thirdExternalUserId !== undefined
      ? {
          chatai_contact: {
            seatId: payload.seatId,
            subjectId: payload.thirdExternalUserId,
          },
        }
      : {}),
    wecom_contact: { subjectId: String(payload.externalUserId) },
  } satisfies WorkflowEventSubjectCandidates;
}

function defineWorkflowEventCatalogDefinition<TPayloadSchema extends TSchema>(
  definition: WorkflowEventCatalogDefinition<TPayloadSchema>,
) {
  return definition;
}

function assertDefinition(definition: WorkflowEventCatalogDefinition) {
  if (!Value.Check(WorkflowEntryEventNameSchema, definition.eventType)) {
    throw new Error(`Invalid Workflow Event Catalog event type: ${definition.eventType}`);
  }
  if (!Number.isInteger(definition.payloadVersion)
    || definition.payloadVersion < 1
    || definition.payloadVersion > 65_535) {
    throw new Error(`Invalid Workflow Event Catalog payload version: ${definition.payloadVersion}`);
  }
  if (definition.subjectTypes.length === 0
    || new Set(definition.subjectTypes).size !== definition.subjectTypes.length
    || !definition.subjectTypes.every(subjectType =>
      Value.Check(WorkflowSubjectTypeSchema, subjectType))) {
    throw new Error("Workflow Event Catalog subject types must be unique and non-empty");
  }
  if (!isClosedObjectSchema(definition.payloadSchema)) {
    throw new Error("Workflow Event Catalog payload schemas must be closed objects");
  }
}

function isClosedObjectSchema(schema: TSchema): boolean {
  if (schema.type === "object") return schema.additionalProperties === false;
  const variants = "anyOf" in schema && Array.isArray(schema.anyOf) ? schema.anyOf : null;
  return variants !== null && variants.length > 0
    && variants.every(variant => isClosedObjectSchema(variant as TSchema));
}
