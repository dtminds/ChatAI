import type {
  AccountRole,
  InsightActionStatus,
  InsightAnalysisStatus,
  InsightAnalysisPolicy,
  InsightAnalysisPolicyUpdateRequest,
  InsightOverviewSessionsQuery,
  InsightOverviewSessionsResponse,
  InsightBusinessRelatedSessionsResponse,
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
  InsightsBusinessResponse,
  InsightsFollowUpsResponse,
  InsightsOverviewResponse,
  InsightsQualityResponse,
  InsightsRescanRequest,
  InsightsRescanResponse,
  WorkbenchMessageDto,
} from "@chatai/contracts";
import { DEFAULT_INSIGHT_SETTINGS } from "./insights-seeds.js";
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

type InsightConfigIdentity = {
  id: string;
  status: -1 | 0 | 1;
};

export type InsightsUidScope = {
  uid: number;
};

type InsightResolutionStatus =
  InsightsQualityResponse["overview"] extends never
    ? never
    : InsightDetailResponse["problemResolution"]["resolutionStatus"];

type InsightSeverity = InsightDetailResponse["qaFindings"][number] extends never
  ? "low" | "medium" | "high"
  : "low" | "medium" | "high";
type InsightOverviewSessionItem = InsightOverviewSessionsResponse["items"][number];

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
  assets?: NonNullable<InsightOverviewSessionItem["assets"]>;
  endedAt: number | null;
  entities?: NonNullable<InsightOverviewSessionItem["entities"]>;
  generatedAt?: number;
  intents?: NonNullable<InsightOverviewSessionItem["intents"]>;
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
  tags?: NonNullable<InsightOverviewSessionItem["tags"]>;
  unresolvedReason: string | null;
};

export type InsightActionItemRow = InsightsFollowUpsResponse["items"][number] & {
  resolutionStatus?: InsightResolutionStatus;
};

export type InsightDetailActionItemRow = InsightDetailResponse["actionItems"][number] & {
  resolutionStatus?: InsightResolutionStatus;
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
  view?: "agent-report" | "all" | "quality-results";
};

export type InsightsOverviewFilters = {
  analysisStatus?: InsightOverviewSessionsQuery["analysisStatus"];
  entityName?: string;
  from?: string;
  intentCode?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  problemScope?: InsightOverviewSessionsQuery["problemScope"];
  resolutionStatus?: InsightOverviewSessionsQuery["resolutionStatus"];
  sessionIds?: string[];
  tagCode?: string;
  to?: string;
};

export type InsightOverviewSessionFilters = {
  analysisStatus?: InsightOverviewSessionsQuery["analysisStatus"];
  entityName?: string;
  from?: string;
  intentCode?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  problemScope?: InsightOverviewSessionsQuery["problemScope"];
  resolutionStatus?: InsightOverviewSessionsQuery["resolutionStatus"];
  sessionIds?: string[];
  tagCode?: string;
  to?: string;
};

export type InsightsBusinessRelatedSessionFilters = InsightsOverviewFilters & {
  dimension: InsightBusinessTopicFactRow["dimension"];
  topicCode: string;
  topicType?: string;
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
  "comparison" | "entityHotspots" | "intentDistribution" | "sessions"
>;

export type InsightBusinessTopicFactRow = {
  code: string;
  dimension: InsightsBusinessResponse["tagDistribution"][number]["dimension"];
  mentionCount: number;
  name: string;
  sentiment?: string | null;
  sessionId: string;
  snapshotId: string;
  startedAt: number;
  type?: string | null;
};

export type InsightQualityAggregateRow = InsightsQualityResponse["overview"];

export type InsightQualityAgentStatRow = InsightsQualityResponse["agentStats"][number];

export type InsightQualityResultRow = InsightsQualityResponse["qualityResults"][number];

export type InsightQualityResultPage = {
  items: InsightQualityResultRow[];
  total: number;
};

export type InsightBusinessSessionAggregateRow = {
  actionItemsOpen: number;
  analyzedSessions: number;
  date: string;
  sessionId: string;
  startedAt: number;
  unresolvedSessions: number;
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
  listActionItems(
    scope: InsightsUidScope,
    filters?: InsightsFollowUpFilters,
  ): Promise<InsightActionItemRow[]>;
  listActionItemsPage?(
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
    inspectedSessions: number;
    inspectionRate: number;
    passRate: number;
    ruleDistribution: Array<{ count: number; ruleCode: string; ruleName: string }>;
  }>;
  listBusinessSessionAggregates?(
    scope: InsightsUidScope,
    filters?: InsightsOverviewFilters,
  ): Promise<InsightBusinessSessionAggregateRow[]>;
  getOverviewAggregate(
    scope: InsightsUidScope,
    filters?: InsightsOverviewFilters,
  ): Promise<InsightOverviewAggregateRow>;
  listBusinessTopicFacts?(
    scope: InsightsUidScope,
    filters?: InsightsOverviewFilters,
  ): Promise<InsightBusinessTopicFactRow[]>;
  listEntityHotspots?(
    scope: InsightsUidScope,
  ): Promise<InsightsOverviewResponse["entityHotspots"]>;
  hasActiveRescanTask(scope: InsightsUidScope): Promise<boolean>;
  listRescanTasks(
    scope: InsightsUidScope,
    filters: { limit: number; offset: number },
  ): Promise<{ items: InsightRescanTaskRow[]; total: number }>;
  listSessionMessageRecords(
    scope: InsightsUidScope,
    sessionId: string,
  ): Promise<WorkbenchMessageDto[]>;
  listMessageContext(
    scope: InsightsUidScope,
    conversationId: string,
    messageId: string,
    options: { after: number; before: number },
  ): Promise<InsightMessageContextResponse>;
  listIntentDistribution?(
    scope: InsightsUidScope,
  ): Promise<InsightsOverviewResponse["intentDistribution"]>;
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

const unresolvedStatuses = new Set<InsightResolutionStatus>([
  "unresolved",
  "partially_resolved",
]);

const analyzedStatuses = new Set<InsightAnalysisStatus>(["ready", "partial"]);

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
  intentConfigs: { hardLimit: 20, softLimit: 15 },
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
    const [aggregate, previousAggregate, entityHotspots, intentDistribution] = await Promise.all([
      this.repository.getOverviewAggregate(scope, aggregateFilters),
      this.repository.getOverviewAggregate(scope, comparisonFilters),
      this.repository.listEntityHotspots?.(scope) ?? Promise.resolve([]),
      this.repository.listIntentDistribution?.(scope) ?? Promise.resolve([]),
    ]);

    return {
      ...aggregate,
      comparison: buildOverviewComparison(aggregate.totals, previousAggregate.totals),
      entityHotspots,
      intentDistribution,
    };
  }

  async getOverviewSessions(
    scope: InsightsUidScope,
    filters: InsightOverviewSessionFilters = {},
  ): Promise<InsightOverviewSessionsResponse> {
    const normalizedPage = normalizeOverviewPage(filters.page);
    const normalizedPageSize = normalizeOverviewPageSize(filters.pageSize);
    const normalizedFilters = {
      ...filters,
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

  async getQuality(
    scope: InsightsUidScope,
    filters: InsightsQualityFilters = {},
  ): Promise<InsightsQualityResponse> {
    const normalizedPage = normalizeOverviewPage(filters.page);
    const normalizedPageSize = normalizeOverviewPageSize(filters.pageSize);
    const view = filters.view ?? "all";
    const shouldLoadAgentStats = view === "all" || view === "agent-report";
    const shouldLoadQualityResults = view === "all" || view === "quality-results";
    const [overview, qaAggregate, agentStats, qualityResultsPage] = await Promise.all([
      this.repository.getQualityAggregate?.(scope, { from: filters.from, to: filters.to }),
      this.repository.getQaFindingAggregate?.(scope, { from: filters.from, to: filters.to }),
      shouldLoadAgentStats
        ? this.repository.listQualityAgentStats?.(scope, { from: filters.from, to: filters.to })
        : Promise.resolve([]),
      shouldLoadQualityResults && this.repository.listQualityResults
        ? this.repository.listQualityResults(scope, {
        from: filters.from,
        page: normalizedPage,
        pageSize: normalizedPageSize,
        passed: filters.passed,
        to: filters.to,
      })
        : Promise.resolve({ items: [], total: 0 }),
    ]);

    const baseOverview = overview ?? buildQualityOverview([]);

    return {
      agentStats: agentStats ?? [],
      overview: {
        ...baseOverview,
        inspectedSessions: qaAggregate?.inspectedSessions ?? baseOverview.inspectedSessions,
        inspectionRate: qaAggregate?.inspectionRate ?? baseOverview.inspectionRate,
        passRate: qaAggregate?.passRate ?? baseOverview.passRate,
        ruleDistribution: qaAggregate?.ruleDistribution ?? baseOverview.ruleDistribution,
      },
      qualityResultsPage: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total: qualityResultsPage.total,
        totalPages: Math.max(1, Math.ceil(qualityResultsPage.total / normalizedPageSize)),
      },
      qualityResults: qualityResultsPage.items,
    };
  }

  async getBusiness(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters = {},
  ): Promise<InsightsBusinessResponse> {
    const boundedFilters = withDefaultOverviewDateRange(filters);
    const [sessionAggregates, facts] = await Promise.all([
      this.repository.listBusinessSessionAggregates?.(scope, boundedFilters) ?? Promise.resolve([]),
      this.repository.listBusinessTopicFacts?.(scope, boundedFilters) ?? Promise.resolve([]),
    ]);
    const sessionsById = new Map(sessionAggregates.map((row) => [row.sessionId, row]));
    const topicCollections = buildBusinessTopicCollections(facts, sessionsById);

    return {
      assetHotspots: topicCollections.assetHotspots,
      entityHotspots: topicCollections.entityHotspots,
      intentDistribution: topicCollections.intentDistribution,
      intentTrend: buildBusinessIntentTrend(facts),
      qualityTopics: topicCollections.qualityTopics,
      tagDistribution: topicCollections.tagDistribution,
      totals: {
        actionItemsOpen: sessionAggregates.reduce((total, row) => total + row.actionItemsOpen, 0),
        analyzedSessions: sessionAggregates.reduce((total, row) => total + row.analyzedSessions, 0),
        assetMentions: sumTopicMentions(topicCollections.assetHotspots),
        entityMentions: sumTopicMentions(topicCollections.entityHotspots),
        intentMentions: sumTopicMentions(topicCollections.intentDistribution),
        negativeSessions: countNegativeBusinessSessions(facts),
        tagMentions: sumTopicMentions(topicCollections.tagDistribution),
        topicSessions: new Set(facts.map((fact) => fact.sessionId)).size,
        unresolvedSessions: sessionAggregates.reduce((total, row) => total + row.unresolvedSessions, 0),
      },
      trend: buildBusinessTrend(sessionAggregates, facts),
    };
  }

  async getBusinessRelatedSessions(
    scope: InsightsUidScope,
    filters: InsightsBusinessRelatedSessionFilters,
  ): Promise<InsightBusinessRelatedSessionsResponse> {
    const boundedFilters = withDefaultOverviewDateRange(filters);
    const normalizedPage = normalizeOverviewPage(filters.page);
    const normalizedPageSize = normalizeOverviewPageSize(filters.pageSize);
    const facts = await this.repository.listBusinessTopicFacts?.(scope, boundedFilters) ?? [];
    const sessionIds = Array.from(
      new Set(
        facts
          .filter((fact) => businessTopicFactMatchesFilter(fact, filters))
          .sort((left, right) => right.startedAt - left.startedAt)
          .map((fact) => fact.sessionId),
      ),
    );

    if (sessionIds.length === 0) {
      return {
        items: [],
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total: 0,
        totalPages: 1,
      };
    }

    const sessions = await this.repository.listCurrentSessions(scope, {
      from: boundedFilters.from,
      keyword: filters.keyword,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      sessionIds,
      to: boundedFilters.to,
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
    const pageResult = await this.repository.listActionItemsPage?.(scope, {
      ...filters,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    });
    const rows = pageResult
      ? pageResult.items
      : await this.repository.listActionItems(scope, filters);
    const filteredItems = rows
      .filter((row) => !row.resolutionStatus || requiresHumanIntervention(row.resolutionStatus))
      .filter((row) => !filters.status || row.status === filters.status)
      .filter((row) => !filters.priority || row.priority === filters.priority)
      .sort(compareActionItems)
      .map(stripActionItemInternalFields);
    const total = pageResult?.total ?? filteredItems.length;
    const items = pageResult
      ? filteredItems
      : filteredItems.slice(
          (normalizedPage - 1) * normalizedPageSize,
          normalizedPage * normalizedPageSize,
        );

    return {
      items,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / normalizedPageSize)),
    };
  }

  async getDetail(scope: InsightsUidScope, sessionId: string): Promise<InsightDetailResponse> {
    const detail = await this.repository.findDetail(scope, sessionId);

    if (!detail) {
      throw new NotFoundError("INSIGHT_SESSION_NOT_FOUND", "洞察会话不存在");
    }

    return {
      actionItems: detail.actionItems,
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
    if (!await this.repository.hasSession(scope, sessionId)) {
      throw new NotFoundError("INSIGHT_SESSION_NOT_FOUND", "洞察会话不存在");
    }

    return {
      messages: sortWorkbenchMessagesBySeq(
        await this.repository.listSessionMessageRecords(scope, sessionId),
      ),
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
      featureConfig: {
        ...settings.featureConfig,
        insightAvailable: isInsightAvailable(scope),
      },
    };
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
    return this.repository.listIntentConfigs(scope);
  }

  async listLabelConfigs(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightLabelConfig[]> {
    assertInsightSettingsAdmin(role);
    return this.repository.listLabelConfigs(scope);
  }

  async listQaRuleConfigs(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightQaRuleConfig[]> {
    assertInsightSettingsAdmin(role);
    return this.repository.listQaRuleConfigs(scope);
  }

  async listEntityDictionary(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightEntityDictionaryItem[]> {
    assertInsightSettingsAdmin(role);
    return this.repository.listEntityDictionary(scope);
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
    await this.assertConfigTotalAllowed(scope, "intentConfigs");
    await this.assertConfigEnableAllowed(scope, "intentConfigs", payload.status);
    return this.repository.createIntentConfig(scope, payload);
  }

  async updateIntentConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig> {
    assertInsightSettingsAdmin(role);
    await this.assertConfigEnableAllowed(
      scope,
      "intentConfigs",
      payload.status,
      await this.getCurrentConfig(scope, "intentConfigs", id),
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
    await this.assertConfigTotalAllowed(scope, "labelConfigs");
    await this.assertConfigEnableAllowed(scope, "labelConfigs", payload.status);
    return this.repository.createLabelConfig(scope, payload);
  }

  async updateLabelConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig> {
    assertInsightSettingsAdmin(role);
    await this.assertConfigEnableAllowed(
      scope,
      "labelConfigs",
      payload.status,
      await this.getCurrentConfig(scope, "labelConfigs", id),
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
    await this.assertConfigTotalAllowed(scope, "qaRuleConfigs");
    await this.assertConfigEnableAllowed(scope, "qaRuleConfigs", payload.status);
    return this.repository.createQaRuleConfig(scope, payload);
  }

  async updateQaRuleConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig> {
    assertInsightSettingsAdmin(role);
    await this.assertConfigEnableAllowed(
      scope,
      "qaRuleConfigs",
      payload.status,
      await this.getCurrentConfig(scope, "qaRuleConfigs", id),
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
    await this.assertConfigTotalAllowed(scope, "entityDictionary");
    await this.assertConfigEnableAllowed(scope, "entityDictionary", payload.status);
    return this.repository.createEntityDictionaryItem(scope, payload);
  }

  async updateEntityDictionaryItem(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem> {
    assertInsightSettingsAdmin(role);
    await this.assertConfigEnableAllowed(
      scope,
      "entityDictionary",
      payload.status,
      await this.getCurrentConfig(scope, "entityDictionary", id),
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
  return [...rows]
    .sort((left, right) => right.startedAt - left.startedAt)
    .map((row) => ({
      agentAvatarUrl: row.agentAvatarUrl ?? undefined,
      agentName: row.agentName ?? undefined,
      analysisStatus: row.analysisStatus,
      conversationId: row.conversationId,
      customerAvatarUrl: row.customerAvatarUrl ?? undefined,
      customerName: row.customerName,
      endedAt: row.endedAt ?? undefined,
      assets: row.assets ?? [],
      entities: row.entities ?? [],
      intents: row.intents ?? [],
      lastMessageAt: row.lastMessageAt ?? undefined,
      problemSummary: row.problemSummary || undefined,
      resolutionStatus: row.resolutionStatus,
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      summarySessionTitle: row.summarySessionTitle,
      tags: row.tags ?? [],
    }));
}

function requiresHumanIntervention(
  value: InsightCurrentSessionRow | InsightResolutionStatus,
) {
  const status = typeof value === "string" ? value : value.resolutionStatus;

  return unresolvedStatuses.has(status);
}

function isCustomerProblemSession(row: InsightCurrentSessionRow) {
  return row.problemDetected &&
    row.resolutionStatus !== "no_customer_problem" &&
    row.resolutionStatus !== "unknown";
}

function buildQualityOverview(rows: InsightCurrentSessionRow[]): InsightQualityAggregateRow {
  return {
    analyzedSessions: rows.filter((row) => analyzedStatuses.has(row.analysisStatus)).length,
    inspectedSessions: 0,
    inspectionRate: 0,
    noCustomerProblem: rows.filter(
      (row) => row.resolutionStatus === "no_customer_problem",
    ).length,
    partial: rows.filter((row) => row.resolutionStatus === "partially_resolved").length,
    passRate: 0,
    problemSessions: rows.filter(isCustomerProblemSession).length,
    resolved: rows.filter((row) => row.resolutionStatus === "resolved").length,
    ruleDistribution: [],
    totalSessions: rows.length,
    unresolved: rows.filter((row) => row.resolutionStatus === "unresolved").length,
  };
}

function stripActionItemInternalFields(row: InsightActionItemRow): InsightsFollowUpsResponse["items"][number] {
  const { resolutionStatus: _resolutionStatus, ...item } = row;

  return item;
}

type BusinessTopicAccumulator = {
  actionItemSessions: Set<string>;
  code: string;
  dimension: InsightsBusinessResponse["tagDistribution"][number]["dimension"];
  mentionCount: number;
  name: string;
  negativeSessions: Set<string>;
  sessions: Set<string>;
  type?: string;
  unresolvedSessions: Set<string>;
};

function buildBusinessTopicCollections(
  facts: InsightBusinessTopicFactRow[],
  sessionsById: Map<string, InsightBusinessSessionAggregateRow>,
) {
  const accumulators = new Map<string, BusinessTopicAccumulator>();

  for (const fact of facts) {
    const session = sessionsById.get(fact.sessionId);

    if (!session) {
      continue;
    }

    const key = `${fact.dimension}:${fact.code}:${fact.type ?? ""}`;
    const accumulator = accumulators.get(key) ?? {
      actionItemSessions: new Set<string>(),
      code: fact.code,
      dimension: fact.dimension,
      mentionCount: 0,
      name: fact.name,
      negativeSessions: new Set<string>(),
      sessions: new Set<string>(),
      type: fact.type ?? undefined,
      unresolvedSessions: new Set<string>(),
    };

    accumulator.mentionCount += fact.mentionCount;
    accumulator.sessions.add(session.sessionId);

    if (session.unresolvedSessions > 0) {
      accumulator.unresolvedSessions.add(session.sessionId);
    }

    if (isNegativeTopicFact(fact)) {
      accumulator.negativeSessions.add(session.sessionId);
    }

    if (session.actionItemsOpen > 0) {
      accumulator.actionItemSessions.add(session.sessionId);
    }

    accumulators.set(key, accumulator);
  }

  const totalTopicSessions = new Set(facts.map((fact) => fact.sessionId)).size;
  const topics = Array.from(accumulators.values())
    .map((topic) => mapBusinessTopic(topic, totalTopicSessions))
    .sort(compareBusinessTopics);

  return {
    assetHotspots: topics.filter((topic) => topic.dimension === "asset").slice(0, 12),
    entityHotspots: topics.filter((topic) => topic.dimension === "entity").slice(0, 12),
    intentDistribution: topics.filter((topic) => topic.dimension === "intent").slice(0, 12),
    qualityTopics: [...topics]
      .sort((left, right) =>
        right.unresolvedRate - left.unresolvedRate ||
        right.unresolvedSessions - left.unresolvedSessions ||
        right.sessionCount - left.sessionCount
      )
      .slice(0, 12),
    tagDistribution: topics.filter((topic) => topic.dimension === "tag").slice(0, 12),
  };
}

function mapBusinessTopic(
  topic: BusinessTopicAccumulator,
  totalTopicSessions: number,
): InsightsBusinessResponse["tagDistribution"][number] {
  const sessionCount = topic.sessions.size;
  const unresolvedSessions = topic.unresolvedSessions.size;
  const negativeSessions = topic.negativeSessions.size;

  return {
    actionItemsOpen: topic.actionItemSessions.size,
    code: topic.code,
    dimension: topic.dimension,
    mentionCount: topic.mentionCount,
    name: topic.name,
    negativeRate: sessionCount > 0 ? negativeSessions / sessionCount : 0,
    negativeSessions,
    sessionCount,
    share: totalTopicSessions > 0 ? sessionCount / totalTopicSessions : 0,
    type: topic.type,
    unresolvedRate: sessionCount > 0 ? unresolvedSessions / sessionCount : 0,
    unresolvedSessions,
  };
}

function compareBusinessTopics(
  left: InsightsBusinessResponse["tagDistribution"][number],
  right: InsightsBusinessResponse["tagDistribution"][number],
) {
  return right.sessionCount - left.sessionCount ||
    right.mentionCount - left.mentionCount ||
    left.name.localeCompare(right.name, "zh-CN");
}

function isNegativeTopicFact(fact: InsightBusinessTopicFactRow) {
  return fact.dimension === "entity" && fact.sentiment === "negative";
}

function businessTopicFactMatchesFilter(
  fact: InsightBusinessTopicFactRow,
  filters: InsightsBusinessRelatedSessionFilters,
) {
  if (fact.dimension !== filters.dimension || fact.code !== filters.topicCode) {
    return false;
  }

  return filters.topicType == null || fact.type === filters.topicType;
}

function sumTopicMentions(topics: InsightsBusinessResponse["tagDistribution"]) {
  return topics.reduce((total, topic) => total + topic.mentionCount, 0);
}

function buildBusinessTrend(
  rows: InsightBusinessSessionAggregateRow[],
  facts: InsightBusinessTopicFactRow[],
) {
  const trend = new Map<
    string,
    InsightsBusinessResponse["trend"][number] & {
      negativeSessionIds: Set<string>;
      topicSessionIds: Set<string>;
    }
  >();

  for (const row of rows) {
    const date = row.date || formatDateKey(row.startedAt);
    const point = getBusinessTrendPoint(trend, date);

    point.unresolvedSessions += row.unresolvedSessions;
  }

  for (const fact of facts) {
    const date = formatDateKey(fact.startedAt);
    const point = getBusinessTrendPoint(trend, date);

    point.topicSessionIds.add(fact.sessionId);

    if (fact.dimension === "tag") {
      point.tagMentions += fact.mentionCount;
    }

    if (fact.dimension === "entity") {
      point.entityMentions += fact.mentionCount;
    }

    if (fact.dimension === "intent") {
      point.intentMentions += fact.mentionCount;
    }

    if (fact.dimension === "asset") {
      point.assetMentions += fact.mentionCount;
    }

    if (isNegativeTopicFact(fact)) {
      point.negativeSessionIds.add(fact.sessionId);
    }
  }

  return Array.from(trend.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, point]) => ({
      date: point.date,
      assetMentions: point.assetMentions,
      entityMentions: point.entityMentions,
      intentMentions: point.intentMentions,
      negativeSessions: point.negativeSessionIds.size,
      tagMentions: point.tagMentions,
      topicSessions: point.topicSessionIds.size,
      unresolvedSessions: point.unresolvedSessions,
    }));
}

function getBusinessTrendPoint(
  trend: Map<
    string,
    InsightsBusinessResponse["trend"][number] & {
      negativeSessionIds: Set<string>;
      topicSessionIds: Set<string>;
    }
  >,
  date: string,
) {
  const point = trend.get(date) ?? {
    assetMentions: 0,
    date,
    entityMentions: 0,
    intentMentions: 0,
    negativeSessions: 0,
    negativeSessionIds: new Set<string>(),
    tagMentions: 0,
    topicSessions: 0,
    topicSessionIds: new Set<string>(),
    unresolvedSessions: 0,
  };

  trend.set(date, point);

  return point;
}

function buildBusinessIntentTrend(facts: InsightBusinessTopicFactRow[]) {
  const trend = new Map<
    string,
    {
      date: string;
      intentCode: string;
      intentName: string;
      sessionIds: Set<string>;
    }
  >();

  for (const fact of facts) {
    if (fact.dimension !== "intent") {
      continue;
    }

    const date = formatDateKey(fact.startedAt);
    const key = `${date}:${fact.code}`;
    const point = trend.get(key) ?? {
      date,
      intentCode: fact.code,
      intentName: fact.name,
      sessionIds: new Set<string>(),
    };

    point.sessionIds.add(fact.sessionId);
    trend.set(key, point);
  }

  return Array.from(trend.values())
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.intentName.localeCompare(right.intentName, "zh-CN") ||
      left.intentCode.localeCompare(right.intentCode),
    )
    .map((point) => ({
      date: point.date,
      intentCode: point.intentCode,
      intentName: point.intentName,
      sessionCount: point.sessionIds.size,
    }));
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

function getDefaultOverviewDateRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - defaultOverviewRangeDays + 1);

  return {
    from: formatDateKey(from.getTime()),
    to: formatDateKey(today.getTime()),
  };
}

function compareActionItems(left: InsightActionItemRow, right: InsightActionItemRow) {
  return compareNumericIdDesc(left.actionItemId, right.actionItemId);
}

function compareNumericIdDesc(left: string, right: string) {
  const leftId = Number(left);
  const rightId = Number(right);

  if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
    return rightId - leftId;
  }

  return right.localeCompare(left);
}

function sortWorkbenchMessagesBySeq(rows: WorkbenchMessageDto[]) {
  return [...rows].sort((left, right) => left.seq - right.seq);
}

function countNegativeBusinessSessions(facts: InsightBusinessTopicFactRow[]) {
  return new Set(
    facts
      .filter(isNegativeTopicFact)
      .map((fact) => fact.sessionId),
  ).size;
}
