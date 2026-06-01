import { Type, type Static } from "@sinclair/typebox";
import type { WorkbenchMessageDto } from "../chat/dto.js";

export const InsightAnalysisStatusSchema = Type.Union([
  Type.Literal("ready"),
  Type.Literal("analyzing"),
  Type.Literal("failed"),
  Type.Literal("stale"),
  Type.Literal("partial"),
]);

export const InsightActionStatusSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("done"),
  Type.Literal("dismissed"),
  Type.Literal("expired"),
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

export const InsightEvidenceMessageContextSchema = Type.Object({
  contentText: Type.String(),
  contentType: Type.String(),
  messageId: Type.String(),
  msgtime: Type.Number(),
  senderName: Type.Optional(Type.String()),
  senderRole: Type.Union([
    Type.Literal("customer"),
    Type.Literal("agent"),
    Type.Literal("system"),
    Type.Literal("bot"),
    Type.Literal("unknown"),
  ]),
});

export const InsightEntityHotspotSchema = Type.Object({
  entityId: Type.String(),
  entityName: Type.String(),
  entityType: Type.String(),
  mentionCount: Type.Number(),
  negativeCount: Type.Number(),
  riskSessionCount: Type.Number(),
  sessionCount: Type.Number(),
});

export const InsightIntentCountSchema = Type.Object({
  count: Type.Number(),
  intentCode: Type.String(),
  intentLabel: Type.String(),
});

export const InsightOverviewTotalsSchema = Type.Object({
  agentMessages: Type.Number(),
  consultingCustomers: Type.Number(),
  customerMessages: Type.Number(),
  logicalSessions: Type.Number(),
  messages: Type.Number(),
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
  agentAvatarUrl: Type.Optional(Type.String()),
  agentMessageCount: Type.Number(),
  agentName: Type.Optional(Type.String()),
  analysisStatus: InsightAnalysisStatusSchema,
  conversationId: Type.String(),
  customerAvatarUrl: Type.Optional(Type.String()),
  customerMessageCount: Type.Number(),
  customerName: Type.String(),
  endedAt: Type.Optional(Type.Number()),
  lastMessageAt: Type.Optional(Type.Number()),
  messageCount: Type.Number(),
  problemSummary: Type.Optional(Type.String()),
  resolutionStatus: InsightResolutionStatusSchema,
  sessionId: Type.String(),
  startedAt: Type.Number(),
  summaryCustomerIntent: Type.String(),
});

export const InsightsOverviewResponseSchema = Type.Object({
  actionItemsOpen: Type.Number(),
  analysis: Type.Object({
    failed: Type.Number(),
    partial: Type.Number(),
    ready: Type.Number(),
    stale: Type.Number(),
  }),
  entityHotspots: Type.Array(InsightEntityHotspotSchema),
  highRiskSessions: Type.Number(),
  intentDistribution: Type.Array(InsightIntentCountSchema),
  negativeSessions: Type.Number(),
  problemSessions: Type.Number(),
  readySessions: Type.Number(),
  sessions: Type.Array(InsightOverviewSessionItemSchema),
  totalSessions: Type.Number(),
  totals: InsightOverviewTotalsSchema,
  trend: Type.Array(InsightOverviewTrendPointSchema),
  unresolvedSessions: Type.Number(),
});

export const InsightsQualityOverviewSchema = Type.Object({
  analyzedSessions: Type.Number(),
  noCustomerProblem: Type.Number(),
  partial: Type.Number(),
  problemSessions: Type.Number(),
  resolved: Type.Number(),
  totalSessions: Type.Number(),
  unresolved: Type.Number(),
});

export const InsightsQualityAgentStatSchema = Type.Object({
  agentAvatarUrl: Type.Optional(Type.String()),
  agentName: Type.String(),
  agentSeatId: Type.String(),
  partial: Type.Number(),
  problemSessions: Type.Number(),
  resolved: Type.Number(),
  totalSessions: Type.Number(),
  unresolved: Type.Number(),
  unresolvedRate: Type.Number(),
});

export const InsightsUnresolvedReasonSchema = Type.Object({
  count: Type.Number(),
  reasonCode: Type.String(),
  reasonLabel: Type.String(),
});

export const InsightsUnresolvedSessionSchema = Type.Object({
  agentAvatarUrl: Type.Optional(Type.String()),
  agentName: Type.Optional(Type.String()),
  conversationId: Type.String(),
  customerAvatarUrl: Type.Optional(Type.String()),
  customerName: Type.String(),
  evidenceMessageIds: Type.Array(Type.String()),
  lastCustomerMessageAt: Type.Optional(Type.Number()),
  problemSummary: Type.String(),
  resolutionStatus: InsightResolutionStatusSchema,
  sessionId: Type.String(),
  severity: InsightSeveritySchema,
  unresolvedReason: Type.String(),
});

export const InsightsQualityResponseSchema = Type.Object({
  agentStats: Type.Array(InsightsQualityAgentStatSchema),
  overview: InsightsQualityOverviewSchema,
  unresolvedReasons: Type.Array(InsightsUnresolvedReasonSchema),
  unresolvedSessions: Type.Array(InsightsUnresolvedSessionSchema),
});

export const InsightFollowUpItemSchema = Type.Object({
  actionItemId: Type.String(),
  actionType: Type.String(),
  conversationId: Type.String(),
  customerAvatarUrl: Type.Optional(Type.String()),
  customerName: Type.String(),
  evidenceMessageIds: Type.Array(Type.String()),
  lastCustomerMessageAt: Type.Optional(Type.Number()),
  priority: InsightPrioritySchema,
  reason: Type.String(),
  sessionId: Type.String(),
  status: InsightActionStatusSchema,
  title: Type.String(),
});

export const InsightsFollowUpsResponseSchema = Type.Object({
  items: Type.Array(InsightFollowUpItemSchema),
  total: Type.Number(),
});

export const InsightSessionMetaSchema = Type.Object({
  agentAvatarUrl: Type.Optional(Type.String()),
  agentName: Type.Optional(Type.String()),
  conversationId: Type.String(),
  customerAvatarUrl: Type.Optional(Type.String()),
  customerName: Type.String(),
  endedAt: Type.Optional(Type.Number()),
  phase: Type.Union([Type.Literal("live"), Type.Literal("final")]),
  sessionId: Type.String(),
  startedAt: Type.Number(),
});

export const InsightSummarySchema = Type.Object({
  customerIntent: Type.String(),
  followUp: Type.Optional(Type.String()),
  processSummary: Type.String(),
  resultSummary: Type.String(),
});

export const InsightProblemResolutionSchema = Type.Object({
  confidence: Type.Number(),
  evidenceMessageIds: Type.Array(Type.String()),
  problemDetected: Type.Boolean(),
  problemSummary: Type.String(),
  resolutionStatus: InsightResolutionStatusSchema,
  unresolvedReason: Type.Optional(Type.String()),
});

export const InsightTagSchema = Type.Object({
  confidence: Type.Number(),
  evidenceMessageIds: Type.Array(Type.String()),
  tagCode: Type.String(),
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
  entityType: Type.String(),
  evidenceMessageIds: Type.Array(Type.String()),
  sentiment: Type.Optional(Type.String()),
});

export const InsightIntentSchema = Type.Object({
  confidence: Type.Number(),
  evidenceMessageIds: Type.Array(Type.String()),
  intentCode: Type.String(),
  intentLabel: Type.String(),
});

export const InsightFaqCandidateSchema = Type.Object({
  answerHint: Type.String(),
  evidenceMessageIds: Type.Array(Type.String()),
  question: Type.String(),
  status: Type.String(),
});

export const InsightDetailResponseSchema = Type.Object({
  actionItems: Type.Array(InsightFollowUpItemSchema),
  analysisStatus: InsightAnalysisStatusSchema,
  currentSnapshotId: Type.String(),
  entities: Type.Array(InsightDetailEntitySchema),
  evidenceMessageRecords: Type.Array(Type.Any()),
  evidenceMessages: Type.Array(InsightEvidenceMessageContextSchema),
  faqCandidates: Type.Array(InsightFaqCandidateSchema),
  intents: Type.Array(InsightIntentSchema),
  problemResolution: InsightProblemResolutionSchema,
  qaFindings: Type.Array(Type.Object({
    evidenceMessageIds: Type.Array(Type.String()),
    passed: Type.Boolean(),
    reason: Type.String(),
    ruleCode: Type.String(),
  })),
  risks: Type.Array(Type.Object({
    evidenceMessageIds: Type.Array(Type.String()),
    reason: Type.String(),
    riskLevel: InsightSeveritySchema,
    riskType: Type.String(),
  })),
  sentiment: Type.Array(InsightSentimentSchema),
  session: InsightSessionMetaSchema,
  summary: InsightSummarySchema,
  tags: Type.Array(InsightTagSchema),
});

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
  ruleFallbackEnabled: Type.Boolean(),
});

export const InsightAnalysisPolicyUpdateRequestSchema =
  InsightAnalysisPolicySchema;

export const InsightLabelConfigSchema = Type.Object({
  description: Type.Optional(Type.String()),
  enabled: Type.Boolean(),
  id: Type.String(),
  includeInStatistics: Type.Boolean(),
  labelCode: Type.String(),
  labelName: Type.String(),
  negativeExamples: Type.Optional(Type.Array(Type.String())),
  positiveExamples: Type.Optional(Type.Array(Type.String())),
});

export const InsightLabelConfigMutationRequestSchema = Type.Object({
  description: Type.Optional(Type.String()),
  enabled: Type.Boolean(),
  includeInStatistics: Type.Boolean(),
  labelCode: Type.String({ minLength: 1 }),
  labelName: Type.String({ minLength: 1 }),
  negativeExamples: Type.Optional(Type.Array(Type.String())),
  positiveExamples: Type.Optional(Type.Array(Type.String())),
});

export const InsightQaRuleConfigSchema = Type.Object({
  applicableScene: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  enabled: Type.Boolean(),
  id: Type.String(),
  judgmentCriteria: Type.Optional(Type.String()),
  negativeExamples: Type.Optional(Type.Array(Type.String())),
  positiveExamples: Type.Optional(Type.Array(Type.String())),
  ruleCode: Type.String(),
  ruleName: Type.String(),
  severity: InsightSeveritySchema,
});

export const InsightQaRuleConfigMutationRequestSchema = Type.Object({
  applicableScene: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  enabled: Type.Boolean(),
  judgmentCriteria: Type.Optional(Type.String()),
  negativeExamples: Type.Optional(Type.Array(Type.String())),
  positiveExamples: Type.Optional(Type.Array(Type.String())),
  ruleCode: Type.String({ minLength: 1 }),
  ruleName: Type.String({ minLength: 1 }),
  severity: InsightSeveritySchema,
});

export const InsightRiskConfigSchema = Type.Object({
  description: Type.Optional(Type.String()),
  enabled: Type.Boolean(),
  id: Type.String(),
  keywords: Type.Optional(Type.Array(Type.String())),
  priorityBoost: Type.Number(),
  riskCode: Type.String(),
  riskName: Type.String(),
  severity: InsightSeveritySchema,
  unresolvedTimeoutMinutes: Type.Optional(Type.Number()),
});

export const InsightRiskConfigMutationRequestSchema = Type.Object({
  description: Type.Optional(Type.String()),
  enabled: Type.Boolean(),
  keywords: Type.Optional(Type.Array(Type.String())),
  priorityBoost: Type.Number(),
  riskCode: Type.String({ minLength: 1 }),
  riskName: Type.String({ minLength: 1 }),
  severity: InsightSeveritySchema,
  unresolvedTimeoutMinutes: Type.Optional(Type.Number()),
});

export const InsightEntityDictionaryItemSchema = Type.Object({
  aliases: Type.Array(Type.String()),
  attributes: Type.Optional(Type.Record(Type.String(), Type.Any())),
  canonicalName: Type.String(),
  enabled: Type.Boolean(),
  entityType: Type.String(),
  id: Type.String(),
  includeInAggregation: Type.Boolean(),
});

export const InsightEntityDictionaryMutationRequestSchema = Type.Object({
  aliases: Type.Array(Type.String()),
  attributes: Type.Optional(Type.Record(Type.String(), Type.Any())),
  canonicalName: Type.String({ minLength: 1 }),
  enabled: Type.Boolean(),
  entityType: Type.String({ minLength: 1 }),
  includeInAggregation: Type.Boolean(),
});

export const InsightSettingsResponseSchema = Type.Object({
  analysisPolicy: InsightAnalysisPolicySchema,
  entityDictionary: Type.Array(InsightEntityDictionaryItemSchema),
  labelConfigs: Type.Array(InsightLabelConfigSchema),
  qaRuleConfigs: Type.Array(InsightQaRuleConfigSchema),
  riskConfigs: Type.Array(InsightRiskConfigSchema),
  sessionization: InsightSessionizationSettingsSchema,
});

export const InsightsRescanRequestSchema = Type.Object({
  from: Type.String({ minLength: 1 }),
});

export const InsightsRescanResponseSchema = Type.Object({
  jobId: Type.String(),
  status: Type.Literal("accepted"),
});

export const InsightConfigStatusUpdateRequestSchema = Type.Object({
  enabled: Type.Boolean(),
});

export const InsightConfigDeletedResponseSchema = Type.Object({
  deleted: Type.Boolean(),
});

export type InsightActionStatus = Static<typeof InsightActionStatusSchema>;
export type InsightAnalysisStatus = Static<typeof InsightAnalysisStatusSchema>;
export type InsightDetailResponse = Omit<
  Static<typeof InsightDetailResponseSchema>,
  "evidenceMessageRecords"
> & {
  evidenceMessageRecords: WorkbenchMessageDto[];
};
export type InsightEvidenceMessageContext = Static<
  typeof InsightEvidenceMessageContextSchema
>;
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
export type InsightQaRuleConfig = Static<typeof InsightQaRuleConfigSchema>;
export type InsightQaRuleConfigMutationRequest = Static<
  typeof InsightQaRuleConfigMutationRequestSchema
>;
export type InsightRiskConfig = Static<typeof InsightRiskConfigSchema>;
export type InsightRiskConfigMutationRequest = Static<
  typeof InsightRiskConfigMutationRequestSchema
>;
export type InsightSettingsResponse = Static<typeof InsightSettingsResponseSchema>;
export type InsightSessionizationSettings = Static<typeof InsightSessionizationSettingsSchema>;
export type InsightSessionizationSettingsUpdateRequest = Static<
  typeof InsightSessionizationSettingsUpdateRequestSchema
>;
export type InsightsFollowUpsResponse = Static<typeof InsightsFollowUpsResponseSchema>;
export type InsightsOverviewResponse = Static<typeof InsightsOverviewResponseSchema>;
export type InsightsQualityResponse = Static<typeof InsightsQualityResponseSchema>;
export type InsightsRescanRequest = Static<typeof InsightsRescanRequestSchema>;
export type InsightsRescanResponse = Static<typeof InsightsRescanResponseSchema>;
