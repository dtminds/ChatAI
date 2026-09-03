import { Type, type Static } from "@sinclair/typebox";
import {
  WORKFLOW_TAG_QUERY_MAX_COUNT,
} from "./node-contract.js";

export const WorkflowTagQueryCommandSchema = Type.Object({
  tagIds: Type.Array(
    Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    { maxItems: WORKFLOW_TAG_QUERY_MAX_COUNT, minItems: 1, uniqueItems: true },
  ),
}, { additionalProperties: false });

export const WorkflowTagQueryMatchedTagSchema = Type.Object({
  id: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  name: Type.String({ maxLength: 256, minLength: 1 }),
}, { additionalProperties: false });

export const WorkflowTagQueryResultSchema = Type.Object({
  matchedTags: Type.Array(WorkflowTagQueryMatchedTagSchema, {
    maxItems: WORKFLOW_TAG_QUERY_MAX_COUNT,
  }),
}, { additionalProperties: false });

export type WorkflowTagQueryCommand = Static<typeof WorkflowTagQueryCommandSchema>;
export type WorkflowTagQueryMatchedTag = Static<typeof WorkflowTagQueryMatchedTagSchema>;
export type WorkflowTagQueryResult = Static<typeof WorkflowTagQueryResultSchema>;
