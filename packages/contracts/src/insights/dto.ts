import { Type, type Static } from "@sinclair/typebox";
import type { WorkbenchMessageDto } from "../chat/dto.js";

export const InsightAnalysisStatusSchema = Type.Union([
  Type.Literal("ready"),
  Type.Literal("analyzing"),
  Type.Literal("failed"),
  Type.Literal("stale"),
  Type.Literal("partial"),
  Type.Literal("skipped"),
]);

export const InsightModeSchema = Type.Union([
  Type.Literal("basic"),
  Type.Literal("insight"),
]);

export const InsightActionStatusSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("done"),
  Type.Literal("dismissed"),
  Type.Literal("expired"),
]);

export const InsightRescanAnalysisScopeSchema = Type.Union([
  Type.Literal("all"),
  Type.Literal("qaFindings"),
  Type.Literal("classification"),
]);

export const InsightRescanTaskStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("running"),
  Type.Literal("succeeded"),
  Type.Literal("partial"),
  Type.Literal("failed"),
]);

export const InsightSeveritySchema = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

export const InsightResolutionStatusSchema = Type.Union([
  Type.Literal("resolved"),
  Type.Literal("unresolved"),
  Type.Literal("partially_resolved"),
  Type.Literal("no_customer_problem"),
  Type.Literal("unknown"),
]);

export const InsightPrioritySchema = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

export const InsightOverviewTotalsSchema = Type.Object({
  agentMessages: Type.Number(),
  consultingCustomers: Type.Number(),
  customerMessages: Type.Number(),
  logicalSessions: Type.Number(),
  messages: Type.Number(),
});

export const InsightOverviewComparisonValueSchema = Type.Object({
  current: Type.Number(),
  delta: Type.Number(),
  deltaRate: Type.Optional(Type.Number()),
  previous: Type.Number(),
});

export const InsightOverviewComparisonSchema = Type.Object({
  agentMessages: InsightOverviewComparisonValueSchema,
  consultingCustomers: InsightOverviewComparisonValueSchema,
  customerMessages: InsightOverviewComparisonValueSchema,
  logicalSessions: InsightOverviewComparisonValueSchema,
  messages: InsightOverviewComparisonValueSchema,
});

export const InsightOverviewTrendPointSchema = Type.Object({
  agentMessages: Type.Number(),
  consultingCustomers: Type.Number(),
  customerMessages: Type.Number(),
  date: Type.String(),
  logicalSessions: Type.Number(),
  messages: Type.Number(),
});

export const InsightOverviewSessionItemSchema = Type.Object({
  agentMessageCount: Type.Number(),
  agentAvatarUrl: Type.Optional(Type.String()),
  agentName: Type.Optional(Type.String()),
  analysisPhase: Type.Optional(Type.Union([Type.Literal("live"), Type.Literal("final")])),
  analysisStatus: Type.Optional(InsightAnalysisStatusSchema),
  conversationId: Type.String(),
  customerMessageCount: Type.Number(),
  customerAvatarUrl: Type.Optional(Type.String()),
  customerName: Type.String(),
  endedAt: Type.Optional(Type.Number()),
  lastMessageAt: Type.Optional(Type.Number()),
  messageCount: Type.Number(),
  problemSummary: Type.Optional(Type.String()),
  resolutionStatus: Type.Optional(InsightResolutionStatusSchema),
  sessionId: Type.String(),
  sessionState: Type.Union([Type.Literal("open"), Type.Literal("ended")]),
  startedAt: Type.Number(),
  summarySessionTitle: Type.Optional(Type.String()),
});

export const InsightOverviewSessionsPageSchema = Type.Object({
  items: Type.Array(InsightOverviewSessionItemSchema),
  mode: InsightModeSchema,
  page: Type.Number(),
  pageSize: Type.Number(),
  total: Type.Number(),
  totalPages: Type.Number(),
});

export const InsightOverviewSessionsResponseSchema = InsightOverviewSessionsPageSchema;

export const InsightsOverviewResponseSchema = Type.Object({
  actionItemsOpen: Type.Optional(Type.Number()),
  analysis: Type.Optional(Type.Object({
    failed: Type.Number(),
    partial: Type.Number(),
    ready: Type.Number(),
    stale: Type.Number(),
  })),
  comparison: InsightOverviewComparisonSchema,
  comparisonAvailable: Type.Boolean(),
  mode: InsightModeSchema,
  problemSessions: Type.Optional(Type.Number()),
  readySessions: Type.Optional(Type.Number()),
  resolution: Type.Optional(Type.Object({
    noCustomerProblem: Type.Number(),
    partiallyResolved: Type.Number(),
    resolved: Type.Number(),
    unknown: Type.Number(),
    unresolved: Type.Number(),
  })),
  totalSessions: Type.Optional(Type.Number()),
  totals: InsightOverviewTotalsSchema,
  trend: Type.Array(InsightOverviewTrendPointSchema),
  unresolvedSessions: Type.Optional(Type.Number()),
});

export const InsightCapabilitiesResponseSchema = Type.Object({
  canManageInsights: Type.Boolean(),
  insightAvailable: Type.Boolean(),
  mode: InsightModeSchema,
});

export const InsightFilterOptionSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
}, { additionalProperties: false });

export const InsightFilterOptionsResponseSchema = Type.Object({
  entities: Type.Array(InsightFilterOptionSchema),
  intents: Type.Array(InsightFilterOptionSchema),
  tags: Type.Array(InsightFilterOptionSchema),
}, { additionalProperties: false });

export type InsightOverviewQuery = {
  from?: string;
  to?: string;
};

export type InsightOverviewSessionsQuery = {
  analysisStatus?: Static<typeof InsightAnalysisStatusSchema>;
  entityId?: string;
  from?: string;
  intentId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  problemScope?: "all" | "problem" | "unresolved";
  resolutionStatus?: Static<typeof InsightResolutionStatusSchema>;
  tagId?: string;
  to?: string;
};

export const InsightBusinessTopicDimensionSchema = Type.Union([
  Type.Literal("tag"),
  Type.Literal("entity"),
  Type.Literal("intent"),
  Type.Literal("asset"),
]);

export const InsightBusinessTopicSchema = Type.Object({
  code: Type.String(),
  dimension: InsightBusinessTopicDimensionSchema,
  mentionCount: Type.Number(),
  name: Type.String(),
  sessionCount: Type.Number(),
  share: Type.Number(),
  type: Type.Optional(Type.String()),
});

export const InsightBusinessTrendPointSchema = Type.Object({
  assetMentions: Type.Number(),
  date: Type.String(),
  entityMentions: Type.Number(),
  intentMentions: Type.Number(),
  tagMentions: Type.Number(),
  topicSessions: Type.Number(),
});

export const InsightBusinessIntentTrendPointSchema = Type.Object({
  date: Type.String(),
  intentId: Type.String(),
  intentName: Type.String(),
  sessionCount: Type.Number(),
});

export const InsightBusinessTopicsResponseSchema = Type.Object({
  dimension: InsightBusinessTopicDimensionSchema,
  intentTrend: Type.Array(InsightBusinessIntentTrendPointSchema),
  topics: Type.Array(InsightBusinessTopicSchema),
  totals: Type.Object({
    mentionCount: Type.Number(),
    topicSessions: Type.Number(),
  }),
  trend: Type.Array(InsightBusinessTrendPointSchema),
});

export const InsightBusinessRelatedSessionsResponseSchema = InsightOverviewSessionsPageSchema;

export const InsightsQualityRuleDistributionSchema = Type.Object({
  count: Type.Number(),
  ruleCode: Type.String(),
  ruleName: Type.String(),
});

export const InsightsQualityOverviewSchema = Type.Object({
  inspectedSessions: Type.Number(),
  inspectionRate: Type.Number(),
  passRate: Type.Number(),
  ruleDistribution: Type.Array(InsightsQualityRuleDistributionSchema),
  totalSessions: Type.Number(),
});

export const InsightsQualityAgentStatSchema = Type.Object({
  agentAvatarUrl: Type.Optional(Type.String()),
  agentName: Type.String(),
  agentSeatId: Type.String(),
  failedSessions: Type.Number(),
  inspectionRate: Type.Number(),
  inspectedSessions: Type.Number(),
  passedSessions: Type.Number(),
  passRate: Type.Number(),
  totalSessions: Type.Number(),
});

export const InsightsQualityRuleResultSchema = Type.Object({
  passed: Type.Boolean(),
  ruleCode: Type.String(),
  ruleName: Type.String(),
});

export const InsightsQualityResultSchema = Type.Object({
  agentAvatarUrl: Type.Optional(Type.String()),
  agentName: Type.Optional(Type.String()),
  conversationId: Type.String(),
  customerAvatarUrl: Type.Optional(Type.String()),
  customerName: Type.String(),
  passed: Type.Boolean(),
  passedRules: Type.Number(),
  rules: Type.Array(InsightsQualityRuleResultSchema),
  sessionId: Type.String(),
  startedAt: Type.Number(),
  summary: Type.String(),
  totalRules: Type.Number(),
});

export const InsightsQualityOverviewResponseSchema = Type.Object({
  overview: InsightsQualityOverviewSchema,
});

export const InsightsQualityAgentStatsResponseSchema = Type.Object({
  agentStats: Type.Array(InsightsQualityAgentStatSchema),
});

export const InsightsQualityResultsResponseSchema = Type.Object({
  qualityResultsPage: Type.Object({
    page: Type.Number(),
    pageSize: Type.Number(),
    total: Type.Number(),
    totalPages: Type.Number(),
  }),
  qualityResults: Type.Array(InsightsQualityResultSchema),
});

export const InsightFollowUpItemSchema = Type.Object({
  actionItemId: Type.String(),
  conversationId: Type.String(),
  createdAt: Type.Number(),
  customerAvatarUrl: Type.Optional(Type.String()),
  customerName: Type.String(),
  priority: InsightPrioritySchema,
  sessionId: Type.String(),
  status: InsightActionStatusSchema,
  title: Type.String(),
}, { additionalProperties: false });

export const InsightsFollowUpsResponseSchema = Type.Object({
  items: Type.Array(InsightFollowUpItemSchema),
  page: Type.Number(),
  pageSize: Type.Number(),
  total: Type.Number(),
  totalPages: Type.Number(),
});

export const InsightSessionMetaSchema = Type.Object({
  agentAvatarUrl: Type.Optional(Type.String()),
  agentName: Type.Optional(Type.String()),
  conversationId: Type.String(),
  customerAvatarUrl: Type.Optional(Type.String()),
  customerName: Type.String(),
  endedAt: Type.Optional(Type.Number()),
  generatedAt: Type.Optional(Type.Number()),
  phase: Type.Optional(Type.Union([Type.Literal("live"), Type.Literal("final")])),
  sessionId: Type.String(),
  startedAt: Type.Number(),
});

export const InsightSummarySchema = Type.Object({
  sessionTitle: Type.String(),
  text: Type.String(),
});

export const InsightProblemResolutionSchema = Type.Object({
  confidence: Type.Number(),
  evidenceMessageIds: Type.Array(Type.String()),
  problemDetected: Type.Boolean(),
  problemSummary: Type.String(),
  resolutionStatus: InsightResolutionStatusSchema,
  unresolvedReason: Type.Optional(Type.String()),
});

export const InsightEvidenceItemSchema = Type.Object({
  dimensionRecordId: Type.Optional(Type.String()),
  dimensionType: Type.String(),
  evidenceRole: Type.String(),
  messageId: Type.String(),
  reason: Type.Optional(Type.String()),
});

export const InsightTagSchema = Type.Object({
  confidence: Type.Number(),
  evidenceMessageIds: Type.Array(Type.String()),
  tagId: Type.String(),
  tagName: Type.String(),
});

export const InsightSentimentSchema = Type.Object({
  confidence: Type.Number(),
  evidenceMessageIds: Type.Array(Type.String()),
  polarity: Type.Union([
    Type.Literal("positive"),
    Type.Literal("neutral"),
    Type.Literal("negative"),
    Type.Literal("mixed"),
    Type.Literal("unknown"),
  ]),
  reason: Type.String(),
});

export const InsightDetailEntitySchema = Type.Object({
  entityId: Type.String(),
  entityName: Type.String(),
  evidenceMessageIds: Type.Array(Type.String()),
  sentiment: Type.Optional(Type.String()),
});

export const InsightIntentSchema = Type.Object({
  confidence: Type.Number(),
  evidenceMessageIds: Type.Array(Type.String()),
  intentId: Type.String(),
  intentLabel: Type.String(),
});

export const InsightFaqCandidateSchema = Type.Object({
  answerHint: Type.String(),
  evidenceMessageIds: Type.Array(Type.String()),
  question: Type.String(),
  status: Type.String(),
});

export const InsightDetailActionItemSchema = Type.Object({
  actionItemId: Type.String(),
  conversationId: Type.String(),
  customerAvatarUrl: Type.Optional(Type.String()),
  customerName: Type.String(),
  evidenceMessageIds: Type.Array(Type.String()),
  priority: InsightPrioritySchema,
  sessionId: Type.String(),
  status: InsightActionStatusSchema,
  title: Type.String(),
}, { additionalProperties: false });

export const InsightCreateActionItemRequestSchema = Type.Object({
  conversationId: Type.String({ minLength: 1 }),
  dueHint: Type.Optional(Type.String()),
  priority: InsightPrioritySchema,
  sessionId: Type.String({ minLength: 1 }),
  title: Type.String({ maxLength: 255, minLength: 1 }),
}, { additionalProperties: false });

export const InsightCreateActionItemResponseSchema = Type.Object({
  actionItemId: Type.String(),
});

export const InsightDetailResponseSchema = Type.Object({
  actionItems: Type.Array(InsightDetailActionItemSchema),
  analysisStatus: Type.Optional(InsightAnalysisStatusSchema),
  currentSnapshotId: Type.Optional(Type.String()),
  entities: Type.Array(InsightDetailEntitySchema),
  evidenceItems: Type.Array(InsightEvidenceItemSchema),
  faqCandidates: Type.Array(InsightFaqCandidateSchema),
  intents: Type.Array(InsightIntentSchema),
  problemResolution: InsightProblemResolutionSchema,
  qaFindings: Type.Array(Type.Object({
    evidenceMessageIds: Type.Array(Type.String()),
    passed: Type.Boolean(),
    reason: Type.String(),
    ruleCode: Type.String(),
    ruleName: Type.String(),
  })),
  sentiment: Type.Array(InsightSentimentSchema),
  session: InsightSessionMetaSchema,
  summary: InsightSummarySchema,
  tags: Type.Array(InsightTagSchema),
}, { additionalProperties: false });

export const InsightSessionMessagesResponseSchema = Type.Object({
  messages: Type.Array(Type.Any()),
}, { additionalProperties: false });

export const InsightMessageContextRequestSchema = Type.Object({
  conversationId: Type.String({ minLength: 1 }),
  messageId: Type.String({ minLength: 1 }),
});

export const InsightMessageContextResponseSchema = Type.Object({
  contextAfter: Type.Number(),
  contextBefore: Type.Number(),
  conversationId: Type.String(),
  messages: Type.Array(Type.Any()),
  targetMessageId: Type.String(),
});

export const InsightSessionizationSettingsSchema = Type.Object({
  analysisDelayMinutes: Type.Number(),
  hardMaxDurationHours: Type.Number(),
  idleTimeoutMinutes: Type.Number(),
  lateArrivalWindowMinutes: Type.Number(),
  preset: Type.Union([
    Type.Literal("realtime_service"),
    Type.Literal("private_domain"),
    Type.Literal("custom"),
  ]),
});

export const InsightSessionizationSettingsUpdateRequestSchema =
  InsightSessionizationSettingsSchema;

export const InsightAnalysisPolicySchema = Type.Object({
  finalAnalysisEnabled: Type.Boolean(),
  liveAnalysisEnabled: Type.Boolean(),
  liveMinIntervalMinutes: Type.Number(),
  liveMinNewMeaningfulMessages: Type.Number(),
  lowConfidenceThreshold: Type.Number(),
  minAnalysisMessages: Type.Integer({ minimum: 1 }),
  ruleFallbackEnabled: Type.Boolean(),
});

export const InsightAnalysisPolicyUpdateRequestSchema =
  InsightAnalysisPolicySchema;

export const InsightFeatureConfigSchema = Type.Object({
  entityEnabled: Type.Boolean(),
  insightAvailable: Type.Optional(Type.Boolean()),
  insightEnabled: Type.Boolean(),
  intentEnabled: Type.Boolean(),
  labelEnabled: Type.Boolean(),
  lastEnableTime: Type.Optional(Type.Number()),
  qaEnabled: Type.Boolean(),
  todoEnabled: Type.Boolean(),
});

export const InsightFeatureConfigUpdateRequestSchema = Type.Object({
  entityEnabled: Type.Boolean(),
  insightEnabled: Type.Boolean(),
  intentEnabled: Type.Boolean(),
  labelEnabled: Type.Boolean(),
  qaEnabled: Type.Boolean(),
  todoEnabled: Type.Boolean(),
});

export const InsightConfigStatusSchema = Type.Union([
  Type.Literal(-1),
  Type.Literal(0),
  Type.Literal(1),
]);

export const InsightConfigActiveStatusSchema = Type.Union([
  Type.Literal(0),
  Type.Literal(1),
]);

export const InsightLabelConfigSchema = Type.Object({
  description: Type.Optional(Type.String()),
  id: Type.String(),
  labelCode: Type.String(),
  labelName: Type.String(),
  negativeExamples: Type.Optional(Type.Array(Type.String())),
  positiveExamples: Type.Optional(Type.Array(Type.String())),
  status: InsightConfigStatusSchema,
});

export const InsightLabelConfigMutationRequestSchema = Type.Object({
  description: Type.Optional(Type.String()),
  labelCode: Type.String({ minLength: 1 }),
  labelName: Type.String({ minLength: 1 }),
  negativeExamples: Type.Optional(Type.Array(Type.String())),
  positiveExamples: Type.Optional(Type.Array(Type.String())),
  status: InsightConfigActiveStatusSchema,
});

export const InsightIntentConfigSchema = Type.Object({
  description: Type.Optional(Type.String()),
  id: Type.String(),
  intentCode: Type.String(),
  intentName: Type.String(),
  negativeExamples: Type.Optional(Type.Array(Type.String())),
  positiveExamples: Type.Optional(Type.Array(Type.String())),
  status: InsightConfigStatusSchema,
  weight: Type.Number(),
}, { additionalProperties: false });

export const InsightIntentConfigMutationRequestSchema = Type.Object({
  description: Type.Optional(Type.String()),
  intentCode: Type.String({ minLength: 1 }),
  intentName: Type.String({ minLength: 1 }),
  negativeExamples: Type.Optional(Type.Array(Type.String())),
  positiveExamples: Type.Optional(Type.Array(Type.String())),
  status: InsightConfigActiveStatusSchema,
  weight: Type.Number(),
}, { additionalProperties: false });

export const InsightQaRuleConfigSchema = Type.Object({
  applicableScene: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  id: Type.String(),
  judgmentCriteria: Type.Optional(Type.String()),
  negativeExamples: Type.Optional(Type.Array(Type.String())),
  positiveExamples: Type.Optional(Type.Array(Type.String())),
  ruleCode: Type.String(),
  ruleName: Type.String(),
  severity: InsightSeveritySchema,
  status: InsightConfigStatusSchema,
});

export const InsightQaRuleConfigMutationRequestSchema = Type.Object({
  applicableScene: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  judgmentCriteria: Type.Optional(Type.String()),
  negativeExamples: Type.Optional(Type.Array(Type.String())),
  positiveExamples: Type.Optional(Type.Array(Type.String())),
  ruleCode: Type.String({ minLength: 1 }),
  ruleName: Type.String({ minLength: 1 }),
  severity: InsightSeveritySchema,
  status: InsightConfigActiveStatusSchema,
});

export const InsightEntityDictionaryItemSchema = Type.Object({
  aliases: Type.Array(Type.String()),
  attributes: Type.Optional(Type.Record(Type.String(), Type.Any())),
  entityCode: Type.String(),
  entityName: Type.String(),
  id: Type.String(),
  status: InsightConfigStatusSchema,
});

export const InsightEntityDictionaryMutationRequestSchema = Type.Object({
  aliases: Type.Array(Type.String()),
  attributes: Type.Optional(Type.Record(Type.String(), Type.Any())),
  entityCode: Type.String({ minLength: 1 }),
  entityName: Type.String({ minLength: 1 }),
  status: InsightConfigActiveStatusSchema,
});

export const InsightSettingsResponseSchema = Type.Object({
  analysisPolicy: InsightAnalysisPolicySchema,
  entityDictionary: Type.Array(InsightEntityDictionaryItemSchema),
  featureConfig: InsightFeatureConfigSchema,
  intentConfigs: Type.Array(InsightIntentConfigSchema),
  labelConfigs: Type.Array(InsightLabelConfigSchema),
  qaRuleConfigs: Type.Array(InsightQaRuleConfigSchema),
  sessionization: InsightSessionizationSettingsSchema,
});

export const InsightSettingsSummaryResponseSchema = Type.Object({
  enabledIntentCount: Type.Number(),
  intentLimit: Type.Number(),
  intentSoftLimit: Type.Number(),
  enabledLabelCount: Type.Number(),
  labelLimit: Type.Number(),
  labelSoftLimit: Type.Number(),
  enabledQaCount: Type.Number(),
  qaLimit: Type.Number(),
  qaSoftLimit: Type.Number(),
  enabledEntityCount: Type.Number(),
  entityLimit: Type.Number(),
  entitySoftLimit: Type.Number(),
  entityEnabled: Type.Boolean(),
  insightAvailable: Type.Optional(Type.Boolean()),
  insightEnabled: Type.Boolean(),
  intentEnabled: Type.Boolean(),
  labelEnabled: Type.Boolean(),
  qaEnabled: Type.Boolean(),
  todoEnabled: Type.Boolean(),
});

export const InsightsRescanRequestSchema = Type.Object(
  {
    analysisScope: InsightRescanAnalysisScopeSchema,
    from: Type.String({ minLength: 1 }),
    to: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const InsightsRescanResponseSchema = Type.Object({
  jobId: Type.String(),
  status: Type.Literal("accepted"),
  taskId: Type.String(),
});

export const InsightRescanTaskSchema = Type.Object({
  analysisScope: InsightRescanAnalysisScopeSchema,
  createTime: Type.Number(),
  createdBy: Type.Optional(Type.String()),
  failedSessions: Type.Number(),
  finishedAt: Type.Optional(Type.Number()),
  from: Type.String(),
  progressText: Type.String(),
  queuedSessions: Type.Number(),
  startedAt: Type.Optional(Type.Number()),
  status: InsightRescanTaskStatusSchema,
  succeededSessions: Type.Number(),
  taskId: Type.String(),
  to: Type.Optional(Type.String()),
  totalSessions: Type.Number(),
  updateTime: Type.Number(),
});

export const InsightRescanTaskListResponseSchema = Type.Object({
  items: Type.Array(InsightRescanTaskSchema),
  total: Type.Number(),
});

export const InsightConfigStatusUpdateRequestSchema = Type.Object({
  status: InsightConfigActiveStatusSchema,
});

export const InsightConfigDeletedResponseSchema = Type.Object({
  deleted: Type.Boolean(),
});

export type InsightActionStatus = Static<typeof InsightActionStatusSchema>;
export type InsightAnalysisStatus = Static<typeof InsightAnalysisStatusSchema>;
export type InsightMode = Static<typeof InsightModeSchema>;
export type InsightCapabilitiesResponse = Static<typeof InsightCapabilitiesResponseSchema>;
export type InsightRescanAnalysisScope = Static<typeof InsightRescanAnalysisScopeSchema>;
export type InsightRescanTaskStatus = Static<typeof InsightRescanTaskStatusSchema>;
export type InsightCreateActionItemRequest = Static<typeof InsightCreateActionItemRequestSchema>;
export type InsightCreateActionItemResponse = Static<typeof InsightCreateActionItemResponseSchema>;
export type InsightDetailResponse = Static<typeof InsightDetailResponseSchema>;
export type InsightSessionMessagesResponse = Omit<
  Static<typeof InsightSessionMessagesResponseSchema>,
  "messages"
> & {
  messages: WorkbenchMessageDto[];
};
export type InsightMessageContextRequest = Static<typeof InsightMessageContextRequestSchema>;
export type InsightMessageContextResponse = Omit<
  Static<typeof InsightMessageContextResponseSchema>,
  "messages"
> & {
  messages: WorkbenchMessageDto[];
};
export type InsightAnalysisPolicy = Static<typeof InsightAnalysisPolicySchema>;
export type InsightAnalysisPolicyUpdateRequest = Static<
  typeof InsightAnalysisPolicyUpdateRequestSchema
>;
export type InsightFeatureConfig = Static<typeof InsightFeatureConfigSchema>;
export type InsightFeatureConfigUpdateRequest = Static<
  typeof InsightFeatureConfigUpdateRequestSchema
>;
export type InsightConfigStatus = Static<typeof InsightConfigStatusSchema>;
export type InsightConfigDeletedResponse = Static<typeof InsightConfigDeletedResponseSchema>;
export type InsightConfigStatusUpdateRequest = Static<typeof InsightConfigStatusUpdateRequestSchema>;
export type InsightEntityDictionaryItem = Static<typeof InsightEntityDictionaryItemSchema>;
export type InsightEntityDictionaryMutationRequest = Static<
  typeof InsightEntityDictionaryMutationRequestSchema
>;
export type InsightLabelConfig = Static<typeof InsightLabelConfigSchema>;
export type InsightLabelConfigMutationRequest = Static<
  typeof InsightLabelConfigMutationRequestSchema
>;
export type InsightIntentConfig = Static<typeof InsightIntentConfigSchema>;
export type InsightIntentConfigMutationRequest = Static<
  typeof InsightIntentConfigMutationRequestSchema
>;
export type InsightQaRuleConfig = Static<typeof InsightQaRuleConfigSchema>;
export type InsightQaRuleConfigMutationRequest = Static<
  typeof InsightQaRuleConfigMutationRequestSchema
>;
export type InsightSettingsResponse = Static<typeof InsightSettingsResponseSchema>;
export type InsightSettingsSummaryResponse = Static<typeof InsightSettingsSummaryResponseSchema>;
export type InsightFilterOptionsResponse = Static<typeof InsightFilterOptionsResponseSchema>;
export type InsightSessionizationSettings = Static<typeof InsightSessionizationSettingsSchema>;
export type InsightSessionizationSettingsUpdateRequest = Static<
  typeof InsightSessionizationSettingsUpdateRequestSchema
>;
export type InsightsFollowUpsResponse = Static<typeof InsightsFollowUpsResponseSchema>;
export type InsightBusinessRelatedSessionsResponse = Static<
  typeof InsightBusinessRelatedSessionsResponseSchema
>;
export type InsightBusinessTopicsResponse = Static<typeof InsightBusinessTopicsResponseSchema>;
export type InsightsOverviewResponse = Static<typeof InsightsOverviewResponseSchema>;
export type InsightOverviewSessionsResponse = Static<typeof InsightOverviewSessionsResponseSchema>;
export type InsightsQualityOverviewResponse = Static<typeof InsightsQualityOverviewResponseSchema>;
export type InsightsQualityAgentStatsResponse = Static<typeof InsightsQualityAgentStatsResponseSchema>;
export type InsightsQualityResultsResponse = Static<typeof InsightsQualityResultsResponseSchema>;
export type InsightsRescanRequest = Static<typeof InsightsRescanRequestSchema>;
export type InsightsRescanResponse = Static<typeof InsightsRescanResponseSchema>;
export type InsightRescanTask = Static<typeof InsightRescanTaskSchema>;
export type InsightRescanTaskListResponse = Static<typeof InsightRescanTaskListResponseSchema>;
