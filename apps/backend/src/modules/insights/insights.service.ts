import type {
  AccountRole,
  InsightActionStatus,
  InsightAnalysisStatus,
  InsightDetailResponse,
  InsightSettingsResponse,
  InsightsFollowUpsResponse,
  InsightsOverviewResponse,
  InsightsQualityResponse,
  InsightsRescanRequest,
  InsightsRescanResponse,
} from "@chatai/contracts";
import { DEFAULT_INSIGHT_SETTINGS } from "./insights-seeds.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors.js";

export type InsightsTenantScope = {
  tenantId: number;
};

type InsightResolutionStatus =
  InsightsQualityResponse["overview"] extends never
    ? never
    : InsightDetailResponse["problemResolution"]["resolutionStatus"];

type InsightSeverity = InsightsQualityResponse["unresolvedSessions"][number]["severity"];

export type InsightCurrentSessionRow = {
  actionOpenCount: number;
  agentName: string | null;
  agentSeatId: string | null;
  analysisStatus: InsightAnalysisStatus;
  conversationId: string;
  currentSnapshotId: string;
  customerName: string;
  endedAt: number | null;
  highRiskCount: number;
  lastCustomerMessageAt: number | null;
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
  actionItems: unknown[];
  current: InsightCurrentSessionRow;
  problemEvidenceMessageIds: string[];
  qaFindings: unknown[];
  risks: unknown[];
};

export type InsightsFollowUpFilters = {
  priority?: InsightActionItemRow["priority"];
  status?: InsightActionStatus;
  type?: string;
};

export type InsightsRepositoryPort = {
  createRescanJob(
    scope: InsightsTenantScope,
    from: Date,
    idempotencyKey: string,
  ): Promise<string>;
  findDetail(scope: InsightsTenantScope, sessionId: string): Promise<InsightDetailRow | undefined>;
  listActionItems(
    scope: InsightsTenantScope,
    filters?: InsightsFollowUpFilters,
  ): Promise<InsightActionItemRow[]>;
  listCurrentSessions(scope: InsightsTenantScope): Promise<InsightCurrentSessionRow[]>;
  listEvidenceMessages(
    scope: InsightsTenantScope,
    sessionId: string,
    messageIds: string[],
  ): Promise<InsightEvidenceMessageRow[]>;
  updateActionStatus(
    scope: InsightsTenantScope,
    actionItemId: string,
    status: Extract<InsightActionStatus, "done" | "dismissed">,
  ): Promise<boolean>;
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

export class InsightsService {
  constructor(private readonly repository: InsightsRepositoryPort) {}

  async getOverview(scope: InsightsTenantScope): Promise<InsightsOverviewResponse> {
    const rows = await this.repository.listCurrentSessions(scope);
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
      entityHotspots: [],
      highRiskSessions: rows.filter((row) => row.highRiskCount > 0).length,
      intentDistribution: buildIntentDistribution(rows),
      negativeSessions: rows.filter((row) => row.negativeCount > 0).length,
      problemSessions: rows.filter((row) => row.problemDetected).length,
      readySessions: analysis.ready,
      totalSessions: rows.length,
      unresolvedSessions: rows.filter((row) => unresolvedStatuses.has(row.resolutionStatus)).length,
    };
  }

  async getQuality(scope: InsightsTenantScope): Promise<InsightsQualityResponse> {
    const rows = await this.repository.listCurrentSessions(scope);
    const unresolvedSessions = rows
      .filter((row) => unresolvedStatuses.has(row.resolutionStatus))
      .sort(compareByRiskAndLastMessage)
      .map((row) => ({
        agentName: row.agentName ?? undefined,
        conversationId: row.conversationId,
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
    scope: InsightsTenantScope,
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

  async getDetail(scope: InsightsTenantScope, sessionId: string): Promise<InsightDetailResponse> {
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

    return {
      actionItems: detail.actionItems,
      analysisStatus: detail.current.analysisStatus,
      currentSnapshotId: detail.current.currentSnapshotId,
      entities: [],
      evidenceMessages,
      faqCandidates: [],
      intents: [],
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
      sentiment: [],
      session: {
        conversationId: detail.current.conversationId,
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
      tags: [],
    };
  }

  async getSettings(
    _scope: InsightsTenantScope,
    role: AccountRole | string | undefined,
  ): Promise<InsightSettingsResponse> {
    if (role !== "owner" && role !== "admin") {
      throw new ForbiddenError("FORBIDDEN", "无权限访问");
    }

    return DEFAULT_INSIGHT_SETTINGS;
  }

  async updateActionStatus(
    scope: InsightsTenantScope,
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
    scope: InsightsTenantScope,
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
      `rescan:${scope.tenantId}:${normalizedFrom}`,
    );

    return {
      jobId,
      status: "accepted",
    };
  }
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

function buildAgentStats(rows: InsightCurrentSessionRow[]) {
  const stats = new Map<
    string,
    {
      agentName: string;
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
