import { Type, type Static } from "@sinclair/typebox";
import { WORKFLOW_ORDER_NUMBER_MAX_LENGTH } from "./node-contract.js";

export const WorkflowOrderBindResultValueSchema = Type.Boolean();

export const WorkflowOrderBindCommandSchema = Type.Object({
  orderNumber: Type.String({ maxLength: WORKFLOW_ORDER_NUMBER_MAX_LENGTH, minLength: 1 }),
  source: Type.Literal("workflow"),
}, { additionalProperties: false });

export const WorkflowOrderBindResultSchema = Type.Object({
  result: WorkflowOrderBindResultValueSchema,
}, { additionalProperties: false });

export type WorkflowOrderBindResultValue = Static<typeof WorkflowOrderBindResultValueSchema>;
export type WorkflowOrderBindCommand = Static<typeof WorkflowOrderBindCommandSchema>;
export type WorkflowOrderBindResult = Static<typeof WorkflowOrderBindResultSchema>;
