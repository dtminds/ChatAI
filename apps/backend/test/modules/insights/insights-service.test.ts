import { describe, expect, it, vi } from "vitest";
import {
  BusinessError,
  ForbiddenError,
  NotFoundError,
} from "../../../src/shared/errors.js";
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
    agentName: "客服一号",
    agentSeatId: "seat-1",
    analysisStatus: "ready",
    conversationId: "301",
    currentSnapshotId: "7001",
    generatedAt: 1_780_245_100_000,
    customerAvatarUrl: "https://example.com/customer-1.png",
    customerName: "张三",
    endedAt: 1_780_245_000_000,
    lastMessageAt: 1_780_244_950_000,
    lastCustomerMessageAt: 1_780_244_900_000,
    phase: "final",
    problemDetected: true,
    problemEvidenceMessageIds: ["9001", "9002"],
    problemResolutionConfidence: 0.84,
    problemSummary: "客户反馈物流异常",
    resolutionStatus: "unresolved",
    sessionId: "501",
    startedAt: 1_780_243_200_000,
    summarySessionTitle: "查物流",
    summaryText: "客服要求客户等待",
    unresolvedReason: "售后/物流/退款进度未确认",
  },
  {
    actionOpenCount: 0,
    agentAvatarUrl: "https://example.com/agent-2.png",
    agentName: "客服二号",
    agentSeatId: "seat-2",
    analysisStatus: "partial",
    conversationId: "302",
    currentSnapshotId: "7002",
    generatedAt: 1_780_244_600_000,
    customerAvatarUrl: "https://example.com/customer-2.png",
    customerName: "李四",
    endedAt: null,
    lastMessageAt: 1_780_243_950_000,
    lastCustomerMessageAt: 1_780_243_900_000,
    phase: "live",
    problemDetected: true,
    problemEvidenceMessageIds: ["9004"],
    problemSummary: "客户咨询退款到账时间",
    resolutionStatus: "partially_resolved",
    sessionId: "502",
    startedAt: 1_780_243_000_000,
    summarySessionTitle: "退款咨询",
    summaryText: "客服说明会继续查询",
    unresolvedReason: "要求客户等待但未说明下一步",
  },
  {
    actionOpenCount: 0,
    agentAvatarUrl: null,
    agentName: null,
    agentSeatId: null,
    analysisStatus: "stale",
    conversationId: "303",
    currentSnapshotId: "7003",
    generatedAt: 1_780_242_500_000,
    customerAvatarUrl: "https://example.com/customer-3.png",
    customerName: "王五",
    endedAt: null,
    lastMessageAt: null,
    lastCustomerMessageAt: null,
    phase: "live",
    problemDetected: false,
    problemEvidenceMessageIds: [],
    problemSummary: "",
    resolutionStatus: "no_customer_problem",
    sessionId: "503",
    startedAt: 1_780_242_000_000,
    summarySessionTitle: "活动寒暄",
    summaryText: "无明确问题",
    unresolvedReason: null,
  },
  {
    actionOpenCount: 1,
    agentAvatarUrl: "https://example.com/agent-3.png",
    agentName: "客服三号",
    agentSeatId: "seat-3",
    analysisStatus: "ready",
    conversationId: "304",
    currentSnapshotId: "7004",
    generatedAt: 1_780_241_500_000,
    customerAvatarUrl: "https://example.com/customer-4.png",
    customerName: "赵六",
    endedAt: null,
    lastMessageAt: 1_780_241_400_000,
    lastCustomerMessageAt: 1_780_241_400_000,
    phase: "live",
    problemDetected: true,
    problemEvidenceMessageIds: ["9006"],
    problemSummary: "",
    resolutionStatus: "unknown",
    sessionId: "504",
    startedAt: 1_780_241_000_000,
    summarySessionTitle: "",
    summaryText: "",
    unresolvedReason: null,
  },
  {
    actionOpenCount: 0,
    agentAvatarUrl: "https://example.com/agent-4.png",
    agentName: "客服四号",
    agentSeatId: "seat-4",
    analysisStatus: "analyzing",
    conversationId: "305",
    currentSnapshotId: undefined,
    generatedAt: undefined,
    customerAvatarUrl: "https://example.com/customer-5.png",
    customerName: "孙七",
    endedAt: null,
    lastMessageAt: 1_780_245_500_000,
    lastCustomerMessageAt: 1_780_245_400_000,
    phase: undefined,
    problemDetected: false,
    problemEvidenceMessageIds: [],
    problemSummary: "",
    resolutionStatus: "unknown",
    sessionId: "505",
    startedAt: 1_780_245_000_000,
    summarySessionTitle: "",
    summaryText: "",
    unresolvedReason: null,
  },
];

const overviewAggregate = {
  actionItemsOpen: 0,
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

const previousOverviewAggregate = {
  ...overviewAggregate,
  actionItemsOpen: 0,
  problemSessions: 1,
  readySessions: 1,
  totalSessions: 3,
  totals: {
    agentMessages: 3,
    consultingCustomers: 2,
    customerMessages: 8,
    logicalSessions: 3,
    messages: 11,
  },
  trend: [],
  unresolvedSessions: 1,
} satisfies Awaited<ReturnType<InsightsRepositoryPort["getOverviewAggregate"]>>;

const qualityAggregate = {
  analyzedSessions: 3,
  inspectedSessions: 3,
  inspectionRate: 0.75,
  noCustomerProblem: 1,
  partial: 1,
  passRate: 0.5,
  problemSessions: 2,
  resolved: 0,
  ruleDistribution: [],
  totalSessions: 4,
  unresolved: 1,
} satisfies Awaited<NonNullable<InsightsRepositoryPort["getQualityAggregate"]>>;

const qaFindingAggregate = {
  ruleDistribution: [
    { count: 2, ruleCode: "reply_quality", ruleName: "回复质量" },
  ],
} satisfies Awaited<
  NonNullable<InsightsRepositoryPort["getQaFindingAggregate"]>
>;

const qualityResults = [
  {
    agentAvatarUrl: "https://example.com/agent-1.png",
    agentName: "客服一号",
    conversationId: "301",
    customerAvatarUrl: "https://example.com/customer-1.png",
    customerName: "张三",
    passed: false,
    passedRules: 1,
    rules: [
      { passed: false, ruleCode: "reply_quality", ruleName: "回复质量" },
      { passed: true, ruleCode: "clear_next_step", ruleName: "明确下一步" },
    ],
    sessionId: "501",
    startedAt: 1_780_243_200_000,
    summary: "客户反馈物流异常",
    totalRules: 2,
  },
  {
    agentAvatarUrl: "https://example.com/agent-2.png",
    agentName: "客服二号",
    conversationId: "302",
    customerAvatarUrl: "https://example.com/customer-2.png",
    customerName: "李四",
    passed: true,
    passedRules: 2,
    rules: [
      { passed: true, ruleCode: "reply_quality", ruleName: "回复质量" },
      { passed: true, ruleCode: "clear_next_step", ruleName: "明确下一步" },
    ],
    sessionId: "502",
    startedAt: 1_780_243_000_000,
    summary: "客户咨询退款到账时间",
    totalRules: 2,
  },
] satisfies Awaited<
  NonNullable<InsightsRepositoryPort["listQualityResults"]>
>["items"];

const qualityAgentStats = [
  {
    agentAvatarUrl: "https://example.com/agent-1.png",
    agentName: "客服一号",
    agentSeatId: "seat-1",
    failedSessions: 1,
    inspectedSessions: 1,
    passedSessions: 0,
    passRate: 0,
    totalSessions: 1,
  },
  {
    agentAvatarUrl: "https://example.com/agent-2.png",
    agentName: "客服二号",
    agentSeatId: "seat-2",
    failedSessions: 0,
    inspectedSessions: 1,
    passedSessions: 1,
    passRate: 1,
    totalSessions: 1,
  },
] satisfies Awaited<
  NonNullable<InsightsRepositoryPort["listQualityAgentStats"]>
>;

const baseBusinessTopicFacts = [
  {
    dimension: "tag",
    mentionCount: 1,
    name: "物流异常",
    sessionId: "501",
    snapshotId: "7001",
    startedAt: 1_780_243_200_000,
    topicId: "21",
  },
  {
    dimension: "tag",
    mentionCount: 1,
    name: "退款咨询",
    sessionId: "502",
    snapshotId: "7002",
    startedAt: 1_780_243_000_000,
    topicId: "22",
  },
  {
    dimension: "entity",
    mentionCount: 2,
    name: "白色羽绒服",
    sentiment: "negative",
    sessionId: "501",
    snapshotId: "7001",
    startedAt: 1_780_243_200_000,
    topicId: "41",
  },
  {
    dimension: "intent",
    mentionCount: 1,
    name: "物流异常",
    sessionId: "501",
    snapshotId: "7001",
    startedAt: 1_780_243_200_000,
    topicId: "31",
  },
] satisfies Awaited<
  NonNullable<InsightsRepositoryPort["listBusinessTopicFacts"]>
>;

function createRepository(
  overrides: Partial<InsightsRepositoryPort> = {},
): InsightsRepositoryPort {
  return {
    countEnabledConfigs: vi.fn(async () => 0),
    countActiveConfigs: vi.fn(async () => 0),
    createRescanJob: vi.fn(async () => ({ jobId: "8801", taskId: "9901" })),
    hasSession: vi.fn(async () => true),
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
    listEntityDictionary: vi.fn(async () => [
      {
        aliases: ["白色羽绒服"],
        entityName: "白色羽绒服",
        id: "41",
        includeInAggregation: true,
        status: 1,
      },
    ]),
    listIntentConfigs: vi.fn(async () => [
      {
        aliases: ["物流"],
        description: "物流相关咨询",
        id: "90",
        includeInStatistics: true,
        intentCode: "logistics_delay",
        intentName: "物流异常",
        negativeExamples: [],
        positiveExamples: ["物流一直没更新"],
        status: 1,
        weight: 5,
      },
    ]),
    listLabelConfigs: vi.fn(async () => [
      {
        description: "退款咨询相关标签",
        id: "91",
        includeInStatistics: true,
        labelCode: "retention",
        labelName: "挽留机会",
        negativeExamples: [],
        positiveExamples: [],
        status: 1,
      },
    ]),
    listQaRuleConfigs: vi.fn(async () => [
      {
        applicableScene: "售后",
        description: "售后跟进规则",
        id: "92",
        judgmentCriteria: "必须给出明确处理动作",
        negativeExamples: [],
        positiveExamples: [],
        ruleCode: "after_sale_followup",
        ruleName: "售后跟进",
        severity: "high",
        status: 1,
      },
    ]),
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
    listBusinessTopicFacts: vi.fn(async (_scope, filters) =>
      filters?.dimension
        ? baseBusinessTopicFacts.filter((fact) => fact.dimension === filters.dimension)
        : baseBusinessTopicFacts,
    ),
    getQualityAggregate: vi.fn(async () => qualityAggregate),
    getQaFindingAggregate: vi.fn(async () => qaFindingAggregate),
    getOverviewAggregate: vi.fn(async (_scope, filters) =>
      filters.from === "2026-05-02T00:00:00.000+08:00"
        ? previousOverviewAggregate
        : overviewAggregate,
    ),
    listQualityResults: vi.fn(async (_scope, filters) => ({
      items:
        filters?.passed === false
          ? qualityResults.filter((item) => !item.passed)
          : qualityResults,
      total: filters?.passed === false ? 1 : qualityResults.length,
    })),
    hasActiveRescanTask: vi.fn(async () => false),
    listQualityAgentStats: vi.fn(async () => qualityAgentStats),
    listAllCurrentSessions: vi.fn(async () => baseRows),
    listCurrentSessions: vi.fn(async (_scope, filters) => ({
      items:
        filters?.pageSize === 10_000 || filters?.problemScope === "unresolved"
          ? baseRows.filter((row) =>
              ["partially_resolved", "unresolved"].includes(
                row.resolutionStatus,
              ),
            )
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
        minAnalysisMessages: 5,
        ruleFallbackEnabled: true,
      },
      entityDictionary: [
        {
          aliases: ["白鸭绒外套"],
          entityName: "白色羽绒服",
          status: 1,
          id: "41",
          includeInAggregation: true,
        },
      ],
      intentConfigs: [
        {
          aliases: ["物流", "查快递"],
          description: "客户咨询发货、快递或物流异常",
          status: 1,
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
          status: 1,
          id: "11",
          includeInStatistics: true,
          labelCode: "price_sensitive",
          labelName: "价格敏感",
        },
      ],
      qaRuleConfigs: [
        {
          status: 1,
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
    getFilterOptions: vi.fn(async () => ({
      entities: [{ id: "41", name: "白色羽绒服" }],
      intents: [{ id: "31", name: "物流异常" }],
      tags: [{ id: "11", name: "价格敏感" }],
    })),
    getSettingsSummary: vi.fn(async () => ({
      enabledEntityCount: 2,
      enabledIntentCount: 2,
      enabledLabelCount: 3,
      enabledQaCount: 1,
      entityEnabled: true,
      entityLimit: 20,
      entitySoftLimit: 15,
      insightEnabled: false,
      intentEnabled: true,
      intentLimit: 20,
      intentSoftLimit: 15,
      labelEnabled: true,
      labelLimit: 20,
      labelSoftLimit: 15,
      qaEnabled: true,
      qaLimit: 10,
      qaSoftLimit: 8,
      todoEnabled: false,
    })),
    upsertAnalysisPolicy: vi.fn(async (_scope, payload) => payload),
    upsertSessionizationSettings: vi.fn(async (_scope, payload) => payload),
    createIntentConfig: vi.fn(async (_scope, payload) => ({
      ...payload,
      id: "90",
    })),
    updateIntentConfig: vi.fn(async (_scope, id, payload) => ({
      ...payload,
      id,
    })),
    updateIntentConfigStatus: vi.fn(async (_scope, id, status) => ({
      status,
      id,
      includeInStatistics: true,
      intentCode: "logistics_delay",
      intentName: "物流异常",
      weight: 8,
    })),
    deleteIntentConfig: vi.fn(async () => true),
    createLabelConfig: vi.fn(async (_scope, payload) => ({
      ...payload,
      id: "91",
    })),
    updateLabelConfig: vi.fn(async (_scope, id, payload) => ({
      ...payload,
      id,
    })),
    updateLabelConfigStatus: vi.fn(async (_scope, id, status) => ({
      status,
      id,
      includeInStatistics: true,
      labelCode: "price_sensitive",
      labelName: "价格敏感",
    })),
    deleteLabelConfig: vi.fn(async () => true),
    createQaRuleConfig: vi.fn(async (_scope, payload) => ({
      ...payload,
      id: "92",
    })),
    updateQaRuleConfig: vi.fn(async (_scope, id, payload) => ({
      ...payload,
      id,
    })),
    updateQaRuleConfigStatus: vi.fn(async (_scope, id, status) => ({
      status,
      id,
      ruleCode: "problem_resolution",
      ruleName: "客户问题是否解决",
      severity: "high",
    })),
    deleteQaRuleConfig: vi.fn(async () => true),
    createEntityDictionaryItem: vi.fn(async (_scope, payload) => ({
      ...payload,
      id: "94",
    })),
    updateEntityDictionaryItem: vi.fn(async (_scope, id, payload) => ({
      ...payload,
      id,
    })),
    updateEntityDictionaryItemStatus: vi.fn(async (_scope, id, status) => ({
      aliases: ["白鸭绒外套"],
      entityName: "白色羽绒服",
      status,
      id,
      includeInAggregation: true,
    })),
    deleteEntityDictionaryItem: vi.fn(async () => true),
    updateActionStatus: vi.fn(async () => true),
    createActionItem: vi.fn(async () => ({ actionItemId: "8101" })),
    validateActionItemTarget: vi.fn(async () => true),
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
      expect(repository.listBusinessTopicFacts).not.toHaveBeenCalled();
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
      actionItemsOpen: 0,
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
      comparison: {
        agentMessages: {
          current: 7,
          delta: 4,
          deltaRate: 1.3333333333333333,
          previous: 3,
        },
        consultingCustomers: {
          current: 4,
          delta: 2,
          deltaRate: 1,
          previous: 2,
        },
        customerMessages: {
          current: 10,
          delta: 2,
          deltaRate: 0.25,
          previous: 8,
        },
        logicalSessions: {
          current: 4,
          delta: 1,
          deltaRate: 0.3333333333333333,
          previous: 3,
        },
        messages: {
          current: 17,
          delta: 6,
          deltaRate: 0.5454545454545454,
          previous: 11,
        },
      },
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
    expect(repository.getOverviewAggregate).toHaveBeenCalledWith(scope, {
      from: "2026-05-02T00:00:00.000+08:00",
      to: "2026-05-31T23:59:59.999+08:00",
    });
    expect(repository.listCurrentSessions).not.toHaveBeenCalled();
  });

  it("returns bounded comparison rates when the previous period has no data", async () => {
    const repository = createRepository({
      getOverviewAggregate: vi.fn(async (_scope, filters) =>
        filters.from === "2026-05-02T00:00:00.000+08:00"
          ? {
              ...previousOverviewAggregate,
              totals: {
                agentMessages: 0,
                consultingCustomers: 0,
                customerMessages: 0,
                logicalSessions: 0,
                messages: 0,
              },
            }
          : overviewAggregate,
      ),
    });
    const service = new InsightsService(repository);

    const result = await service.getOverview(scope, {
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(result.comparison).toMatchObject({
      agentMessages: { current: 7, delta: 7, deltaRate: 1, previous: 0 },
      consultingCustomers: { current: 4, delta: 4, deltaRate: 1, previous: 0 },
      customerMessages: { current: 10, delta: 10, deltaRate: 1, previous: 0 },
      logicalSessions: { current: 4, delta: 4, deltaRate: 1, previous: 0 },
      messages: { current: 17, delta: 17, deltaRate: 1, previous: 0 },
    });
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
      total: 5,
      totalPages: 5,
      items: [
        expect.objectContaining({
          customerName: "张三",
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

  it("defaults overview session reads to a recent bounded date range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T12:00:00.000Z"));
    const repository = createRepository();
    const service = new InsightsService(repository);

    try {
      await service.getOverviewSessions(scope);

      expect(repository.listCurrentSessions).toHaveBeenCalledWith(scope, {
        from: "2026-05-07T00:00:00.000+08:00",
        page: 1,
        pageSize: 20,
        to: "2026-06-05T23:59:59.999+08:00",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns analyzing physical sessions in overview sessions", async () => {
    const repository = createRepository({
      listCurrentSessions: vi.fn(async () => ({
        items: [baseRows[4]!],
        total: 1,
      })),
    });
    const service = new InsightsService(repository);

    const result = await service.getOverviewSessions(scope);

    expect(result.items).toEqual([
      expect.objectContaining({
        analysisStatus: "analyzing",
        problemSummary: undefined,
        resolutionStatus: "unknown",
        sessionId: "505",
        summarySessionTitle: "",
      }),
    ]);
  });

  it("builds service quality counts and paginated failed QA results", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);
    const [overviewResult, resultsResult] = await Promise.all([
      service.getQualityOverview(scope),
      service.getQualityResults(scope, { passed: false }),
    ]);

    expect(overviewResult.overview).toMatchObject({
      analyzedSessions: 3,
      inspectedSessions: 3,
      inspectionRate: 0.75,
      noCustomerProblem: 1,
      partial: 1,
      passRate: 0.5,
      problemSessions: 2,
      resolved: 0,
      ruleDistribution: [
        { count: 2, ruleCode: "reply_quality", ruleName: "回复质量" },
      ],
      totalSessions: 4,
      unresolved: 1,
    });
    expect(resultsResult.qualityResults.map((item) => item.sessionId)).toEqual([
      "501",
    ]);
    expect(resultsResult.qualityResults[0]).toMatchObject({
      passed: false,
      passedRules: 1,
      rules: [
        { passed: false, ruleCode: "reply_quality", ruleName: "回复质量" },
        { passed: true, ruleCode: "clear_next_step", ruleName: "明确下一步" },
      ],
      totalRules: 2,
    });
    expect(repository.getQaFindingAggregate).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        from: expect.stringMatching(/^2026-/),
        to: expect.stringMatching(/^2026-/),
      }),
    );
    expect(repository.getQualityAggregate).toHaveBeenCalledWith(scope, {
      from: expect.any(String),
      to: expect.any(String),
    });
    expect(repository.listQualityAgentStats).not.toHaveBeenCalled();
    expect(repository.listAllCurrentSessions).not.toHaveBeenCalled();
    expect(repository.listCurrentSessions).not.toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        problemScope: "unresolved",
      }),
    );
    expect(repository.listQualityResults).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        from: expect.any(String),
        page: 1,
        pageSize: 20,
        passed: false,
        to: expect.any(String),
      }),
    );
  });

  it("merges QA rule distribution into the quality overview", async () => {
    const repository = createRepository({
      getQualityAggregate: vi.fn(async () => ({
        ...qualityAggregate,
        analyzedSessions: 4,
        inspectedSessions: 2,
        inspectionRate: 0.5,
        passRate: 1,
      })),
      getQaFindingAggregate: vi.fn(async () => qaFindingAggregate),
    });
    const service = new InsightsService(repository);
    const result = await service.getQualityOverview(scope, {
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(result.overview).toMatchObject({
      analyzedSessions: 4,
      inspectedSessions: 2,
      inspectionRate: 0.5,
      passRate: 1,
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

  it("paginates quality QA results", async () => {
    const repository = createRepository({
      listQualityResults: vi.fn(async (_scope, filters) => ({
        items: [qualityResults[1]!],
        total: 2,
      })),
    });
    const service = new InsightsService(repository);

    const result = await service.getQualityResults(scope, {
      from: "2026-06-01",
      page: 2,
      passed: false,
      pageSize: 1,
      to: "2026-06-30",
    });

    expect(result.qualityResults).toEqual([
      expect.objectContaining({
        passed: true,
        sessionId: "502",
      }),
    ]);
    expect(result.qualityResultsPage).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(repository.listQualityResults).toHaveBeenCalledWith(scope, {
      from: "2026-06-01",
      page: 2,
      pageSize: 1,
      passed: false,
      to: "2026-06-30",
    });
    expect(repository.listQualityAgentStats).not.toHaveBeenCalled();
  });

  it("does not apply QA result pass filter when requesting all quality results", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await service.getQualityResults(scope, {
      from: "2026-06-01",
      page: 1,
      pageSize: 10,
      to: "2026-06-30",
    });

    expect(repository.listQualityResults).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        from: "2026-06-01",
        page: 1,
        pageSize: 10,
        passed: undefined,
        to: "2026-06-30",
      }),
    );
  });

  it("loads the agent quality report without quality results", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    const result = await service.getQualityAgentStats(scope, {
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(result.agentStats).toHaveLength(2);
    expect(repository.listQualityAgentStats).toHaveBeenCalledWith(scope, {
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(repository.listQualityResults).not.toHaveBeenCalled();
  });

  it("loads quality results without overview or agent stats", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    const result = await service.getQualityResults(scope, {
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(result.qualityResults).toHaveLength(2);
    expect(repository.getQualityAggregate).not.toHaveBeenCalled();
    expect(repository.getQaFindingAggregate).not.toHaveBeenCalled();
    expect(repository.listQualityAgentStats).not.toHaveBeenCalled();
    expect(repository.listQualityResults).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        from: "2026-06-01",
        to: "2026-06-30",
      }),
    );
  });

  it("loads only the selected business topic dimension", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T12:00:00.000Z"));
    const listBusinessTopicFacts = vi.fn(async () => [
      {
        dimension: "intent" as const,
        mentionCount: 3,
        name: "物流异常",
        sessionId: "501",
        snapshotId: "7001",
        startedAt: 1_780_243_200_000,
        topicId: "31",
      },
    ]);
    const service = new InsightsService(createRepository({
      listBusinessTopicFacts,
    }));

    try {
      const result = await service.getBusinessTopics(scope, {
        dimension: "intent",
      });

      expect(result.dimension).toBe("intent");
      expect(result.topics).toEqual([
        expect.objectContaining({
          code: "31",
          dimension: "intent",
          mentionCount: 3,
          name: "物流异常",
        }),
      ]);
      expect(result.intentTrend).toEqual([
        {
          date: "2026-06-01",
          intentId: "31",
          intentName: "物流异常",
          sessionCount: 1,
        },
      ]);
      expect(listBusinessTopicFacts).toHaveBeenCalledWith(scope, {
        dimension: "intent",
        from: "2026-05-07T00:00:00.000+08:00",
        to: "2026-06-05T23:59:59.999+08:00",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("defaults asset business topics to the recent seven days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T12:00:00.000+08:00"));
    const listBusinessTopicFacts = vi.fn(async () => []);
    const getBusinessAssetTopicAnalytics = vi.fn(async () => ({
      topics: [],
      totals: {
        mentionCount: 0,
        topicSessions: 0,
      },
      trend: [],
    }));
    const service = new InsightsService(createRepository({
      getBusinessAssetTopicAnalytics,
      listBusinessTopicFacts,
    }));

    try {
      await service.getBusinessTopics(scope, {
        dimension: "asset",
      });

      expect(getBusinessAssetTopicAnalytics).toHaveBeenCalledWith(scope, {
        dimension: "asset",
        from: "2026-05-30T00:00:00.000+08:00",
        to: "2026-06-05T23:59:59.999+08:00",
      });
      expect(listBusinessTopicFacts).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("limits asset business topic reads to at most seven days", async () => {
    const listBusinessTopicFacts = vi.fn(async () => []);
    const getBusinessAssetTopicAnalytics = vi.fn(async () => ({
      topics: [],
      totals: {
        mentionCount: 0,
        topicSessions: 0,
      },
      trend: [],
    }));
    const service = new InsightsService(createRepository({
      getBusinessAssetTopicAnalytics,
      listBusinessTopicFacts,
    }));

    await service.getBusinessTopics(scope, {
      dimension: "asset",
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(getBusinessAssetTopicAnalytics).toHaveBeenCalledWith(scope, {
      dimension: "asset",
      from: "2026-06-24T00:00:00.000+08:00",
      to: "2026-06-30T23:59:59.999+08:00",
    });
    expect(listBusinessTopicFacts).not.toHaveBeenCalled();
  });

  it("paginates business related sessions by selected topic facts", async () => {
    const listBusinessRelatedSessions = vi.fn(async () => ({
      items: [baseRows[0]],
      total: 1,
    }));
    const repository = createRepository({
      listBusinessRelatedSessions,
      listCurrentSessions: vi.fn(async (_scope, filters) => ({
        items: [baseRows[0]],
        total: 1,
      })),
    } as Partial<InsightsRepositoryPort>);
    const service = new InsightsService(repository);

    const result = await service.getBusinessRelatedSessions(scope, {
      dimension: "intent",
      from: "2026-06-01",
      page: 2,
      pageSize: 1,
      topicCode: "31",
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
    expect(listBusinessRelatedSessions).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        dimension: "intent",
        from: "2026-06-01",
        page: 2,
        pageSize: 1,
        topicCode: "31",
        to: "2026-06-30",
      }),
    );
    expect(repository.listBusinessTopicFacts).not.toHaveBeenCalled();
    expect(repository.listCurrentSessions).not.toHaveBeenCalled();
    expect(repository.listAllCurrentSessions).not.toHaveBeenCalled();
  });

  it("limits asset related sessions to the same seven-day asset window", async () => {
    const listBusinessRelatedSessions = vi.fn(async () => ({
      items: [],
      total: 0,
    }));
    const service = new InsightsService(createRepository({
      listBusinessRelatedSessions,
    } as Partial<InsightsRepositoryPort>));

    await service.getBusinessRelatedSessions(scope, {
      dimension: "asset",
      from: "2026-06-01",
      page: 1,
      pageSize: 20,
      topicCode: "701",
      to: "2026-06-30",
    });

    expect(listBusinessRelatedSessions).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        dimension: "asset",
        from: "2026-06-24T00:00:00.000+08:00",
        to: "2026-06-30T23:59:59.999+08:00",
      }),
    );
  });

  it("fails business related sessions when the repository has no focused query", async () => {
    const listBusinessTopicFacts = vi.fn(async () => baseBusinessTopicFacts);
    const listCurrentSessions = vi.fn(async () => ({
      items: [baseRows[0]],
      total: 1,
    }));
    const service = new InsightsService(createRepository({
      listBusinessRelatedSessions: undefined,
      listBusinessTopicFacts,
      listCurrentSessions,
    } as Partial<InsightsRepositoryPort>));

    await expect(
      service.getBusinessRelatedSessions(scope, {
        dimension: "intent",
        page: 1,
        pageSize: 20,
        topicCode: "31",
      }),
    ).rejects.toBeInstanceOf(BusinessError);

    expect(listBusinessTopicFacts).not.toHaveBeenCalled();
    expect(listCurrentSessions).not.toHaveBeenCalled();
  });

  it("filters follow-up action items by status", async () => {
    const service = new InsightsService(createRepository());

    await expect(
      service.getFollowUps(scope, { status: "open" }),
    ).resolves.toMatchObject({
      items: [
        {
          actionItemId: "803",
          conversationId: "304",
          createdAt: 1_780_241_300_000,
          status: "open",
        },
        {
          actionItemId: "801",
          conversationId: "301",
          createdAt: 1_780_244_800_000,
          status: "open",
        },
      ],
      total: 2,
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

  it("keeps repository-expanded processed follow-up action items", async () => {
    const repository = createRepository({
      listActionItemsPage: vi.fn(async () => ({
        items: [
          {
            actionItemId: "802",
            conversationId: "302",
            customerName: "李四",
            createdAt: 1_780_243_800_000,
            priority: "medium",
            sessionId: "502",
            status: "done",
            title: "已完成事项",
          },
          {
            actionItemId: "803",
            conversationId: "303",
            customerName: "王五",
            createdAt: 1_780_243_700_000,
            priority: "low",
            sessionId: "503",
            status: "dismissed",
            title: "已忽略事项",
          },
        ],
        total: 2,
      })),
    });
    const service = new InsightsService(repository);

    await expect(
      service.getFollowUps(scope, {
        page: 1,
        pageSize: 10,
        status: "processed",
      }),
    ).resolves.toMatchObject({
      items: [
        { actionItemId: "802", status: "done" },
        { actionItemId: "803", status: "dismissed" },
      ],
      total: 2,
    });
  });

  it("keeps paginated follow-up action items without resolution status", async () => {
    const repository = createRepository({
      listActionItemsPage: vi.fn(async () => ({
        items: [
          {
            actionItemId: "801",
            conversationId: "301",
            customerName: "张三",
            createdAt: 1_780_244_800_000,
            priority: "high",
            sessionId: "501",
            status: "open",
            title: "确认快递状态",
          },
        ],
        total: 1,
      })),
    });
    const service = new InsightsService(repository);

    await expect(
      service.getFollowUps(scope, {
        page: 1,
        pageSize: 10,
        status: "open",
      }),
    ).resolves.toMatchObject({
      items: [
        { actionItemId: "801", status: "open" },
      ],
      total: 1,
    });
  });

  it("does not re-filter repository-paginated follow-up action items", async () => {
    const repository = createRepository({
      listActionItemsPage: vi.fn(async () => ({
        items: [
          {
            actionItemId: "801",
            conversationId: "301",
            customerName: "张三",
            createdAt: 1_780_244_800_000,
            priority: "high",
            sessionId: "501",
            status: "open",
            title: "确认快递状态",
          },
          {
            actionItemId: "802",
            conversationId: "302",
            customerName: "李四",
            createdAt: 1_780_243_800_000,
            priority: "medium",
            sessionId: "502",
            status: "done",
            title: "已完成事项",
          },
        ],
        total: 2,
      })),
    });
    const service = new InsightsService(repository);

    await expect(
      service.getFollowUps(scope, {
        page: 1,
        pageSize: 10,
        priority: "high",
        status: "open",
      }),
    ).resolves.toMatchObject({
      items: [
        { actionItemId: "801", status: "open" },
        { actionItemId: "802", status: "done" },
      ],
      total: 2,
    });
  });

  it("returns detail analysis without loading conversation messages", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);
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
    expect(result).not.toHaveProperty("evidenceMessages");
    expect(result).not.toHaveProperty("evidenceMessageRecords");
    expect(result).not.toHaveProperty("sessionMessageRecords");
    expect(repository.listSessionMessageRecords).not.toHaveBeenCalled();
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

  it("returns analyzing physical session detail without snapshot fields", async () => {
    const repository = createRepository({
      findDetail: vi.fn(async () => ({
        actionItems: [],
        current: baseRows[4]!,
        entities: [],
        evidenceItems: [],
        faqCandidates: [],
        intents: [],
        problemEvidenceMessageIds: [],
        qaFindings: [],
        sentiment: [],
        tags: [],
      })),
    });
    const service = new InsightsService(repository);

    const result = await service.getDetail(scope, "505");

    expect(result).toMatchObject({
      actionItems: [],
      analysisStatus: "analyzing",
      currentSnapshotId: undefined,
      entities: [],
      evidenceItems: [],
      problemResolution: {
        confidence: 0,
        evidenceMessageIds: [],
        problemDetected: false,
        problemSummary: "",
        resolutionStatus: "unknown",
        unresolvedReason: undefined,
      },
      session: {
        agentName: "客服四号",
        customerName: "孙七",
        generatedAt: undefined,
        phase: undefined,
        sessionId: "505",
      },
      summary: {
        sessionTitle: "",
        text: "",
      },
    });
  });

  it("returns session messages separately from detail analysis", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);
    const result = await service.getSessionMessages(scope, "501");

    expect(result.messages.map((item) => item.seq)).toEqual([9001, 9002]);
    expect(repository.hasSession).not.toHaveBeenCalled();
    expect(repository.listSessionMessageRecords).toHaveBeenCalledWith(scope, "501");
    expect(repository.findDetail).not.toHaveBeenCalled();
  });

  it("throws not found when session messages are requested outside uid scope", async () => {
    const service = new InsightsService(
      createRepository({
        listSessionMessageRecords: vi.fn(async () => undefined),
      }),
    );

    await expect(
      service.getSessionMessages(scope, "999"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("omits unused hydrated overview assets from session responses", async () => {
    const service = new InsightsService(createRepository());

    const result = await service.getOverviewSessions(scope);

    expect(result.items[0]).toMatchObject({ sessionId: "501" });
    expect(result.items[0]).not.toHaveProperty("assets");
  });

  it("loads a fixed evidence message context window", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(
      service.getMessageContext(scope, "301", "9002"),
    ).resolves.toMatchObject({
      contextAfter: 30,
      contextBefore: 30,
      conversationId: "301",
      targetMessageId: "9002",
      messages: [
        { messageId: "external-msg-9001", seq: 9001 },
        { messageId: "external-msg-9002", seq: 9002 },
      ],
    });

    expect(repository.listMessageContext).toHaveBeenCalledWith(
      scope,
      "301",
      "9002",
      {
        after: 30,
        before: 30,
      },
    );
  });

  it("rejects settings access for non-admin roles at the service boundary", async () => {
    const service = new InsightsService(createRepository());

    await expect(service.getSettings(scope, "operator")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
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

  it("returns compact filter options for non-admin insight pages", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(service.getFilterOptions(scope)).resolves.toEqual({
      entities: [{ id: "41", name: "白色羽绒服" }],
      intents: [{ id: "31", name: "物流异常" }],
      tags: [{ id: "11", name: "价格敏感" }],
    });
    expect(repository.getFilterOptions).toHaveBeenCalledWith(scope);
  });

  it("returns feature switch state in settings summary", async () => {
    const service = new InsightsService(createRepository());

    await expect(
      service.getSettingsSummary(scope, "admin"),
    ).resolves.toMatchObject({
      entityEnabled: true,
      insightAvailable: true,
      intentEnabled: true,
      labelEnabled: true,
      qaEnabled: true,
      todoEnabled: false,
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
    expect(repository.upsertSessionizationSettings).toHaveBeenCalledWith(
      scope,
      {
        analysisDelayMinutes: 8,
        hardMaxDurationHours: 36,
        idleTimeoutMinutes: 90,
        lateArrivalWindowMinutes: 20,
        preset: "custom",
      },
    );

    await expect(
      service.createIntentConfig(scope, "admin", {
        aliases: ["物流", "查快递"],
        description: "客户咨询发货、快递或物流异常",
        status: 1,
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
      service.updateIntentConfigStatus(scope, "admin", "90", { status: 0 }),
    ).resolves.toMatchObject({ status: 0, id: "90" });
    expect(repository.updateIntentConfigStatus).toHaveBeenCalledWith(
      scope,
      "90",
      0,
    );

    await expect(
      service.createLabelConfig(scope, "admin", {
        status: 1,
        includeInStatistics: true,
        labelCode: "retention",
        labelName: "挽留机会",
      }),
    ).resolves.toMatchObject({ id: "91", labelCode: "retention" });
    expect(repository.createLabelConfig).toHaveBeenCalled();
  });

  it("rejects config writes that would exceed enabled limits", async () => {
    const repository = createRepository({
      countEnabledConfigs: vi.fn(async (currentScope, configType) => {
        expect(currentScope).toEqual(scope);
        return configType === "qaRuleConfigs" ? 10 : 20;
      }),
      listIntentConfigs: vi.fn(async () => [
        {
          aliases: ["物流"],
          description: "物流相关咨询",
          id: "90",
          includeInStatistics: true,
          intentCode: "logistics_delay",
          intentName: "物流异常",
          negativeExamples: [],
          positiveExamples: ["物流一直没更新"],
          status: 0,
          weight: 5,
        },
      ]),
    });
    const service = new InsightsService(repository);

    await expect(
      service.createQaRuleConfig(scope, "admin", {
        status: 1,
        applicableScene: "售后",
        judgmentCriteria: "必须给出明确处理动作",
        positiveExamples: [],
        negativeExamples: [],
        ruleCode: "after_sale_followup",
        ruleName: "售后跟进",
        severity: "high",
      }),
    ).rejects.toMatchObject({
      code: "INSIGHT_CONFIG_ENABLED_LIMIT_REACHED",
      details: {
        configType: "qaRuleConfigs",
        currentEnabled: 10,
        limit: 10,
      },
    });

    await expect(
      service.updateIntentConfigStatus(scope, "admin", "90", { status: 1 }),
    ).rejects.toMatchObject({
      code: "INSIGHT_CONFIG_ENABLED_LIMIT_REACHED",
      details: {
        configType: "intentConfigs",
        currentEnabled: 20,
        limit: 20,
      },
    });
  });

  it("rejects creating configs when the active record total reaches 50", async () => {
    const repository = createRepository({
      countActiveConfigs: vi.fn(async (currentScope, configType) => {
        expect(currentScope).toEqual(scope);
        expect(configType).toBe("labelConfigs");
        return 50;
      }),
    });
    const service = new InsightsService(repository);

    await expect(
      service.createLabelConfig(scope, "admin", {
        status: 0,
        includeInStatistics: true,
        labelCode: "retention",
        labelName: "挽留机会",
      }),
    ).rejects.toMatchObject({
      code: "INSIGHT_CONFIG_TOTAL_LIMIT_REACHED",
      details: {
        configType: "labelConfigs",
        currentTotal: 50,
        limit: 50,
      },
    });
    expect(repository.createLabelConfig).not.toHaveBeenCalled();
  });

  it("allows updating an already-enabled config without consuming a new slot at the limit", async () => {
    const repository = createRepository({
      countEnabledConfigs: vi.fn(async (currentScope, configType) => {
        expect(currentScope).toEqual(scope);
        expect(configType).toBe("intentConfigs");
        return 20;
      }),
      updateIntentConfig: vi.fn(async (_scope, id, payload) => ({
        id,
        aliases: payload.aliases ?? [],
        description: payload.description,
        includeInStatistics: payload.includeInStatistics,
        intentCode: payload.intentCode,
        intentName: payload.intentName,
        negativeExamples: payload.negativeExamples ?? [],
        positiveExamples: payload.positiveExamples ?? [],
        status: payload.status,
        weight: payload.weight,
      })),
    });
    const service = new InsightsService(repository);

    await expect(
      service.updateIntentConfig(scope, "admin", "90", {
        aliases: ["物流"],
        description: "重新整理判定标准",
        includeInStatistics: true,
        intentCode: "logistics_delay",
        intentName: "物流异常",
        negativeExamples: [],
        positiveExamples: ["物流一直没更新"],
        status: 1,
        weight: 3,
      }),
    ).resolves.toMatchObject({
      id: "90",
      intentCode: "logistics_delay",
      status: 1,
    });
  });

  it("throws not found when deleting missing insight config records", async () => {
    const service = new InsightsService(
      createRepository({ deleteQaRuleConfig: vi.fn(async () => false) }),
    );

    await expect(
      service.deleteQaRuleConfig(scope, "admin", "999"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates action item status only for supported manual statuses", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(
      service.updateActionStatus(scope, "801", "done"),
    ).resolves.toMatchObject({
      actionItemId: "801",
      status: "done",
    });
    expect(repository.updateActionStatus).toHaveBeenCalledWith(
      scope,
      "801",
      "done",
    );

    await expect(
      service.updateActionStatus(scope, "801", "open"),
    ).resolves.toMatchObject({
      actionItemId: "801",
      status: "open",
    });
    expect(repository.updateActionStatus).toHaveBeenCalledWith(
      scope,
      "801",
      "open",
    );
  });

  it("returns a business error when an action item cannot be updated", async () => {
    const repository = createRepository({
      updateActionStatus: vi.fn(async () => false),
    });
    const service = new InsightsService(repository);

    await expect(
      service.updateActionStatus(scope, "21", "done"),
    ).rejects.toBeInstanceOf(BusinessError);
    await expect(
      service.updateActionStatus(scope, "21", "done"),
    ).rejects.toMatchObject({
      code: "INSIGHT_ACTION_ITEM_NOT_FOUND",
      statusCode: 200,
    });
  });

  it("creates a manual conversation action item with trimmed title", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(
      service.createActionItem(
        scope,
        {
          conversationId: "301",
          dueHint: "今天内",
          priority: "high",
          sessionId: "501",
          title: "  回访物流状态  ",
        },
        "77",
      ),
    ).resolves.toEqual({ actionItemId: "8101" });

    expect(repository.createActionItem).toHaveBeenCalledWith(scope, {
      conversationId: "301",
      createdBySubUserId: "77",
      dueHint: "今天内",
      priority: "high",
      sessionId: "501",
      title: "回访物流状态",
    });
  });

  it("rejects manual action items when the target conversation or session is outside scope", async () => {
    const repository = createRepository({
      validateActionItemTarget: vi.fn(async () => false),
    });
    const service = new InsightsService(repository);

    await expect(
      service.createActionItem(
        scope,
        {
          conversationId: "301",
          priority: "medium",
          sessionId: "501",
          title: "回访物流状态",
        },
        "77",
      ),
    ).rejects.toMatchObject({
      code: "INVALID_ACTION_ITEM_TARGET",
    });

    expect(repository.validateActionItemTarget).toHaveBeenCalledWith(scope, {
      conversationId: "301",
      sessionId: "501",
    });
    expect(repository.createActionItem).not.toHaveBeenCalled();
  });

  it("rejects manual action items without a session id", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(
      service.createActionItem(scope, {
        conversationId: "301",
        priority: "medium",
        title: "回访物流状态",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_ACTION_ITEM_TARGET",
    });

    expect(repository.validateActionItemTarget).not.toHaveBeenCalled();
    expect(repository.createActionItem).not.toHaveBeenCalled();
  });

  it("rejects blank manual action item titles", async () => {
    const repository = createRepository();
    const service = new InsightsService(repository);

    await expect(
      service.createActionItem(scope, {
        conversationId: "301",
        priority: "medium",
        title: "   ",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_ACTION_ITEM_TITLE",
    });
    expect(repository.createActionItem).not.toHaveBeenCalled();
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
      expect.stringMatching(
        /^rescan:9001:qaFindings:2026-06-01T00:00:00\.000Z:2026-06-02T00:00:00\.000Z:/,
      ),
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
    expect(repository.listRescanTasks).toHaveBeenCalledWith(scope, {
      limit: 10,
      offset: 0,
    });
  });

  it("throws not found when a detail session is outside uid scope", async () => {
    const service = new InsightsService(
      createRepository({ findDetail: vi.fn(async () => undefined) }),
    );

    await expect(service.getDetail(scope, "999")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
