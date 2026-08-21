import { Type, type Static } from "@sinclair/typebox";
import { WorkflowPushAccountStrategySchema } from "./trigger.js";

export const WorkflowChatAiAccountSelectionSchema = Type.Object({
  seatIds: Type.Array(
    Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    { maxItems: 100, minItems: 1, uniqueItems: true },
  ),
  strategy: WorkflowPushAccountStrategySchema,
}, { additionalProperties: false });

export type WorkflowChatAiAccountSelection = Static<
  typeof WorkflowChatAiAccountSelectionSchema
>;
