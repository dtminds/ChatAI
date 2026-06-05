import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "../../../src/shared/errors.js";
import {
  InsightsService,
  type InsightsRepositoryPort,
} from "../../../src/modules/insights/insights.service.js";

const scope = {
  uid: 9001,
};

const baseRows = [
  {
    actionOpenCount: 1,
    agentAvatarUrl: "https://example.com/agent-1.png",
    agentMessageCount: 3,
    agentName: "客服一号",
    agentSeatId: "seat-1",
    analysisStatus: "ready",
    conversationId: "301",
    currentSnapshotId: "7001",
    generatedAt: 1_780_245_100_000,
    customerAvatarUrl: "https://example.com/customer-1.png",
    customerMessageCount: 5,
    customerName: "张三",
    assets: [
      {
        assetCode: "link:9002",
        assetName: "物流详情页",
        assetType: "link",
      },
    ],
    endedAt: 1_780_245_000_000,
    lastMessageAt: 1_780_244_950_000,
    lastCustomerMessageAt: 1_780_244_900_000,
    messageCount: 8,
    phase: "final",
    problemDetected: true,
    problemEvidenceMessageIds: ["9001", "9002"],
    problemResolutionConfidence: 0.84,
    problemSummary: "客户反馈物流异常",
    resolutionStatus: "unresolved",
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
    agentAvatarUrl: "https://example.com/agent-2.png",
    agentMessageCount: 2,
    agentName: "客服二号",
    agentSeatId: "seat-2",
    analysisStatus: "partial",
    conversationId: "302",
    currentSnapshotId: "7002",
    generatedAt: 1_780_244_600_000,
    customerAvatarUrl: "https://example.com/customer-2.png",
    customerMessageCount: 3,
    customerName: "李四",
    endedAt: null,
    lastMessageAt: 1_780_243_950_000,
    lastCustomerMessageAt: 1_780_243_900_000,
    messageCount: 5,
    phase: "live",
    problemDetected: true,
    problemEvidenceMessageIds: ["9004"],
    problemSummary: "客户咨询退款到账时间",
    resolutionStatus: "partially_resolved",
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
    agentAvatarUrl: null,
    agentMessageCount: 1,
    agentName: null,
    agentSeatId: null,
    analysisStatus: "stale",
    conversationId: "303",
    currentSnapshotId: "7003",
    generatedAt: 1_780_242_500_000,
    customerAvatarUrl: "https://example.com/customer-3.png",
    customerMessageCount: 1,
    customerName: "王五",
    endedAt: null,
    lastMessageAt: null,
    lastCustomerMessageAt: null,
    messageCount: 2,
    phase: "live",
    problemDetected: false,
    problemEvidenceMessageIds: [],
    problemSummary: "",
    resolutionStatus: "no_customer_problem",
    sessionId: "503",
    startedAt: 1_780_242_000_000,
    summaryCustomerIntent: "活动寒暄",
    summaryProcess: "无明确问题",
    summaryResult: "无需处理",
    summaryFollowUp: null,
    unresolvedReason: null,
  },
  {
    actionOpenCount: 1,
    agentAvatarUrl: "https://example.com/agent-3.png",
    agentMessageCount: 1,
    agentName: "客服三号",
    agentSeatId: "seat-3",
    analysisStatus: "ready",
    conversationId: "304",
    currentSnapshotId: "7004",
    generatedAt: 1_780_241_500_000,
    customerAvatarUrl: "https://example.com/customer-4.png",
    customerMessageCount: 1,
    customerName: "赵六",
    endedAt: null,
    lastMessageAt: 1_780_241_400_000,
    lastCustomerMessageAt: 1_780_241_400_000,
    messageCount: 2,
    phase: "live",
    problemDetected: true,
    problemEvidenceMessageIds: ["9006"],
    problemSummary: "消息不足，无法判断客户问题",
    resolutionStatus: "unknown",
    sessionId: "504",
    startedAt: 1_780_241_000_000,
    summaryCustomerIntent: "消息不足",
    summaryProcess: "消息不足",
    summaryResult: "无法判断",
    summaryFollowUp: null,
    unresolvedReason: null,
  },
];

const overviewAggregate = {
  actionItemsOpen: 1,
  analysis: {
    failed: 0,
    partial: 1,
    ready: 2,
    stale: 1,
  },
  problemSessions: 2,
  readySessions: 2,
  resolution: {
    noCustomerProblem: 1,
    partiallyResolved: 1,
    resolved: 0,
    unknown: 1,
    unresolved: 1,
  },
  totalSessions: 4,
  totals: {
    agentMessages: 7,
    consultingCustomers: 4,
    customerMessages: 10,
    logicalSessions: 4,
    messages: 17,
  },
  trend: [
    {
      agentMessages: 4,
      consultingCustomers: 3,
      customerMessages: 5,
      date: "2026-05-31",
      logicalSessions: 3,
      messages: 9,
    },
    {
      agentMessages: 3,
      consultingCustomers: 1,
      customerMessages: 5,
      date: "2026-06-01",
      logicalSessions: 1,
      messages: 8,
    },
  ],
  unresolvedSessions: 2,
} satisfies Awaited<ReturnType<InsightsRepositoryPort["getOverviewAggregate"]>>;

const qualityAggregate = {
  analyzedSessions: 3,
  inspectionRate: 0,
  noCustomerProblem: 1,
  partial: 1,
  passRate: 0,
  problemSessions: 2,
  resolved: 0,
  ruleDistribution: [],
  totalSessions: 4,
  unresolved: 1,
} satisfies Awaited<NonNullable<InsightsRepositoryPort["getQualityAggregate"]>>;

const qaFindingAggregate = {
  inspectionRate: 0.75,
  passRate: 0.5,
  ruleDistribution: [
    { count: 2, ruleCode: "reply_quality", ruleName: "回复质量" },
  ],
} satisfies Awaited<NonNullable<InsightsRepositoryPort["getQaFindingAggregate"]>>;

const qualityAgentStats = [
  {
    agentAvatarUrl: "https://example.com/agent-1.png",
    agentName: "客服一号",
    agentSeatId: "seat-1",
    partial: 0,
    problemSessions: 1,
    resolved: 0,
    totalSessions: 1,
    unresolved: 1,
    unresolvedRate: 1,
  },
  {
    agentAvatarUrl: "https://example.com/agent-2.png",
    agentName: "客服二号",
    agentSeatId: "seat-2",
    partial: 1,
    problemSessions: 1,
    resolved: 0,
    totalSessions: 1,
    unresolved: 0,
    unresolvedRate: 0,
  },
] satisfies Awaited<NonNullable<InsightsRepositoryPort["listQualityAgentStats"]>>;

const businessSessionAggregates = baseRows.map((row) => ({
  actionItemsOpen: ["partially_resolved", "unresolved"].includes(row.resolutionStatus)
    ? row.actionOpenCount
    : 0,
  analyzedSessions: ["partial", "ready"].includes(row.analysisStatus) ? 1 : 0,
  date: new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(new Date(row.startedAt)),
  sessionId: row.sessionId,
  startedAt: row.startedAt,
  unresolvedSessions: ["partially_resolved", "unresolved"].includes(row.resolutionStatus) ? 1 : 0,
})) satisfies Awaited<NonNullable<InsightsRepositoryPort["listBusinessSessionAggregates"]>>;

function createRepository(
  overrides: Partial<InsightsRepositoryPort> = {},
): InsightsRepositoryPort {
  return {
    createRescanJob: vi.fn(async () => ({ jobId: "8801", taskId: "9901" })),
    findDetail: vi.fn(async () => ({
      actionItems: [
        {
          actionItemId: "801",
          conversationId: "301",
          customerAvatarUrl: "https://example.com/customer-1.png",
          customerName: "张三",
          evidenceMessageIds: ["9002"],
          priority: "high",
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
      evidenceItems: [
        {
          dimensionType: "problem_resolution",
          evidenceRole: "customer_problem",
          messageId: "9002",
          reason: "客户说明还没收到货且物流不更新",
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
        conversationId: "301",
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerName: "张三",
        createdAt: 1_780_244_800_000,
        priority: "high",
        resolutionStatus: "unresolved",
        sessionId: "501",
        status: "open",
        title: "确认快递状态",
      },
      {
        actionItemId: "802",
        conversationId: "302",
        customerAvatarUrl: "https://example.com/customer-2.png",
        customerName: "李四",
        createdAt: 1_780_243_800_000,
        priority: "medium",
        resolutionStatus: "partially_resolved",
        sessionId: "502",
        status: "done",
        title: "沉淀退款到账 FAQ",
      },
      {
        actionItemId: "803",
        conversationId: "304",
        customerAvatarUrl: "https://example.com/customer-4.png",
        customerName: "赵六",
        createdAt: 1_780_241_300_000,
        priority: "high",
        resolutionStatus: "unknown",
        sessionId: "504",
        status: "open",
        title: "复核消息不足会话",
      },
    ]),
    listBusinessTopicFacts: vi.fn(async () => [
      {
        code: "logistics_issue",
        dimension: "tag",
        mentionCount: 1,
        name: "物流异常",
        sessionId: "501",
        snapshotId: "7001",
        startedAt: 1_780_243_200_000,
      },
      {
        code: "refund",
        dimension: "tag",
        mentionCount: 1,
        name: "退款咨询",
        sessionId: "502",
        snapshotId: "7002",
        startedAt: 1_780_243_000_000,
      },
      {
        code: "sku-1",
        dimension: "entity",
        mentionCount: 2,
        name: "白色羽绒服",
        sentiment: "negative",
        sessionId: "501",
        snapshotId: "7001",
        startedAt: 1_780_243_200_000,
        type: "product",
      },
      {
        code: "https://example.com/promo",
        dimension: "asset",
        mentionCount: 2,
        name: "红包活动",
        sessionId: "501",
        snapshotId: "7001",
        startedAt: 1_780_243_200_000,
        type: "link",
      },
      {
        code: "logistics_delay",
        dimension: "intent",
        mentionCount: 1,
        name: "物流异常",
        sessionId: "501",
        snapshotId: "7001",
        startedAt: 1_780_243_200_000,
      },
    ]),
    getQualityAggregate: vi.fn(async () => qualityAggregate),
    getOverviewAggregate: vi.fn(async () => overviewAggregate),
    hasActiveRescanTask: vi.fn(async () => false),
    listQualityAgentStats: vi.fn(async () => qualityAgentStats),
    listBusinessSessionAggregates: vi.fn(async () => businessSessionAggregates),
    listAllCurrentSessions: vi.fn(async () => baseRows),
    listCurrentSessions: vi.fn(async (_scope, filters) => ({
      items: filters?.pageSize === 10_000 || filters?.problemScope === "unresolved"
        ? baseRows.filter((row) => ["partially_resolved", "unresolved"].includes(row.resolutionStatus))
        : [baseRows[0]],
      total: baseRows.length,
    })),
    listRescanTasks: vi.fn(async () => ({
      items: [
        {
          analysisScope: "classification",
          createTime: 1_780_243_200_000,
          createdBy: "客服主管",
          failedSessions: 2,
          finishedAt: 1_780_246_800_000,
          from: "2026-06-01T00:00:00.000Z",
          queuedSessions: 20,
          startedAt: 1_780_243_300_000,
          status: "partial",
          succeededSessions: 18,
          taskId: "9901",
          to: "2026-06-02T00:00:00.000Z",
          totalSessions: 20,
          updateTime: 1_780_246_800_000,
        },
      ],
      total: 1,
    })),
    listEntityHotspots: vi.fn(async () => [
      {
        entityId: "sku-1",
        entityName: "白色羽绒服",
        entityType: "product",
        mentionCount: 2,
        negativeCount: 1,
        sessionCount: 1,
      },
    ]),
    listIntentDistribution: vi.fn(async () => [
      {
        count: 2,
        intentCode: "logistics_delay",
        intentLabel: "物流异常",
      },
    ]),
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
    listEvidenceMessageRecords: vi.fn(async () => [
      {
        content: { text: "帮您催一下快递" },
        contentType: "text",
        conversationId: "301",
        createdAt: 1_780_244_000_000,
        customerId: "customer-301",
        messageId: "external-msg-9001",
        seatId: "seat-1",
        senderName: "客服一号",
        senderType: "agent",
        seq: 9001,
        status: "sent",
      },
      {
        content: { text: "还没收到货，物流也不更新" },
        contentType: "text",
        conversationId: "301",
        createdAt: 1_780_244_100_000,
        customerId: "customer-301",
        messageId: "external-msg-9002",
        seatId: "seat-1",
        senderName: "张三",
        senderType: "customer",
        seq: 9002,
        status: "sent",
      },
    ]),
    listSessionMessageRecords: vi.fn(async () => [
      {
        content: { text: "帮您催一下快递" },
        contentType: "text",
        conversationId: "301",
        createdAt: 1_780_244_000_000,
        customerId: "customer-301",
        messageId: "external-msg-9001",
        seatId: "seat-1",
        senderName: "客服一号",
        senderType: "agent",
        seq: 9001,
        status: "sent",
      },
      {
        content: { text: "还没收到货，物流也不更新" },
        contentType: "text",
        conversationId: "301",
        createdAt: 1_780_244_100_000,
        customerId: "customer-301",
        messageId: "external-msg-9002",
        seatId: "seat-1",
        senderName: "张三",
        senderType: "customer",
        seq: 9002,
        status: "sent",
      },
    ]),
    listMessageContext: vi.fn(async () => ({
      contextBefore: 30,
      contextAfter: 30,
      conversationId: "301",
      targetMessageId: "9002",
      messages: [
        {
          content: { text: "帮您催一下快递" },
          contentType: "text",
          conversationId: "301",
          createdAt: 1_780_244_000_000,
          customerId: "customer-301",
          messageId: "external-msg-9001",
          seatId: "seat-1",
          senderName: "客服一号",
          senderType: "agent",
          seq: 9001,
          status: "sent",
        },
        {
          content: { text: "还没收到货，物流也不更新" },
          contentType: "text",
          conversationId: "301",
          createdAt: 1_780_244_100_000,
          customerId: "customer-301",
          messageId: "external-msg-9002",
          seatId: "seat-1",
          senderName: "张三",
          senderType: "customer",
          seq: 9002,
          status: "sent",
        },
      ],
    })),
    getSettings: vi.fn(async () => ({
      analysisPolicy: {
        finalAnalysisEnabled: true,
        liveAnalysisEnabled: true,
        liveMinIntervalMinutes: 15,
        liveMinNewMeaningfulMessages: 20,
        lowConfidenceThreshold: 0.6,
        ruleFallbackEnabled: true,
      },
      entityDictionary: [
        {
          aliases: ["白鸭绒外套"],
          canonicalName: "白色羽绒服",
          enabled: true,
          entityType: "product",
          id: "41",
          includeInAggregation: true,
        },
      ],
      intentConfigs: [
        {
          aliases: ["物流", "查快递"],
          description: "客户咨询发货、快递或物流异常",
          enabled: true,
          id: "31",
          includeInStatistics: true,
          intentCode: "logistics_delay",
          intentName: "物流异常",
          negativeExamples: ["咨询退款到账"],
          positiveExamples: ["快递一直没更新"],
          weight: 8,
        },
      ],
      labelConfigs: [
        {
          enabled: true,
          id: "11",
          includeInStatistics: true,
          labelCode: "price_sensitive",
          labelName: "价格敏感",
        },
      ],
      qaRuleConfigs: [
        {
          enabled: true,
          id: "21",
          ruleCode: "problem_resolution",
          ruleName: "客户问题是否解决",
          severity: "high",
        },
      ],
      sessionization: {
        analysisDelayMinutes: 10,
        hardMaxDurationHours: 8,
        idleTimeoutMinutes: 120,
        lateArrivalWindowMinutes: 30,
        preset: "custom",
      },
    })),
    upsertAnalysisPolicy: vi.fn(async (_scope, payload) => payload),
    upsertSessionizationSettings: vi.fn(async (_scope, payload) => payload),
    createIntentConfig: vi.fn(async (_scope, payload) => ({ ...payload, id: "90" })),
    updateIntentConfig: vi.fn(async (_scope, id, payload) => ({ ...payload, id })),
    updateIntentConfigStatus: vi.fn(async (_scope, id, enabled) => ({
      enabled,
      id,
      includeInStatistics: true,
      intentCode: "logistics_delay",
      intentName: "物流异常",
      weight: 8,
    })),
    deleteIntentConfig: vi.fn(async () => true),
    createLabelConfig: vi.fn(async (_scope, payload) => ({ ...payload, id: "91" })),
    updateLabelConfig: vi.fn(async (_scope, id, payload) => ({ ...payload, id })),
    updateLabelConfigStatus: vi.fn(async (_scope, id, enabled) => ({
      enabled,
      id,
      includeInStatistics: true,
      labelCode: "price_sensitive",
      labelName: "价格敏感",
    })),
    deleteLabelConfig: vi.fn(async () => true),
    createQaRuleConfig: vi.fn(async (_scope, payload) => ({ ...payload, id: "92" })),
    updateQaRuleConfig: vi.fn(async (_scope, id, payload) => ({ ...payload, id })),
    updateQaRuleConfigStatus: vi.fn(async (_scope, id, enabled) => ({
      enabled,
      id,
      ruleCode: "problem_resolution",
      ruleName: "客户问题是否解决",
      severity: "high",
    })),
    deleteQaRuleConfig: vi.fn(async () => true),
    createEntityDictionaryItem: vi.fn(async (_scope, payload) => ({ ...payload, id: "94" })),
    updateEntityDictionaryItem: vi.fn(async (_scope, id, payload) => ({ ...payload, id })),
    updateEntityDictionaryItemStatus: vi.fn(async (_scope, id, enabled) => ({
      aliases: ["白鸭绒外套"],
      canonicalName: "白色羽绒服",
      enabled,
      entityType: "product",
      id,
      includeInAggregation: true,
    })),
    deleteEntityDictionaryItem: vi.fn(async () => true),
    updateActionStatus: vi.fn(async () => true),
    ...overrides,
  };
}

describe("InsightsService", () => {
  it("defaults overview reads to a recent bounded date range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T12:00:00.000Z"));
    const repository = createRepository();
    const service = new InsightsService(repository);

    try {
      await service.getOverview(scope);

      expect(repository.getOverviewAggregate).toHaveBeenCalledWith(scope, {
        from: "2026-05-07T00:00:00.000+08:00",
        to: "2026-06-05T23:59:59.999+08:00",
      });
      expect(repository.listBusinessSessionAggregates).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("aggregates overview metrics from current insight snapshots", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);
    const result = await service.getOverview(scope, {
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(result).toMatchObject({
      actionItemsOpen: 1,
      analysis: {
        failed: 0,
        partial: 1,
        ready: 2,
        stale: 1,
      },
      entityHotspots: [
        expect.objectContaining({
          entityName: "白色羽绒服",
          mentionCount: 2,
        }),
      ],
      intentDistribution: [
        expect.objectContaining({
          count: 2,
          intentCode: "logistics_delay",
        }),
      ],
      problemSessions: 2,
      readySessions: 2,
      resolution: {
        noCustomerProblem: 1,
        partiallyResolved: 1,
        resolved: 0,
        unknown: 1,
        unresolved: 1,
      },
      totalSessions: 4,
      totals: {
        agentMessages: 7,
        consultingCustomers: 4,
        customerMessages: 10,
        logicalSessions: 4,
        messages: 17,
      },
      trend: [
        expect.objectContaining({
          agentMessages: 4,
          consultingCustomers: 3,
          customerMessages: 5,
          date: "2026-05-31",
          logicalSessions: 3,
          messages: 9,
        }),
        expect.objectContaining({
          agentMessages: 3,
          consultingCustomers: 1,
          customerMessages: 5,
          date: "2026-06-01",
          logicalSessions: 1,
          messages: 8,
        }),
      ],
      unresolvedSessions: 2,
    });
    expect(result).not.toHaveProperty("sessions");
    expect(repository.getOverviewAggregate).toHaveBeenCalledWith(scope, {
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(repository.listCurrentSessions).not.toHaveBeenCalled();
  });

  it("paginates overview sessions separately from overview metrics", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);
    const result = await service.getOverviewSessions(scope, {
      from: "2026-06-01",
      page: 2,
      pageSize: 1,
      resolutionStatus: "unresolved",
      to: "2026-06-30",
    });

    expect(result).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 4,
      totalPages: 4,
      items: [
        expect.objectContaining({
          customerName: "张三",
          messageCount: 8,
          sessionId: "501",
        }),
      ],
    });
    expect(repository.getOverviewAggregate).not.toHaveBeenCalled();
    expect(repository.listCurrentSessions).toHaveBeenCalledWith(scope, {
      from: "2026-06-01",
      page: 2,
      pageSize: 1,
      resolutionStatus: "unresolved",
      to: "2026-06-30",
    });
  });

  it("builds service quality counts, unresolved ordering and reasons", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);
    const result = await service.getQuality(scope);

    expect(result.overview).toMatchObject({
      analyzedSessions: 3,
      noCustomerProblem: 1,
      partial: 1,
      problemSessions: 2,
      resolved: 0,
      totalSessions: 4,
      unresolved: 1,
    });
    expect(result.unresolvedSessions.map((item) => item.sessionId)).toEqual(["501", "502"]);
    expect(result.unresolvedSessions[0]).toMatchObject({
      evidenceMessageIds: ["9001", "9002"],
      resolutionStatus: "unresolved",
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
    expect(repository.getQualityAggregate).toHaveBeenCalledWith(scope, {
      from: undefined,
      to: undefined,
    });
    expect(repository.listQualityAgentStats).toHaveBeenCalledWith(scope, {
      from: undefined,
      to: undefined,
    });
    expect(repository.listAllCurrentSessions).not.toHaveBeenCalled();
    expect(repository.listCurrentSessions).toHaveBeenCalledWith(scope, expect.objectContaining({
      from: undefined,
      page: 1,
      pageSize: 20,
      problemScope: "unresolved",
      to: undefined,
    }));
  });

  it("merges QA finding aggregate into the quality overview", async () => {
    const repository = createRepository({
      getQaFindingAggregate: vi.fn(async () => qaFindingAggregate),
    });
    const service = new InsightsService(repository);
    const result = await service.getQuality(scope, {
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(result.overview).toMatchObject({
      analyzedSessions: 3,
      inspectionRate: 0.75,
      passRate: 0.5,
      ruleDistribution: [
        { count: 2, ruleCode: "reply_quality", ruleName: "回复质量" },
      ],
      totalSessions: 4,
    });
    expect(repository.getQaFindingAggregate).toHaveBeenCalledWith(scope, {
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("paginates quality unresolved sessions", async () => {
    const repository = createRepository({
      listCurrentSessions: vi.fn(async (_scope, filters) => ({
        items: [baseRows[1]],
        total: 2,
      })),
    });
    const service = new InsightsService(repository);

    const result = await service.getQuality(scope, {
      from: "2026-06-01",
      page: 2,
      pageSize: 1,
      to: "2026-06-30",
    });

    expect(result.unresolvedSessions).toEqual([
      expect.objectContaining({
        sessionId: "502",
      }),
    ]);
    expect(result.unresolvedSessionsPage).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(repository.listCurrentSessions).toHaveBeenCalledWith(scope, {
      from: "2026-06-01",
      page: 2,
      pageSize: 1,
      problemScope: "unresolved",
      to: "2026-06-30",
    });
    expect(repository.listQualityAgentStats).toHaveBeenCalledWith(scope, {
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("builds business topic analytics from current snapshots", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);
    const result = await service.getBusiness(scope);

    expect(result.totals).toMatchObject({
      actionItemsOpen: 1,
      analyzedSessions: 3,
      assetMentions: 2,
      entityMentions: 2,
      intentMentions: 1,
      tagMentions: 2,
      topicSessions: 2,
      unresolvedSessions: 2,
    });
    expect(result.tagDistribution).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "logistics_issue",
        dimension: "tag",
        name: "物流异常",
        sessionCount: 1,
        unresolvedSessions: 1,
      }),
      expect.objectContaining({
        code: "refund",
        name: "退款咨询",
      }),
    ]));
    expect(result.entityHotspots[0]).toMatchObject({
      code: "sku-1",
      mentionCount: 2,
      name: "白色羽绒服",
      negativeSessions: 1,
      type: "product",
    });
    expect(result.assetHotspots[0]).toMatchObject({
      code: "https://example.com/promo",
      dimension: "asset",
      mentionCount: 2,
      name: "红包活动",
      type: "link",
    });
    expect(result.intentDistribution[0]).toMatchObject({
      code: "logistics_delay",
      name: "物流异常",
    });
    expect(result.intentTrend).toEqual([
      {
        date: "2026-06-01",
        intentCode: "logistics_delay",
        intentName: "物流异常",
        sessionCount: 1,
      },
    ]);
    expect(result.qualityTopics[0]).toEqual(
      expect.objectContaining({
        actionItemsOpen: 1,
        name: "白色羽绒服",
        unresolvedRate: 1,
      }),
    );
    expect(result.trend).toEqual([
      expect.objectContaining({
        date: "2026-05-31",
        tagMentions: 1,
        topicSessions: 1,
      }),
      expect.objectContaining({
        date: "2026-06-01",
        entityMentions: 2,
        intentMentions: 1,
        tagMentions: 1,
        negativeSessions: 1,
        topicSessions: 1,
        unresolvedSessions: 1,
      }),
    ]);
    expect(repository.listBusinessSessionAggregates).toHaveBeenCalledWith(scope, expect.objectContaining({
      from: expect.any(String),
      to: expect.any(String),
    }));
    expect(repository.listAllCurrentSessions).not.toHaveBeenCalled();
    expect(repository.listCurrentSessions).not.toHaveBeenCalled();
  });

  it("defaults business reads to a recent bounded date range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T12:00:00.000Z"));
    const repository = createRepository();
    const service = new InsightsService(repository);

    try {
      await service.getBusiness(scope);

      expect(repository.listBusinessSessionAggregates).toHaveBeenCalledWith(scope, {
        from: "2026-05-07T00:00:00.000+08:00",
        to: "2026-06-05T23:59:59.999+08:00",
      });
      expect(repository.listBusinessTopicFacts).toHaveBeenCalledWith(scope, {
        from: "2026-05-07T00:00:00.000+08:00",
        to: "2026-06-05T23:59:59.999+08:00",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("paginates business related sessions by selected topic facts", async () => {
    const repository = createRepository({
      listCurrentSessions: vi.fn(async (_scope, filters) => ({
        items: [baseRows[0]],
        total: 1,
      })),
    });
    const service = new InsightsService(repository);

    const result = await service.getBusinessRelatedSessions(scope, {
      dimension: "intent",
      from: "2026-06-01",
      keyword: "物流",
      page: 2,
      pageSize: 1,
      topicCode: "logistics_delay",
      to: "2026-06-30",
    });

    expect(result).toMatchObject({
      items: [
        expect.objectContaining({
          problemSummary: "客户反馈物流异常",
          sessionId: "501",
        }),
      ],
      page: 2,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });
    expect(repository.listBusinessTopicFacts).toHaveBeenCalledWith(scope, expect.objectContaining({
      dimension: "intent",
      topicCode: "logistics_delay",
    }));
    expect(repository.listCurrentSessions).toHaveBeenCalledWith(scope, {
      from: "2026-06-01",
      keyword: "物流",
      page: 2,
      pageSize: 1,
      sessionIds: ["501"],
      to: "2026-06-30",
    });
    expect(repository.listAllCurrentSessions).not.toHaveBeenCalled();
  });

  it("filters follow-up action items by status", async () => {
    const service = new InsightsService(createRepository());

    await expect(service.getFollowUps(scope, { status: "open" })).resolves.toMatchObject({
      items: [
        {
          actionItemId: "801",
          conversationId: "301",
          createdAt: 1_780_244_800_000,
          status: "open",
        },
      ],
      total: 1,
    });
  });

  it("paginates follow-up action items", async () => {
    const repository = createRepository({
      listActionItems: vi.fn(async () => [
        {
          actionItemId: "801",
          conversationId: "301",
          customerAvatarUrl: "https://example.com/customer-1.png",
          customerName: "张三",
          createdAt: 1_780_244_800_000,
          priority: "high",
          resolutionStatus: "unresolved",
          sessionId: "501",
          status: "open",
          title: "确认快递状态",
        },
        {
          actionItemId: "802",
          conversationId: "302",
          customerAvatarUrl: "https://example.com/customer-2.png",
          customerName: "李四",
          createdAt: 1_780_243_800_000,
          priority: "medium",
          resolutionStatus: "partially_resolved",
          sessionId: "502",
          status: "open",
          title: "沉淀退款到账 FAQ",
        },
      ]),
    });
    const service = new InsightsService(repository);

    const result = await service.getFollowUps(scope, {
      page: 2,
      pageSize: 1,
      status: "open",
    });

    expect(result).toMatchObject({
      items: [
        expect.objectContaining({
          actionItemId: "801",
        }),
      ],
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(repository.listActionItems).toHaveBeenCalledWith(scope, {
      page: 2,
      pageSize: 1,
      status: "open",
    });
  });

  it("returns detail evidence sorted by msgtime and message id", async () => {
    const service = new InsightsService(createRepository());
    const result = await service.getDetail(scope, "501");

    expect(result.session).toMatchObject({
      agentAvatarUrl: "https://example.com/agent-1.png",
      agentName: "客服一号",
      conversationId: "301",
      customerAvatarUrl: "https://example.com/customer-1.png",
      customerName: "张三",
      generatedAt: 1_780_245_100_000,
      sessionId: "501",
    });
    expect(result.evidenceMessages.map((item) => item.messageId)).toEqual(["9001", "9002"]);
    expect(result.evidenceMessageRecords.map((item) => item.seq)).toEqual([9001, 9002]);
    expect(result.evidenceMessageRecords.map((item) => item.messageId)).toEqual([
      "external-msg-9001",
      "external-msg-9002",
    ]);
    expect(result.sessionMessageRecords.map((item) => item.seq)).toEqual([9001, 9002]);
    expect(result.evidenceItems).toEqual([
      expect.objectContaining({
        evidenceRole: "customer_problem",
        messageId: "9002",
      }),
    ]);
    expect(result.problemResolution).toMatchObject({
      confidence: 0.84,
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

  it("keeps hydrated overview assets in session responses", async () => {
    const service = new InsightsService(createRepository());

    const result = await service.getOverviewSessions(scope);

    expect(result.items[0]).toMatchObject({
      assets: [
        {
          assetCode: "link:9002",
          assetName: "物流详情页",
          assetType: "link",
        },
      ],
      sessionId: "501",
    });
  });

  it("loads a fixed evidence message context window", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(service.getMessageContext(scope, "301", "9002")).resolves.toMatchObject({
      contextAfter: 30,
      contextBefore: 30,
      conversationId: "301",
      targetMessageId: "9002",
      messages: [
        { messageId: "external-msg-9001", seq: 9001 },
        { messageId: "external-msg-9002", seq: 9002 },
      ],
    });

    expect(repository.listMessageContext).toHaveBeenCalledWith(scope, "301", "9002", {
      after: 30,
      before: 30,
    });
  });

  it("rejects settings access for non-admin roles at the service boundary", async () => {
    const service = new InsightsService(createRepository());

    await expect(service.getSettings(scope, "operator")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.getSettings(scope, "admin")).resolves.toMatchObject({
      intentConfigs: [
        expect.objectContaining({
          intentCode: "logistics_delay",
          intentName: "物流异常",
        }),
      ],
      sessionization: {
        idleTimeoutMinutes: 120,
      },
    });
  });

  it("persists insight settings mutations for admin roles", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(
      service.updateSessionizationSettings(scope, "admin", {
        analysisDelayMinutes: 8,
        hardMaxDurationHours: 36,
        idleTimeoutMinutes: 90,
        lateArrivalWindowMinutes: 20,
        preset: "custom",
      }),
    ).resolves.toMatchObject({ idleTimeoutMinutes: 90 });
    expect(repository.upsertSessionizationSettings).toHaveBeenCalledWith(scope, {
      analysisDelayMinutes: 8,
      hardMaxDurationHours: 36,
      idleTimeoutMinutes: 90,
      lateArrivalWindowMinutes: 20,
      preset: "custom",
    });

    await expect(
      service.createIntentConfig(scope, "admin", {
        aliases: ["物流", "查快递"],
        description: "客户咨询发货、快递或物流异常",
        enabled: true,
        includeInStatistics: true,
        intentCode: "logistics_delay",
        intentName: "物流异常",
        negativeExamples: ["咨询退款到账"],
        positiveExamples: ["快递一直没更新"],
        weight: 8,
      }),
    ).resolves.toMatchObject({ id: "90", intentCode: "logistics_delay" });
    expect(repository.createIntentConfig).toHaveBeenCalled();

    await expect(
      service.updateIntentConfigStatus(scope, "admin", "90", { enabled: false }),
    ).resolves.toMatchObject({ enabled: false, id: "90" });
    expect(repository.updateIntentConfigStatus).toHaveBeenCalledWith(scope, "90", false);

    await expect(
      service.createLabelConfig(scope, "admin", {
        enabled: true,
        includeInStatistics: true,
        labelCode: "retention",
        labelName: "挽留机会",
      }),
    ).resolves.toMatchObject({ id: "91", labelCode: "retention" });
    expect(repository.createLabelConfig).toHaveBeenCalled();
  });

  it("throws not found when deleting missing insight config records", async () => {
    const service = new InsightsService(createRepository({ deleteQaRuleConfig: vi.fn(async () => false) }));

    await expect(service.deleteQaRuleConfig(scope, "admin", "999")).rejects.toBeInstanceOf(NotFoundError);
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

  it("creates a scoped historical rescan task on each manual trigger", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(
      service.createRescanJob(
        scope,
        {
          analysisScope: "qaFindings",
          from: "2026-06-01T00:00:00.000Z",
          to: "2026-06-02T00:00:00.000Z",
        },
        "客服主管",
      ),
    ).resolves.toEqual({
      jobId: "8801",
      status: "accepted",
      taskId: "9901",
    });
    expect(repository.createRescanJob).toHaveBeenCalledWith(
      scope,
      {
        analysisScope: "qaFindings",
        createdBy: "客服主管",
        from: new Date("2026-06-01T00:00:00.000Z"),
        to: new Date("2026-06-02T00:00:00.000Z"),
      },
      expect.stringMatching(/^rescan:9001:qaFindings:2026-06-01T00:00:00\.000Z:2026-06-02T00:00:00\.000Z:/),
    );
  });

  it("rejects rescan tasks with an end time before the start time", async () => {
    const service = new InsightsService(createRepository());

    await expect(
      service.createRescanJob(scope, {
        analysisScope: "all",
        from: "2026-06-02T00:00:00.000Z",
        to: "2026-06-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESCAN_RANGE" });
  });

  it("rejects creating a rescan task when another task is active", async () => {
    const repository = createRepository({
      hasActiveRescanTask: vi.fn(async () => true),
    });
    const service = new InsightsService(repository);

    await expect(
      service.createRescanJob(scope, {
        analysisScope: "qaFindings",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-02T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "RESCAN_TASK_ACTIVE" });
    expect(repository.createRescanJob).not.toHaveBeenCalled();
  });

  it("lists historical rescan tasks with progress text", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(service.listRescanTasks(scope)).resolves.toEqual({
      items: [
        expect.objectContaining({
          analysisScope: "classification",
          progressText: "20 / 20",
          status: "partial",
          taskId: "9901",
        }),
      ],
      total: 1,
    });
    expect(repository.listRescanTasks).toHaveBeenCalledWith(scope, { limit: 20 });
  });

  it("throws not found when a detail session is outside uid scope", async () => {
    const service = new InsightsService(createRepository({ findDetail: vi.fn(async () => undefined) }));

    await expect(service.getDetail(scope, "999")).rejects.toBeInstanceOf(NotFoundError);
  });
});
