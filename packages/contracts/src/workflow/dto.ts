import { Type, type Static } from "@sinclair/typebox";
import {
  WorkflowSubjectTypeSchema,
  WorkflowTypeSchema,
} from "./policy.js";

export const WorkflowIdSchema = Type.String({ pattern: "^[1-9][0-9]*$" });

export const WorkflowDirectEntryEndpointKeySchema = Type.String({
  maxLength: 512,
  minLength: 1,
  pattern: "^[A-Za-z0-9._~-]+$",
});

export const WorkflowDirectEntryEndpointResponseSchema = Type.Object({
  endpointKey: WorkflowDirectEntryEndpointKeySchema,
}, { additionalProperties: false });

export const WorkflowNodeKindSchema = Type.Union([
  Type.Literal("start"),
  Type.Literal("wait"),
  Type.Literal("wait-event"),
  Type.Literal("branch"),
  Type.Literal("ratio-split"),
  Type.Literal("message"),
  Type.Literal("message-query"),
  Type.Literal("tag"),
  Type.Literal("coupon"),
  Type.Literal("handoff"),
  Type.Literal("agent"),
  Type.Literal("llm"),
  Type.Literal("order-bind"),
  Type.Literal("order-query"),
  Type.Literal("order-conversion"),
  Type.Literal("tag-query"),
  Type.Literal("customer-update"),
  Type.Literal("ai-collect"),
  Type.Literal("audience-filter"),
  Type.Literal("ai-intent"),
  Type.Literal("end"),
]);

export const WorkflowRuntimeStatusSchema = Type.Union([
  Type.Literal("inactive"),
  Type.Literal("active"),
  Type.Literal("paused"),
  Type.Literal("stopped"),
]);

export const WORKFLOW_NODE_TITLE_MAX_LENGTH = 10;

export const WorkflowNodeTitleSchema = Type.String({
  maxLength: WORKFLOW_NODE_TITLE_MAX_LENGTH,
});

export const WorkflowDraftNodeDataSchema = Type.Object({
  kind: WorkflowNodeKindSchema,
  label: Type.String(),
  metric: Type.String(),
  schemaVersion: Type.Integer({ minimum: 1 }),
  status: Type.Union([
    Type.Literal("ready"),
    Type.Literal("running"),
    Type.Literal("warning"),
  ]),
  title: WorkflowNodeTitleSchema,
}, { additionalProperties: true });

export const WorkflowDraftNodeSchema = Type.Object({
  data: WorkflowDraftNodeDataSchema,
  id: Type.String({ minLength: 1, maxLength: 128 }),
  position: Type.Object({
    x: Type.Number(),
    y: Type.Number(),
  }),
  selected: Type.Optional(Type.Boolean()),
  type: Type.Optional(Type.String()),
}, { additionalProperties: true });

export const WorkflowDraftEdgeSchema = Type.Object({
  data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  id: Type.String({ minLength: 1, maxLength: 256 }),
  selected: Type.Optional(Type.Boolean()),
  source: Type.String({ minLength: 1, maxLength: 128 }),
  sourceHandle: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  target: Type.String({ minLength: 1, maxLength: 128 }),
  targetHandle: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  type: Type.Optional(Type.String()),
}, { additionalProperties: true });

export const WorkflowDraftSchema = Type.Object({
  edges: Type.Array(WorkflowDraftEdgeSchema, { maxItems: 500 }),
  nodes: Type.Array(WorkflowDraftNodeSchema, { maxItems: 200 }),
  viewport: Type.Object({
    x: Type.Number(),
    y: Type.Number(),
    zoom: Type.Number({ exclusiveMinimum: 0 }),
  }),
});

export const WorkflowPermissionsSchema = Type.Object({
  canDelete: Type.Boolean(),
  canEdit: Type.Boolean(),
  canOperate: Type.Boolean(),
  canPublish: Type.Boolean(),
  canView: Type.Boolean(),
});

export const WorkflowStatusReasonSchema = Type.Union([
  Type.Literal("entitlement_revoked"),
  Type.Null(),
]);

export const WorkflowCapabilitySummarySchema = Type.Object({
  runtimeSupportedNodeKinds: Type.Array(WorkflowNodeKindSchema, { uniqueItems: true }),
});

export const WorkflowPublishReviewStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("approved"),
  Type.Literal("rejected"),
  Type.Literal("withdrawn"),
]);

export const WorkflowPublishReviewNodeSummarySchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 128 }),
  kind: WorkflowNodeKindSchema,
  title: WorkflowNodeTitleSchema,
});

export const WorkflowPublishReviewChangeSummarySchema = Type.Object({
  addedNodes: Type.Array(WorkflowPublishReviewNodeSummarySchema),
  changedNodes: Type.Array(WorkflowPublishReviewNodeSummarySchema),
  firstPublication: Type.Boolean(),
  pathChanged: Type.Boolean(),
  removedNodes: Type.Array(WorkflowPublishReviewNodeSummarySchema),
  triggerChanged: Type.Boolean(),
});

export const WorkflowPublishReviewSchema = Type.Object({
  basePublishedRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  changeSummary: WorkflowPublishReviewChangeSummarySchema,
  checkedAt: Type.String(),
  id: WorkflowIdSchema,
  publishedAt: Type.Union([Type.String(), Type.Null()]),
  publishedBySubUserId: Type.Union([WorkflowIdSchema, Type.Null()]),
  resultingRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  reviewComment: Type.Union([Type.String(), Type.Null()]),
  reviewedAt: Type.Union([Type.String(), Type.Null()]),
  reviewedBySubUserId: Type.Union([WorkflowIdSchema, Type.Null()]),
  sourceDraftVersion: Type.Integer({ minimum: 1 }),
  status: WorkflowPublishReviewStatusSchema,
  submittedAt: Type.String(),
  submittedBySubUserId: WorkflowIdSchema,
  workflowId: WorkflowIdSchema,
});

export const WorkflowDefinitionSchema = Type.Object({
  capabilitySummary: WorkflowCapabilitySummarySchema,
  createdAt: Type.String(),
  currentReview: Type.Union([WorkflowPublishReviewSchema, Type.Null()]),
  description: Type.String({ maxLength: 1000 }),
  draft: WorkflowDraftSchema,
  draftVersion: Type.Integer({ minimum: 1 }),
  hasUnpublishedChanges: Type.Boolean(),
  id: WorkflowIdSchema,
  name: Type.String({ minLength: 1, maxLength: 100 }),
  permissions: WorkflowPermissionsSchema,
  publishedRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  runtimeStatus: WorkflowRuntimeStatusSchema,
  statusReason: WorkflowStatusReasonSchema,
  updatedAt: Type.String(),
  workflowType: WorkflowTypeSchema,
});

export const WorkflowDefinitionSummarySchema = Type.Omit(WorkflowDefinitionSchema, ["draft"]);

export const WorkflowDefinitionListStatusSchema = Type.Union([
  Type.Literal("all"),
  Type.Literal("active"),
  Type.Literal("ready"),
  Type.Literal("draft"),
  Type.Literal("stopped"),
]);

export const WorkflowDefinitionListItemSchema = Type.Object({
  canOperate: Type.Boolean(),
  description: Type.String({ maxLength: 1000 }),
  hasUnpublishedChanges: Type.Boolean(),
  id: WorkflowIdSchema,
  inProgressRunCount: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  lastRunAt: Type.Union([Type.String(), Type.Null()]),
  managedAccountCount: Type.Integer({ minimum: 0, maximum: 100 }),
  managedAccounts: Type.Array(Type.Object({
    avatarUrl: Type.String(),
    id: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    name: Type.String(),
  }, { additionalProperties: false }), { maxItems: 3 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  publishedRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  runtimeStatus: WorkflowRuntimeStatusSchema,
  successRatePercent: Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]),
  trigger: Type.String(),
  totalRunCount: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  updatedAt: Type.String(),
  workflowType: WorkflowTypeSchema,
}, { additionalProperties: false });

export const WorkflowDefinitionListPageSchema = Type.Object({
  items: Type.Array(WorkflowDefinitionListItemSchema, { maxItems: 50 }),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export const WorkflowRevisionSchema = Type.Object({
  draft: WorkflowDraftSchema,
  id: WorkflowIdSchema,
  publishedAt: Type.String(),
  reviewId: WorkflowIdSchema,
  revision: Type.Integer({ minimum: 1 }),
  subjectType: WorkflowSubjectTypeSchema,
  workflowType: WorkflowTypeSchema,
  workflowId: WorkflowIdSchema,
});

export const WorkflowRevisionPageSchema = Type.Object({
  items: Type.Array(WorkflowRevisionSchema, { maxItems: 50 }),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});

export const WorkflowPublishReviewPageSchema = Type.Object({
  items: Type.Array(WorkflowPublishReviewSchema, { maxItems: 50 }),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});

export const WorkflowCreateRequestSchema = Type.Object({
  clientRequestId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  workflowType: WorkflowTypeSchema,
});

export const WorkflowSaveDraftRequestSchema = Type.Object({
  draft: WorkflowDraftSchema,
  expectedDraftVersion: Type.Integer({ minimum: 1 }),
});

export const WorkflowRenameRequestSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
});

export const WorkflowMetadataUpdateRequestSchema = Type.Object({
  description: Type.String({ maxLength: 1000 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
});

export const WorkflowReviewSubmitRequestSchema = Type.Object({
  expectedDraftVersion: Type.Integer({ minimum: 1 }),
});

export const WORKFLOW_REVIEW_COMMENT_MAX_LENGTH = 200;

export const WorkflowReviewApproveRequestSchema = Type.Object({
  comment: Type.Optional(Type.String({ maxLength: WORKFLOW_REVIEW_COMMENT_MAX_LENGTH })),
});

export const WorkflowReviewRejectRequestSchema = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: WORKFLOW_REVIEW_COMMENT_MAX_LENGTH }),
});

export const WorkflowPublishRequestSchema = Type.Object({
  reviewId: WorkflowIdSchema,
});

export const WorkflowRestoreRequestSchema = Type.Object({
  expectedDraftVersion: Type.Integer({ minimum: 1 }),
});

export const WorkflowPublishResultSchema = Type.Object({
  definition: WorkflowDefinitionSchema,
  revision: WorkflowRevisionSchema,
});

export const WorkflowNodeMetricSchema = Type.Object({
  completed: Type.Integer({ minimum: 0 }),
  current: Type.Integer({ minimum: 0 }),
  entered: Type.Integer({ minimum: 0 }),
  incomplete: Type.Integer({ minimum: 0 }),
  nodeId: Type.String({ minLength: 1, maxLength: 128 }),
  passed: Type.Integer({ minimum: 0 }),
});

export const WorkflowDataOverviewSchema = Type.Object({
  calculatedAt: Type.String(),
  nodes: Type.Array(WorkflowNodeMetricSchema, { maxItems: 200 }),
  publishedRevision: Type.Integer({ minimum: 1 }),
  summary: Type.Object({
    completed: Type.Integer({ minimum: 0 }),
    current: Type.Integer({ minimum: 0 }),
    entered: Type.Integer({ minimum: 0 }),
    incomplete: Type.Integer({ minimum: 0 }),
  }),
});

export const WorkflowCapacityOverviewSchema = Type.Object({
  capacityRejectedCountToday: Type.Integer({ minimum: 0 }),
  status: Type.Union([
    Type.Literal("normal"),
    Type.Literal("warning"),
    Type.Literal("full"),
  ]),
  usagePercent: Type.Integer({ maximum: 100, minimum: 0 }),
});

export const WorkflowTenantOverviewSchema = Type.Object({
  activeWorkflowCount: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  recentFailedRunCount: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  recentSuccessRatePercent: Type.Union([Type.Number({ maximum: 100, minimum: 0 }), Type.Null()]),
  todayRunCount: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  todayRunCountChangePercent: Type.Union([
    Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: -100 }),
    Type.Null(),
  ]),
  totalWorkflowCount: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
}, { additionalProperties: false });

export const WorkflowEntryRecordStatusSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("running"),
  Type.Literal("waiting"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
]);

export const WorkflowEntryRecordCustomerSchema = Type.Object({
  avatar: Type.Union([Type.String(), Type.Null()]),
  name: Type.String(),
});

export const WorkflowEntryRecordSchema = Type.Object({
  createdAt: Type.String(),
  currentNodeId: Type.String({ minLength: 1, maxLength: 128 }),
  customer: WorkflowEntryRecordCustomerSchema,
  nextExecuteAt: Type.Union([Type.String(), Type.Null()]),
  recordId: WorkflowIdSchema,
  revision: Type.Integer({ minimum: 1 }),
  status: WorkflowEntryRecordStatusSchema,
  subjectType: WorkflowSubjectTypeSchema,
  updatedAt: Type.String(),
});

export const WorkflowEntryRecordPageSchema = Type.Object({
  items: Type.Array(WorkflowEntryRecordSchema),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});

export const WorkflowEntryRecordStepNodeKindSchema = Type.Union([
  WorkflowNodeKindSchema,
  Type.Literal("unknown"),
]);

export const WorkflowEntryRecordStepSchema = Type.Object({
  description: Type.Optional(Type.String()),
  nextExecuteAt: Type.Optional(Type.String()),
  occurredAt: Type.String(),
  nodeId: Type.String({ minLength: 1, maxLength: 128 }),
  nodeKind: WorkflowEntryRecordStepNodeKindSchema,
  revision: Type.Integer({ minimum: 1 }),
  status: Type.Union([
    Type.Literal("completed"),
    Type.Literal("failed"),
    Type.Literal("current"),
    Type.Literal("waiting"),
  ]),
  title: WorkflowNodeTitleSchema,
});

export const WorkflowFlowChangedReasonSchema = Type.Union([
  Type.Literal("flow_changed_context_incompatible"),
  Type.Literal("flow_changed_current_node_deleted"),
  Type.Literal("flow_changed_node_kind_changed"),
  Type.Literal("flow_changed_outlet_deleted"),
]);

export const WorkflowEntryRecordDetailSchema = Type.Object({
  createdAt: Type.String(),
  customer: WorkflowEntryRecordCustomerSchema,
  recordId: WorkflowIdSchema,
  revision: Type.Integer({ minimum: 1 }),
  status: WorkflowEntryRecordStatusSchema,
  subjectType: WorkflowSubjectTypeSchema,
  terminalReason: Type.Union([WorkflowFlowChangedReasonSchema, Type.Null()]),
  steps: Type.Array(WorkflowEntryRecordStepSchema),
});

export type WorkflowNodeKind = Static<typeof WorkflowNodeKindSchema>;
export type WorkflowEntryRecordStepNodeKind = Static<typeof WorkflowEntryRecordStepNodeKindSchema>;
export type WorkflowFlowChangedReason = Static<typeof WorkflowFlowChangedReasonSchema>;
export type WorkflowRuntimeStatus = Static<typeof WorkflowRuntimeStatusSchema>;
export type WorkflowStatusReason = Static<typeof WorkflowStatusReasonSchema>;
export type WorkflowCapabilitySummary = Static<typeof WorkflowCapabilitySummarySchema>;
export type WorkflowPublishReviewStatus = Static<typeof WorkflowPublishReviewStatusSchema>;
export type WorkflowPublishReviewNodeSummary = Static<typeof WorkflowPublishReviewNodeSummarySchema>;
export type WorkflowPublishReviewChangeSummary = Static<typeof WorkflowPublishReviewChangeSummarySchema>;
export type WorkflowPublishReview = Static<typeof WorkflowPublishReviewSchema>;
export type WorkflowDraft = Static<typeof WorkflowDraftSchema>;
export type WorkflowDraftNode = Static<typeof WorkflowDraftNodeSchema>;
export type WorkflowDraftEdge = Static<typeof WorkflowDraftEdgeSchema>;
export type WorkflowPermissions = Static<typeof WorkflowPermissionsSchema>;
export type WorkflowDefinition = Static<typeof WorkflowDefinitionSchema>;
export type WorkflowDefinitionSummary = Static<typeof WorkflowDefinitionSummarySchema>;
export type WorkflowDefinitionListStatus = Static<typeof WorkflowDefinitionListStatusSchema>;
export type WorkflowDefinitionListItem = Static<typeof WorkflowDefinitionListItemSchema>;
export type WorkflowDefinitionListPage = Static<typeof WorkflowDefinitionListPageSchema>;
export type WorkflowDirectEntryEndpointResponse = Static<
  typeof WorkflowDirectEntryEndpointResponseSchema
>;
export type WorkflowRevision = Static<typeof WorkflowRevisionSchema>;
export type WorkflowRevisionPage = Static<typeof WorkflowRevisionPageSchema>;
export type WorkflowPublishReviewPage = Static<typeof WorkflowPublishReviewPageSchema>;
export type WorkflowCreateRequest = Static<typeof WorkflowCreateRequestSchema>;
export type WorkflowSaveDraftRequest = Static<typeof WorkflowSaveDraftRequestSchema>;
export type WorkflowRenameRequest = Static<typeof WorkflowRenameRequestSchema>;
export type WorkflowMetadataUpdateRequest = Static<typeof WorkflowMetadataUpdateRequestSchema>;
export type WorkflowReviewSubmitRequest = Static<typeof WorkflowReviewSubmitRequestSchema>;
export type WorkflowReviewApproveRequest = Static<typeof WorkflowReviewApproveRequestSchema>;
export type WorkflowReviewRejectRequest = Static<typeof WorkflowReviewRejectRequestSchema>;
export type WorkflowPublishRequest = Static<typeof WorkflowPublishRequestSchema>;
export type WorkflowRestoreRequest = Static<typeof WorkflowRestoreRequestSchema>;
export type WorkflowPublishResult = Static<typeof WorkflowPublishResultSchema>;
export type WorkflowNodeMetric = Static<typeof WorkflowNodeMetricSchema>;
export type WorkflowDataOverview = Static<typeof WorkflowDataOverviewSchema>;
export type WorkflowCapacityOverview = Static<typeof WorkflowCapacityOverviewSchema>;
export type WorkflowTenantOverview = Static<typeof WorkflowTenantOverviewSchema>;
export type WorkflowEntryRecordStatus = Static<typeof WorkflowEntryRecordStatusSchema>;
export type WorkflowEntryRecord = Static<typeof WorkflowEntryRecordSchema>;
export type WorkflowEntryRecordPage = Static<typeof WorkflowEntryRecordPageSchema>;
export type WorkflowEntryRecordStep = Static<typeof WorkflowEntryRecordStepSchema>;
export type WorkflowEntryRecordDetail = Static<typeof WorkflowEntryRecordDetailSchema>;
