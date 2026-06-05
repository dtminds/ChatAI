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
  InsightConfigStatusUpdateRequest,
  InsightDetailResponse,
  InsightEntityDictionaryItem,
  InsightEntityDictionaryMutationRequest,
  InsightIntentConfig,
  InsightIntentConfigMutationRequest,
  InsightLabelConfig,
  InsightLabelConfigMutationRequest,
  InsightMessageContextResponse,
  InsightQaRuleConfig,
  InsightQaRuleConfigMutationRequest,
  InsightRescanAnalysisScope,
  InsightRescanTaskListResponse,
  InsightSettingsResponse,
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
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors.js";

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
  agentMessageCount: number;
  agentName: string | null;
  agentSeatId: string | null;
  analysisStatus: InsightAnalysisStatus;
  conversationId: string;
  currentSnapshotId: string;
  customerAvatarUrl: string | null;
  customerMessageCount: number;
  customerName: string;
  assets?: NonNullable<InsightOverviewSessionItem["assets"]>;
  endedAt: number | null;
  entities?: NonNullable<InsightOverviewSessionItem["entities"]>;
  generatedAt: number;
  intents?: NonNullable<InsightOverviewSessionItem["intents"]>;
  lastMessageAt: number | null;
  lastCustomerMessageAt: number | null;
  messageCount: number;
  phase: InsightDetailResponse["session"]["phase"];
  problemDetected: boolean;
  problemEvidenceMessageIds: string[];
  problemResolutionConfidence?: number;
  problemSummary: string;
  resolutionStatus: InsightResolutionStatus;
  sessionId: string;
  startedAt: number;
  summaryCustomerIntent: string;
  summaryFollowUp: string | null;
  summaryProcess: string;
  summaryResult: string;
  tags?: NonNullable<InsightOverviewSessionItem["tags"]>;
  unresolvedReason: string | null;
};

export type InsightActionItemRow = InsightsFollowUpsResponse["items"][number] & {
  resolutionStatus?: InsightResolutionStatus;
};

export type InsightDetailActionItemRow = InsightDetailResponse["actionItems"][number] & {
  resolutionStatus?: InsightResolutionStatus;
};

export type InsightEvidenceMessageRow = InsightDetailResponse["evidenceMessages"][number];

export type InsightDetailRow = {
  actionItems: InsightDetailActionItemRow[];
  current: InsightCurrentSessionRow;
  entities: InsightDetailResponse["entities"];
  evidenceItems: InsightDetailResponse["evidenceItems"];
  faqCandidates: InsightDetailResponse["faqCandidates"];
  intents: InsightDetailResponse["intents"];
  problemEvidenceMessageIds: string[];
  qaFindingDetails?: Array<InsightDetailResponse["qaFindings"][number] & { severity: InsightSeverity }>;
  qaFindings: InsightDetailResponse["qaFindings"];
  sentiment: InsightDetailResponse["sentiment"];
  tags: InsightDetailResponse["tags"];
};

export type InsightsFollowUpFilters = {
  page?: number;
  pageSize?: number;
  priority?: InsightActionItemRow["priority"];
  status?: InsightActionStatus;
};

export type InsightsQualityFilters = {
  from?: string;
  page?: number;
  pageSize?: number;
  to?: string;
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
  "entityHotspots" | "intentDistribution" | "sessions"
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
  getQaFindingAggregate?(
    scope: InsightsUidScope,
    filters?: { from?: string; to?: string },
  ): Promise<{
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
  listEvidenceMessages(
    scope: InsightsUidScope,
    sessionId: string,
    messageIds: string[],
  ): Promise<InsightEvidenceMessageRow[]>;
  listEvidenceMessageRecords(
    scope: InsightsUidScope,
    sessionId: string,
    messageIds: string[],
  ): Promise<WorkbenchMessageDto[]>;
  hasActiveRescanTask(scope: InsightsUidScope): Promise<boolean>;
  listRescanTasks(
    scope: InsightsUidScope,
    filters: { limit: number },
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
    status: Extract<InsightActionStatus, "done" | "dismissed">,
  ): Promise<boolean>;
  getSettings(scope: InsightsUidScope): Promise<InsightSettingsResponse>;
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
    enabled: boolean,
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
    enabled: boolean,
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
    enabled: boolean,
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
    enabled: boolean,
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
    const [aggregate, entityHotspots, intentDistribution] = await Promise.all([
      this.repository.getOverviewAggregate(scope, aggregateFilters),
      this.repository.listEntityHotspots?.(scope) ?? Promise.resolve([]),
      this.repository.listIntentDistribution?.(scope) ?? Promise.resolve([]),
    ]);

    return {
      ...aggregate,
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
    const [overview, qaAggregate, agentStats, unresolvedPage] = await Promise.all([
      this.repository.getQualityAggregate?.(scope, { from: filters.from, to: filters.to }),
      this.repository.getQaFindingAggregate?.(scope, { from: filters.from, to: filters.to }),
      this.repository.listQualityAgentStats?.(scope, { from: filters.from, to: filters.to }),
      this.repository.listCurrentSessions(scope, {
        from: filters.from,
        page: normalizedPage,
        pageSize: normalizedPageSize,
        problemScope: "unresolved",
        to: filters.to,
      }),
    ]);
    const unresolvedRows = unresolvedPage.items.filter((row) => unresolvedStatuses.has(row.resolutionStatus));
    const unresolvedSessions = unresolvedRows
      .filter((row) => unresolvedStatuses.has(row.resolutionStatus))
      .sort(compareByLastCustomerMessage)
      .map((row) => ({
        agentAvatarUrl: row.agentAvatarUrl ?? undefined,
        agentName: row.agentName ?? undefined,
        conversationId: row.conversationId,
        customerAvatarUrl: row.customerAvatarUrl ?? undefined,
        customerName: row.customerName,
        evidenceMessageIds: row.problemEvidenceMessageIds,
        lastCustomerMessageAt: row.lastCustomerMessageAt ?? undefined,
        problemSummary: row.problemSummary,
        resolutionStatus: row.resolutionStatus,
        sessionId: row.sessionId,
        unresolvedReason: row.unresolvedReason ?? "未给出判定理由",
      }));

    const baseOverview = overview ?? buildQualityOverview(unresolvedRows);

    return {
      agentStats: agentStats ?? buildAgentStats(unresolvedRows),
      overview: {
        ...baseOverview,
        inspectionRate: qaAggregate?.inspectionRate ?? baseOverview.inspectionRate,
        passRate: qaAggregate?.passRate ?? baseOverview.passRate,
        ruleDistribution: qaAggregate?.ruleDistribution ?? baseOverview.ruleDistribution,
      },
      unresolvedReasons: buildUnresolvedReasons(unresolvedSessions),
      unresolvedSessionsPage: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total: unresolvedPage.total,
        totalPages: Math.max(1, Math.ceil(unresolvedPage.total / normalizedPageSize)),
      },
      unresolvedSessions,
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

    const evidenceMessages = sortEvidenceMessages(
      await this.repository.listEvidenceMessages(
        scope,
        sessionId,
        detail.problemEvidenceMessageIds,
      ),
    );
    const evidenceMessageRecords = sortWorkbenchMessagesBySeq(
      await this.repository.listEvidenceMessageRecords(
        scope,
        sessionId,
        detail.problemEvidenceMessageIds,
      ),
    );
    const sessionMessageRecords = sortWorkbenchMessagesBySeq(
      await this.repository.listSessionMessageRecords(scope, sessionId),
    );

    return {
      actionItems: detail.actionItems,
      analysisStatus: detail.current.analysisStatus,
      currentSnapshotId: detail.current.currentSnapshotId,
      entities: detail.entities,
      evidenceItems: detail.evidenceItems,
      evidenceMessageRecords,
      evidenceMessages,
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
      sessionMessageRecords,
      summary: {
        customerIntent: detail.current.summaryCustomerIntent,
        followUp: detail.current.summaryFollowUp ?? undefined,
        processSummary: detail.current.summaryProcess,
        resultSummary: detail.current.summaryResult,
      },
      tags: detail.tags,
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

    return this.repository.getSettings(scope);
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

  async createIntentConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    payload: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig> {
    assertInsightSettingsAdmin(role);
    return this.repository.createIntentConfig(scope, payload);
  }

  async updateIntentConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig> {
    assertInsightSettingsAdmin(role);
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
    return await this.repository.updateIntentConfigStatus(scope, id, payload.enabled)
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
    return this.repository.createLabelConfig(scope, payload);
  }

  async updateLabelConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig> {
    assertInsightSettingsAdmin(role);
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
    return await this.repository.updateLabelConfigStatus(scope, id, payload.enabled)
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
    return this.repository.createQaRuleConfig(scope, payload);
  }

  async updateQaRuleConfig(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig> {
    assertInsightSettingsAdmin(role);
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
    return await this.repository.updateQaRuleConfigStatus(scope, id, payload.enabled)
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
    return this.repository.createEntityDictionaryItem(scope, payload);
  }

  async updateEntityDictionaryItem(
    scope: InsightsUidScope,
    role: AccountRole | string | undefined,
    id: string,
    payload: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem> {
    assertInsightSettingsAdmin(role);
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
    return await this.repository.updateEntityDictionaryItemStatus(scope, id, payload.enabled)
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
    if (status !== "done" && status !== "dismissed") {
      throw new BadRequestError("INVALID_ACTION_STATUS", "不支持的处理状态");
    }

    const updated = await this.repository.updateActionStatus(scope, actionItemId, status);

    if (!updated) {
      throw new NotFoundError("INSIGHT_ACTION_ITEM_NOT_FOUND", "待处理事项不存在");
    }

    return {
      actionItemId,
      status,
    };
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
  ): Promise<InsightRescanTaskListResponse> {
    const tasks = await this.repository.listRescanTasks(scope, { limit: 20 });

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
}

function assertInsightSettingsAdmin(role: AccountRole | string | undefined) {
  if (role !== "owner" && role !== "admin") {
    throw new ForbiddenError("FORBIDDEN", "无权限访问");
  }
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
      agentMessageCount: row.agentMessageCount,
      agentName: row.agentName ?? undefined,
      analysisStatus: row.analysisStatus,
      conversationId: row.conversationId,
      customerAvatarUrl: row.customerAvatarUrl ?? undefined,
      customerMessageCount: row.customerMessageCount,
      customerName: row.customerName,
      endedAt: row.endedAt ?? undefined,
      assets: row.assets ?? [],
      entities: row.entities ?? [],
      intents: row.intents ?? [],
      lastMessageAt: row.lastMessageAt ?? undefined,
      messageCount: row.messageCount,
      problemSummary: row.problemSummary || undefined,
      resolutionStatus: row.resolutionStatus,
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      summaryCustomerIntent: row.summaryCustomerIntent,
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

function getDefaultOverviewDateRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - defaultOverviewRangeDays + 1);

  return {
    from: formatDateKey(from.getTime()),
    to: formatDateKey(today.getTime()),
  };
}

function buildAgentStats(rows: InsightCurrentSessionRow[]) {
  const stats = new Map<
    string,
    {
      agentName: string;
      agentAvatarUrl?: string;
      agentSeatId: string;
      partial: number;
      problemSessions: number;
      resolved: number;
      totalSessions: number;
      unresolved: number;
    }
  >();

  for (const row of rows) {
    const agentSeatId = row.agentSeatId ?? "unknown";
    const stat =
      stats.get(agentSeatId) ??
      {
        agentName: row.agentName ?? "未分配客服",
        agentAvatarUrl: row.agentAvatarUrl ?? undefined,
        agentSeatId,
        partial: 0,
        problemSessions: 0,
        resolved: 0,
        totalSessions: 0,
        unresolved: 0,
      };

    stat.totalSessions += 1;

    if (isCustomerProblemSession(row)) {
      stat.problemSessions += 1;
    }

    if (row.resolutionStatus === "resolved") {
      stat.resolved += 1;
    }

    if (row.resolutionStatus === "unresolved") {
      stat.unresolved += 1;
    }

    if (row.resolutionStatus === "partially_resolved") {
      stat.partial += 1;
    }

    stats.set(agentSeatId, stat);
  }

  return Array.from(stats.values()).map((stat) => ({
    ...stat,
    unresolvedRate: stat.problemSessions > 0 ? stat.unresolved / stat.problemSessions : 0,
  }));
}

function buildUnresolvedReasons(
  rows: InsightsQualityResponse["unresolvedSessions"],
) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.unresolvedReason, (counts.get(row.unresolvedReason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .map(([reason, count]) => ({
      count,
      reasonCode: reason,
      reasonLabel: reason,
    }));
}

function compareByLastCustomerMessage(
  left: InsightCurrentSessionRow,
  right: InsightCurrentSessionRow,
) {
  return (right.lastCustomerMessageAt ?? 0) - (left.lastCustomerMessageAt ?? 0);
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

function sortEvidenceMessages(rows: InsightEvidenceMessageRow[]) {
  return [...rows].sort((left, right) => {
    const timeDelta = left.msgtime - right.msgtime;

    if (timeDelta !== 0) {
      return timeDelta;
    }

    return Number(left.messageId) - Number(right.messageId);
  });
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
