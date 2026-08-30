import { Type, type Static } from "@sinclair/typebox";
import {
  WORKFLOW_NAME_MAX_LENGTH,
  WorkflowIdSchema,
  WorkflowRuntimeStatusSchema,
} from "./dto.js";
export const WorkflowObservabilityTaskDistributionSchema = Type.Object({
  cancelled: Type.Integer({ minimum: 0 }),
  completed: Type.Integer({ minimum: 0 }),
  dead: Type.Integer({ minimum: 0 }),
  dispatched: Type.Integer({ minimum: 0 }),
  leased: Type.Integer({ minimum: 0 }),
  pending: Type.Integer({ minimum: 0 }),
  running: Type.Integer({ minimum: 0 }),
  suspended: Type.Integer({ minimum: 0 }),
  waiting_external: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

const EpochMsSchema = Type.Integer({ minimum: 0 });

export const WORKFLOW_OBSERVABILITY_ROLES = [
  "scheduler",
  "task-consumer",
  "entry-consumer",
  "inference",
  "outbox",
  "reconciler",
] as const;

export const WorkflowObservabilityRoleSchema = Type.Union([
  Type.Literal("scheduler"),
  Type.Literal("task-consumer"),
  Type.Literal("entry-consumer"),
  Type.Literal("inference"),
  Type.Literal("outbox"),
  Type.Literal("reconciler"),
]);

export const WorkflowObservabilityHealthSchema = Type.Union([
  Type.Literal("healthy"),
  Type.Literal("degraded"),
  Type.Literal("offline"),
  Type.Literal("unknown"),
]);

export const WorkflowObservabilityListStateSchema = Type.Union([
  Type.Literal("all"),
  Type.Literal("backlog"),
  Type.Literal("transitioning"),
  Type.Literal("dead"),
]);

export const WorkflowObservabilityWorkerSchema = Type.Object({
  health: WorkflowObservabilityHealthSchema,
  lastDurationMs: Type.Optional(Type.Integer({ minimum: 0 })),
  lastErrorCode: Type.Optional(Type.String({ maxLength: 128 })),
  lastFailureAt: Type.Optional(EpochMsSchema),
  lastStartedAt: Type.Optional(EpochMsSchema),
  lastSuccessAt: Type.Optional(EpochMsSchema),
  reportedAt: Type.Optional(EpochMsSchema),
  reportedBy: Type.Optional(Type.String({ maxLength: 128 })),
  role: WorkflowObservabilityRoleSchema,
  runningDurationMs: Type.Optional(Type.Integer({ minimum: 0 })),
}, { additionalProperties: false });

export const WorkflowObservabilityTransitionSchema = Type.Object({
  attempt: Type.Integer({ minimum: 0 }),
  lastErrorCode: Type.Optional(Type.String({ maxLength: 128 })),
  nextAttemptAt: EpochMsSchema,
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("leased"),
    Type.Literal("dead"),
  ]),
  targetStatus: Type.Union([
    Type.Literal("pending"),
    Type.Literal("suspended"),
  ]),
  updateTime: EpochMsSchema,
}, { additionalProperties: false });

export const WorkflowObservabilitySummaryResponseSchema = Type.Object({
  deadTransitionCount: Type.Integer({ minimum: 0 }),
  inference: Type.Object({
    expiredLease: Type.Integer({ minimum: 0 }),
    pending: Type.Integer({ minimum: 0 }),
    retryWait: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
  observedAt: EpochMsSchema,
  outbox: Type.Object({
    oldestPendingAt: Type.Optional(EpochMsSchema),
    pending: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
  tasks: Type.Object({
    dispatched: Type.Integer({ minimum: 0 }),
    dueBacklog: Type.Integer({ minimum: 0 }),
    expiredLease: Type.Integer({ minimum: 0 }),
    oldestDueAt: Type.Optional(EpochMsSchema),
    pending: Type.Integer({ minimum: 0 }),
    running: Type.Integer({ minimum: 0 }),
    stalledDispatched: Type.Integer({ minimum: 0 }),
    suspended: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
  transitions: Type.Object({
    dead: Type.Integer({ minimum: 0 }),
    leased: Type.Integer({ minimum: 0 }),
    pending: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
  workers: Type.Array(WorkflowObservabilityWorkerSchema, { maxItems: 6 }),
}, { additionalProperties: false });

export const WorkflowObservabilityWorkflowItemSchema = Type.Object({
  activeRunCount: Type.Integer({ minimum: 0 }),
  activeTaskCount: Type.Integer({ minimum: 0 }),
  dueBacklogCount: Type.Integer({ minimum: 0 }),
  lastRunAt: Type.Optional(EpochMsSchema),
  name: Type.String({ maxLength: WORKFLOW_NAME_MAX_LENGTH }),
  oldestDueAt: Type.Optional(EpochMsSchema),
  runtimeStatus: WorkflowRuntimeStatusSchema,
  totalRunCount: Type.Integer({ minimum: 0 }),
  transition: Type.Optional(WorkflowObservabilityTransitionSchema),
  uid: Type.Integer({ minimum: 1 }),
  workflowId: WorkflowIdSchema,
}, { additionalProperties: false });

export const WorkflowObservabilityWorkflowListResponseSchema = Type.Object({
  items: Type.Array(WorkflowObservabilityWorkflowItemSchema, { maxItems: 100 }),
  observedAt: EpochMsSchema,
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ maximum: 100, minimum: 1 }),
  total: Type.Integer({ minimum: 0 }),
  totalPages: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });

export const WorkflowObservabilityWorkflowDetailResponseSchema = Type.Object({
  activeRunCount: Type.Integer({ minimum: 0 }),
  dueBacklogCount: Type.Integer({ minimum: 0 }),
  name: Type.String({ maxLength: WORKFLOW_NAME_MAX_LENGTH }),
  observedAt: EpochMsSchema,
  oldestDueAt: Type.Optional(EpochMsSchema),
  runtimeStatus: WorkflowRuntimeStatusSchema,
  statusReason: Type.Optional(Type.String({ maxLength: 64 })),
  taskDistribution: WorkflowObservabilityTaskDistributionSchema,
  transition: Type.Optional(WorkflowObservabilityTransitionSchema),
  uid: Type.Integer({ minimum: 1 }),
  workflowId: WorkflowIdSchema,
}, { additionalProperties: false });

export type WorkflowObservabilityTaskDistribution = Static<
  typeof WorkflowObservabilityTaskDistributionSchema
>;
export type WorkflowObservabilityRole = Static<typeof WorkflowObservabilityRoleSchema>;
export type WorkflowObservabilityHealth = Static<typeof WorkflowObservabilityHealthSchema>;
export type WorkflowObservabilityListState = Static<typeof WorkflowObservabilityListStateSchema>;
export type WorkflowObservabilityWorker = Static<typeof WorkflowObservabilityWorkerSchema>;
export type WorkflowObservabilityTransition = Static<typeof WorkflowObservabilityTransitionSchema>;
export type WorkflowObservabilitySummaryResponse = Static<
  typeof WorkflowObservabilitySummaryResponseSchema
>;
export type WorkflowObservabilityWorkflowItem = Static<
  typeof WorkflowObservabilityWorkflowItemSchema
>;
export type WorkflowObservabilityWorkflowListResponse = Static<
  typeof WorkflowObservabilityWorkflowListResponseSchema
>;
export type WorkflowObservabilityWorkflowDetailResponse = Static<
  typeof WorkflowObservabilityWorkflowDetailResponseSchema
>;
