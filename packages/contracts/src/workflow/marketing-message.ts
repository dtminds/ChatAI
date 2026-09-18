import { Type, type Static } from "@sinclair/typebox";

export const WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH = 128;
export const WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE = 20;
export const WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE_MAX = 50;
export const WORKFLOW_MARKETING_MESSAGE_WAIT_MIN_BY_UNIT = {
  hour: 1,
  minute: 30,
} as const;
export const WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT = {
  hour: 48,
  minute: 2_880,
} as const;

export const WorkflowMarketingPlanChannelSchema = Type.Union([
  Type.Literal(1),
  Type.Literal(3),
]);

export const WorkflowMarketingPlanStatusSchema = Type.Union([
  Type.Literal(0),
  Type.Literal(1),
  Type.Literal(2),
  Type.Literal(3),
]);

export const WorkflowMarketingPlanSnapshotSchema = Type.Object({
  planId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  planName: Type.String({
    maxLength: WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH,
    minLength: 1,
    pattern: ".*\\S.*",
  }),
}, { additionalProperties: false });

export const WorkflowMarketingPlanListItemSchema = Type.Object({
  name: Type.String({
    maxLength: WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH,
    minLength: 1,
    pattern: ".*\\S.*",
  }),
  planId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  sendChannels: Type.Array(WorkflowMarketingPlanChannelSchema, {
    maxItems: 2,
    minItems: 1,
    uniqueItems: true,
  }),
  status: WorkflowMarketingPlanStatusSchema,
}, { additionalProperties: false });

export const WorkflowMarketingPlanListQuerySchema = Type.Object({
  page: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
  pageSize: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
  planName: Type.Optional(Type.String({ maxLength: WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH })),
}, { additionalProperties: false });

export const WorkflowMarketingPlanListResponseSchema = Type.Object({
  pagination: Type.Object({
    hasNext: Type.Boolean(),
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({
      maximum: WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE_MAX,
      minimum: 1,
    }),
    total: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
  plans: Type.Array(WorkflowMarketingPlanListItemSchema, {
    maxItems: WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE_MAX,
  }),
}, { additionalProperties: false });

export const WorkflowMarketingMessageWaitSchema = Type.Union([
  Type.Object({ mode: Type.Literal("none") }, { additionalProperties: false }),
  Type.Object({
    mode: Type.Literal("fixed"),
    duration: Type.Integer({
      maximum: WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT.minute,
      minimum: WORKFLOW_MARKETING_MESSAGE_WAIT_MIN_BY_UNIT.minute,
    }),
    unit: Type.Literal("minute"),
  }, { additionalProperties: false }),
  Type.Object({
    mode: Type.Literal("fixed"),
    duration: Type.Integer({
      maximum: WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT.hour,
      minimum: WORKFLOW_MARKETING_MESSAGE_WAIT_MIN_BY_UNIT.hour,
    }),
    unit: Type.Literal("hour"),
  }, { additionalProperties: false }),
]);

export const WorkflowMarketingMessageDraftConfigSchema = Type.Object({
  plan: Type.Optional(WorkflowMarketingPlanSnapshotSchema),
  wait: WorkflowMarketingMessageWaitSchema,
}, { additionalProperties: false });

export const WorkflowMarketingMessageExecutionConfigSchema = Type.Object({
  plan: WorkflowMarketingPlanSnapshotSchema,
  wait: WorkflowMarketingMessageWaitSchema,
}, { additionalProperties: false });

export type WorkflowMarketingPlanChannel = Static<typeof WorkflowMarketingPlanChannelSchema>;
export type WorkflowMarketingPlanStatus = Static<typeof WorkflowMarketingPlanStatusSchema>;
export type WorkflowMarketingPlanSnapshot = Static<typeof WorkflowMarketingPlanSnapshotSchema>;
export type WorkflowMarketingPlanListItem = Static<typeof WorkflowMarketingPlanListItemSchema>;
export type WorkflowMarketingPlanListQuery = Static<typeof WorkflowMarketingPlanListQuerySchema>;
export type WorkflowMarketingPlanListResponse = Static<typeof WorkflowMarketingPlanListResponseSchema>;
export type WorkflowMarketingMessageWait = Static<typeof WorkflowMarketingMessageWaitSchema>;
export type WorkflowMarketingMessageDraftConfig = Static<typeof WorkflowMarketingMessageDraftConfigSchema>;
export type WorkflowMarketingMessageExecutionConfig = Static<typeof WorkflowMarketingMessageExecutionConfigSchema>;
