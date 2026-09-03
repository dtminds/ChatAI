import { Type, type Static } from "@sinclair/typebox";
import {
  WORKFLOW_CUSTOMER_UPDATE_MAX_FIELD_COUNT,
  WorkflowCustomerFieldTypeSchema,
} from "./node-contract.js";

export const WorkflowCustomerUpdateCommandSchema = Type.Object({
  source: Type.Literal("workflow"),
  updates: Type.Array(Type.Object({
    fieldId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    fieldType: WorkflowCustomerFieldTypeSchema,
    value: Type.Union([Type.Number(), Type.String()]),
  }, { additionalProperties: false }), {
    maxItems: WORKFLOW_CUSTOMER_UPDATE_MAX_FIELD_COUNT,
    uniqueItems: true,
  }),
}, { additionalProperties: false });

export const WorkflowCustomerUpdateResultSchema = Type.Object({}, { additionalProperties: false });

export type WorkflowCustomerUpdateCommand = Static<typeof WorkflowCustomerUpdateCommandSchema>;
export type WorkflowCustomerUpdateResult = Static<typeof WorkflowCustomerUpdateResultSchema>;
