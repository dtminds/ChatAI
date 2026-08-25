import { Type, type Static } from "@sinclair/typebox";
import { WORKFLOW_ORDER_NUMBER_MAX_LENGTH } from "./node-contract.js";

export const WorkflowOrderConversionResultValueSchema = Type.Boolean();

export const WorkflowOrderConversionCommandSchema = Type.Object({
  orderNumber: Type.String({ maxLength: WORKFLOW_ORDER_NUMBER_MAX_LENGTH, minLength: 1 }),
  source: Type.Literal("workflow"),
}, { additionalProperties: false });

export const WorkflowOrderConversionResultSchema = Type.Object({
  result: WorkflowOrderConversionResultValueSchema,
}, { additionalProperties: false });

export type WorkflowOrderConversionResultValue = Static<typeof WorkflowOrderConversionResultValueSchema>;
export type WorkflowOrderConversionCommand = Static<typeof WorkflowOrderConversionCommandSchema>;
export type WorkflowOrderConversionResult = Static<typeof WorkflowOrderConversionResultSchema>;
