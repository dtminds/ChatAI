import type {
  AccountRole,
  InsightActionStatus,
  InsightAnalysisStatus,
  InsightAnalysisPolicy,
  InsightAnalysisPolicyUpdateRequest,
  InsightConfigDeletedResponse,
  InsightConfigStatusUpdateRequest,
  InsightDetailResponse,
  InsightEntityDictionaryItem,
  InsightEntityDictionaryMutationRequest,
  InsightLabelConfig,
  InsightLabelConfigMutationRequest,
  InsightMessageContextResponse,
  InsightQaRuleConfig,
  InsightQaRuleConfigMutationRequest,
  InsightSettingsResponse,
  InsightSessionizationSettings,
  InsightSessionizationSettingsUpdateRequest,
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

type InsightSeverity = InsightsQualityResponse["unresolvedSessions"][number]["severity"];

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
  endedAt: number | null;
  highRiskCount: number;
  lastMessageAt: number | null;
  lastCustomerMessageAt: number | null;
  messageCount: number;
  negativeCount: number;
  phase: InsightDetailResponse["session"]["phase"];
  problemDetected: boolean;
  problemEvidenceMessageIds: string[];
  problemSummary: string;
  resolutionStatus: InsightResolutionStatus;
  riskSeverity: InsightSeverity | null;
  sessionId: string;
  startedAt: number;
  summaryCustomerIntent: string;
  summaryFollowUp: string | null;
  summaryProcess: string;
  summaryResult: string;
  unresolvedReason: string | null;
};

export type InsightActionItemRow = InsightsFollowUpsResponse["items"][number];

export type InsightEvidenceMessageRow = InsightDetailResponse["evidenceMessages"][number];

export type InsightDetailRow = {
  actionItems: InsightDetailResponse["actionItems"];
  current: InsightCurrentSessionRow;
  entities: InsightDetailResponse["entities"];
  faqCandidates: InsightDetailResponse["faqCandidates"];
  intents: InsightDetailResponse["intents"];
  problemEvidenceMessageIds: string[];
  qaFindings: InsightDetailResponse["qaFindings"];
  risks: InsightDetailResponse["risks"];
  sentiment: InsightDetailResponse["sentiment"];
  tags: InsightDetailResponse["tags"];
};

export type InsightsFollowUpFilters = {
  priority?: InsightActionItemRow["priority"];
  status?: InsightActionStatus;
  type?: string;
};

export type InsightsOverviewFilters = {
  from?: string;
  to?: string;
};

export type InsightsRepositoryPort = {
  createRescanJob(
    scope: InsightsUidScope,
    from: Date,
    idempotencyKey: string,
  ): Promise<string>;
  findDetail(scope: InsightsUidScope, sessionId: string): Promise<InsightDetailRow | undefined>;
  listActionItems(
    scope: InsightsUidScope,
    filters?: InsightsFollowUpFilters,
  ): Promise<InsightActionItemRow[]>;
  listCurrentSessions(
    scope: InsightsUidScope,
    filters?: InsightsOverviewFilters,
  ): Promise<InsightCurrentSessionRow[]>;
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

export class InsightsService {
  constructor(private readonly repository: InsightsRepositoryPort) {}

  async getOverview(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters = {},
  ): Promise<InsightsOverviewResponse> {
    const rows = await this.repository.listCurrentSessions(scope, filters);
    const [entityHotspots, intentDistribution] = await Promise.all([
      this.repository.listEntityHotspots?.(scope) ?? Promise.resolve([]),
      this.repository.listIntentDistribution?.(scope) ?? Promise.resolve(buildIntentDistribution(rows)),
    ]);
    const analysis = {
      failed: 0,
      partial: 0,
      ready: 0,
      stale: 0,
    };

    for (const row of rows) {
      if (row.analysisStatus in analysis) {
        analysis[row.analysisStatus as keyof typeof analysis] += 1;
      }
    }

    return {
      actionItemsOpen: rows.reduce((total, row) => total + row.actionOpenCount, 0),
      analysis,
      entityHotspots,
      highRiskSessions: rows.filter((row) => row.highRiskCount > 0).length,
      intentDistribution,
      negativeSessions: rows.filter((row) => row.negativeCount > 0).length,
      problemSessions: rows.filter((row) => row.problemDetected).length,
      readySessions: analysis.ready,
      sessions: buildOverviewSessions(rows),
      totalSessions: rows.length,
      totals: buildOverviewTotals(rows),
      trend: buildOverviewTrend(rows),
      unresolvedSessions: rows.filter((row) => unresolvedStatuses.has(row.resolutionStatus)).length,
    };
  }

  async getQuality(scope: InsightsUidScope): Promise<InsightsQualityResponse> {
    const rows = await this.repository.listCurrentSessions(scope);
    const unresolvedSessions = rows
      .filter((row) => unresolvedStatuses.has(row.resolutionStatus))
      .sort(compareByRiskAndLastMessage)
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
        severity: normalizeSeverity(row.riskSeverity),
        unresolvedReason: row.unresolvedReason ?? "未给出判定理由",
      }));

    return {
      agentStats: buildAgentStats(rows),
      overview: {
        analyzedSessions: rows.filter((row) => analyzedStatuses.has(row.analysisStatus)).length,
        noCustomerProblem: rows.filter(
          (row) => row.resolutionStatus === "no_customer_problem",
        ).length,
        partial: rows.filter((row) => row.resolutionStatus === "partially_resolved").length,
        problemSessions: rows.filter((row) => row.problemDetected).length,
        resolved: rows.filter((row) => row.resolutionStatus === "resolved").length,
        totalSessions: rows.length,
        unresolved: rows.filter((row) => row.resolutionStatus === "unresolved").length,
      },
      unresolvedReasons: buildUnresolvedReasons(unresolvedSessions),
      unresolvedSessions,
    };
  }

  async getFollowUps(
    scope: InsightsUidScope,
    filters: InsightsFollowUpFilters = {},
  ): Promise<InsightsFollowUpsResponse> {
    const rows = await this.repository.listActionItems(scope, filters);
    const items = rows
      .filter((row) => !filters.status || row.status === filters.status)
      .filter((row) => !filters.priority || row.priority === filters.priority)
      .filter((row) => !filters.type || row.actionType === filters.type)
      .sort(compareActionItems);

    return {
      items,
      total: items.length,
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

    return {
      actionItems: detail.actionItems,
      analysisStatus: detail.current.analysisStatus,
      currentSnapshotId: detail.current.currentSnapshotId,
      entities: detail.entities,
      evidenceMessageRecords,
      evidenceMessages,
      faqCandidates: detail.faqCandidates,
      intents: detail.intents,
      problemResolution: {
        confidence: 0,
        evidenceMessageIds: detail.problemEvidenceMessageIds,
        problemDetected: detail.current.problemDetected,
        problemSummary: detail.current.problemSummary,
        resolutionStatus: detail.current.resolutionStatus,
        unresolvedReason: detail.current.unresolvedReason ?? undefined,
      },
      qaFindings: detail.qaFindings,
      risks: detail.risks,
      sentiment: detail.sentiment,
      session: {
        agentAvatarUrl: detail.current.agentAvatarUrl ?? undefined,
        agentName: detail.current.agentName ?? undefined,
        conversationId: detail.current.conversationId,
        customerAvatarUrl: detail.current.customerAvatarUrl ?? undefined,
        customerName: detail.current.customerName,
        endedAt: detail.current.endedAt ?? undefined,
        phase: detail.current.phase,
        sessionId: detail.current.sessionId,
        startedAt: detail.current.startedAt,
      },
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
      throw new NotFoundError("INSIGHT_MESSAGE_NOT_FOUND", "证据消息不存在");
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
  ): Promise<InsightsRescanResponse> {
    const from = new Date(payload.from);

    if (Number.isNaN(from.getTime())) {
      throw new BadRequestError("INVALID_RESCAN_FROM", "重刷开始时间无效");
    }

    const normalizedFrom = from.toISOString();
    const jobId = await this.repository.createRescanJob(
      scope,
      from,
      `rescan:${scope.uid}:${normalizedFrom}`,
    );

    return {
      jobId,
      status: "accepted",
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

function raiseConfigNotFound(): never {
  throw new NotFoundError("INSIGHT_CONFIG_NOT_FOUND", "配置不存在");
}

function buildIntentDistribution(rows: InsightCurrentSessionRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.summaryCustomerIntent) {
      continue;
    }

    counts.set(row.summaryCustomerIntent, (counts.get(row.summaryCustomerIntent) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([intentLabel, count]) => ({
    count,
    intentCode: intentLabel,
    intentLabel,
  }));
}

function buildOverviewTotals(rows: InsightCurrentSessionRow[]) {
  return {
    agentMessages: rows.reduce((total, row) => total + row.agentMessageCount, 0),
    consultingCustomers: new Set(rows.map((row) => row.conversationId)).size,
    customerMessages: rows.reduce((total, row) => total + row.customerMessageCount, 0),
    logicalSessions: rows.length,
    messages: rows.reduce((total, row) => total + row.messageCount, 0),
  };
}

function buildOverviewTrend(rows: InsightCurrentSessionRow[]) {
  const rowsByDate = new Map<string, InsightCurrentSessionRow[]>();

  for (const row of rows) {
    const date = formatDateKey(row.startedAt);
    rowsByDate.set(date, [...(rowsByDate.get(date) ?? []), row]);
  }

  return Array.from(rowsByDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dateRows]) => ({
      ...buildOverviewTotals(dateRows),
      date,
    }));
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
      lastMessageAt: row.lastMessageAt ?? undefined,
      messageCount: row.messageCount,
      problemSummary: row.problemSummary || undefined,
      resolutionStatus: row.resolutionStatus,
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      summaryCustomerIntent: row.summaryCustomerIntent,
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

    if (row.problemDetected) {
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

function compareByRiskAndLastMessage(
  left: InsightCurrentSessionRow,
  right: InsightCurrentSessionRow,
) {
  const severityDelta =
    severityRank(normalizeSeverity(right.riskSeverity)) -
    severityRank(normalizeSeverity(left.riskSeverity));

  if (severityDelta !== 0) {
    return severityDelta;
  }

  return (right.lastCustomerMessageAt ?? 0) - (left.lastCustomerMessageAt ?? 0);
}

function compareActionItems(left: InsightActionItemRow, right: InsightActionItemRow) {
  const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return (right.lastCustomerMessageAt ?? 0) - (left.lastCustomerMessageAt ?? 0);
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

function normalizeSeverity(severity: InsightSeverity | null): InsightSeverity {
  return severity ?? "low";
}

function severityRank(severity: InsightSeverity) {
  if (severity === "high") {
    return 3;
  }

  if (severity === "medium") {
    return 2;
  }

  return 1;
}

function priorityRank(priority: InsightActionItemRow["priority"]) {
  if (priority === "high") {
    return 3;
  }

  if (priority === "medium") {
    return 2;
  }

  return 1;
}
