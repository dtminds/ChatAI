import { Type, type Static } from "@sinclair/typebox";
import { WORKFLOW_ORDER_NUMBER_MAX_LENGTH } from "./node-contract.js";

export const WorkflowPointsTransferResultValueSchema = Type.Boolean();

export const WorkflowPointsTransferCommandSchema = Type.Object({
  orderNumber: Type.String({ maxLength: WORKFLOW_ORDER_NUMBER_MAX_LENGTH, minLength: 1 }),
  source: Type.Literal("workflow"),
}, { additionalProperties: false });

export const WorkflowPointsTransferResultSchema = Type.Object({
  result: WorkflowPointsTransferResultValueSchema,
}, { additionalProperties: false });

export type WorkflowPointsTransferResultValue = Static<typeof WorkflowPointsTransferResultValueSchema>;
export type WorkflowPointsTransferCommand = Static<typeof WorkflowPointsTransferCommandSchema>;
export type WorkflowPointsTransferResult = Static<typeof WorkflowPointsTransferResultSchema>;
