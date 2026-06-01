import { Type, type Static } from "@sinclair/typebox";

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
  totalSessions: Type.Number(),
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
  agentName: Type.Optional(Type.String()),
  conversationId: Type.String(),
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
  conversationId: Type.String(),
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

export const InsightDetailResponseSchema = Type.Object({
  actionItems: Type.Array(Type.Any()),
  analysisStatus: InsightAnalysisStatusSchema,
  currentSnapshotId: Type.String(),
  entities: Type.Array(Type.Any()),
  evidenceMessages: Type.Array(InsightEvidenceMessageContextSchema),
  faqCandidates: Type.Array(Type.Any()),
  intents: Type.Array(Type.Any()),
  problemResolution: InsightProblemResolutionSchema,
  qaFindings: Type.Array(Type.Any()),
  risks: Type.Array(Type.Any()),
  sentiment: Type.Array(Type.Any()),
  session: InsightSessionMetaSchema,
  summary: InsightSummarySchema,
  tags: Type.Array(Type.Any()),
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

export const InsightAnalysisPolicySchema = Type.Object({
  finalAnalysisEnabled: Type.Boolean(),
  liveAnalysisEnabled: Type.Boolean(),
  liveMinIntervalMinutes: Type.Number(),
  liveMinNewMeaningfulMessages: Type.Number(),
  lowConfidenceThreshold: Type.Number(),
  ruleFallbackEnabled: Type.Boolean(),
});

export const InsightLabelConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  includeInStatistics: Type.Boolean(),
  labelCode: Type.String(),
  labelName: Type.String(),
});

export const InsightQaRuleConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  ruleCode: Type.String(),
  ruleName: Type.String(),
  severity: InsightSeveritySchema,
});

export const InsightRiskConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  priorityBoost: Type.Number(),
  riskCode: Type.String(),
  riskName: Type.String(),
  severity: InsightSeveritySchema,
});

export const InsightEntityDictionaryItemSchema = Type.Object({
  aliases: Type.Array(Type.String()),
  canonicalName: Type.String(),
  enabled: Type.Boolean(),
  entityType: Type.String(),
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

export type InsightActionStatus = Static<typeof InsightActionStatusSchema>;
export type InsightAnalysisStatus = Static<typeof InsightAnalysisStatusSchema>;
export type InsightDetailResponse = Static<typeof InsightDetailResponseSchema>;
export type InsightSettingsResponse = Static<typeof InsightSettingsResponseSchema>;
export type InsightsFollowUpsResponse = Static<typeof InsightsFollowUpsResponseSchema>;
export type InsightsOverviewResponse = Static<typeof InsightsOverviewResponseSchema>;
export type InsightsQualityResponse = Static<typeof InsightsQualityResponseSchema>;
export type InsightsRescanRequest = Static<typeof InsightsRescanRequestSchema>;
export type InsightsRescanResponse = Static<typeof InsightsRescanResponseSchema>;
