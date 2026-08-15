import { Type, type Static } from "@sinclair/typebox";

const WorkflowMessageQueryTimestampSchema = Type.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{3}Z$",
});

export const WorkflowMessageQueryCommandSchema = Type.Object({
  limit: Type.Integer({ maximum: 50, minimum: 1 }),
  rangeEnd: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  rangeStart: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  seatId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  take: Type.Union([Type.Literal("earliest"), Type.Literal("latest")]),
}, { additionalProperties: false });

export const WorkflowMessageQueryResultSchema = Type.Object({
  messageCount: Type.Integer({ maximum: 50, minimum: 0 }),
  messageIds: Type.Array(
    Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    { maxItems: 50 },
  ),
  rangeEnd: WorkflowMessageQueryTimestampSchema,
  rangeStart: WorkflowMessageQueryTimestampSchema,
  textContent: Type.String(),
}, { additionalProperties: false });

export type WorkflowMessageQueryCommand = Static<typeof WorkflowMessageQueryCommandSchema>;
export type WorkflowMessageQueryResult = Static<typeof WorkflowMessageQueryResultSchema>;
