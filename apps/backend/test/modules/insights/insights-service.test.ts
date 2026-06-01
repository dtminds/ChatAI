import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "../../../src/shared/errors.js";
import {
  InsightsService,
  type InsightsRepositoryPort,
} from "../../../src/modules/insights/insights.service.js";

const scope = {
  tenantId: 9001,
};

const baseRows = [
  {
    actionOpenCount: 1,
    agentName: "客服一号",
    agentSeatId: "seat-1",
    analysisStatus: "ready",
    conversationId: "301",
    currentSnapshotId: "7001",
    customerName: "张三",
    endedAt: 1_780_245_000_000,
    highRiskCount: 1,
    lastCustomerMessageAt: 1_780_244_900_000,
    negativeCount: 1,
    phase: "final",
    problemDetected: true,
    problemEvidenceMessageIds: ["9001", "9002"],
    problemSummary: "客户反馈物流异常",
    resolutionStatus: "unresolved",
    riskSeverity: "high",
    sessionId: "501",
    startedAt: 1_780_243_200_000,
    summaryCustomerIntent: "查物流",
    summaryProcess: "客服要求客户等待",
    summaryResult: "未确认物流进展",
    summaryFollowUp: "需要确认快递状态",
    unresolvedReason: "售后/物流/退款进度未确认",
  },
  {
    actionOpenCount: 0,
    agentName: "客服二号",
    agentSeatId: "seat-2",
    analysisStatus: "partial",
    conversationId: "302",
    currentSnapshotId: "7002",
    customerName: "李四",
    endedAt: null,
    highRiskCount: 0,
    lastCustomerMessageAt: 1_780_243_900_000,
    negativeCount: 0,
    phase: "live",
    problemDetected: true,
    problemEvidenceMessageIds: ["9004"],
    problemSummary: "客户咨询退款到账时间",
    resolutionStatus: "partially_resolved",
    riskSeverity: "medium",
    sessionId: "502",
    startedAt: 1_780_243_000_000,
    summaryCustomerIntent: "退款咨询",
    summaryProcess: "客服说明会继续查询",
    summaryResult: "缺少明确到账时间",
    summaryFollowUp: null,
    unresolvedReason: "要求客户等待但未说明下一步",
  },
  {
    actionOpenCount: 0,
    agentName: null,
    agentSeatId: null,
    analysisStatus: "stale",
    conversationId: "303",
    currentSnapshotId: "7003",
    customerName: "王五",
    endedAt: null,
    highRiskCount: 0,
    lastCustomerMessageAt: null,
    negativeCount: 0,
    phase: "live",
    problemDetected: false,
    problemEvidenceMessageIds: [],
    problemSummary: "",
    resolutionStatus: "no_customer_problem",
    riskSeverity: null,
    sessionId: "503",
    startedAt: 1_780_242_000_000,
    summaryCustomerIntent: "活动寒暄",
    summaryProcess: "无明确问题",
    summaryResult: "无需处理",
    summaryFollowUp: null,
    unresolvedReason: null,
  },
] satisfies Awaited<ReturnType<InsightsRepositoryPort["listCurrentSessions"]>>;

function createRepository(
  overrides: Partial<InsightsRepositoryPort> = {},
): InsightsRepositoryPort {
  return {
    createRescanJob: vi.fn(async () => "8801"),
    findDetail: vi.fn(async () => ({
      actionItems: [
        {
          actionItemId: "801",
          actionType: "logistics_check",
          conversationId: "301",
          customerName: "张三",
          evidenceMessageIds: ["9002"],
          lastCustomerMessageAt: 1_780_244_900_000,
          priority: "high",
          reason: "物流进度未确认",
          sessionId: "501",
          status: "open",
          title: "确认快递状态",
        },
      ],
      current: baseRows[0],
      entities: [
        {
          entityId: "entity-1",
          entityName: "白色羽绒服",
          entityType: "product",
          evidenceMessageIds: ["9002"],
          sentiment: "negative",
        },
      ],
      faqCandidates: [
        {
          answerHint: "先核实物流停滞节点，再告知预计回复时间",
          evidenceMessageIds: ["9002"],
          question: "物流停滞怎么处理",
          status: "candidate",
        },
      ],
      intents: [
        {
          confidence: 0.84,
          evidenceMessageIds: ["9002"],
          intentCode: "logistics_delay",
          intentLabel: "物流异常",
        },
      ],
      problemEvidenceMessageIds: ["9001", "9002"],
      qaFindings: [{ ruleCode: "problem_resolution", passed: false }],
      risks: [{ riskLevel: "high", riskType: "bad_review" }],
      sentiment: [
        {
          confidence: 0.82,
          evidenceMessageIds: ["9002"],
          polarity: "negative",
          reason: "客户明确表达物流不更新的不满",
        },
      ],
      tags: [
        {
          confidence: 0.91,
          evidenceMessageIds: ["9002"],
          tagCode: "logistics_issue",
          tagName: "物流异常",
        },
      ],
    })),
    listActionItems: vi.fn(async () => [
      {
        actionItemId: "801",
        actionType: "logistics_check",
        conversationId: "301",
        customerName: "张三",
        evidenceMessageIds: ["9002"],
        lastCustomerMessageAt: 1_780_244_900_000,
        priority: "high",
        reason: "物流进度未确认",
        sessionId: "501",
        status: "open",
        title: "确认快递状态",
      },
      {
        actionItemId: "802",
        actionType: "faq_candidate_review",
        conversationId: "302",
        customerName: "李四",
        evidenceMessageIds: ["9004"],
        lastCustomerMessageAt: 1_780_243_900_000,
        priority: "medium",
        reason: "退款到账解释可沉淀",
        sessionId: "502",
        status: "done",
        title: "沉淀退款到账 FAQ",
      },
    ]),
    listCurrentSessions: vi.fn(async () => baseRows),
    listEvidenceMessages: vi.fn(async () => [
      {
        contentText: "还没收到货，物流也不更新",
        contentType: "text",
        messageId: "9002",
        msgtime: 1_780_244_100_000,
        senderName: "张三",
        senderRole: "customer",
      },
      {
        contentText: "帮您催一下快递",
        contentType: "text",
        messageId: "9001",
        msgtime: 1_780_244_000_000,
        senderName: "客服一号",
        senderRole: "agent",
      },
    ]),
    updateActionStatus: vi.fn(async () => true),
    ...overrides,
  };
}

describe("InsightsService", () => {
  it("aggregates overview metrics from current insight snapshots", async () => {
    const service = new InsightsService(createRepository());

    await expect(service.getOverview(scope)).resolves.toMatchObject({
      actionItemsOpen: 1,
      analysis: {
        failed: 0,
        partial: 1,
        ready: 1,
        stale: 1,
      },
      highRiskSessions: 1,
      negativeSessions: 1,
      problemSessions: 2,
      readySessions: 1,
      totalSessions: 3,
      unresolvedSessions: 2,
    });
  });

  it("builds service quality counts, unresolved ordering and reasons", async () => {
    const service = new InsightsService(createRepository());
    const result = await service.getQuality(scope);

    expect(result.overview).toMatchObject({
      analyzedSessions: 2,
      noCustomerProblem: 1,
      partial: 1,
      problemSessions: 2,
      resolved: 0,
      totalSessions: 3,
      unresolved: 1,
    });
    expect(result.unresolvedSessions.map((item) => item.sessionId)).toEqual(["501", "502"]);
    expect(result.unresolvedSessions[0]).toMatchObject({
      evidenceMessageIds: ["9001", "9002"],
      resolutionStatus: "unresolved",
      severity: "high",
      unresolvedReason: "售后/物流/退款进度未确认",
    });
    expect(result.unresolvedReasons).toEqual([
      {
        count: 1,
        reasonCode: "售后/物流/退款进度未确认",
        reasonLabel: "售后/物流/退款进度未确认",
      },
      {
        count: 1,
        reasonCode: "要求客户等待但未说明下一步",
        reasonLabel: "要求客户等待但未说明下一步",
      },
    ]);
  });

  it("filters follow-up action items by status", async () => {
    const service = new InsightsService(createRepository());

    await expect(service.getFollowUps(scope, { status: "open" })).resolves.toMatchObject({
      items: [
        {
          actionItemId: "801",
          conversationId: "301",
          evidenceMessageIds: ["9002"],
          status: "open",
        },
      ],
      total: 1,
    });
  });

  it("returns detail evidence sorted by msgtime and message id", async () => {
    const service = new InsightsService(createRepository());
    const result = await service.getDetail(scope, "501");

    expect(result.session).toMatchObject({
      conversationId: "301",
      customerName: "张三",
      sessionId: "501",
    });
    expect(result.evidenceMessages.map((item) => item.messageId)).toEqual(["9001", "9002"]);
    expect(result.problemResolution).toMatchObject({
      evidenceMessageIds: ["9001", "9002"],
      problemDetected: true,
      resolutionStatus: "unresolved",
    });
    expect(result.tags).toEqual([
      expect.objectContaining({
        evidenceMessageIds: ["9002"],
        tagCode: "logistics_issue",
      }),
    ]);
    expect(result.sentiment).toEqual([
      expect.objectContaining({
        evidenceMessageIds: ["9002"],
        polarity: "negative",
      }),
    ]);
    expect(result.entities).toEqual([
      expect.objectContaining({
        entityName: "白色羽绒服",
        evidenceMessageIds: ["9002"],
      }),
    ]);
    expect(result.intents).toEqual([
      expect.objectContaining({
        intentCode: "logistics_delay",
        evidenceMessageIds: ["9002"],
      }),
    ]);
    expect(result.faqCandidates).toEqual([
      expect.objectContaining({
        evidenceMessageIds: ["9002"],
        question: "物流停滞怎么处理",
      }),
    ]);
  });

  it("rejects settings access for non-admin roles at the service boundary", async () => {
    const service = new InsightsService(createRepository());

    await expect(service.getSettings(scope, "operator")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.getSettings(scope, "admin")).resolves.toMatchObject({
      sessionization: {
        idleTimeoutMinutes: 120,
      },
    });
  });

  it("updates action item status only for supported manual statuses", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(service.updateActionStatus(scope, "801", "done")).resolves.toMatchObject({
      actionItemId: "801",
      status: "done",
    });
    expect(repository.updateActionStatus).toHaveBeenCalledWith(scope, "801", "done");
  });

  it("creates historical rescan jobs with a stable idempotency key", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(service.createRescanJob(scope, { from: "2026-06-01T00:00:00.000Z" })).resolves.toEqual({
      jobId: "8801",
      status: "accepted",
    });
    expect(repository.createRescanJob).toHaveBeenCalledWith(
      scope,
      new Date("2026-06-01T00:00:00.000Z"),
      "rescan:9001:2026-06-01T00:00:00.000Z",
    );
  });

  it("throws not found when a detail session is outside tenant scope", async () => {
    const service = new InsightsService(createRepository({ findDetail: vi.fn(async () => undefined) }));

    await expect(service.getDetail(scope, "999")).rejects.toBeInstanceOf(NotFoundError);
  });
});
