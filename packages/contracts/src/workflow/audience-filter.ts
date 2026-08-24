import { Type, type Static } from "@sinclair/typebox";

export const WORKFLOW_AUDIENCE_FILTER_OUTLET_MATCHED = "matched";
export const WORKFLOW_AUDIENCE_FILTER_OUTLET_UNMATCHED = "unmatched";
export const WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH = 128;
export const WORKFLOW_AUDIENCE_GROUP_LIST_MAX_COUNT = 200;

export const WorkflowAudienceGroupSnapshotSchema = Type.Object({
  id: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  name: Type.String({ maxLength: WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH, minLength: 1 }),
}, { additionalProperties: false });

export const WorkflowAudienceGroupListResponseSchema = Type.Object({
  groups: Type.Array(WorkflowAudienceGroupSnapshotSchema, {
    maxItems: WORKFLOW_AUDIENCE_GROUP_LIST_MAX_COUNT,
  }),
}, { additionalProperties: false });

export const WorkflowAudienceFilterCommandSchema = Type.Object({
  groupId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
}, { additionalProperties: false });

export const WorkflowAudienceFilterResultSchema = Type.Object({
  exist: Type.Boolean(),
}, { additionalProperties: false });

export type WorkflowAudienceGroupSnapshot = Static<typeof WorkflowAudienceGroupSnapshotSchema>;
export type WorkflowAudienceGroupListResponse = Static<typeof WorkflowAudienceGroupListResponseSchema>;
export type WorkflowAudienceFilterCommand = Static<typeof WorkflowAudienceFilterCommandSchema>;
export type WorkflowAudienceFilterResult = Static<typeof WorkflowAudienceFilterResultSchema>;
