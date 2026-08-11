import { Type, type Static } from "@sinclair/typebox";
import { WorkflowJsonObjectSchema } from "./entry-event.js";
import { WorkflowSubjectTypeSchema } from "./policy.js";

const WorkflowCapabilityFixtureExecutionSchema = Type.Object({
  nodeId: Type.String({ maxLength: 128, minLength: 1 }),
  revision: Type.Integer({ minimum: 1 }),
  runId: Type.String({ maxLength: 128, minLength: 1 }),
  sequence: Type.Integer({ minimum: 1 }),
  workflowId: Type.String({ maxLength: 128, minLength: 1 }),
}, { additionalProperties: false });

const WorkflowCapabilityFixtureCommonProperties = {
  capabilityKey: Type.String({ maxLength: 128, minLength: 1 }),
  command: WorkflowJsonObjectSchema,
  contractVersion: Type.Integer({ minimum: 1 }),
  deadlineAt: Type.String({
    pattern: "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{3}Z$",
  }),
  execution: WorkflowCapabilityFixtureExecutionSchema,
  subjectId: Type.String({ maxLength: 256, minLength: 1 }),
  subjectType: WorkflowSubjectTypeSchema,
  uid: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
};

export const WorkflowCapabilityActionCommandFixtureSchema = Type.Object({
  ...WorkflowCapabilityFixtureCommonProperties,
  idempotencyKey: Type.String({ maxLength: 256, minLength: 1 }),
  kind: Type.Literal("action"),
}, { additionalProperties: false });

export const WorkflowCapabilityQueryCommandFixtureSchema = Type.Object({
  ...WorkflowCapabilityFixtureCommonProperties,
  kind: Type.Literal("query"),
}, { additionalProperties: false });

export const WorkflowCapabilityCommandFixtureSchema = Type.Union([
  WorkflowCapabilityActionCommandFixtureSchema,
  WorkflowCapabilityQueryCommandFixtureSchema,
]);

export const WorkflowCapabilityResultFixtureSchema = Type.Object({
  capabilityKey: Type.String({ maxLength: 128, minLength: 1 }),
  contractVersion: Type.Integer({ minimum: 1 }),
  result: WorkflowJsonObjectSchema,
}, { additionalProperties: false });

export const WorkflowCapabilityErrorFixtureSchema = Type.Object({
  capabilityKey: Type.String({ maxLength: 128, minLength: 1 }),
  contractVersion: Type.Integer({ minimum: 1 }),
  error: Type.Object({
    code: Type.String({ maxLength: 128, minLength: 1 }),
    failureKind: Type.Union([
      Type.Literal("retryable"),
      Type.Literal("terminal"),
      Type.Literal("unknown"),
    ]),
    message: Type.String({ maxLength: 512, minLength: 1 }),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export type WorkflowCapabilityActionCommandFixture = Static<
  typeof WorkflowCapabilityActionCommandFixtureSchema
>;
export type WorkflowCapabilityQueryCommandFixture = Static<
  typeof WorkflowCapabilityQueryCommandFixtureSchema
>;
export type WorkflowCapabilityCommandFixture = Static<typeof WorkflowCapabilityCommandFixtureSchema>;
export type WorkflowCapabilityResultFixture = Static<typeof WorkflowCapabilityResultFixtureSchema>;
export type WorkflowCapabilityErrorFixture = Static<typeof WorkflowCapabilityErrorFixtureSchema>;
