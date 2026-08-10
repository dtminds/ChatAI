import {
  getWorkflowJsonDepth,
  getWorkflowJsonEncodedByteLength,
  WORKFLOW_ENTRY_JSON_MAX_DEPTH,
  WorkflowEntryEventNameSchema,
  type WorkflowEntryEvent,
  type WorkflowJsonObject,
  WorkflowJsonObjectSchema,
  type WorkflowSubjectType,
  WorkflowSubjectTypeSchema,
} from "@chatai/contracts";
import { Type, type Static, type TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const WORKFLOW_TRIGGER_PROJECTION_MAX_BYTES = 32 * 1024;

export const WorkflowTriggerProjectionSchema = Type.Object({
  eventType: WorkflowEntryEventNameSchema,
  match: WorkflowJsonObjectSchema,
  variables: WorkflowJsonObjectSchema,
}, { additionalProperties: false });

export type WorkflowTriggerProjection = Static<typeof WorkflowTriggerProjectionSchema>;

export type WorkflowEventCatalogDefinition<TPayloadSchema extends TObject = TObject> = {
  eventType: string;
  payloadSchema: TPayloadSchema;
  payloadVersion: number;
  project(event: Omit<WorkflowEntryEvent, "payload"> & {
    payload: Static<TPayloadSchema>;
  }): {
    match: WorkflowJsonObject;
    variables: WorkflowJsonObject;
  };
  subjectTypes: readonly WorkflowSubjectType[];
};

export type WorkflowEventCatalogErrorCode =
  | "payload_invalid"
  | "projection_invalid"
  | "subject_type_unsupported"
  | "unknown_event_type"
  | "unsupported_payload_version";

export type WorkflowEventCatalogResult =
  | { kind: "accepted"; projection: WorkflowTriggerProjection }
  | { code: WorkflowEventCatalogErrorCode; kind: "rejected" };

export type WorkflowEventCatalog = {
  project(event: WorkflowEntryEvent): WorkflowEventCatalogResult;
};

export const EMPTY_WORKFLOW_EVENT_CATALOG = createWorkflowEventCatalog([]);

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
      if (!definition.subjectTypes.includes(event.subjectType)) {
        return { code: "subject_type_unsupported", kind: "rejected" };
      }
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
          variables: structuredClone(projected.variables),
        };
        const byteLength = getWorkflowJsonEncodedByteLength(projection);
        if (byteLength === null || byteLength > WORKFLOW_TRIGGER_PROJECTION_MAX_BYTES) {
          return { code: "projection_invalid", kind: "rejected" };
        }
        if (!Value.Check(WorkflowTriggerProjectionSchema, projection)
          || getWorkflowJsonDepth(projection) > WORKFLOW_ENTRY_JSON_MAX_DEPTH) {
          return { code: "projection_invalid", kind: "rejected" };
        }
        return { kind: "accepted", projection };
      } catch {
        return { code: "projection_invalid", kind: "rejected" };
      }
    },
  };
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
  if (definition.payloadSchema.type !== "object"
    || definition.payloadSchema.additionalProperties !== false) {
    throw new Error("Workflow Event Catalog payload schemas must be closed objects");
  }
}
