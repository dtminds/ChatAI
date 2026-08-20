import { Type, type Static } from "@sinclair/typebox";

export const WORKFLOW_HANDOFF_MESSAGE_MAX_LENGTH = 100;

export const WorkflowHandoffCommandSchema = Type.Object({
  customerMessage: Type.String({ maxLength: WORKFLOW_HANDOFF_MESSAGE_MAX_LENGTH }),
  operatorMessage: Type.String({
    maxLength: WORKFLOW_HANDOFF_MESSAGE_MAX_LENGTH,
    minLength: 1,
  }),
  recipient: Type.Object({
    thirdExternalUserId: Type.String({ maxLength: 128, minLength: 1 }),
  }, { additionalProperties: false }),
  seatId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  source: Type.Literal("workflow"),
}, { additionalProperties: false });

export const WorkflowHandoffResultSchema = Type.Object({}, { additionalProperties: false });

export type WorkflowHandoffCommand = Static<typeof WorkflowHandoffCommandSchema>;
export type WorkflowHandoffResult = Static<typeof WorkflowHandoffResultSchema>;
