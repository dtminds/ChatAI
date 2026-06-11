import type {
  AccountRole,
  InsightActionStatus,
  InsightAnalysisStatus,
  InsightAnalysisPolicy,
  InsightAnalysisPolicyUpdateRequest,
  InsightOverviewSessionsQuery,
  InsightOverviewSessionsResponse,
  InsightBusinessRelatedSessionsResponse,
  InsightBusinessTopicsResponse,
  InsightOverviewQuery,
  InsightConfigDeletedResponse,
  InsightConfigStatus,
  InsightConfigStatusUpdateRequest,
  InsightCreateActionItemRequest,
  InsightCreateActionItemResponse,
  InsightDetailResponse,
  InsightEntityDictionaryItem,
  InsightEntityDictionaryMutationRequest,
  InsightFeatureConfig,
  InsightFeatureConfigUpdateRequest,
  InsightFilterOptionsResponse,
  InsightIntentConfig,
  InsightIntentConfigMutationRequest,
  InsightLabelConfig,
  InsightLabelConfigMutationRequest,
  InsightSessionMessagesResponse,
  InsightMessageContextResponse,
  InsightQaRuleConfig,
  InsightQaRuleConfigMutationRequest,
  InsightRescanAnalysisScope,
  InsightRescanTaskListResponse,
  InsightSettingsResponse,
  InsightSettingsSummaryResponse,
  InsightSessionizationSettings,
  InsightSessionizationSettingsUpdateRequest,
  InsightsFollowUpsResponse,
  InsightsOverviewResponse,
  InsightsQualityAgentStatsResponse,
  InsightsQualityOverviewResponse,
  InsightsQualityResultsResponse,
  InsightsRescanRequest,
  InsightsRescanResponse,
  WorkbenchMessageDto,
} from "@chatai/contracts";
import {
  SYSTEM_PRESET_ENTITY_DICTIONARY,
  SYSTEM_PRESET_INTENT_CONFIGS,
  SYSTEM_PRESET_LABEL_CONFIGS,
  SYSTEM_PRESET_QA_RULE_CONFIGS,
  systemPresetCodePrefix,
} from "./insights-seeds.js";
import {
  BadRequestError,
  BusinessError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors.js";

type InsightConfigLimitType = "entityDictionary" | "intentConfigs" | "labelConfigs" | "qaRuleConfigs";

type InsightConfigLimitRule = {
  hardLimit: number;
  softLimit: number;
};

type InsightConfigIdentity =
  | InsightEntityDictionaryItem
  | InsightIntentConfig
  | InsightLabelConfig
  | InsightQaRuleConfig;

export type InsightsUidScope = {
  uid: number;
};

type InsightResolutionStatus = InsightDetailResponse["problemResolution"]["resolutionStatus"];

type InsightSeverity = InsightDetailResponse["qaFindings"][number] extends never
  ? "low" | "medium" | "high"
  : "low" | "medium" | "high";

export type InsightCurrentSessionRow = {
  actionOpenCount: number;
  agentAvatarUrl: string | null;
  agentName: string | null;
  agentSeatId: string | null;
  analysisStatus: InsightAnalysisStatus;
  conversationId: string;
  currentSnapshotId?: string;
  customerAvatarUrl: string | null;
  customerName: string;
  endedAt: number | null;
  entities?: Array<Pick<InsightDetailResponse["entities"][number], "entityId" | "entityName">>;
  generatedAt?: number;
  intents?: Array<Pick<InsightDetailResponse["intents"][number], "intentId" | "intentLabel">>;
  lastMessageAt: number | null;
  lastCustomerMessageAt: number | null;
  phase?: InsightDetailResponse["session"]["phase"];
  problemDetected: boolean;
  problemEvidenceMessageIds: string[];
  problemResolutionConfidence?: number;
  problemSummary: string;
  resolutionStatus: InsightResolutionStatus;
  sessionId: string;
  startedAt: number;
  summarySessionTitle: string;
  summaryText: string;
  sourceMessageHighWatermark?: string | null;
  tags?: Array<Pick<InsightDetailResponse["tags"][number], "tagId" | "tagName">>;
  thirdExternalUserId: string;
  thirdUserId: string;
  unresolvedReason: string | null;
};

export type InsightActionItemRow = InsightsFollowUpsResponse["items"][number] & {
  thirdExternalUserId?: string;
};

export type InsightDetailActionItemRow = InsightDetailResponse["actionItems"][number] & {
  resolutionStatus?: InsightResolutionStatus;
  thirdExternalUserId?: string;
};

export type InsightDetailRow = {
  actionItems: InsightDetailActionItemRow[];
  current: InsightCurrentSessionRow;
  entities: InsightDetailResponse["entities"];
  evidenceItems: InsightDetailResponse["evidenceItems"];
  faqCandidates: InsightDetailResponse["faqCandidates"];
  intents: InsightDetailResponse["intents"];
  problemEvidenceMessageIds: string[];
  qaFindingDetails?: Array<InsightDetailResponse["qaFindings"][number] & {
    ruleName: string;
    severity: InsightSeverity;
  }>;
  qaFindings: InsightDetailResponse["qaFindings"];
  sentiment: InsightDetailResponse["sentiment"];
  tags: InsightDetailResponse["tags"];
};

export type InsightsFollowUpFilters = {
  from?: string;
  page?: number;
  pageSize?: number;
  priority?: InsightActionItemRow["priority"];
  status?: InsightActionStatus | "processed";
  to?: string;
};

export type InsightsQualityFilters = {
  from?: string;
  page?: number;
  pageSize?: number;
  passed?: boolean;
  to?: string;
};

export type InsightsOverviewFilters = {
  analysisStatus?: InsightOverviewSessionsQuery["analysisStatus"];
  entityId?: string;
  from?: string;
  intentId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  problemScope?: InsightOverviewSessionsQuery["problemScope"];
  resolutionStatus?: InsightOverviewSessionsQuery["resolutionStatus"];
  sessionIds?: string[];
  tagId?: string;
  to?: string;
};

export type InsightsBusinessTopicFilters = InsightsOverviewFilters & {
  dimension: InsightBusinessTopicsResponse["dimension"];
};

export type InsightOverviewSessionFilters = {
  analysisStatus?: InsightOverviewSessionsQuery["analysisStatus"];
  entityId?: string;
  from?: string;
  intentId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  problemScope?: InsightOverviewSessionsQuery["problemScope"];
  resolutionStatus?: InsightOverviewSessionsQuery["resolutionStatus"];
  sessionIds?: string[];
  tagId?: string;
  to?: string;
};

export type InsightsBusinessRelatedSessionFilters = Pick<InsightsOverviewFilters, "from" | "page" | "pageSize" | "to"> & {
  dimension: InsightBusinessTopicsResponse["dimension"];
  topicCode: string;
};

export type InsightRescanTaskRow = {
  analysisScope: InsightRescanAnalysisScope;
  createTime: number;
  createdBy?: string;
  failedSessions: number;
  finishedAt?: number;
  from: string;
  queuedSessions: number;
  startedAt?: number;
  status: InsightRescanTaskListResponse["items"][number]["status"];
  succeededSessions: number;
  taskId: string;
  to?: string;
  totalSessions: number;
  updateTime: number;
};

export type InsightCurrentSessionPage = {
  items: InsightCurrentSessionRow[];
  total: number;
};

export type InsightOverviewAggregateRow = Omit<
  InsightsOverviewResponse,
  "comparison" | "sessions"
>;

export type InsightBusinessTopicAnalytics = Pick<
  InsightBusinessTopicsResponse,
  "intentTrend" | "topics" | "totals" | "trend"
>;

export type InsightQualityAggregateRow = InsightsQualityOverviewResponse["overview"];

export type InsightQualityAgentStatRow = InsightsQualityAgentStatsResponse["agentStats"][number];

export type InsightQualityResultRow = InsightsQualityResultsResponse["qualityResults"][number];

export type InsightQualityResultPage = {
  items: InsightQualityResultRow[];
  total: number;
};

export type InsightActionItemPage = {
  items: InsightActionItemRow[];
  total: number;
};

export type InsightsRepositoryPort = {
  createRescanJob(
    scope: InsightsUidScope,
    input: {
      analysisScope: InsightRescanAnalysisScope;
      createdBy?: string;
      from: Date;
      to: Date;
    },
    idempotencyKey: string,
  ): Promise<{ jobId: string; taskId: string }>;
  findDetail(scope: InsightsUidScope, sessionId: string): Promise<InsightDetailRow | undefined>;
  hasSession(scope: InsightsUidScope, sessionId: string): Promise<boolean>;
  listActionItemsPage(
    scope: InsightsUidScope,
    filters?: InsightsFollowUpFilters,
  ): Promise<InsightActionItemPage>;
  listCurrentSessions(
    scope: InsightsUidScope,
    filters?: InsightsOverviewFilters,
  ): Promise<InsightCurrentSessionPage>;
  listAllCurrentSessions(
    scope: InsightsUidScope,
    filters?: InsightsOverviewFilters,
  ): Promise<InsightCurrentSessionRow[]>;
  getQualityAggregate?(
    scope: InsightsUidScope,
    filters?: { from?: string; to?: string },
  ): Promise<InsightQualityAggregateRow>;
  listQualityAgentStats?(
    scope: InsightsUidScope,
    filters?: { from?: string; to?: string },
  ): Promise<InsightQualityAgentStatRow[]>;
  listQualityResults?(
    scope: InsightsUidScope,
    filters?: InsightsQualityFilters,
  ): Promise<InsightQualityResultPage>;
  getQaFindingAggregate?(
    scope: InsightsUidScope,
    filters?: { from?: string; to?: string },
  ): Promise<{
    ruleDistribution: Array<{ count: number; ruleCode: string; ruleName: string }>;
  }>;
  getOverviewAggregate(
    scope: InsightsUidScope,
    filters?: InsightsOverviewFilters,
  ): Promise<InsightOverviewAggregateRow>;
  getBusinessTopicAnalytics?(
    scope: InsightsUidScope,
    filters: InsightsBusinessTopicFilters,
  ): Promise<InsightBusinessTopicAnalytics>;
  listBusinessRelatedSessions?(
    scope: InsightsUidScope,
    filters: InsightsBusinessRelatedSessionFilters,
  ): Promise<InsightCurrentSessionPage>;
  hasActiveRescanTask(scope: InsightsUidScope): Promise<boolean>;
  listRescanTasks(
    scope: InsightsUidScope,
    filters: { limit: number; offset: number },
  ): Promise<{ items: InsightRescanTaskRow[]; total: number }>;
  listSessionMessageRecords(
    scope: InsightsUidScope,
    sessionId: string,
  ): Promise<WorkbenchMessageDto[] | undefined>;
  listMessageContext(
    scope: InsightsUidScope,
    conversationId: string,
    messageId: string,
    options: { after: number; before: number },
  ): Promise<InsightMessageContextResponse>;
  updateActionStatus(
    scope: InsightsUidScope,
    actionItemId: string,
    status: Extract<InsightActionStatus, "done" | "dismissed" | "open">,
  ): Promise<boolean>;
  createActionItem(
    scope: InsightsUidScope,
    input: InsightCreateActionItemRequest & { createdBySubUserId?: string },
  ): Promise<InsightCreateActionItemResponse>;
  validateActionItemTarget(
    scope: InsightsUidScope,
    input: Pick<InsightCreateActionItemRequest, "conversationId" | "sessionId">,
  ): Promise<boolean>;
  getSettings(scope: InsightsUidScope): Promise<InsightSettingsResponse>;
  getFilterOptions(scope: InsightsUidScope): Promise<InsightFilterOptionsResponse>;
  getSettingsSummary(scope: InsightsUidScope): Promise<InsightSettingsSummaryResponse>;
  getPolicySettings(scope: InsightsUidScope): Promise<{
    analysisPolicy: InsightAnalysisPolicy;
    sessionization: InsightSessionizationSettings;
  }>;
  getFeatureConfig(scope: InsightsUidScope): Promise<InsightFeatureConfig>;
  listIntentConfigs(scope: InsightsUidScope): Promise<InsightIntentConfig[]>;
  listLabelConfigs(scope: InsightsUidScope): Promise<InsightLabelConfig[]>;
  listQaRuleConfigs(scope: InsightsUidScope): Promise<InsightQaRuleConfig[]>;
  listEntityDictionary(scope: InsightsUidScope): Promise<InsightEntityDictionaryItem[]>;
  countEnabledConfigs(scope: InsightsUidScope, configType: InsightConfigLimitType): Promise<number>;
  countActiveConfigs(scope: InsightsUidScope, configType: InsightConfigLimitType): Promise<number>;
  upsertFeatureConfig(
    scope: InsightsUidScope,
    payload: InsightFeatureConfigUpdateRequest,
  ): Promise<InsightFeatureConfig>;
  upsertAnalysisPolicy(
    scope: InsightsUidScope,
    payload: InsightAnalysisPolicyUpdateRequest,
  ): Promise<InsightAnalysisPolicy>;
  upsertSessionizationSettings(
    scope: InsightsUidScope,
    payload: InsightSessionizationSettingsUpdateRequest,
  ): Promise<InsightSessionizationSettings>;
  createIntentConfig(
    scope: InsightsUidScope,
    payload: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig>;
  activatePresetIntentConfig(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig>;
  updateIntentConfig(
    scope: InsightsUidScope,
    id: string,
    payload: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig | undefined>;
  updateIntentConfigStatus(
    scope: InsightsUidScope,
    id: string,
    status: Exclude<InsightConfigStatus, -1>,
  ): Promise<InsightIntentConfig | undefined>;
  deleteIntentConfig(scope: InsightsUidScope, id: string): Promise<boolean>;
  createLabelConfig(
    scope: InsightsUidScope,
    payload: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig>;
  activatePresetLabelConfig(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig>;
  updateLabelConfig(
    scope: InsightsUidScope,
    id: string,
    payload: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig | undefined>;
  updateLabelConfigStatus(
    scope: InsightsUidScope,
    id: string,
    status: Exclude<InsightConfigStatus, -1>,
  ): Promise<InsightLabelConfig | undefined>;
  deleteLabelConfig(scope: InsightsUidScope, id: string): Promise<boolean>;
  createQaRuleConfig(
    scope: InsightsUidScope,
    payload: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig>;
  activatePresetQaRuleConfig(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig>;
  updateQaRuleConfig(
    scope: InsightsUidScope,
    id: string,
    payload: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig | undefined>;
  updateQaRuleConfigStatus(
    scope: InsightsUidScope,
    id: string,
    status: Exclude<InsightConfigStatus, -1>,
  ): Promise<InsightQaRuleConfig | undefined>;
  deleteQaRuleConfig(scope: InsightsUidScope, id: string): Promise<boolean>;
  createEntityDictionaryItem(
    scope: InsightsUidScope,
    payload: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem>;
  activatePresetEntityDictionaryItem(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem>;
  updateEntityDictionaryItem(
    scope: InsightsUidScope,
    id: string,
    payload: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem | undefined>;
  updateEntityDictionaryItemStatus(
    scope: InsightsUidScope,
    id: string,
    status: Exclude<InsightConfigStatus, -1>,
  ): Promise<InsightEntityDictionaryItem | undefined>;
  deleteEntityDictionaryItem(scope: InsightsUidScope, id: string): Promise<boolean>;
};

const analysisStatuses: InsightAnalysisStatus[] = [
  "ready",
  "partial",
  "failed",
  "stale",
];

const defaultMessageContextSize = 30;
const defaultOverviewPageSize = 20;
const maxOverviewPageSize = 100;
const defaultOverviewRangeDays = 30;
const insightConfigLimitRules: Record<InsightConfigLimitType, InsightConfigLimitRule> = {
  entityDictionary: { hardLimit: 20, softLimit: 15 },
  intentConfigs: { hardLimit: 15, softLimit: 12 },
  labelConfigs: { hardLimit: 20, softLimit: 15 },
  qaRuleConfigs: { hardLimit: 10, softLimit: 8 },
};
const insightConfigTotalLimit = 50;

export class InsightsService {
  constructor(private readonly repository: InsightsRepositoryPort) {}

  async getOverview(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters = {},
  ): Promise<InsightsOverviewResponse> {
    const boundedFilters = withDefaultOverviewDateRange(filters);
    const aggregateFilters = {
      from: boundedFilters.from,
      to: boundedFilters.to,
    };
    const comparisonFilters = getPreviousOverviewDateRange(aggregateFilters);
    const [aggregate, previousAggregate] = await Promise.all([
      this.repository.getOverviewAggregate(scope, aggregateFilters),
      this.repository.getOverviewAggregate(scope, comparisonFilters),
    ]);

    return {
      ...aggregate,
      comparison: buildOverviewComparison(aggregate.totals, previousAggregate.totals),
    };
  }

  async getOverviewSessions(
    scope: InsightsUidScope,
    filters: InsightOverviewSessionFilters = {},
  ): Promise<InsightOverviewSessionsResponse> {
    const normalizedPage = normalizeOverviewPage(filters.page);
    const normalizedPageSize = normalizeOverviewPageSize(filters.pageSize);
    const boundedFilters = withDefaultOverviewDateRange(filters);
    const normalizedFilters = {
      ...boundedFilters,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
    const sessions = await this.repository.listCurrentSessions(scope, normalizedFilters);

    return {
      items: buildOverviewSessions(sessions.items),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total: sessions.total,
      totalPages: Math.max(1, Math.ceil(sessions.total / normalizedPageSize)),
    };
  }

  async getQualityOverview(
    scope: InsightsUidScope,
    filters: Pick<InsightsQualityFilters, "from" | "to"> = {},
  ): Promise<InsightsQualityOverviewResponse> {
    const boundedFilters = withDefaultOverviewDateRange(filters);
    const [overview, qaAggregate] = await Promise.all([
      this.repository.getQualityAggregate?.(scope, { from: boundedFilters.from, to: boundedFilters.to }),
      this.repository.getQaFindingAggregate?.(scope, { from: boundedFilters.from, to: boundedFilters.to }),
    ]);
    const baseOverview = overview ?? buildQualityOverview([]);

    return {
      overview: {
        ...baseOverview,
        ruleDistribution: qaAggregate?.ruleDistribution ?? baseOverview.ruleDistribution,
      },
    };
  }

  async getQualityAgentStats(
    scope: InsightsUidScope,
    filters: Pick<InsightsQualityFilters, "from" | "to"> = {},
  ): Promise<InsightsQualityAgentStatsResponse> {
    const boundedFilters = withDefaultOverviewDateRange(filters);

    return {
      agentStats: await this.repository.listQualityAgentStats?.(scope, {
        from: boundedFilters.from,
        to: boundedFilters.to,
      }) ?? [],
    };
  }

  async getQualityResults(
    scope: InsightsUidScope,
    filters: InsightsQualityFilters = {},
  ): Promise<InsightsQualityResultsResponse> {
    const normalizedPage = normalizeOverviewPage(filters.page);
    const normalizedPageSize = normalizeOverviewPageSize(filters.pageSize);
    const boundedFilters = withDefaultOverviewDateRange(filters);
    const qualityResultsPage = await (this.repository.listQualityResults
      ? this.repository.listQualityResults(scope, {
        from: boundedFilters.from,
        page: normalizedPage,
        pageSize: normalizedPageSize,
        passed: boundedFilters.passed,
        to: boundedFilters.to,
      })
      : Promise.resolve({ items: [], total: 0 }));

    return {
      qualityResultsPage: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total: qualityResultsPage.total,
        totalPages: Math.max(1, Math.ceil(qualityResultsPage.total / normalizedPageSize)),
      },
      qualityResults: qualityResultsPage.items,
    };
  }

  async getBusinessTopics(
    scope: InsightsUidScope,
    filters: InsightsBusinessTopicFilters,
  ): Promise<InsightBusinessTopicsResponse> {
    const boundedFilters = filters.dimension === "asset"
      ? withAssetBusinessDateRange(filters)
      : withDefaultOverviewDateRange(filters);

    const analytics = await this.repository.getBusinessTopicAnalytics?.(scope, boundedFilters) ?? {
      intentTrend: [],
      topics: [],
      totals: {
        mentionCount: 0,
        topicSessions: 0,
      },
      trend: [],
    };

    return {
      dimension: filters.dimension,
      ...analytics,
    };
  }

  async getBusinessRelatedSessions(
    scope: InsightsUidScope,
    filters: InsightsBusinessRelatedSessionFilters,
  ): Promise<InsightBusinessRelatedSessionsResponse> {
    const boundedFilters = filters.dimension === "asset"
      ? withAssetBusinessDateRange(filters)
      : withDefaultOverviewDateRange(filters);
    const normalizedPage = normalizeOverviewPage(filters.page);
    const normalizedPageSize = normalizeOverviewPageSize(filters.pageSize);

    if (!this.repository.listBusinessRelatedSessions) {
      throw new BusinessError(
        "INSIGHT_BUSINESS_RELATED_SESSIONS_UNAVAILABLE",
        "业务相关会话查询不可用",
      );
    }

    const sessions = await this.repository.listBusinessRelatedSessions(scope, {
      ...boundedFilters,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    });

    return {
      items: buildOverviewSessions(sessions.items),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total: sessions.total,
      totalPages: Math.max(1, Math.ceil(sessions.total / normalizedPageSize)),
    };
  }

  async getFollowUps(
    scope: InsightsUidScope,
    filters: InsightsFollowUpFilters = {},
  ): Promise<InsightsFollowUpsResponse> {
    const normalizedPage = normalizeOverviewPage(filters.page);
    const normalizedPageSize = normalizeOverviewPageSize(filters.pageSize);
    const pageResult = await this.repository.listActionItemsPage(scope, {
      ...filters,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    });

    return {
      items: pageResult.items
        .map(stripActionItemInternalFields),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total: pageResult.total,
      totalPages: Math.max(1, Math.ceil(pageResult.total / normalizedPageSize)),
    };
  }

  async getDetail(scope: InsightsUidScope, sessionId: string): Promise<InsightDetailResponse> {
    const detail = await this.repository.findDetail(scope, sessionId);

    if (!detail) {
      throw new NotFoundError("INSIGHT_SESSION_NOT_FOUND", "洞察会话不存在");
    }

    return {
      actionItems: detail.actionItems.map(stripDetailActionItemInternalFields),
      analysisStatus: detail.current.analysisStatus,
      currentSnapshotId: detail.current.currentSnapshotId,
      entities: detail.entities,
      evidenceItems: detail.evidenceItems,
      faqCandidates: detail.faqCandidates,
      intents: detail.intents,
      problemResolution: {
        confidence: detail.current.problemResolutionConfidence ?? 0,
        evidenceMessageIds: detail.problemEvidenceMessageIds,
        problemDetected: detail.current.problemDetected,
        problemSummary: detail.current.problemSummary,
        resolutionStatus: detail.current.resolutionStatus,
        unresolvedReason: detail.current.unresolvedReason ?? undefined,
      },
      qaFindings: detail.qaFindings,
      sentiment: detail.sentiment,
      session: {
        agentAvatarUrl: detail.current.agentAvatarUrl ?? undefined,
        agentName: detail.current.agentName ?? undefined,
        conversationId: detail.current.conversationId,
        customerAvatarUrl: detail.current.customerAvatarUrl ?? undefined,
        customerName: detail.current.customerName,
        endedAt: detail.current.endedAt ?? undefined,
        generatedAt: detail.current.generatedAt,
        phase: detail.current.phase,
        sessionId: detail.current.sessionId,
        startedAt: detail.current.startedAt,
      },
      summary: {
        sessionTitle: detail.current.summarySessionTitle,
        text: detail.current.summaryText,
      },
      tags: detail.tags,
    };
  }

  async getSessionMessages(
    scope: InsightsUidScope,
    sessionId: string,
  ): Promise<InsightSessionMessagesResponse> {
    const messages = await this.repository.listSessionMessageRecords(scope, sessionId);

    if (!messages) {
      throw new NotFoundError("INSIGHT_SESSION_NOT_FOUND", "洞察会话不存在");
    }

    return {
      messages: sortWorkbenchMessagesBySeq(messages),
    };
  }

  async getMessageContext(
    scope: InsightsUidScope,
    conversationId: string,
    messageId: string,
  ): Promise<InsightMessageContextResponse> {
    const context = await this.repository.listMessageContext(
      scope,
      conversationId,
      messageId,
      {
        after: defaultMessageContextSize,
        before: defaultMessageContextSize,
      },
    );

    if (
      !context.messages.some((message) =>
        message.messageId === context.targetMessageId ||
        String(message.seq) === context.targetMessageId
      )
    ) {
      throw new NotFoundError("INSIGHT_MESSAGE_NOT_FOUND", "消息不存在");
    }

    return context;
  }

  async getSettings(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightSettingsResponse> {
    assertInsightSettingsAdmin(role);

    const settings = await this.repository.getSettings(scope);

    return {
      ...settings,
      entityDictionary: mergePresetConfigs(
        settings.entityDictionary,
        SYSTEM_PRESET_ENTITY_DICTIONARY,
        (item) => item.entityCode,
      ),
      featureConfig: {
        ...settings.featureConfig,
        insightAvailable: isInsightAvailable(scope),
      },
      intentConfigs: mergePresetConfigs(
        settings.intentConfigs,
        SYSTEM_PRESET_INTENT_CONFIGS,
        (item) => item.intentCode,
      ),
      labelConfigs: mergePresetConfigs(
        settings.labelConfigs,
        SYSTEM_PRESET_LABEL_CONFIGS,
        (item) => item.labelCode,
      ),
      qaRuleConfigs: mergePresetConfigs(
        settings.qaRuleConfigs,
        SYSTEM_PRESET_QA_RULE_CONFIGS,
        (item) => item.ruleCode,
      ),
    };
  }

  async getFilterOptions(scope: InsightsUidScope): Promise<InsightFilterOptionsResponse> {
    return this.repository.getFilterOptions(scope);
  }

  async getSettingsSummary(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightSettingsSummaryResponse> {
    assertInsightSettingsAdmin(role);

    const summary = await this.repository.getSettingsSummary(scope);

    return {
      ...summary,
      insightAvailable: isInsightAvailable(scope),
    };
  }

  async getPolicySettings(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<{
    analysisPolicy: InsightAnalysisPolicy;
    sessionization: InsightSessionizationSettings;
  }> {
    assertInsightSettingsAdmin(role);
    return this.repository.getPolicySettings(scope);
  }

  async getFeatureConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightFeatureConfig> {
    assertInsightSettingsAdmin(role);
    const config = await this.repository.getFeatureConfig(scope);

    return {
      ...config,
      insightAvailable: isInsightAvailable(scope),
    };
  }

  async listIntentConfigs(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightIntentConfig[]> {
    assertInsightSettingsAdmin(role);
    return mergePresetConfigs(
      await this.repository.listIntentConfigs(scope),
      SYSTEM_PRESET_INTENT_CONFIGS,
      (item) => item.intentCode,
    );
  }

  async listLabelConfigs(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightLabelConfig[]> {
    assertInsightSettingsAdmin(role);
    return mergePresetConfigs(
      await this.repository.listLabelConfigs(scope),
      SYSTEM_PRESET_LABEL_CONFIGS,
      (item) => item.labelCode,
    );
  }

  async listQaRuleConfigs(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightQaRuleConfig[]> {
    assertInsightSettingsAdmin(role);
    return mergePresetConfigs(
      await this.repository.listQaRuleConfigs(scope),
      SYSTEM_PRESET_QA_RULE_CONFIGS,
      (item) => item.ruleCode,
    );
  }

  async listEntityDictionary(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightEntityDictionaryItem[]> {
    assertInsightSettingsAdmin(role);
    return mergePresetConfigs(
      await this.repository.listEntityDictionary(scope),
      SYSTEM_PRESET_ENTITY_DICTIONARY,
      (item) => item.entityCode,
    );
  }

  async updateSessionizationSettings(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    payload: InsightSessionizationSettingsUpdateRequest,
  ): Promise<InsightSessionizationSettings> {
    assertInsightSettingsAdmin(role);
    return this.repository.upsertSessionizationSettings(scope, payload);
  }

  async updateAnalysisPolicy(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    payload: InsightAnalysisPolicyUpdateRequest,
  ): Promise<InsightAnalysisPolicy> {
    assertInsightSettingsAdmin(role);
    return this.repository.upsertAnalysisPolicy(scope, payload);
  }

  async updateFeatureConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    payload: InsightFeatureConfigUpdateRequest,
  ): Promise<InsightFeatureConfig> {
    assertInsightSettingsAdmin(role);
    assertInsightEnableAllowed(scope, payload);
    return this.repository.upsertFeatureConfig(scope, payload);
  }

  async createIntentConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    payload: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig> {
    assertInsightSettingsAdmin(role);
    assertCustomConfigCodeAllowed(payload.intentCode);
    await this.assertConfigTotalAllowed(scope, "intentConfigs");
    await this.assertConfigEnableAllowed(scope, "intentConfigs", payload.status);
    return this.repository.createIntentConfig(scope, payload);
  }

  async activatePresetIntentConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    presetCode: string,
  ): Promise<InsightIntentConfig> {
    assertInsightSettingsAdmin(role);
    const preset = findPresetOrThrow(
      SYSTEM_PRESET_INTENT_CONFIGS,
      presetCode,
      (item) => item.intentCode,
    );
    if (!await this.hasExistingPresetConfig(scope, "intentConfigs", presetCode)) {
      await this.assertConfigTotalAllowed(scope, "intentConfigs");
    }
    await this.assertConfigEnableAllowed(scope, "intentConfigs", 0);
    return this.repository.activatePresetIntentConfig(
      scope,
      presetCode,
      normalizeIntentPresetMutation(preset),
    );
  }

  async updateIntentConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig> {
    assertInsightSettingsAdmin(role);
    const currentConfig = await this.getCurrentConfig(scope, "intentConfigs", id);
    assertConfigIdentityMutationAllowed(currentConfig, payload.intentCode, payload.intentName);
    await this.assertConfigEnableAllowed(
      scope,
      "intentConfigs",
      payload.status,
      currentConfig,
    );
    return await this.repository.updateIntentConfig(scope, id, payload)
      ?? raiseConfigNotFound();
  }

  async updateIntentConfigStatus(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightConfigStatusUpdateRequest,
  ): Promise<InsightIntentConfig> {
    assertInsightSettingsAdmin(role);
    await this.assertConfigEnableAllowed(
      scope,
      "intentConfigs",
      payload.status,
      await this.getCurrentConfig(scope, "intentConfigs", id),
    );
    return await this.repository.updateIntentConfigStatus(scope, id, payload.status)
      ?? raiseConfigNotFound();
  }

  async deleteIntentConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
  ): Promise<InsightConfigDeletedResponse> {
    assertInsightSettingsAdmin(role);
    return { deleted: await this.deleteConfigOrThrow(() => this.repository.deleteIntentConfig(scope, id)) };
  }

  async createLabelConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    payload: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig> {
    assertInsightSettingsAdmin(role);
    assertCustomConfigCodeAllowed(payload.labelCode);
    await this.assertConfigTotalAllowed(scope, "labelConfigs");
    await this.assertConfigEnableAllowed(scope, "labelConfigs", payload.status);
    return this.repository.createLabelConfig(scope, payload);
  }

  async activatePresetLabelConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    presetCode: string,
  ): Promise<InsightLabelConfig> {
    assertInsightSettingsAdmin(role);
    const preset = findPresetOrThrow(
      SYSTEM_PRESET_LABEL_CONFIGS,
      presetCode,
      (item) => item.labelCode,
    );
    if (!await this.hasExistingPresetConfig(scope, "labelConfigs", presetCode)) {
      await this.assertConfigTotalAllowed(scope, "labelConfigs");
    }
    await this.assertConfigEnableAllowed(scope, "labelConfigs", 0);
    return this.repository.activatePresetLabelConfig(
      scope,
      presetCode,
      normalizeLabelPresetMutation(preset),
    );
  }

  async updateLabelConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig> {
    assertInsightSettingsAdmin(role);
    const currentConfig = await this.getCurrentConfig(scope, "labelConfigs", id);
    assertConfigIdentityMutationAllowed(currentConfig, payload.labelCode, payload.labelName);
    await this.assertConfigEnableAllowed(
      scope,
      "labelConfigs",
      payload.status,
      currentConfig,
    );
    return await this.repository.updateLabelConfig(scope, id, payload)
      ?? raiseConfigNotFound();
  }

  async updateLabelConfigStatus(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightConfigStatusUpdateRequest,
  ): Promise<InsightLabelConfig> {
    assertInsightSettingsAdmin(role);
    await this.assertConfigEnableAllowed(
      scope,
      "labelConfigs",
      payload.status,
      await this.getCurrentConfig(scope, "labelConfigs", id),
    );
    return await this.repository.updateLabelConfigStatus(scope, id, payload.status)
      ?? raiseConfigNotFound();
  }

  async deleteLabelConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
  ): Promise<InsightConfigDeletedResponse> {
    assertInsightSettingsAdmin(role);
    return { deleted: await this.deleteConfigOrThrow(() => this.repository.deleteLabelConfig(scope, id)) };
  }

  async createQaRuleConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    payload: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig> {
    assertInsightSettingsAdmin(role);
    assertCustomConfigCodeAllowed(payload.ruleCode);
    await this.assertConfigTotalAllowed(scope, "qaRuleConfigs");
    await this.assertConfigEnableAllowed(scope, "qaRuleConfigs", payload.status);
    return this.repository.createQaRuleConfig(scope, payload);
  }

  async activatePresetQaRuleConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    presetCode: string,
  ): Promise<InsightQaRuleConfig> {
    assertInsightSettingsAdmin(role);
    const preset = findPresetOrThrow(
      SYSTEM_PRESET_QA_RULE_CONFIGS,
      presetCode,
      (item) => item.ruleCode,
    );
    if (!await this.hasExistingPresetConfig(scope, "qaRuleConfigs", presetCode)) {
      await this.assertConfigTotalAllowed(scope, "qaRuleConfigs");
    }
    await this.assertConfigEnableAllowed(scope, "qaRuleConfigs", 0);
    return this.repository.activatePresetQaRuleConfig(
      scope,
      presetCode,
      normalizeQaPresetMutation(preset),
    );
  }

  async updateQaRuleConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig> {
    assertInsightSettingsAdmin(role);
    const currentConfig = await this.getCurrentConfig(scope, "qaRuleConfigs", id);
    assertConfigIdentityMutationAllowed(currentConfig, payload.ruleCode, payload.ruleName);
    await this.assertConfigEnableAllowed(
      scope,
      "qaRuleConfigs",
      payload.status,
      currentConfig,
    );
    return await this.repository.updateQaRuleConfig(scope, id, payload)
      ?? raiseConfigNotFound();
  }

  async updateQaRuleConfigStatus(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightConfigStatusUpdateRequest,
  ): Promise<InsightQaRuleConfig> {
    assertInsightSettingsAdmin(role);
    await this.assertConfigEnableAllowed(
      scope,
      "qaRuleConfigs",
      payload.status,
      await this.getCurrentConfig(scope, "qaRuleConfigs", id),
    );
    return await this.repository.updateQaRuleConfigStatus(scope, id, payload.status)
      ?? raiseConfigNotFound();
  }

  async deleteQaRuleConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
  ): Promise<InsightConfigDeletedResponse> {
    assertInsightSettingsAdmin(role);
    return { deleted: await this.deleteConfigOrThrow(() => this.repository.deleteQaRuleConfig(scope, id)) };
  }

  async createEntityDictionaryItem(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    payload: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem> {
    assertInsightSettingsAdmin(role);
    assertCustomConfigCodeAllowed(payload.entityCode);
    await this.assertConfigTotalAllowed(scope, "entityDictionary");
    await this.assertConfigEnableAllowed(scope, "entityDictionary", payload.status);
    return this.repository.createEntityDictionaryItem(scope, payload);
  }

  async activatePresetEntityDictionaryItem(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    presetCode: string,
  ): Promise<InsightEntityDictionaryItem> {
    assertInsightSettingsAdmin(role);
    const preset = findPresetOrThrow(
      SYSTEM_PRESET_ENTITY_DICTIONARY,
      presetCode,
      (item) => item.entityCode,
    );
    if (!await this.hasExistingPresetConfig(scope, "entityDictionary", presetCode)) {
      await this.assertConfigTotalAllowed(scope, "entityDictionary");
    }
    await this.assertConfigEnableAllowed(scope, "entityDictionary", 0);
    return this.repository.activatePresetEntityDictionaryItem(
      scope,
      presetCode,
      normalizeEntityPresetMutation(preset),
    );
  }

  async updateEntityDictionaryItem(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem> {
    assertInsightSettingsAdmin(role);
    const currentConfig = await this.getCurrentConfig(scope, "entityDictionary", id);
    assertConfigIdentityMutationAllowed(currentConfig, payload.entityCode, payload.entityName);
    await this.assertConfigEnableAllowed(
      scope,
      "entityDictionary",
      payload.status,
      currentConfig,
    );
    return await this.repository.updateEntityDictionaryItem(scope, id, payload)
      ?? raiseConfigNotFound();
  }

  async updateEntityDictionaryItemStatus(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightConfigStatusUpdateRequest,
  ): Promise<InsightEntityDictionaryItem> {
    assertInsightSettingsAdmin(role);
    await this.assertConfigEnableAllowed(
      scope,
      "entityDictionary",
      payload.status,
      await this.getCurrentConfig(scope, "entityDictionary", id),
    );
    return await this.repository.updateEntityDictionaryItemStatus(scope, id, payload.status)
      ?? raiseConfigNotFound();
  }

  async deleteEntityDictionaryItem(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
  ): Promise<InsightConfigDeletedResponse> {
    assertInsightSettingsAdmin(role);
    return { deleted: await this.deleteConfigOrThrow(() => this.repository.deleteEntityDictionaryItem(scope, id)) };
  }

  async updateActionStatus(
    scope: InsightsUidScope,
    actionItemId: string,
    status: InsightActionStatus,
  ) {
    if (status !== "done" && status !== "dismissed" && status !== "open") {
      throw new BadRequestError("INVALID_ACTION_STATUS", "不支持的处理状态");
    }

    const updated = await this.repository.updateActionStatus(scope, actionItemId, status);

    if (!updated) {
      throw new BusinessError("INSIGHT_ACTION_ITEM_NOT_FOUND", "待处理事项不存在");
    }

    return {
      actionItemId,
      status,
    };
  }

  async createActionItem(
    scope: InsightsUidScope,
    input: InsightCreateActionItemRequest,
    createdBySubUserId?: string,
  ): Promise<InsightCreateActionItemResponse> {
    const title = input.title.trim();

    if (!title) {
      throw new BadRequestError("INVALID_ACTION_ITEM_TITLE", "待办标题不能为空");
    }

    const sessionId = input.sessionId?.trim();

    if (!sessionId) {
      throw new BadRequestError("INVALID_ACTION_ITEM_TARGET", "待办关联会话无效");
    }

    const targetValid = await this.repository.validateActionItemTarget(scope, {
      conversationId: input.conversationId,
      sessionId,
    });

    if (!targetValid) {
      throw new BadRequestError("INVALID_ACTION_ITEM_TARGET", "待办关联会话无效");
    }

    return await this.repository.createActionItem(scope, {
      ...input,
      createdBySubUserId,
      sessionId,
      title,
    });
  }

  async createRescanJob(
    scope: InsightsUidScope,
    payload: InsightsRescanRequest,
    createdBy?: string,
  ): Promise<InsightsRescanResponse> {
    const from = new Date(payload.from);

    if (Number.isNaN(from.getTime())) {
      throw new BadRequestError("INVALID_RESCAN_FROM", "重刷开始时间无效");
    }

    const to = payload.to ? new Date(payload.to) : new Date();

    if (Number.isNaN(to.getTime())) {
      throw new BadRequestError("INVALID_RESCAN_TO", "重刷结束时间无效");
    }

    if (to.getTime() < from.getTime()) {
      throw new BadRequestError("INVALID_RESCAN_RANGE", "重刷结束时间不能早于开始时间");
    }

    if (await this.repository.hasActiveRescanTask(scope)) {
      throw new BadRequestError("RESCAN_TASK_ACTIVE", "已有重刷任务正在运行，请等待完成后再新建");
    }

    const normalizedFrom = from.toISOString();
    const normalizedTo = to.toISOString();
    const result = await this.repository.createRescanJob(
      scope,
      {
        analysisScope: payload.analysisScope,
        createdBy,
        from,
        to,
      },
      `rescan:${scope.uid}:${payload.analysisScope}:${normalizedFrom}:${normalizedTo}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    );

    return {
      jobId: result.jobId,
      status: "accepted",
      taskId: result.taskId,
    };
  }

  async listRescanTasks(
    scope: InsightsUidScope,
    options?: { page?: number; pageSize?: number },
  ): Promise<InsightRescanTaskListResponse> {
    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, options?.pageSize ?? 10));
    const offset = (page - 1) * pageSize;
    const tasks = await this.repository.listRescanTasks(scope, { limit: pageSize, offset });

    return {
      items: tasks.items.map((task) => ({
        ...task,
        progressText: `${task.succeededSessions + task.failedSessions} / ${task.totalSessions}`,
      })),
      total: tasks.total,
    };
  }

  private async deleteConfigOrThrow(deleteConfig: () => Promise<boolean>) {
    const deleted = await deleteConfig();

    if (!deleted) {
      throw new NotFoundError("INSIGHT_CONFIG_NOT_FOUND", "配置不存在");
    }

    return true;
  }

  private async assertConfigEnableAllowed(
    scope: InsightsUidScope,
    configType: InsightConfigLimitType,
    status: 0 | 1,
    currentConfig?: InsightConfigIdentity,
  ) {
    if (status !== 1) {
      return;
    }

    if (currentConfig?.status === 1) {
      return;
    }

    const currentEnabled = await this.repository.countEnabledConfigs(scope, configType);
    const rule = insightConfigLimitRules[configType];

    if (currentEnabled >= rule.hardLimit) {
      throw new BadRequestError(
        "INSIGHT_CONFIG_ENABLED_LIMIT_REACHED",
        `当前已启用 ${currentEnabled} 条（上限 ${rule.hardLimit} 条），请先停用其他配置`,
        {
          configType,
          currentEnabled,
          limit: rule.hardLimit,
        },
      );
    }
  }

  private async assertConfigTotalAllowed(
    scope: InsightsUidScope,
    configType: InsightConfigLimitType,
  ) {
    const currentTotal = await this.repository.countActiveConfigs(scope, configType);

    if (currentTotal >= insightConfigTotalLimit) {
      throw new BadRequestError(
        "INSIGHT_CONFIG_TOTAL_LIMIT_REACHED",
        `当前已有 ${currentTotal} 条配置（上限 ${insightConfigTotalLimit} 条），请先删除无用配置后再新建`,
        {
          configType,
          currentTotal,
          limit: insightConfigTotalLimit,
        },
      );
    }
  }

  private async hasExistingPresetConfig(
    scope: InsightsUidScope,
    configType: InsightConfigLimitType,
    presetCode: string,
  ) {
    if (configType === "intentConfigs") {
      return this.repository.listIntentConfigs(scope)
        .then((items) => items.some((item) => item.intentCode === presetCode));
    }

    if (configType === "labelConfigs") {
      return this.repository.listLabelConfigs(scope)
        .then((items) => items.some((item) => item.labelCode === presetCode));
    }

    if (configType === "qaRuleConfigs") {
      return this.repository.listQaRuleConfigs(scope)
        .then((items) => items.some((item) => item.ruleCode === presetCode));
    }

    return this.repository.listEntityDictionary(scope)
      .then((items) => items.some((item) => item.entityCode === presetCode));
  }

  private async getCurrentConfig(
    scope: InsightsUidScope,
    configType: InsightConfigLimitType,
    id: string,
  ): Promise<InsightConfigIdentity | undefined> {
    if (configType === "intentConfigs") {
      return this.repository.listIntentConfigs(scope).then((items) => items.find((item) => item.id === id));
    }

    if (configType === "labelConfigs") {
      return this.repository.listLabelConfigs(scope).then((items) => items.find((item) => item.id === id));
    }

    if (configType === "qaRuleConfigs") {
      return this.repository.listQaRuleConfigs(scope).then((items) => items.find((item) => item.id === id));
    }

    return this.repository.listEntityDictionary(scope).then((items) => items.find((item) => item.id === id));
  }
}

function assertInsightSettingsAdmin(role: AccountRole | string | undefined) {
  if (role !== "owner" && role !== "admin") {
    throw new ForbiddenError("FORBIDDEN", "无权限访问");
  }
}

function assertInsightEnableAllowed(
  scope: InsightsUidScope,
  payload: InsightFeatureConfigUpdateRequest,
) {
  if (!payload.insightEnabled) {
    return;
  }

  if (!isInsightAvailable(scope)) {
    throw new ForbiddenError("INSIGHT_NOT_AVAILABLE", "当前账号暂未开通会话洞察");
  }
}

export function isInsightAvailable(scope: InsightsUidScope) {
  const insightAllowedUids = parseInsightAllowedUids(process.env.INSIGHTS_WORKER_UID_ALLOWLIST);

  return !insightAllowedUids || insightAllowedUids.has(scope.uid);
}

function parseInsightAllowedUids(value: string | undefined) {
  const values = (value ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isSafeInteger(item) && item > 0);

  return values.length > 0 ? new Set(values) : undefined;
}

function normalizeOverviewPage(value: number | undefined) {
  return Number.isSafeInteger(value) && value != null && value > 0 ? value : 1;
}

function normalizeOverviewPageSize(value: number | undefined) {
  if (!Number.isSafeInteger(value) || value == null || value <= 0) {
    return defaultOverviewPageSize;
  }

  return Math.min(value, maxOverviewPageSize);
}

function raiseConfigNotFound(): never {
  throw new NotFoundError("INSIGHT_CONFIG_NOT_FOUND", "配置不存在");
}

function buildOverviewSessions(rows: InsightCurrentSessionRow[]) {
  return rows.map((row) => ({
      agentAvatarUrl: row.agentAvatarUrl ?? undefined,
      agentName: row.agentName ?? undefined,
      analysisStatus: row.analysisStatus,
      conversationId: row.conversationId,
      customerAvatarUrl: row.customerAvatarUrl ?? undefined,
      customerName: row.customerName,
      endedAt: row.endedAt ?? undefined,
      lastMessageAt: row.lastMessageAt ?? undefined,
      problemSummary: row.problemSummary || undefined,
      resolutionStatus: row.resolutionStatus,
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      summarySessionTitle: row.summarySessionTitle,
    }));
}

function buildQualityOverview(rows: InsightCurrentSessionRow[]): InsightQualityAggregateRow {
  return {
    inspectedSessions: 0,
    inspectionRate: 0,
    passRate: 0,
    ruleDistribution: [],
    totalSessions: rows.length,
  };
}

function stripActionItemInternalFields(row: InsightActionItemRow): InsightsFollowUpsResponse["items"][number] {
  const { thirdExternalUserId: _thirdExternalUserId, ...item } = row;

  return item;
}

function stripDetailActionItemInternalFields(row: InsightDetailActionItemRow): InsightDetailResponse["actionItems"][number] {
  const { resolutionStatus: _resolutionStatus, thirdExternalUserId: _thirdExternalUserId, ...item } = row;

  return item;
}

function formatDateKey(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(new Date(value));
}

function withDefaultOverviewDateRange<T extends InsightsOverviewFilters>(filters: T): T {
  if (filters.from || filters.to) {
    return filters;
  }

  const range = getDefaultOverviewDateRange();

  return {
    ...filters,
    from: `${range.from}T00:00:00.000+08:00`,
    to: `${range.to}T23:59:59.999+08:00`,
  };
}

function withAssetBusinessDateRange<T extends InsightsBusinessTopicFilters>(filters: T): T {
  const normalizedTo = filters.to
    ? normalizeOverviewBoundary(filters.to, "end")
    : `${formatDateKey(Date.now())}T23:59:59.999+08:00`;
  const to = parseOverviewBoundary(normalizedTo) ?? Date.now();
  const requestedFrom = filters.from
    ? normalizeOverviewBoundary(filters.from, "start")
    : `${formatDateKey(to - 6 * 24 * 60 * 60_000)}T00:00:00.000+08:00`;
  const from = parseOverviewBoundary(requestedFrom) ?? to;
  const minFrom = to - 7 * 24 * 60 * 60_000 + 1;
  const boundedFrom = Math.max(from, minFrom);

  return {
    ...filters,
    from: `${formatDateKey(boundedFrom)}T00:00:00.000+08:00`,
    to: `${formatDateKey(to)}T23:59:59.999+08:00`,
  };
}

function normalizeOverviewBoundary(value: string, boundary: "end" | "start") {
  if (Number.isNaN(Date.parse(value)) || value.includes("T")) {
    return value;
  }

  return boundary === "start"
    ? `${value}T00:00:00.000+08:00`
    : `${value}T23:59:59.999+08:00`;
}

function getPreviousOverviewDateRange(filters: Pick<InsightsOverviewFilters, "from" | "to">) {
  const normalizedFilters = {
    from: filters.from ? normalizeOverviewBoundary(filters.from, "start") : filters.from,
    to: filters.to ? normalizeOverviewBoundary(filters.to, "end") : filters.to,
  };
  const from = parseOverviewBoundary(normalizedFilters.from);
  const to = parseOverviewBoundary(normalizedFilters.to);

  if (from == null || to == null || to < from) {
    return filters;
  }

  const duration = to - from + 1;
  const previousTo = from - 1;
  const previousFrom = previousTo - duration + 1;

  return {
    from: formatOverviewBoundary(previousFrom, "start"),
    to: formatOverviewBoundary(previousTo, "end"),
  };
}

function parseOverviewBoundary(value?: string) {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function formatOverviewBoundary(value: number, boundary: "end" | "start") {
  const date = formatDateKey(value);

  return boundary === "start"
    ? `${date}T00:00:00.000+08:00`
    : `${date}T23:59:59.999+08:00`;
}

function buildOverviewComparison(
  current: InsightsOverviewResponse["totals"],
  previous: InsightsOverviewResponse["totals"],
): InsightsOverviewResponse["comparison"] {
  return {
    agentMessages: buildOverviewComparisonValue(current.agentMessages, previous.agentMessages),
    consultingCustomers: buildOverviewComparisonValue(current.consultingCustomers, previous.consultingCustomers),
    customerMessages: buildOverviewComparisonValue(current.customerMessages, previous.customerMessages),
    logicalSessions: buildOverviewComparisonValue(current.logicalSessions, previous.logicalSessions),
    messages: buildOverviewComparisonValue(current.messages, previous.messages),
  };
}

function buildOverviewComparisonValue(current: number, previous: number) {
  const delta = current - previous;

  return {
    current,
    delta,
    deltaRate: previous > 0 ? delta / previous : current > 0 ? 1 : 0,
    previous,
  };
}

function mergePresetConfigs<T>(
  dbItems: T[],
  presetItems: T[],
  getCode: (item: T) => string,
) {
  const existingCodes = new Set(dbItems.map(getCode));
  const inactivePresets = presetItems.filter((item) => !existingCodes.has(getCode(item)));

  return [...dbItems, ...inactivePresets];
}

function findPresetOrThrow<T>(
  presets: T[],
  presetCode: string,
  getCode: (item: T) => string,
) {
  const preset = presets.find((item) => getCode(item) === presetCode);

  if (!preset) {
    throw new NotFoundError("INSIGHT_PRESET_CONFIG_NOT_FOUND", "预置配置不存在");
  }

  return preset;
}

function isSystemPresetCode(code: string) {
  return code.startsWith(systemPresetCodePrefix);
}

function assertCustomConfigCodeAllowed(code: string) {
  if (isSystemPresetCode(code)) {
    throw new BadRequestError(
      "INSIGHT_SYSTEM_CODE_RESERVED",
      "sys_ 开头的编码仅用于系统预设",
    );
  }
}

function assertConfigIdentityMutationAllowed(
  currentConfig: InsightConfigIdentity | undefined,
  nextCode: string,
  nextName: string,
) {
  if (!currentConfig) {
    assertCustomConfigCodeAllowed(nextCode);
    return;
  }

  const currentIdentity = getConfigCodeAndName(currentConfig);

  if (!isSystemPresetCode(currentIdentity.code)) {
    assertCustomConfigCodeAllowed(nextCode);
    return;
  }

  if (nextCode !== currentIdentity.code || nextName !== currentIdentity.name) {
    throw new BadRequestError(
      "INSIGHT_SYSTEM_CONFIG_IDENTITY_LOCKED",
      "系统预设配置不允许修改编码和名称",
    );
  }
}

function getConfigCodeAndName(config: InsightConfigIdentity) {
  if ("intentCode" in config) {
    return { code: config.intentCode, name: config.intentName };
  }

  if ("labelCode" in config) {
    return { code: config.labelCode, name: config.labelName };
  }

  if ("ruleCode" in config) {
    return { code: config.ruleCode, name: config.ruleName };
  }

  return { code: config.entityCode, name: config.entityName };
}

function normalizeIntentPresetMutation(
  preset: InsightIntentConfig,
): InsightIntentConfigMutationRequest {
  return {
    description: preset.description,
    intentCode: preset.intentCode,
    intentName: preset.intentName,
    negativeExamples: preset.negativeExamples,
    positiveExamples: preset.positiveExamples,
    status: 0,
    weight: preset.weight,
  };
}

function normalizeLabelPresetMutation(
  preset: InsightLabelConfig,
): InsightLabelConfigMutationRequest {
  return {
    description: preset.description,
    labelCode: preset.labelCode,
    labelName: preset.labelName,
    negativeExamples: preset.negativeExamples,
    positiveExamples: preset.positiveExamples,
    status: 0,
  };
}

function normalizeQaPresetMutation(
  preset: InsightQaRuleConfig,
): InsightQaRuleConfigMutationRequest {
  return {
    applicableScene: preset.applicableScene,
    description: preset.description,
    judgmentCriteria: preset.judgmentCriteria,
    negativeExamples: preset.negativeExamples,
    positiveExamples: preset.positiveExamples,
    ruleCode: preset.ruleCode,
    ruleName: preset.ruleName,
    severity: preset.severity,
    status: 0,
  };
}

function normalizeEntityPresetMutation(
  preset: InsightEntityDictionaryItem,
): InsightEntityDictionaryMutationRequest {
  return {
    aliases: preset.aliases,
    attributes: preset.attributes,
    entityCode: preset.entityCode,
    entityName: preset.entityName,
    status: 0,
  };
}

function getDefaultOverviewDateRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - defaultOverviewRangeDays + 1);

  return {
    from: formatDateKey(from.getTime()),
    to: formatDateKey(today.getTime()),
  };
}

function sortWorkbenchMessagesBySeq(rows: WorkbenchMessageDto[]) {
  return [...rows].sort((left, right) => left.seq - right.seq);
}
