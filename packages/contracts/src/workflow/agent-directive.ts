import { Type, type Static } from "@sinclair/typebox";

export const WORKFLOW_AGENT_DIRECTIVE_EVENT_TYPE = "agent.directive" as const;
export const WORKFLOW_COLLECT_FIELDS_DIRECTIVE_TYPE = "collect-fields" as const;

const WorkflowPositiveSafeIntegerSchema = Type.Integer({
  maximum: Number.MAX_SAFE_INTEGER,
  minimum: 1,
});

export const WorkflowAgentDirectiveEventPayloadSchema = Type.Object({
  bizId: Type.String({ maxLength: 64, minLength: 1 }),
  bizInfo: Type.Optional(Type.String({ maxLength: 2_048 })),
  externalUserId: Type.Optional(Type.Integer({
    maximum: Number.MAX_SAFE_INTEGER,
    minimum: 0,
  })),
  seatId: WorkflowPositiveSafeIntegerSchema,
  thirdExternalUserId: Type.String({ maxLength: 128, minLength: 1 }),
  totalRound: WorkflowPositiveSafeIntegerSchema,
  type: Type.Literal(WORKFLOW_COLLECT_FIELDS_DIRECTIVE_TYPE),
  workUserId: WorkflowPositiveSafeIntegerSchema,
}, { additionalProperties: false });

export type WorkflowAgentDirectiveEventPayload = Static<
  typeof WorkflowAgentDirectiveEventPayloadSchema
>;
