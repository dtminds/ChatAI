import { Type, type Static } from "@sinclair/typebox";

export const WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH = 128;
export const WORKFLOW_AUDIENCE_GROUP_MAX_COUNT = 3;
export const WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE = 20;
export const WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE_MAX = 50;
export const WORKFLOW_AUDIENCE_GROUP_CALCULATE_TIME_MAX_LENGTH = 64;
export const WORKFLOW_AUDIENCE_GROUP_CONDITION_MAX_COUNT = 20;
export const WORKFLOW_AUDIENCE_GROUP_CONDITIONS_MAX_LENGTH = 256;
export const WORKFLOW_AUDIENCE_GROUP_CREATE_TYPE_RULE = 1;
export const WORKFLOW_AUDIENCE_GROUP_CREATE_TYPE_IMPORT = 2;
export const WORKFLOW_AUDIENCE_GROUP_USER_TYPE_WECOM = 1;

export const WorkflowAudienceGroupSnapshotSchema = Type.Object({
  id: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  name: Type.String({ maxLength: WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH, minLength: 1 }),
}, { additionalProperties: false });

export const WorkflowAudienceGroupCreateTypeSchema = Type.Union([
  Type.Literal(WORKFLOW_AUDIENCE_GROUP_CREATE_TYPE_RULE),
  Type.Literal(WORKFLOW_AUDIENCE_GROUP_CREATE_TYPE_IMPORT),
]);

export const WorkflowAudienceGroupListItemSchema = Type.Object({
  conditions: Type.Optional(Type.Array(
    Type.String({
      maxLength: WORKFLOW_AUDIENCE_GROUP_CONDITIONS_MAX_LENGTH,
      minLength: 1,
    }),
    {
      maxItems: WORKFLOW_AUDIENCE_GROUP_CONDITION_MAX_COUNT,
      minItems: 1,
    },
  )),
  createType: Type.Optional(WorkflowAudienceGroupCreateTypeSchema),
  groupNum: Type.Optional(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 })),
  id: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  name: Type.String({ maxLength: WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH, minLength: 1 }),
  peopleCalculateTime: Type.Optional(Type.String({
    maxLength: WORKFLOW_AUDIENCE_GROUP_CALCULATE_TIME_MAX_LENGTH,
    minLength: 1,
  })),
}, { additionalProperties: false });

export const WorkflowAudienceGroupListQuerySchema = Type.Object({
  name: Type.Optional(Type.String({ maxLength: WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH })),
  page: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
  pageSize: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
}, { additionalProperties: false });

export const WorkflowAudienceGroupListResponseSchema = Type.Object({
  groups: Type.Array(WorkflowAudienceGroupListItemSchema, {
    maxItems: WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE_MAX,
  }),
  pagination: Type.Object({
    hasNext: Type.Boolean(),
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({
      maximum: WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE_MAX,
      minimum: 1,
    }),
    total: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export const WorkflowAudienceFilterCommandSchema = Type.Object({
  groupIds: Type.Array(
    Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    {
      maxItems: WORKFLOW_AUDIENCE_GROUP_MAX_COUNT,
      minItems: 1,
      uniqueItems: true,
    },
  ),
}, { additionalProperties: false });

export const WorkflowAudienceFilterResultSchema = Type.Object({
  exist: Type.Boolean(),
  groupIds: Type.Array(
    Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    {
      maxItems: WORKFLOW_AUDIENCE_GROUP_MAX_COUNT,
      uniqueItems: true,
    },
  ),
}, { additionalProperties: false });

export type WorkflowAudienceGroupSnapshot = Static<typeof WorkflowAudienceGroupSnapshotSchema>;
export type WorkflowAudienceGroupCreateType = Static<typeof WorkflowAudienceGroupCreateTypeSchema>;
export type WorkflowAudienceGroupListItem = Static<typeof WorkflowAudienceGroupListItemSchema>;
export type WorkflowAudienceGroupListQuery = Static<typeof WorkflowAudienceGroupListQuerySchema>;
export type WorkflowAudienceGroupListResponse = Static<typeof WorkflowAudienceGroupListResponseSchema>;
export type WorkflowAudienceFilterCommand = Static<typeof WorkflowAudienceFilterCommandSchema>;
export type WorkflowAudienceFilterResult = Static<typeof WorkflowAudienceFilterResultSchema>;
