import { Type, type Static } from "@sinclair/typebox";

export const WORKFLOW_MESSAGES_SCHEMA_REF = "workflow.messages.v1";

export const WorkflowMessagePartSchema = Type.Union([
  Type.Object({
    text: Type.String({ maxLength: 10_000 }),
    type: Type.Literal("text"),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("image"),
    url: Type.String({ maxLength: 2_048, minLength: 1 }),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("video"),
    url: Type.String({ maxLength: 2_048, minLength: 1 }),
  }, { additionalProperties: false }),
  Type.Object({
    label: Type.String({ maxLength: 128, minLength: 1 }),
    type: Type.Literal("unsupported"),
  }, { additionalProperties: false }),
]);

export const WorkflowMessageSchema = Type.Object({
  id: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  parts: Type.Array(WorkflowMessagePartSchema, { maxItems: 20, minItems: 1 }),
  role: Type.Union([
    Type.Literal("customer"),
    Type.Literal("agent"),
    Type.Literal("bot"),
    Type.Literal("unknown"),
  ]),
}, { additionalProperties: false });

export const WorkflowMessagesV1Schema = Type.Array(WorkflowMessageSchema, { maxItems: 50 });

export type WorkflowMessagePart = Static<typeof WorkflowMessagePartSchema>;
export type WorkflowMessage = Static<typeof WorkflowMessageSchema>;
export type WorkflowMessagesV1 = Static<typeof WorkflowMessagesV1Schema>;
