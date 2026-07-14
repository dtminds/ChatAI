import { Type, type Static } from "@sinclair/typebox";

export const WorkflowIdSchema = Type.String({ pattern: "^[1-9][0-9]*$" });

export const WorkflowNodeKindSchema = Type.Union([
  Type.Literal("start"),
  Type.Literal("wait"),
  Type.Literal("branch"),
  Type.Literal("message"),
  Type.Literal("tag"),
  Type.Literal("coupon"),
  Type.Literal("handoff"),
  Type.Literal("agent"),
  Type.Literal("llm"),
  Type.Literal("order-query"),
  Type.Literal("tag-query"),
  Type.Literal("customer-update"),
  Type.Literal("ai-collect"),
  Type.Literal("ai-intent"),
  Type.Literal("end"),
]);

export const WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS = [
  "start",
  "wait",
  "end",
] as const satisfies readonly WorkflowNodeKind[];

export const WorkflowRuntimeStatusSchema = Type.Union([
  Type.Literal("inactive"),
  Type.Literal("active"),
  Type.Literal("paused"),
  Type.Literal("stopped"),
]);

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
  title: Type.String(),
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

export const WorkflowDefinitionSchema = Type.Object({
  createdAt: Type.String(),
  description: Type.String({ maxLength: 1000 }),
  draft: WorkflowDraftSchema,
  draftVersion: Type.Integer({ minimum: 1 }),
  id: WorkflowIdSchema,
  name: Type.String({ minLength: 1, maxLength: 100 }),
  permissions: WorkflowPermissionsSchema,
  publishedRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  runtimeStatus: WorkflowRuntimeStatusSchema,
  updatedAt: Type.String(),
  validatedDraftVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
});

export const WorkflowDefinitionSummarySchema = Type.Omit(WorkflowDefinitionSchema, ["draft"]);

export const WorkflowRevisionSchema = Type.Object({
  draft: WorkflowDraftSchema,
  id: WorkflowIdSchema,
  publishedAt: Type.String(),
  revision: Type.Integer({ minimum: 1 }),
  workflowId: WorkflowIdSchema,
});

export const WorkflowCreateRequestSchema = Type.Object({
  clientRequestId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
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

export const WorkflowPublishRequestSchema = Type.Object({
  expectedDraftVersion: Type.Integer({ minimum: 1 }),
});

export const WorkflowRestoreRequestSchema = Type.Object({
  expectedDraftVersion: Type.Integer({ minimum: 1 }),
});

export const WorkflowPublishResultSchema = Type.Object({
  definition: WorkflowDefinitionSchema,
  revision: Type.Union([WorkflowRevisionSchema, Type.Null()]),
  validatedOnly: Type.Boolean(),
});

export const WorkflowNodeMetricSchema = Type.Object({
  completed: Type.Integer({ minimum: 0 }),
  current: Type.Integer({ minimum: 0 }),
  entered: Type.Integer({ minimum: 0 }),
  nodeId: Type.String({ minLength: 1, maxLength: 128 }),
  passed: Type.Integer({ minimum: 0 }),
});

export const WorkflowDataOverviewSchema = Type.Object({
  calculatedAt: Type.String(),
  nodes: Type.Array(WorkflowNodeMetricSchema, { maxItems: 200 }),
  revision: Type.Integer({ minimum: 1 }),
});

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
  occurredAt: Type.String(),
  nodeId: Type.String({ minLength: 1, maxLength: 128 }),
  nodeKind: WorkflowEntryRecordStepNodeKindSchema,
  status: Type.Union([Type.Literal("completed"), Type.Literal("failed"), Type.Literal("current")]),
  title: Type.String(),
});

export const WorkflowEntryRecordDetailSchema = Type.Object({
  createdAt: Type.String(),
  customer: WorkflowEntryRecordCustomerSchema,
  recordId: WorkflowIdSchema,
  revision: Type.Integer({ minimum: 1 }),
  status: WorkflowEntryRecordStatusSchema,
  steps: Type.Array(WorkflowEntryRecordStepSchema),
});

export type WorkflowNodeKind = Static<typeof WorkflowNodeKindSchema>;
export type WorkflowRuntimeSupportedNodeKind =
  (typeof WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS)[number];
export type WorkflowEntryRecordStepNodeKind = Static<typeof WorkflowEntryRecordStepNodeKindSchema>;
export type WorkflowRuntimeStatus = Static<typeof WorkflowRuntimeStatusSchema>;
export type WorkflowDraft = Static<typeof WorkflowDraftSchema>;
export type WorkflowDraftNode = Static<typeof WorkflowDraftNodeSchema>;
export type WorkflowDraftEdge = Static<typeof WorkflowDraftEdgeSchema>;
export type WorkflowPermissions = Static<typeof WorkflowPermissionsSchema>;
export type WorkflowDefinition = Static<typeof WorkflowDefinitionSchema>;
export type WorkflowDefinitionSummary = Static<typeof WorkflowDefinitionSummarySchema>;
export type WorkflowRevision = Static<typeof WorkflowRevisionSchema>;
export type WorkflowCreateRequest = Static<typeof WorkflowCreateRequestSchema>;
export type WorkflowSaveDraftRequest = Static<typeof WorkflowSaveDraftRequestSchema>;
export type WorkflowRenameRequest = Static<typeof WorkflowRenameRequestSchema>;
export type WorkflowMetadataUpdateRequest = Static<typeof WorkflowMetadataUpdateRequestSchema>;
export type WorkflowPublishRequest = Static<typeof WorkflowPublishRequestSchema>;
export type WorkflowRestoreRequest = Static<typeof WorkflowRestoreRequestSchema>;
export type WorkflowPublishResult = Static<typeof WorkflowPublishResultSchema>;
export type WorkflowNodeMetric = Static<typeof WorkflowNodeMetricSchema>;
export type WorkflowDataOverview = Static<typeof WorkflowDataOverviewSchema>;
export type WorkflowEntryRecordStatus = Static<typeof WorkflowEntryRecordStatusSchema>;
export type WorkflowEntryRecord = Static<typeof WorkflowEntryRecordSchema>;
export type WorkflowEntryRecordPage = Static<typeof WorkflowEntryRecordPageSchema>;
export type WorkflowEntryRecordStep = Static<typeof WorkflowEntryRecordStepSchema>;
export type WorkflowEntryRecordDetail = Static<typeof WorkflowEntryRecordDetailSchema>;
