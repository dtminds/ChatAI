import { Type, type Static } from "@sinclair/typebox";

const EpochMsSchema = Type.Integer({ minimum: 0 });
const CursorSchema = Type.Optional(Type.String({ minLength: 1 }));
export const AGENT_USER_MEMORY_EXTRACTION_INSTRUCTION_MAX_LENGTH = 2000;

export const AgentUserMemoryCategorySchema = Type.Union([
  Type.Literal("customer_profile"),
  Type.Literal("preference"),
  Type.Literal("recent_intent"),
]);
export const AgentUserMemorySourceSchema = Type.Union([
  Type.Literal("manual"),
  Type.Literal("ai"),
]);
export const AgentUserMemoryRunStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("running"),
  Type.Literal("waiting"),
  Type.Literal("succeeded"),
  Type.Literal("partial"),
  Type.Literal("failed"),
  Type.Literal("canceled"),
]);
export const AgentUserMemoryRunPhaseSchema = Type.Union([
  Type.Literal("selecting"),
  Type.Literal("inference"),
  Type.Literal("merging"),
  Type.Literal("completed"),
]);
export const AgentUserMemoryRunItemStatusSchema = Type.Union([
  Type.Literal("prepared"),
  Type.Literal("submitted"),
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("skipped"),
  Type.Literal("canceled"),
]);
export const AgentUserMemoryExecutionModeSchema = Type.Union([
  Type.Literal("sync"),
  Type.Literal("volcengine_batch"),
]);
export const AgentUserMemoryErrorCodeSchema = Type.Union([
  Type.Literal("AGENT_USER_MEMORY_DISABLED"),
  Type.Literal("AGENT_USER_MEMORY_RUN_ACTIVE"),
  Type.Literal("AGENT_USER_MEMORY_RUN_NOT_RETRYABLE"),
  Type.Literal("AGENT_USER_MEMORY_RUN_NOT_FOUND"),
  Type.Literal("AGENT_USER_MEMORY_ITEM_SUPERSEDED"),
  Type.Literal("AGENT_USER_MEMORY_ITEM_NO_READABLE_MESSAGES"),
  Type.Literal("AGENT_USER_MEMORY_CUSTOMER_NOT_FOUND"),
  Type.Literal("AGENT_USER_MEMORY_ITEM_NOT_FOUND"),
  Type.Literal("AGENT_USER_MEMORY_LIMIT_REACHED"),
  Type.Literal("AGENT_USER_MEMORY_VERSION_CONFLICT"),
  Type.Literal("AGENT_USER_MEMORY_CONTENT_DUPLICATE"),
  Type.Literal("AGENT_USER_MEMORY_CONTENT_INVALID"),
  Type.Literal("AGENT_USER_MEMORY_DATA_INVALID"),
  Type.Literal("AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID"),
  Type.Literal("AGENT_USER_MEMORY_ATTEMPTS_EXHAUSTED"),
]);

const BaseMemoryItemSchema = Type.Object({
  category: AgentUserMemoryCategorySchema,
  content: Type.String({ minLength: 1, maxLength: 100 }),
  createdAt: EpochMsSchema,
  expiresAt: Type.Union([EpochMsSchema, Type.Null()]),
  id: Type.Integer({ minimum: 1 }),
  updatedAt: EpochMsSchema,
}, { additionalProperties: false });

export const AgentUserMemoryManualItemSchema = Type.Composite([
  BaseMemoryItemSchema,
  Type.Object({
    updatedBySubUserId: Type.Integer({ minimum: 1 }),
  }, { additionalProperties: false }),
], { additionalProperties: false });

export const AgentUserMemoryAiItemSchema = Type.Composite([
  BaseMemoryItemSchema,
  Type.Object({
    evidenceMessageIds: Type.Array(Type.Integer({ minimum: 1 }), { minItems: 1, maxItems: 3 }),
    sourceSessionId: Type.Integer({ minimum: 1 }),
  }, { additionalProperties: false }),
], { additionalProperties: false });

export const AgentUserMemoryItemSchema = Type.Union([
  Type.Composite([
    AgentUserMemoryManualItemSchema,
    Type.Object({ source: Type.Literal("manual") }, { additionalProperties: false }),
  ], { additionalProperties: false }),
  Type.Composite([
    AgentUserMemoryAiItemSchema,
    Type.Object({ source: Type.Literal("ai") }, { additionalProperties: false }),
  ], { additionalProperties: false }),
]);

export const AgentUserMemoryDocumentSchema = Type.Object({
  ai: Type.Array(AgentUserMemoryAiItemSchema, { maxItems: 20 }),
  manual: Type.Array(AgentUserMemoryManualItemSchema, { maxItems: 20 }),
  nextItemId: Type.Integer({ minimum: 1 }),
  schemaVersion: Type.Literal(1),
}, { additionalProperties: false });

export const AgentUserMemorySettingsRequestSchema = Type.Object({
  enabled: Type.Optional(Type.Boolean()),
  extractionInstruction: Type.Optional(Type.String({
    maxLength: AGENT_USER_MEMORY_EXTRACTION_INSTRUCTION_MAX_LENGTH,
  })),
}, { additionalProperties: false, minProperties: 1 });

export const AgentUserMemoryRunSchema = Type.Object({
  candidateCustomerCount: Type.Integer({ minimum: 0 }),
  candidateSessionCount: Type.Integer({ minimum: 0 }),
  candidateSessionLimit: Type.Integer({ minimum: 1 }),
  customerLimit: Type.Integer({ minimum: 1 }),
  executionMode: AgentUserMemoryExecutionModeSchema,
  failureCount: Type.Integer({ minimum: 0 }),
  finishedAt: Type.Optional(EpochMsSchema),
  id: Type.Number(),
  inputTokens: Type.Integer({ minimum: 0 }),
  lastErrorCode: Type.Optional(Type.String()),
  outputTokens: Type.Integer({ minimum: 0 }),
  phase: AgentUserMemoryRunPhaseSchema,
  quotaDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  scheduledFor: EpochMsSchema,
  selectedCustomerCount: Type.Integer({ minimum: 0 }),
  skippedCount: Type.Integer({ minimum: 0 }),
  startedAt: Type.Optional(EpochMsSchema),
  status: AgentUserMemoryRunStatusSchema,
  successCount: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const AgentUserMemoryOverviewResponseSchema = Type.Object({
  activeRun: Type.Optional(AgentUserMemoryRunSchema),
  canViewWorkerObservability: Type.Boolean(),
  customerLimit: Type.Integer({ minimum: 1 }),
  enabled: Type.Boolean(),
  executionMode: AgentUserMemoryExecutionModeSchema,
  extractionInstruction: Type.String({
    maxLength: AGENT_USER_MEMORY_EXTRACTION_INSTRUCTION_MAX_LENGTH,
  }),
  nextRunAt: Type.Optional(EpochMsSchema),
  recentRun: Type.Optional(AgentUserMemoryRunSchema),
  schedule: Type.String(),
  timezone: Type.String(),
}, { additionalProperties: false });

export const AgentUserMemoryWorkerHealthSchema = Type.Union([
  Type.Literal("healthy"),
  Type.Literal("error"),
  Type.Literal("offline"),
]);

export const AgentUserMemoryWorkerStateSchema = Type.Object({
  health: AgentUserMemoryWorkerHealthSchema,
  lastDurationMs: Type.Optional(Type.Integer({ minimum: 0 })),
  lastErrorCode: Type.Optional(Type.String()),
  lastFailureAt: Type.Optional(EpochMsSchema),
  lastStartedAt: Type.Optional(EpochMsSchema),
  lastSuccessAt: Type.Optional(EpochMsSchema),
  reportedAt: Type.Optional(EpochMsSchema),
  reportedBy: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const AgentUserMemoryObservabilityTotalsSchema = Type.Object({
  activeRunCount: Type.Integer({ minimum: 0 }),
  delayedTenantCount: Type.Integer({ minimum: 0 }),
  dueTenantCount: Type.Integer({ minimum: 0 }),
  enabledTenantCount: Type.Integer({ minimum: 0 }),
  expiredLeaseCount: Type.Integer({ minimum: 0 }),
  oldestDueAt: Type.Optional(EpochMsSchema),
  oldestRunnableAt: Type.Optional(EpochMsSchema),
}, { additionalProperties: false });

export const AgentUserMemoryObservabilityPeriodSchema = Type.Object({
  canceledRunCount: Type.Integer({ minimum: 0 }),
  failedRunCount: Type.Integer({ minimum: 0 }),
  failureCount: Type.Integer({ minimum: 0 }),
  inputTokens: Type.Integer({ minimum: 0 }),
  outputTokens: Type.Integer({ minimum: 0 }),
  partialRunCount: Type.Integer({ minimum: 0 }),
  selectedCustomerCount: Type.Integer({ minimum: 0 }),
  skippedCount: Type.Integer({ minimum: 0 }),
  succeededRunCount: Type.Integer({ minimum: 0 }),
  successCount: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const AgentUserMemoryObservabilityTrendPointSchema = Type.Object({
  date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  failureCount: Type.Integer({ minimum: 0 }),
  inputTokens: Type.Integer({ minimum: 0 }),
  outputTokens: Type.Integer({ minimum: 0 }),
  selectedCustomerCount: Type.Integer({ minimum: 0 }),
  skippedCount: Type.Integer({ minimum: 0 }),
  successCount: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const AgentUserMemoryObservabilitySummaryResponseSchema = Type.Object({
  last24Hours: AgentUserMemoryObservabilityPeriodSchema,
  observedAt: EpochMsSchema,
  totals: AgentUserMemoryObservabilityTotalsSchema,
  trend: Type.Array(AgentUserMemoryObservabilityTrendPointSchema, { maxItems: 14 }),
  worker: AgentUserMemoryWorkerStateSchema,
}, { additionalProperties: false });

export const AgentUserMemoryTenantStateSchema = Type.Union([
  Type.Literal("normal"),
  Type.Literal("due"),
  Type.Literal("running"),
  Type.Literal("warning"),
  Type.Literal("disabled"),
]);

export const AgentUserMemoryObservabilityRunSchema = Type.Object({
  failureCount: Type.Integer({ minimum: 0 }),
  finishedAt: Type.Optional(EpochMsSchema),
  id: Type.Number(),
  inputTokens: Type.Integer({ minimum: 0 }),
  lastErrorCode: Type.Optional(Type.String()),
  outputTokens: Type.Integer({ minimum: 0 }),
  phase: AgentUserMemoryRunPhaseSchema,
  scheduledFor: EpochMsSchema,
  selectedCustomerCount: Type.Integer({ minimum: 0 }),
  skippedCount: Type.Integer({ minimum: 0 }),
  startedAt: Type.Optional(EpochMsSchema),
  status: AgentUserMemoryRunStatusSchema,
  successCount: Type.Integer({ minimum: 0 }),
  updatedAt: EpochMsSchema,
}, { additionalProperties: false });

export const AgentUserMemoryObservabilityTenantSchema = Type.Object({
  activeRun: Type.Optional(AgentUserMemoryObservabilityRunSchema),
  enabled: Type.Boolean(),
  nextRunAt: Type.Optional(EpochMsSchema),
  recentRun: Type.Optional(AgentUserMemoryObservabilityRunSchema),
  state: AgentUserMemoryTenantStateSchema,
  uid: Type.Number(),
}, { additionalProperties: false });

export const AgentUserMemoryObservabilityTenantListResponseSchema = Type.Object({
  items: Type.Array(AgentUserMemoryObservabilityTenantSchema),
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1, maximum: 100 }),
  total: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const AgentUserMemoryRunListResponseSchema = Type.Object({
  items: Type.Array(AgentUserMemoryRunSchema),
  nextCursor: CursorSchema,
}, { additionalProperties: false });

export const AgentUserMemoryRunItemSchema = Type.Object({
  attemptCount: Type.Integer({ minimum: 0 }),
  finishedAt: Type.Optional(EpochMsSchema),
  id: Type.Number(),
  inputTokens: Type.Integer({ minimum: 0 }),
  lastErrorCode: Type.Optional(Type.String()),
  messageCount: Type.Integer({ minimum: 0 }),
  outputTokens: Type.Integer({ minimum: 0 }),
  platform: Type.Integer({ minimum: 1 }),
  sessionCount: Type.Integer({ minimum: 1 }),
  status: AgentUserMemoryRunItemStatusSchema,
  thirdExternalUserId: Type.String(),
}, { additionalProperties: false });

export const AgentUserMemoryRunDetailResponseSchema = Type.Object({
  items: Type.Array(AgentUserMemoryRunItemSchema),
  nextItemCursor: CursorSchema,
  run: AgentUserMemoryRunSchema,
}, { additionalProperties: false });

export const AgentUserMemoryRetryFailedResponseSchema = Type.Object({
  resetCount: Type.Integer({ minimum: 0 }),
  skippedCount: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const AgentUserMemoryCustomerListItemSchema = Type.Object({
  avatarUrl: Type.Optional(Type.String()),
  customerName: Type.String(),
  lastAutoUpdatedAt: Type.Optional(EpochMsSchema),
  memoryCount: Type.Integer({ minimum: 0, maximum: 20 }),
  platform: Type.Integer({ minimum: 1 }),
  thirdExternalUserId: Type.String(),
  updatedAt: Type.Optional(EpochMsSchema),
  version: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const AgentUserMemoryCustomerListResponseSchema = Type.Object({
  items: Type.Array(AgentUserMemoryCustomerListItemSchema),
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1, maximum: 100 }),
  total: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const AgentUserMemoryCustomerDetailResponseSchema = Type.Object({
  avatarUrl: Type.Optional(Type.String()),
  customerName: Type.String(),
  items: Type.Array(AgentUserMemoryItemSchema, { maxItems: 20 }),
  lastAutoQuotaDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
  lastAutoUpdatedAt: Type.Optional(EpochMsSchema),
  manualUpdatedAt: Type.Optional(EpochMsSchema),
  platform: Type.Integer({ minimum: 1 }),
  thirdExternalUserId: Type.String(),
  version: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const AgentUserMemoryEvidenceMessageSchema = Type.Object({
  content: Type.String(),
  messageId: Type.Number(),
  occurredAt: EpochMsSchema,
  senderRole: Type.String(),
  sessionId: Type.Number(),
}, { additionalProperties: false });
export const AgentUserMemoryEvidenceResponseSchema = Type.Object({
  messages: Type.Array(AgentUserMemoryEvidenceMessageSchema, { minItems: 1, maxItems: 3 }),
}, { additionalProperties: false });

const ManualWriteBaseSchema = Type.Object({
  category: AgentUserMemoryCategorySchema,
  content: Type.String({ minLength: 1, maxLength: 100 }),
  expectedVersion: Type.Integer({ minimum: 0 }),
  expiresAt: Type.Optional(Type.Union([EpochMsSchema, Type.Null()])),
}, { additionalProperties: false });
export const AgentUserMemoryManualCreateRequestSchema = ManualWriteBaseSchema;
export const AgentUserMemoryManualUpdateRequestSchema = ManualWriteBaseSchema;
export const AgentUserMemoryManualDeleteRequestSchema = Type.Object({
  expectedVersion: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });
export const AgentUserMemoryManualWriteResponseSchema = AgentUserMemoryCustomerDetailResponseSchema;

export type AgentUserMemoryCategory = Static<typeof AgentUserMemoryCategorySchema>;
export type AgentUserMemorySource = Static<typeof AgentUserMemorySourceSchema>;
export type AgentUserMemoryRunStatus = Static<typeof AgentUserMemoryRunStatusSchema>;
export type AgentUserMemoryRunPhase = Static<typeof AgentUserMemoryRunPhaseSchema>;
export type AgentUserMemoryRunItemStatus = Static<typeof AgentUserMemoryRunItemStatusSchema>;
export type AgentUserMemoryExecutionMode = Static<typeof AgentUserMemoryExecutionModeSchema>;
export type AgentUserMemoryErrorCode = Static<typeof AgentUserMemoryErrorCodeSchema>;
export type AgentUserMemoryManualItem = Static<typeof AgentUserMemoryManualItemSchema>;
export type AgentUserMemoryAiItem = Static<typeof AgentUserMemoryAiItemSchema>;
export type AgentUserMemoryItem = Static<typeof AgentUserMemoryItemSchema>;
export type AgentUserMemoryDocument = Static<typeof AgentUserMemoryDocumentSchema>;
export type AgentUserMemorySettingsRequest = Static<typeof AgentUserMemorySettingsRequestSchema>;
export type AgentUserMemoryRun = Static<typeof AgentUserMemoryRunSchema>;
export type AgentUserMemoryOverviewResponse = Static<typeof AgentUserMemoryOverviewResponseSchema>;
export type AgentUserMemoryWorkerHealth = Static<typeof AgentUserMemoryWorkerHealthSchema>;
export type AgentUserMemoryWorkerState = Static<typeof AgentUserMemoryWorkerStateSchema>;
export type AgentUserMemoryObservabilitySummaryResponse = Static<typeof AgentUserMemoryObservabilitySummaryResponseSchema>;
export type AgentUserMemoryTenantState = Static<typeof AgentUserMemoryTenantStateSchema>;
export type AgentUserMemoryObservabilityRun = Static<typeof AgentUserMemoryObservabilityRunSchema>;
export type AgentUserMemoryObservabilityTenant = Static<typeof AgentUserMemoryObservabilityTenantSchema>;
export type AgentUserMemoryObservabilityTenantListResponse = Static<typeof AgentUserMemoryObservabilityTenantListResponseSchema>;
export type AgentUserMemoryRunListResponse = Static<typeof AgentUserMemoryRunListResponseSchema>;
export type AgentUserMemoryRunItem = Static<typeof AgentUserMemoryRunItemSchema>;
export type AgentUserMemoryRunDetailResponse = Static<typeof AgentUserMemoryRunDetailResponseSchema>;
export type AgentUserMemoryRetryFailedResponse = Static<typeof AgentUserMemoryRetryFailedResponseSchema>;
export type AgentUserMemoryCustomerListItem = Static<typeof AgentUserMemoryCustomerListItemSchema>;
export type AgentUserMemoryCustomerListResponse = Static<typeof AgentUserMemoryCustomerListResponseSchema>;
export type AgentUserMemoryCustomerDetailResponse = Static<typeof AgentUserMemoryCustomerDetailResponseSchema>;
export type AgentUserMemoryEvidenceResponse = Static<typeof AgentUserMemoryEvidenceResponseSchema>;
export type AgentUserMemoryManualCreateRequest = Static<typeof AgentUserMemoryManualCreateRequestSchema>;
export type AgentUserMemoryManualUpdateRequest = Static<typeof AgentUserMemoryManualUpdateRequestSchema>;
export type AgentUserMemoryManualDeleteRequest = Static<typeof AgentUserMemoryManualDeleteRequestSchema>;
