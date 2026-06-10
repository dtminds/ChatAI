import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { routerConfig } from "@/router";
import { useAuthStore } from "@/store/auth-store";

const serviceMocks = vi.hoisted(() => ({
  createInsightRescanJob: vi.fn(),
  getInsightBusinessRelatedSessions: vi.fn(),
  getInsightBusinessTopics: vi.fn(),
  getInsightDetail: vi.fn(),
  getInsightFollowUps: vi.fn(),
  getInsightMessageContext: vi.fn(),
  getInsightSessionMessages: vi.fn(),
  getInsightFilterOptions: vi.fn(),
  getInsightOverview: vi.fn(),
  getInsightOverviewSessions: vi.fn(),
  getInsightQualityAgentStats: vi.fn(),
  getInsightQualityOverview: vi.fn(),
  getInsightQualityResults: vi.fn(),
  getInsightRescanTasks: vi.fn(),
  getInsightSettings: vi.fn(),
  getInsightSettingsSummary: vi.fn(),
  getInsightPolicyAndSessionization: vi.fn(),
  getInsightFeatureConfig: vi.fn(),
  listInsightIntentConfigs: vi.fn(),
  listInsightLabelConfigs: vi.fn(),
  listInsightQaRuleConfigs: vi.fn(),
  listInsightEntityDictionary: vi.fn(),
  createInsightIntentConfig: vi.fn(),
  createInsightLabelConfig: vi.fn(),
  updateInsightAnalysisPolicy: vi.fn(),
  updateInsightEntityDictionaryItem: vi.fn(),
  updateInsightEntityDictionaryItemStatus: vi.fn(),
  updateInsightFeatureConfig: vi.fn(),
  updateInsightIntentConfig: vi.fn(),
  updateInsightIntentConfigStatus: vi.fn(),
  updateInsightLabelConfig: vi.fn(),
  updateInsightLabelConfigStatus: vi.fn(),
  updateInsightQaRuleConfig: vi.fn(),
  updateInsightQaRuleConfigStatus: vi.fn(),
  updateInsightSessionizationSettings: vi.fn(),
  createInsightEntityDictionaryItem: vi.fn(),
  createInsightQaRuleConfig: vi.fn(),
  deleteInsightEntityDictionaryItem: vi.fn(),
  deleteInsightIntentConfig: vi.fn(),
  deleteInsightLabelConfig: vi.fn(),
  deleteInsightQaRuleConfig: vi.fn(),
  updateInsightActionStatus: vi.fn(),
}));

const mockInsightSettings = {
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
      entityCode: "white-coat",
      entityName: "白色羽绒服",
      status: 1,
      id: "41",
      includeInAggregation: true,
    },
    {
      aliases: ["雨伞"],
      entityCode: "black-umbrella",
      entityName: "黑色雨伞",
      status: 1,
      id: "42",
      includeInAggregation: true,
    },
    {
      aliases: [],
      entityCode: "hidden",
      entityName: "隐藏实体",
      status: 0,
      id: "43",
      includeInAggregation: true,
    },
  ],
  featureConfig: {
    entityEnabled: true,
    insightAvailable: true,
    insightEnabled: false,
    intentEnabled: true,
    labelEnabled: true,
    qaEnabled: true,
    todoEnabled: true,
  },
  intentConfigs: [
    {
      aliases: ["查快递"],
      description: "客户咨询物流或发货进度",
      status: 1,
      id: "31",
      includeInStatistics: true,
      intentCode: "logistics",
      intentName: "查物流",
      negativeExamples: [],
      positiveExamples: ["快递什么时候到"],
      weight: 8,
    },
    {
      aliases: ["AI客服"],
      description: "客户咨询AI客服系统相关信息",
      status: 1,
      id: "32",
      includeInStatistics: true,
      intentCode: "ai_customer_service_info",
      intentName: "咨询AI客服系统相关信息",
      negativeExamples: [],
      positiveExamples: ["AI客服支持什么功能"],
      weight: 6,
    },
    {
      aliases: [],
      status: 0,
      id: "33",
      includeInStatistics: true,
      intentCode: "hidden_intent",
      intentName: "隐藏意图",
      weight: 3,
    },
  ],
  labelConfigs: [
    {
      status: 1,
      id: "11",
      includeInStatistics: true,
      labelCode: "refund",
      labelName: "退款咨询",
    },
    {
      status: 1,
      id: "12",
      includeInStatistics: true,
      labelCode: "price_sensitive",
      labelName: "价格敏感",
    },
    {
      status: 1,
      id: "13",
      includeInStatistics: true,
      labelCode: "high_intent",
      labelName: "高意向",
    },
    {
      status: 0,
      id: "14",
      includeInStatistics: true,
      labelCode: "hidden_label",
      labelName: "隐藏标签",
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
};

async function openSettingsDialog(
  tabName: string,
  buttonName: string,
  dialogName: string,
) {
  renderRoute("/chat/insights/settings");

  expect(
    await screen.findByRole("heading", { name: "洞察配置" }),
  ).toBeInTheDocument();

  await userEvent.click(screen.getByRole("tab", { name: tabName }));
  await userEvent.click(screen.getByRole("button", { name: buttonName }));

  return screen.findByRole("dialog", { name: dialogName });
}

vi.mock("@/pages/chat/insights/api/insights-service", () => serviceMocks);

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const React = await import("react");

  return {
    ...actual,
    AreaChart: (props: React.ComponentProps<typeof actual.AreaChart>) => (
      <div data-testid="recharts-area-chart">
        <actual.AreaChart {...props} />
      </div>
    ),
    BarChart: (props: React.ComponentProps<typeof actual.BarChart>) => (
      <div
        data-margin-left={String(props.margin?.left ?? "")}
        data-testid="recharts-bar-chart"
      >
        <actual.BarChart {...props} />
      </div>
    ),
    Tooltip: (props: React.ComponentProps<typeof actual.Tooltip>) => {
      const contentName =
        React.isValidElement(props.content) &&
        typeof props.content.type === "function"
          ? props.content.type.name
          : "";
      const cursor = props.cursor;
      const cursorProps =
        cursor && typeof cursor === "object" && !React.isValidElement(cursor)
          ? (cursor as { fill?: string; fillOpacity?: number })
          : undefined;

      return (
        <div
          data-content-name={contentName}
          data-cursor-fill={cursorProps?.fill ?? ""}
          data-cursor-fill-opacity={cursorProps?.fillOpacity?.toString() ?? ""}
          data-testid="recharts-tooltip"
        />
      );
    },
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => {
      const chart = React.Children.only(children);

      if (!React.isValidElement<{ height?: number; width?: number }>(chart)) {
        return chart;
      }

      return React.cloneElement(chart, { height: 180, width: 480 });
    },
  };
});

function renderRoute(initialEntry: string) {
  const router = createMemoryRouter(routerConfig, {
    initialEntries: [initialEntry],
  });

  render(<RouterProvider router={router} />);

  return router;
}

function mockSession(role: "admin" | "operator" = "admin") {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useAuthStore.getState().setSession({
    accountType: "sub",
    displayName: "客服主管",
    permissions: ["chat.access", "chat.send", "chat.takeover"],
    role,
    subUserId: "101",
    uid: 1,
  });
}

function createDeferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

function createMockInsightDetail() {
  return {
    actionItems: [
      {
        actionItemId: "801",
        conversationId: "301",
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerName: "张三",
        evidenceMessageIds: ["9001", "9002"],
        priority: "high",
        sessionId: "501",
        status: "open",
        title: "跟进物流是否已更新",
      },
      {
        actionItemId: "802",
        conversationId: "301",
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerName: "张三",
        evidenceMessageIds: ["9001"],
        priority: "low",
        sessionId: "501",
        status: "done",
        title: "发送补偿说明",
      },
    ],
    analysisStatus: "ready",
    currentSnapshotId: "7001",
    entities: [
      {
        entityId: "41",
        entityName: "白色羽绒服",
        evidenceMessageIds: ["9002"],
        sentiment: "negative",
      },
    ],
    evidenceItems: [
      {
        dimensionRecordId: "7002",
        dimensionType: "problem_resolution",
        evidenceRole: "customer_problem",
        messageId: "9002",
        reason: "客户明确反馈物流不更新",
      },
      {
        dimensionRecordId: "7002",
        dimensionType: "problem_resolution",
        evidenceRole: "agent_solution",
        messageId: "9001",
        reason: "客服表示会催快递",
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
        intentId: "31",
        intentLabel: "物流异常",
      },
    ],
    problemResolution: {
      confidence: 0.82,
      evidenceMessageIds: ["9001", "9002"],
      problemDetected: true,
      problemSummary: "客户反馈物流异常",
      resolutionStatus: "unresolved",
      unresolvedReason: "售后/物流/退款进度未确认",
    },
    qaFindings: [
      {
        evidenceMessageIds: ["9001"],
        passed: true,
        reason: "已向客户说明会催促快递并同步进展",
        ruleCode: "response_timeliness",
        ruleName: "响应及时性",
      },
      {
        evidenceMessageIds: ["9002"],
        passed: false,
        reason: "未确认物流进展",
        ruleCode: "problem_resolution",
        ruleName: "客户问题是否解决",
      },
    ],
    sentiment: [
      {
        confidence: 0.82,
        evidenceMessageIds: ["9002"],
        polarity: "negative",
        reason: "客户明确表达物流不更新的不满",
      },
    ],
    session: {
      agentAvatarUrl: "https://example.com/agent-1.png",
      agentName: "客服一号",
      conversationId: "301",
      customerAvatarUrl: "https://example.com/customer-1.png",
      customerName: "张三",
      endedAt: 1_780_245_000_000,
      generatedAt: 1_780_245_100_000,
      phase: "final",
      sessionId: "501",
      startedAt: 1_780_243_200_000,
    },
    summary: {
      sessionTitle: "物流异常待跟进",
      text: "客户反馈物流不更新，客服表示会催快递但尚未确认物流进展。",
    },
    tags: [
      {
        confidence: 0.91,
        evidenceMessageIds: ["9002"],
        tagId: "11",
        tagName: "物流异常",
      },
    ],
  };
}

function createMockAnalyzingInsightDetail() {
  return {
    actionItems: [],
    analysisStatus: "analyzing",
    currentSnapshotId: undefined,
    entities: [],
    evidenceItems: [],
    faqCandidates: [],
    intents: [],
    problemResolution: {
      confidence: 0,
      evidenceMessageIds: [],
      problemDetected: false,
      problemSummary: "",
      resolutionStatus: "unknown",
      unresolvedReason: undefined,
    },
    qaFindings: [],
    sentiment: [],
    session: {
      agentAvatarUrl: "https://example.com/agent-4.png",
      agentName: "客服四号",
      conversationId: "304",
      customerAvatarUrl: "https://example.com/customer-4.png",
      customerName: "孙七",
      endedAt: undefined,
      generatedAt: undefined,
      phase: undefined,
      sessionId: "504",
      startedAt: 1_780_245_000_000,
    },
    summary: {
      sessionTitle: "",
      text: "",
    },
    tags: [],
  };
}

function createMockInsightSessionMessages() {
  return {
    messages: [
      {
        content: { text: "帮您催一下快递" },
        contentType: "text",
        conversationId: "301",
        createdAt: 1_780_244_000_000,
        customerId: "customer-301",
        messageId: "external-msg-9001",
        seatId: "seat-1",
        senderAvatar: "https://example.com/agent-1.png",
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
        senderAvatar: "https://example.com/customer-1.png",
        senderName: "张三",
        senderType: "customer",
        seq: 9002,
        status: "sent",
      },
    ],
  };
}

function installInsightMocks() {
  serviceMocks.getInsightOverview.mockResolvedValue({
    actionItemsOpen: 3,
    analysis: { failed: 1, partial: 2, ready: 18, stale: 1 },
    problemSessions: 11,
    readySessions: 18,
    resolution: {
      noCustomerProblem: 6,
      partiallyResolved: 2,
      resolved: 6,
      unknown: 5,
      unresolved: 5,
    },
    totalSessions: 22,
    comparison: {
      agentMessages: {
        current: 38,
        delta: 38,
        deltaRate: 1,
        previous: 0,
      },
      consultingCustomers: {
        current: 16,
        delta: 16,
        deltaRate: 1,
        previous: 0,
      },
      customerMessages: {
        current: 64,
        delta: 64,
        deltaRate: 1,
        previous: 0,
      },
      logicalSessions: {
        current: 22,
        delta: 22,
        deltaRate: 1,
        previous: 0,
      },
      messages: {
        current: 102,
        delta: 102,
        deltaRate: 1,
        previous: 0,
      },
    },
    totals: {
      agentMessages: 38,
      consultingCustomers: 16,
      customerMessages: 64,
      logicalSessions: 22,
      messages: 102,
    },
    trend: [
      {
        agentMessages: 18,
        consultingCustomers: 8,
        customerMessages: 30,
        date: "2026-06-01",
        logicalSessions: 10,
        messages: 48,
      },
      {
        agentMessages: 20,
        consultingCustomers: 9,
        customerMessages: 34,
        date: "2026-06-02",
        logicalSessions: 12,
        messages: 54,
      },
    ],
    unresolvedSessions: 5,
  });
  serviceMocks.getInsightOverviewSessions.mockResolvedValue({
    items: [
      {
        agentAvatarUrl: "https://example.com/agent-1.png",
        agentName: "客服一号",
        analysisStatus: "ready",
        conversationId: "301",
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerName: "张三",
        lastMessageAt: 1_780_244_950_000,
        problemSummary: "客户反馈物流异常",
        resolutionStatus: "unresolved",
        sessionId: "501",
        startedAt: 1_780_243_200_000,
        summarySessionTitle: "物流异常待跟进",
      },
      {
        agentAvatarUrl: "https://example.com/agent-2.png",
        agentName: "客服二号",
        analysisStatus: "partial",
        conversationId: "302",
        customerAvatarUrl: "https://example.com/customer-2.png",
        customerName: "李四",
        lastMessageAt: 1_780_244_500_000,
        problemSummary: "客户咨询退款到账时间",
        resolutionStatus: "resolved",
        sessionId: "502",
        startedAt: 1_780_244_000_000,
        summarySessionTitle: "退款到账咨询",
      },
      {
        agentAvatarUrl: "https://example.com/agent-3.png",
        agentName: "客服三号",
        analysisStatus: "ready",
        conversationId: "303",
        customerAvatarUrl: "https://example.com/customer-3.png",
        customerName: "赵六",
        lastMessageAt: 1_780_243_500_000,
        problemSummary: "",
        resolutionStatus: "unknown",
        sessionId: "503",
        startedAt: 1_780_243_400_000,
        summarySessionTitle: "",
      },
      {
        agentAvatarUrl: "https://example.com/agent-4.png",
        agentName: "客服四号",
        analysisStatus: "analyzing",
        conversationId: "304",
        customerAvatarUrl: "https://example.com/customer-4.png",
        customerName: "孙七",
        lastMessageAt: 1_780_245_500_000,
        problemSummary: "",
        resolutionStatus: "unknown",
        sessionId: "504",
        startedAt: 1_780_245_000_000,
        summarySessionTitle: "",
      },
    ],
    page: 1,
    pageSize: 20,
    total: 4,
    totalPages: 1,
  });
  serviceMocks.getInsightBusinessTopics.mockImplementation(async (query) => {
    const dimension = query?.dimension ?? "intent";

    if (dimension === "entity") {
      return {
        dimension,
        intentTrend: [],
        topics: [
          {
            code: "sku-1",
            dimension,
            mentionCount: 12,
            name: "白色羽绒服",
            sessionCount: 9,
            share: 1,
            type: "product",
          },
        ],
        totals: {
          mentionCount: 12,
          topicSessions: 9,
        },
        trend: [
          {
            assetMentions: 0,
            date: "2026-06-01",
            entityMentions: 12,
            intentMentions: 0,
            tagMentions: 0,
            topicSessions: 9,
          },
        ],
      };
    }

    if (dimension === "tag") {
      return {
        dimension,
        intentTrend: [],
        topics: [
          {
            code: "11",
            dimension,
            mentionCount: 10,
            name: "物流异常",
            sessionCount: 8,
            share: 1,
          },
        ],
        totals: {
          mentionCount: 10,
          topicSessions: 8,
        },
        trend: [
          {
            assetMentions: 0,
            date: "2026-06-01",
            entityMentions: 0,
            intentMentions: 0,
            tagMentions: 10,
            topicSessions: 8,
          },
        ],
      };
    }

    if (dimension === "asset") {
      return {
        dimension,
        intentTrend: [],
        topics: [
          {
            code: "701",
            dimension,
            mentionCount: 6,
            name: "红包活动",
            sessionCount: 5,
            share: 1,
            type: "link",
          },
        ],
        totals: {
          mentionCount: 6,
          topicSessions: 5,
        },
        trend: [
          {
            assetMentions: 6,
            date: "2026-06-01",
            entityMentions: 0,
            intentMentions: 0,
            tagMentions: 0,
            topicSessions: 5,
          },
        ],
      };
    }

    return {
      dimension,
      intentTrend: [
        {
          date: "2026-06-01",
          intentId: "31",
          intentName: "物流异常",
          sessionCount: 3,
        },
        {
          date: "2026-06-01",
          intentId: "34",
          intentName: "价格咨询",
          sessionCount: 2,
        },
        {
          date: "2026-06-02",
          intentId: "31",
          intentName: "物流异常",
          sessionCount: 5,
        },
      ],
      topics: [
        {
          code: "31",
          dimension,
          mentionCount: 8,
          name: "物流异常",
          sessionCount: 8,
          share: 0.4,
        },
      ],
      totals: {
        mentionCount: 8,
        topicSessions: 8,
      },
      trend: [
        {
          assetMentions: 0,
          date: "2026-06-01",
          entityMentions: 0,
          intentMentions: 3,
          tagMentions: 0,
          topicSessions: 3,
        },
        {
          assetMentions: 0,
          date: "2026-06-02",
          entityMentions: 0,
          intentMentions: 5,
          tagMentions: 0,
          topicSessions: 5,
        },
      ],
    };
  });
  serviceMocks.getInsightBusinessRelatedSessions.mockResolvedValue({
    items: [
      {
        agentAvatarUrl: "https://example.com/agent-1.png",
        agentName: "客服一号",
        analysisStatus: "ready",
        conversationId: "301",
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerName: "张三",
        lastMessageAt: 1_780_244_950_000,
        problemSummary: "客户反馈物流异常",
        resolutionStatus: "unresolved",
        sessionId: "501",
        startedAt: 1_780_243_200_000,
        summarySessionTitle: "物流异常待跟进",
      },
    ],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  });
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
      startedAt: 1_780_243_900_000,
      summary: "客户咨询退款到账时间",
      totalRules: 2,
    },
    {
      agentAvatarUrl: "https://example.com/agent-3.png",
      agentName: "客服三号",
      conversationId: "303",
      customerAvatarUrl: "https://example.com/customer-3.png",
      customerName: "王五",
      passed: false,
      passedRules: 0,
      rules: [
        { passed: false, ruleCode: "reply_quality", ruleName: "回复质量" },
      ],
      sessionId: "503",
      startedAt: 1_780_244_800_000,
      summary: "",
      totalRules: 1,
    },
  ];
  serviceMocks.getInsightQualityOverview.mockResolvedValue({
    overview: {
      inspectedSessions: 19,
      inspectionRate: 0.91,
      passRate: 0.43,
      ruleDistribution: [
        {
          count: 20,
          ruleCode: "problem_resolution",
          ruleName: "客户问题是否解决",
        },
        {
          count: 18,
          ruleCode: "clear_next_step",
          ruleName: "是否明确下一步",
        },
        { count: 16, ruleCode: "tone", ruleName: "服务语气不佳" },
        { count: 14, ruleCode: "response_speed", ruleName: "响应不及时" },
        { count: 12, ruleCode: "solution", ruleName: "方案不完整" },
        { count: 10, ruleCode: "wrong_info", ruleName: "信息错误" },
        { count: 8, ruleCode: "handoff", ruleName: "转接不规范" },
        { count: 6, ruleCode: "empathy", ruleName: "缺少安抚" },
        { count: 4, ruleCode: "closing", ruleName: "结束语缺失" },
        { count: 3, ruleCode: "upsell", ruleName: "推荐不恰当" },
        { count: 1, ruleCode: "privacy", ruleName: "隐私提醒缺失" },
      ],
      totalSessions: 22,
    },
  });
  serviceMocks.getInsightQualityAgentStats.mockResolvedValue({
    agentStats: [
      {
        agentAvatarUrl: "https://example.com/agent-report.png",
        agentName: "企微小助手1号",
        agentSeatId: "seat-1",
        failedSessions: 3,
        inspectionRate: 1,
        inspectedSessions: 21,
        passedSessions: 18,
        passRate: 0.8571,
        totalSessions: 13,
      },
    ],
  });
  serviceMocks.getInsightQualityResults.mockImplementation(async (query = {}) => {
    const filteredResults =
      query.passed == null
        ? qualityResults
        : qualityResults.filter((item) => item.passed === query.passed);

    return {
      qualityResults: filteredResults,
      qualityResultsPage: {
        page: query.page ?? 1,
        pageSize: 10,
        total: filteredResults.length,
        totalPages: 1,
      },
    };
  });
  serviceMocks.getInsightFollowUps.mockResolvedValue({
    items: [
      {
        actionItemId: "801",
        conversationId: "301",
        createdAt: 1_780_244_000_000,
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerName: "张三",
        priority: "high",
        sessionId: "501",
        status: "open",
        title: "确认快递状态",
      },
    ],
    total: 1,
  });
  serviceMocks.getInsightDetail.mockResolvedValue(createMockInsightDetail());
  serviceMocks.getInsightSessionMessages.mockResolvedValue(
    createMockInsightSessionMessages(),
  );
  serviceMocks.getInsightMessageContext.mockResolvedValue({
    contextAfter: 30,
    contextBefore: 30,
    conversationId: "301",
    messages: [
      {
        content: { text: "您好，我帮您看一下" },
        contentType: "text",
        conversationId: "301",
        createdAt: 1_780_243_900_000,
        customerId: "customer-301",
        messageId: "external-msg-9000",
        seatId: "seat-1",
        senderName: "客服一号",
        senderType: "agent",
        seq: 9000,
        status: "sent",
      },
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
    targetMessageId: "9002",
  });
  serviceMocks.getInsightFilterOptions.mockResolvedValue({
    entities: mockInsightSettings.entityDictionary
      .filter((item) => item.status === 1 && item.includeInAggregation)
      .map((item) => ({
        code: item.entityCode,
        id: item.id,
        name: item.entityName,
      })),
    intents: mockInsightSettings.intentConfigs
      .filter((item) => item.status === 1 && item.includeInStatistics)
      .map((item) => ({
        code: item.intentCode,
        id: item.id,
        name: item.intentName,
      })),
    tags: mockInsightSettings.labelConfigs
      .filter((item) => item.status === 1 && item.includeInStatistics)
      .map((item) => ({
        code: item.labelCode,
        id: item.id,
        name: item.labelName,
      })),
  });
  serviceMocks.getInsightSettings.mockResolvedValue(mockInsightSettings);
  serviceMocks.getInsightSettingsSummary.mockResolvedValue({
    enabledIntentCount: mockInsightSettings.intentConfigs.filter(
      (item) => item.status === 1,
    ).length,
    intentLimit: 20,
    intentSoftLimit: 15,
    enabledLabelCount: mockInsightSettings.labelConfigs.filter(
      (item) => item.status === 1,
    ).length,
    labelLimit: 20,
    labelSoftLimit: 15,
    enabledQaCount: mockInsightSettings.qaRuleConfigs.filter(
      (item) => item.status === 1,
    ).length,
    qaLimit: 10,
    qaSoftLimit: 8,
    enabledEntityCount: mockInsightSettings.entityDictionary.filter(
      (item) => item.status === 1,
    ).length,
    entityLimit: 20,
    entitySoftLimit: 15,
    entityEnabled: mockInsightSettings.featureConfig.entityEnabled,
    insightAvailable: mockInsightSettings.featureConfig.insightAvailable,
    insightEnabled: mockInsightSettings.featureConfig.insightEnabled,
    intentEnabled: mockInsightSettings.featureConfig.intentEnabled,
    labelEnabled: mockInsightSettings.featureConfig.labelEnabled,
    qaEnabled: mockInsightSettings.featureConfig.qaEnabled,
    todoEnabled: mockInsightSettings.featureConfig.todoEnabled,
  });
  serviceMocks.getInsightPolicyAndSessionization.mockResolvedValue({
    analysisPolicy: mockInsightSettings.analysisPolicy,
    sessionization: mockInsightSettings.sessionization,
  });
  serviceMocks.updateInsightAnalysisPolicy.mockImplementation(
    async (payload) => payload,
  );
  serviceMocks.updateInsightSessionizationSettings.mockImplementation(
    async (payload) => payload,
  );
  serviceMocks.getInsightFeatureConfig.mockResolvedValue(
    mockInsightSettings.featureConfig,
  );
  serviceMocks.listInsightIntentConfigs.mockResolvedValue(
    mockInsightSettings.intentConfigs,
  );
  serviceMocks.listInsightLabelConfigs.mockResolvedValue(
    mockInsightSettings.labelConfigs,
  );
  serviceMocks.listInsightQaRuleConfigs.mockResolvedValue(
    mockInsightSettings.qaRuleConfigs,
  );
  serviceMocks.listInsightEntityDictionary.mockResolvedValue(
    mockInsightSettings.entityDictionary,
  );
  serviceMocks.updateInsightActionStatus.mockImplementation(
    async (actionItemId: string, status: string) => ({
      actionItemId,
      status,
    }),
  );
  serviceMocks.createInsightRescanJob.mockResolvedValue({
    jobId: "8801",
    status: "accepted",
    taskId: "9901",
  });
  serviceMocks.getInsightRescanTasks.mockResolvedValue({
    items: [
      {
        analysisScope: "classification",
        createTime: 1_780_243_200_000,
        failedSessions: 2,
        finishedAt: 1_780_246_800_000,
        from: "2026-06-01T00:00:00.000Z",
        progressText: "20 / 20",
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
  });
  serviceMocks.createInsightLabelConfig.mockResolvedValue({
    status: 1,
    id: "12",
    includeInStatistics: true,
    labelCode: "high_intent",
    labelName: "高意向",
  });
  serviceMocks.createInsightIntentConfig.mockResolvedValue({
    aliases: ["报价"],
    description: "客户咨询价格",
    status: 1,
    id: "34",
    includeInStatistics: true,
    intentCode: "price_consult",
    intentName: "价格咨询",
    negativeExamples: [],
    positiveExamples: ["多少钱"],
    weight: 3,
  });
  serviceMocks.updateInsightEntityDictionaryItemStatus.mockImplementation(
    async (id: string, payload: { status: 0 | 1 }) => ({
      ...mockInsightSettings.entityDictionary.find((item) => item.id === id),
      ...payload,
      id,
    }),
  );
}

async function applyDateRangePreset(
  label: string,
  expectedFrom: string,
  expectedTo: string,
) {
  await userEvent.click(screen.getByRole("button", { name: /日期范围/ }));
  await userEvent.click(await screen.findByRole("button", { name: label }));

  await waitFor(() => {
    expect(serviceMocks.getInsightOverview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: `${expectedFrom}T00:00:00.000+08:00`,
        to: `${expectedTo}T23:59:59.999+08:00`,
      }),
    );
  });
  expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      from: `${expectedFrom}T00:00:00.000+08:00`,
      page: 1,
      pageSize: 20,
      to: `${expectedTo}T23:59:59.999+08:00`,
    }),
  );
  expect(
    screen.getByRole("button", {
      name: new RegExp(`日期范围.*${label}.*${expectedFrom}.*${expectedTo}`),
    }),
  ).toBeInTheDocument();
}

describe("conversation insights pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-03T10:00:00+08:00"));
    mockSession("admin");
    installInsightMocks();
  });

  afterEach(() => {
    cleanup();
    document.body.removeAttribute("data-scroll-locked");
    document.body.style.removeProperty("pointer-events");
    vi.useRealTimers();
  });

  it("renders overview navigation, metrics and detail evidence", async () => {
    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/当前范围内有/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /日期范围.*近7天.*2026-05-28.*2026-06-03/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("开始日期")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("结束日期")).not.toBeInTheDocument();
    expect(serviceMocks.getInsightOverview).toHaveBeenCalledWith({
      from: "2026-05-28T00:00:00.000+08:00",
      to: "2026-06-03T23:59:59.999+08:00",
    });
    expect(serviceMocks.getInsightOverviewSessions).toHaveBeenCalledWith({
      analysisStatus: undefined,
      entityId: undefined,
      from: "2026-05-28T00:00:00.000+08:00",
      intentId: undefined,
      keyword: undefined,
      page: 1,
      pageSize: 20,
      problemScope: undefined,
      resolutionStatus: undefined,
      tagId: undefined,
      to: "2026-06-03T23:59:59.999+08:00",
    });
    expect(screen.getByRole("link", { name: /服务质检/ })).toHaveAttribute(
      "href",
      "/chat/insights/quality",
    );
    expect(
      screen.queryByRole("link", { name: /分析明细/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("咨询会话数")).toBeInTheDocument();
    expect(screen.getAllByText("22").length).toBeGreaterThan(0);
    expect(screen.getByText("咨询用户数")).toBeInTheDocument();
    expect(screen.getByText("消息数")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^消息数/ })).toBeInTheDocument();
    expect(screen.getByText("环比 ↑100.0% +22")).toBeInTheDocument();
    expect(screen.getByText("环比 ↑100.0% +16")).toBeInTheDocument();
    expect(screen.getByText("环比 ↑100.0% +102")).toBeInTheDocument();
    expect(screen.getByText("环比 ↑100.0% +64")).toBeInTheDocument();
    expect(screen.queryByText(/环比 .* -/)).not.toBeInTheDocument();
    expect(screen.queryByText("按咨询过程归并")).not.toBeInTheDocument();
    expect(screen.queryByText("按客户去重")).not.toBeInTheDocument();
    expect(screen.queryByText("客户与客服合计")).not.toBeInTheDocument();
    expect(screen.queryByText("客户主动表达量")).not.toBeInTheDocument();
    const distributionPanel = screen
      .getByRole("heading", { name: "AI 诊断" })
      .closest("section");
    const trendPanel = screen
      .getByRole("button", { name: "咨询会话" })
      .closest("section");

    expect(distributionPanel).not.toBeNull();
    expect(trendPanel).not.toBeNull();
    expect(
      within(distributionPanel as HTMLElement).getByText(
        "2026-05-28 至 2026-06-03",
      ),
    ).toBeInTheDocument();
    expect(
      within(trendPanel as HTMLElement).getByText("2026-05-28 至 2026-06-03"),
    ).toBeInTheDocument();
    expect(screen.queryByText("最近 30 天")).not.toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "咨询会话明细" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "分页" })).toHaveClass(
      "!mx-0",
      "!ml-auto",
    );
    expect(screen.getByText("摘要")).toBeInTheDocument();
    expect(screen.getByText("物流异常待跟进")).toBeInTheDocument();
    expect(screen.queryByText("客户反馈物流异常")).not.toBeInTheDocument();
    await userEvent.hover(
      screen.getAllByRole("button", { name: "查看 AI 诊断说明" })[0]!,
    );
    expect(
      await screen.findAllByText("按本轮会话内容判断，不代表后续处理状态"),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText("消息未达准入门槛，或模型基于现有消息仍无法判断"),
    ).not.toHaveLength(0);
    expect(screen.getAllByText("消息不足").length).toBeGreaterThan(0);
    expect(screen.queryByText("待复核")).not.toBeInTheDocument();
    expect(screen.queryByText("待判断")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: "AI 诊断" }));
    expect(
      await screen.findByRole("option", { name: "无需客服处理" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "无明确问题" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("优先处理队列")).not.toBeInTheDocument();
    expect(screen.queryByText("分析完成率和异常状态")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "张三" })).toBeInTheDocument();
    expect(screen.getByText("孙七")).toBeInTheDocument();
    expect(screen.getByText("待分析")).toBeInTheDocument();
    expect(screen.queryByText("分析中")).not.toBeInTheDocument();
    expect(screen.queryByText("会话 301")).not.toBeInTheDocument();
    expect(
      document.querySelector("#insightTrendArea stop[offset='100%']"),
    ).toHaveAttribute("stop-opacity", "0");

    await waitFor(() => {
      expect(serviceMocks.getInsightFilterOptions).toHaveBeenCalled();
    });
    expect(serviceMocks.getInsightSettings).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    let advancedFilters = await screen.findByRole("menu", { name: /更多筛选/ });
    expect(
      within(advancedFilters).queryByRole("menuitemradio", {
        name: "退款咨询",
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(advancedFilters).getByRole("menuitem", { name: "标签" }),
    );
    let refundTagOption = await screen.findByRole("menuitemradio", {
      name: "退款咨询",
    });
    expect(refundTagOption).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: "高意向" }),
    ).toBeInTheDocument();
    expect(
      within(advancedFilters).queryByRole("menuitemradio", {
        name: "物流异常",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(advancedFilters).queryByRole("menuitemradio", {
        name: "隐藏标签",
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(refundTagOption);

    await waitFor(() => {
      expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          tagId: "11",
        }),
      );
    });
    expect(serviceMocks.getInsightOverview).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    advancedFilters = await screen.findByRole("menu", { name: /更多筛选/ });
    await userEvent.click(
      within(advancedFilters).getByRole("menuitem", { name: "意图" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "查物流" }),
    );
    await waitFor(() => {
      expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          intentId: "31",
          page: 1,
        }),
      );
    });

    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    advancedFilters = await screen.findByRole("menu", { name: /更多筛选/ });
    await userEvent.click(
      within(advancedFilters).getByRole("menuitem", { name: "实体" }),
    );
    const whiteCoatOption = await screen.findByRole("menuitemradio", {
      name: "白色羽绒服",
    });
    expect(
      screen.getByRole("menuitemradio", { name: "黑色雨伞" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemradio", { name: "隐藏实体" }),
    ).not.toBeInTheDocument();
    await userEvent.click(whiteCoatOption);
    await waitFor(() => {
      expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          entityId: "41",
          page: 1,
        }),
      );
    });

    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    advancedFilters = await screen.findByRole("menu", { name: /更多筛选/ });
    await userEvent.click(
      within(advancedFilters).getByRole("menuitem", { name: /标签/ }),
    );
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "全部标签" }),
    );
    await userEvent.click(screen.getByRole("combobox", { name: "问题范围" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "有客户问题" }),
    );

    await waitFor(() => {
      expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          problemScope: "problem",
        }),
      );
    });

    await userEvent.click(screen.getByRole("combobox", { name: "问题范围" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "未解决/部分解决" }),
    );

    await waitFor(() => {
      expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          problemScope: "unresolved",
        }),
      );
    });

    await userEvent.click(screen.getAllByRole("button", { name: "详情" })[0]);

    expect(await screen.findByText("洞察详情")).toBeInTheDocument();
    await waitFor(() => {
      expect(serviceMocks.getInsightSessionMessages).toHaveBeenCalledWith(
        "501",
      );
    });
    expect(
      serviceMocks.getInsightDetail.mock.invocationCallOrder[0],
    ).toBeLessThan(
      serviceMocks.getInsightSessionMessages.mock.invocationCallOrder[0],
    );
    const detailDialog = screen.getByRole("dialog", { name: "洞察详情" });
    const insightRegion = screen.getByRole("region", { name: "洞察结论" });
    const conversationRegion = screen.getByRole("region", { name: "本轮对话" });
    expect(insightRegion).toBeInTheDocument();
    expect(conversationRegion).toBeInTheDocument();
    expect(
      within(detailDialog).getAllByRole("img", { name: "张三" }).length,
    ).toBeGreaterThan(0);
    expect(
      within(detailDialog).getAllByRole("img", { name: "客服一号" }).length,
    ).toBeGreaterThan(0);
    expect(within(detailDialog).getByText(/生成于/)).toBeInTheDocument();
    expect(within(detailDialog).queryByText("已完成")).not.toBeInTheDocument();
    expect(within(insightRegion).queryByText("摘要")).not.toBeInTheDocument();
    expect(
      within(insightRegion).getByText("物流异常待跟进"),
    ).toBeInTheDocument();
    expect(
      within(insightRegion).getByText(
        "客户反馈物流不更新，客服表示会催快递但尚未确认物流进展。",
      ),
    ).toBeInTheDocument();
    expect(
      within(insightRegion).getByText("客户反馈物流异常"),
    ).toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("处理过程"),
    ).not.toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("客服要求客户等待"),
    ).not.toBeInTheDocument();
    expect(within(insightRegion).getByText("客户问题")).toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("客户诉求"),
    ).not.toBeInTheDocument();
    expect(within(insightRegion).getByText("AI 诊断")).toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("未解决判定理由"),
    ).not.toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("售后/物流/退款进度未确认"),
    ).not.toBeInTheDocument();
    await userEvent.hover(
      within(insightRegion).getByRole("button", { name: "查看 AI 诊断理由" }),
    );
    expect(
      await screen.findByText("售后/物流/退款进度未确认"),
    ).toBeInTheDocument();
    expect(within(insightRegion).getByText("客户")).toBeInTheDocument();
    expect(within(insightRegion).getByText("接待客服")).toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("客服 客服一号"),
    ).not.toBeInTheDocument();
    expect(within(insightRegion).getByText("会话时间")).toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("跟进建议"),
    ).not.toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("确认快递状态"),
    ).not.toBeInTheDocument();
    expect(
      within(insightRegion).queryByRole("heading", { name: "待处理" }),
    ).not.toBeInTheDocument();
    const actionItemsLabel = within(insightRegion).getByText("待办任务");
    const diagnosisLabel = within(insightRegion).getByText("AI 诊断");
    expect(
      diagnosisLabel.compareDocumentPosition(actionItemsLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      actionItemsLabel.compareDocumentPosition(
        within(insightRegion).getByText("服务质检"),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(insightRegion).getByText("服务质检")).toBeInTheDocument();
    expect(
      within(insightRegion).getByRole("img", { name: "服务质检通过率 50%" }),
    ).toBeInTheDocument();
    expect(within(insightRegion).getByText("通过")).toBeInTheDocument();
    expect(within(insightRegion).getByText("未通过")).toBeInTheDocument();
    expect(within(insightRegion).getByText("响应及时性")).toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("已向客户说明会催促快递并同步进展"),
    ).not.toBeInTheDocument();
    expect(
      within(insightRegion).getAllByText("未确认物流进展").length,
    ).toBeGreaterThan(0);
    await userEvent.hover(
      within(insightRegion).getByRole("button", {
        name: "查看未通过原因：未确认物流进展",
      }),
    );
    expect(await screen.findAllByText("未确认物流进展")).toHaveLength(2);
    expect(within(insightRegion).getByText("负向")).toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("客户明确表达物流不更新的不满"),
    ).not.toBeInTheDocument();
    await userEvent.hover(
      within(insightRegion).getByRole("button", {
        name: "查看情绪判定理由：负向",
      }),
    );
    expect(
      await screen.findByText("客户明确表达物流不更新的不满"),
    ).toBeInTheDocument();
    const businessAttributionHeading = within(insightRegion).getByRole(
      "heading",
      { name: "智能归因" },
    );
    expect(
      actionItemsLabel.compareDocumentPosition(businessAttributionHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(insightRegion).getByText("跟进物流是否已更新"),
    ).toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("标记完成"),
    ).not.toBeInTheDocument();
    const completeActionItemButton = within(insightRegion).getByRole("button", {
      name: "标记完成：跟进物流是否已更新",
    });
    expect(
      within(completeActionItemButton).queryByText("标记完成"),
    ).not.toBeInTheDocument();
    expect(
      within(insightRegion).getByRole("button", {
        name: "忽略：跟进物流是否已更新",
      }),
    ).toBeInTheDocument();
    await userEvent.click(completeActionItemButton);
    await waitFor(() => {
      expect(serviceMocks.updateInsightActionStatus).toHaveBeenCalledWith(
        "801",
        "done",
      );
    });
    expect(within(insightRegion).getByText("跟进物流是否已更新")).toHaveClass(
      "line-through",
    );
    expect(
      within(insightRegion).queryByRole("button", {
        name: "恢复待完成：跟进物流是否已更新",
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(insightRegion).getByRole("button", {
        name: "重新打开：跟进物流是否已更新",
      }),
    );
    await waitFor(() => {
      expect(serviceMocks.updateInsightActionStatus).toHaveBeenCalledWith(
        "801",
        "open",
      );
    });
    expect(
      within(insightRegion).getByText("跟进物流是否已更新"),
    ).not.toHaveClass("line-through");
    await userEvent.click(
      within(insightRegion).getByRole("button", {
        name: "忽略：跟进物流是否已更新",
      }),
    );
    await waitFor(() => {
      expect(serviceMocks.updateInsightActionStatus).toHaveBeenLastCalledWith(
        "801",
        "dismissed",
      );
    });
    expect(
      within(insightRegion).queryByRole("button", {
        name: "恢复待完成：跟进物流是否已更新",
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(insightRegion).getByRole("button", {
        name: "重新打开：跟进物流是否已更新",
      }),
    );
    await waitFor(() => {
      expect(serviceMocks.updateInsightActionStatus).toHaveBeenLastCalledWith(
        "801",
        "open",
      );
    });
    expect(within(insightRegion).getByText("发送补偿说明")).toHaveClass(
      "line-through",
    );
    expect(screen.getAllByText("物流异常").length).toBeGreaterThan(0);
    expect(screen.getAllByText("白色羽绒服").length).toBeGreaterThan(0);
    expect(screen.getByText("物流停滞怎么处理")).toBeInTheDocument();
    expect(
      screen.queryByText("先核实物流停滞节点，再告知预计回复时间"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(insightRegion).getByRole("button", { name: /物流停滞怎么处理/ }),
    );
    expect(
      screen.getByText("先核实物流停滞节点，再告知预计回复时间"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("还没收到货，物流也不更新").length,
    ).toBeGreaterThan(0);
    expect(
      within(conversationRegion).getByText("客户问题"),
    ).toBeInTheDocument();
    expect(within(conversationRegion).getByText("客户问题")).toHaveAttribute(
      "title",
      expect.stringContaining("客户明确反馈物流不更新"),
    );
    expect(
      screen.queryByRole("region", { name: "关键证据" }),
    ).not.toBeInTheDocument();
    expect(
      within(detailDialog).queryByText("2 条证据"),
    ).not.toBeInTheDocument();
    expect(within(detailDialog).queryByText("+1")).not.toBeInTheDocument();
    expect(
      within(insightRegion).queryByText("当前会话未确认物流处理结果"),
    ).not.toBeInTheDocument();
    expect(
      within(conversationRegion).queryByText("客户明确反馈物流不更新"),
    ).not.toBeInTheDocument();
    expect(
      within(conversationRegion).queryByText("当前会话未确认物流处理结果"),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByTestId("history-message-item").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByRole("link", { name: "跳转聊天" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "查看上下文" }),
    ).not.toBeInTheDocument();
    expect(serviceMocks.getInsightMessageContext).not.toHaveBeenCalled();
  });

  it("shows insight detail loading and error states", async () => {
    const detailRequest =
      createDeferred<ReturnType<typeof createMockInsightDetail>>();
    serviceMocks.getInsightDetail.mockReturnValueOnce(detailRequest.promise);

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "详情" })[0]);

    expect(await screen.findByText("正在加载会话")).toBeInTheDocument();
    detailRequest.reject(new Error("detail failed"));
    expect(await screen.findByText("洞察详情加载失败")).toBeInTheDocument();
  });

  it("opens analyzing physical session detail without a generated snapshot", async () => {
    serviceMocks.getInsightDetail.mockResolvedValueOnce(
      createMockAnalyzingInsightDetail(),
    );
    serviceMocks.getInsightSessionMessages.mockResolvedValueOnce(
      createMockInsightSessionMessages(),
    );

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "详情" })[3]);

    const detailDialog = await screen.findByRole("dialog", {
      name: "洞察详情",
    });
    const insightRegion = await screen.findByRole("region", {
      name: "洞察结论",
    });

    expect(serviceMocks.getInsightDetail).toHaveBeenCalledWith("504");
    expect(serviceMocks.getInsightSessionMessages).toHaveBeenCalledWith("504");
    expect(within(detailDialog).getAllByText("待分析").length).toBeGreaterThan(
      0,
    );
    expect(within(detailDialog).queryByText("分析中")).not.toBeInTheDocument();
    expect(within(detailDialog).queryByText(/生成于/)).not.toBeInTheDocument();
    expect(
      within(detailDialog).queryByText("消息不足"),
    ).not.toBeInTheDocument();
    expect(within(insightRegion).getByText("孙七")).toBeInTheDocument();
    expect(within(insightRegion).getByText("客服四号")).toBeInTheDocument();
    expect(within(insightRegion).getAllByText("暂无数据")).toHaveLength(3);
  });

  it("only badges problem-resolution evidence in the detail conversation panel", async () => {
    const detail = createMockInsightDetail();
    detail.evidenceItems.push({
      dimensionRecordId: "8001",
      dimensionType: "sentiment",
      evidenceRole: "primary",
      messageId: "9003",
      reason: "客户语气平稳",
    });
    const sessionMessages = createMockInsightSessionMessages();
    sessionMessages.messages.push({
      content: { text: "我只是补充确认一下" },
      contentType: "text",
      conversationId: "301",
      createdAt: 1_780_244_200_000,
      customerId: "customer-301",
      messageId: "external-msg-9003",
      seatId: "seat-1",
      senderAvatar: "https://example.com/customer-1.png",
      senderName: "张三",
      senderType: "customer",
      seq: 9003,
      status: "sent",
    });
    serviceMocks.getInsightDetail.mockResolvedValueOnce(detail);
    serviceMocks.getInsightSessionMessages.mockResolvedValueOnce(
      sessionMessages,
    );

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "详情" })[0]);

    const conversationRegion = await screen.findByRole("region", {
      name: "本轮对话",
    });
    expect(
      within(conversationRegion).getByText("客户问题"),
    ).toBeInTheDocument();
    expect(
      within(conversationRegion).getByText("我只是补充确认一下"),
    ).toBeInTheDocument();
    expect(
      within(conversationRegion).queryByText("证据"),
    ).not.toBeInTheDocument();
  });

  it("hides customer problem row when problem summary is empty", async () => {
    const detail = createMockInsightDetail();
    detail.problemResolution.problemSummary = "";
    serviceMocks.getInsightDetail.mockResolvedValueOnce(detail);

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "详情" })[0]);

    const insightRegion = await screen.findByRole("region", {
      name: "洞察结论",
    });
    expect(
      within(insightRegion).queryByText("客户问题"),
    ).not.toBeInTheDocument();
  });

  it("uses unnamed session title fallback and hides empty summary text", async () => {
    const detail = createMockInsightDetail();
    detail.summary = {
      sessionTitle: "",
      text: "",
    };
    serviceMocks.getInsightDetail.mockResolvedValueOnce(detail);

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "详情" })[0]);

    const insightRegion = await screen.findByRole("region", {
      name: "洞察结论",
    });
    expect(
      within(insightRegion).getByRole("heading", { name: "未命名会话" }),
    ).toBeInTheDocument();
    expect(within(insightRegion).queryByText("暂无")).not.toBeInTheDocument();
  });

  it("shows empty states for insight detail sections with no results", async () => {
    const detail = createMockInsightDetail();
    detail.entities = [];
    detail.faqCandidates = [];
    detail.intents = [];
    detail.qaFindings = [];
    detail.sentiment = [];
    detail.tags = [];
    serviceMocks.getInsightDetail.mockResolvedValueOnce(detail);

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "详情" })[0]);

    const insightRegion = await screen.findByRole("region", {
      name: "洞察结论",
    });
    expect(
      within(insightRegion).getByRole("heading", { name: "服务质检" }),
    ).toBeInTheDocument();
    expect(
      within(insightRegion).getByRole("heading", { name: "智能归因" }),
    ).toBeInTheDocument();
    expect(
      within(insightRegion).getByRole("heading", { name: "知识沉淀" }),
    ).toBeInTheDocument();
    expect(within(insightRegion).getAllByText("暂无数据")).toHaveLength(3);
  });

  it("keeps the latest insight detail request when users switch sessions quickly", async () => {
    const baseDetail = createMockInsightDetail();
    const slowDetail = createDeferred<typeof baseDetail>();
    const latestDetail = {
      ...baseDetail,
      problemResolution: {
        ...baseDetail.problemResolution,
        problemSummary: "第二个会话的问题",
      },
      session: {
        ...baseDetail.session,
        sessionId: "502",
      },
    };
    serviceMocks.getInsightOverviewSessions.mockResolvedValue({
      items: [
        {
          agentAvatarUrl: "https://example.com/agent-1.png",
          agentName: "客服一号",
          analysisStatus: "ready",
          conversationId: "301",
          customerAvatarUrl: "https://example.com/customer-1.png",
          customerName: "张三",
          generatedAt: 1_780_245_100_000,
          lastMessageAt: 1_780_244_950_000,
          phase: "final",
          problemSummary: "第一个会话的问题",
          resolutionStatus: "unresolved",
          sessionId: "501",
          startedAt: 1_780_243_200_000,
          unresolvedReason: "待确认",
        },
        {
          agentAvatarUrl: "https://example.com/agent-1.png",
          agentName: "客服二号",
          analysisStatus: "ready",
          conversationId: "302",
          customerAvatarUrl: "https://example.com/customer-2.png",
          customerName: "李四",
          generatedAt: 1_780_245_200_000,
          lastMessageAt: 1_780_244_980_000,
          phase: "final",
          problemSummary: "第二个会话的问题",
          resolutionStatus: "resolved",
          sessionId: "502",
          startedAt: 1_780_243_500_000,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
    serviceMocks.getInsightDetail
      .mockReturnValueOnce(slowDetail.promise)
      .mockResolvedValueOnce(latestDetail);

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    const detailButtons = await screen.findAllByRole("button", {
      name: "详情",
    });
    await userEvent.click(detailButtons[0]);
    await userEvent.click(await screen.findByRole("button", { name: "关闭" }));
    await userEvent.click(detailButtons[1]);
    const detailDialog = await screen.findByRole("dialog", {
      name: "洞察详情",
    });
    expect(
      await within(detailDialog).findByText("第二个会话的问题"),
    ).toBeInTheDocument();

    slowDetail.resolve(baseDetail);
    await waitFor(() => {
      expect(
        within(detailDialog).queryByText("第一个会话的问题"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows request failure states on overview and business pages", async () => {
    serviceMocks.getInsightOverview.mockRejectedValueOnce(
      new Error("overview failed"),
    );
    renderRoute("/chat/insights");

    expect(await screen.findByText("数据加载失败")).toBeInTheDocument();

    cleanup();
    mockSession("admin");
    installInsightMocks();
    serviceMocks.getInsightBusinessTopics.mockRejectedValueOnce(
      new Error("business failed"),
    );
    renderRoute("/chat/insights/business");

    expect(await screen.findByText("数据加载失败")).toBeInTheDocument();
  });

  it("applies date range presets to insight overview queries", async () => {
    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /日期范围.*近7天/ }),
    );
    expect(await screen.findByText("2026年5月")).toBeInTheDocument();
    expect(screen.getByText("2026年6月")).toBeInTheDocument();
    expect(screen.queryByText("2026年7月")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "昨天" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "近7天" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightOverview).toHaveBeenLastCalledWith({
        from: "2026-05-28T00:00:00.000+08:00",
        to: "2026-06-03T23:59:59.999+08:00",
      });
    });
    expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: "2026-05-28T00:00:00.000+08:00",
        page: 1,
        pageSize: 20,
        to: "2026-06-03T23:59:59.999+08:00",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: /日期范围.*近7天.*2026-05-28.*2026-06-03/,
      }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /日期范围.*近7天/ }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "昨天" }));
    await waitFor(() => {
      expect(serviceMocks.getInsightOverview).toHaveBeenLastCalledWith({
        from: "2026-06-02T00:00:00.000+08:00",
        to: "2026-06-02T23:59:59.999+08:00",
      });
    });
    expect(
      screen.getByRole("button", {
        name: /日期范围.*昨天.*2026-06-02.*2026-06-02/,
      }),
    ).toBeInTheDocument();
    await applyDateRangePreset("本周", "2026-06-01", "2026-06-03");
    await applyDateRangePreset("上周", "2026-05-25", "2026-05-31");
    await applyDateRangePreset("本月", "2026-06-01", "2026-06-03");
    await applyDateRangePreset("上月", "2026-05-01", "2026-05-31");

    await userEvent.click(
      screen.getByRole("button", { name: /日期范围.*上月/ }),
    );
    expect(
      document.querySelector(
        "[data-outside='true'][aria-selected='true']:not([data-hidden='true'])",
      ),
    ).not.toBeInTheDocument();
  });

  it("keeps advanced session filters inside the more filters dropdown", async () => {
    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(serviceMocks.getInsightFilterOptions).toHaveBeenCalled();
    });

    expect(
      screen.getByRole("textbox", { name: "搜索摘要" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "AI 诊断" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "标签" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "实体" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "意图" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "分析状态" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    const advancedFilters = await screen.findByRole("menu", {
      name: /更多筛选/,
    });
    expect(
      within(advancedFilters).queryByRole("menuitemradio", {
        name: "退款咨询",
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(advancedFilters).getByRole("menuitem", { name: "标签" }),
    );
    const refundTagOption = await screen.findByRole("menuitemradio", {
      name: "退款咨询",
    });
    await userEvent.click(refundTagOption);

    await waitFor(() => {
      expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          tagId: "11",
        }),
      );
    });
    expect(
      screen.getByRole("button", { name: "更多筛选" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "移除筛选 标签：退款咨询" }),
    ).toBeInTheDocument();
  });

  it("keeps long advanced filter option labels on one line", async () => {
    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(serviceMocks.getInsightFilterOptions).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    const advancedFilters = await screen.findByRole("menu", {
      name: /更多筛选/,
    });
    await userEvent.click(
      within(advancedFilters).getByRole("menuitem", { name: "意图" }),
    );

    const longIntentOption = await screen.findByRole("menuitemradio", {
      name: "咨询AI客服系统相关信息",
    });
    expect(
      within(longIntentOption).getByText("咨询AI客服系统相关信息"),
    ).toHaveClass("truncate");
  });

  it("starts a new custom date range when clicking the calendar after a complete range is selected", async () => {
    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /日期范围.*近7天/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /2026年5月10日/ }),
    );
    expect(screen.getByRole("button", { name: "应用" })).toBeDisabled();
    expect(screen.getByText("请选择完整范围")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2026年6月9日/ })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /2026年6月10日/ }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: /2026年5月12日/ }),
    );
    expect(screen.getByRole("button", { name: /2026年5月10日/ })).toHaveClass(
      "rounded-l-[10px]",
    );
    expect(screen.getByRole("button", { name: /2026年5月10日/ })).toHaveClass(
      "rounded-r-none",
    );
    expect(screen.getByRole("button", { name: /2026年5月11日/ })).toHaveClass(
      "rounded-none",
    );
    expect(screen.getByRole("button", { name: /2026年5月12日/ })).toHaveClass(
      "rounded-l-none",
    );
    expect(screen.getByRole("button", { name: /2026年5月12日/ })).toHaveClass(
      "rounded-r-[10px]",
    );
    expect(screen.getByText("2026-05-10 至 2026-05-12")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "应用" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightOverview).toHaveBeenLastCalledWith({
        from: "2026-05-10T00:00:00.000+08:00",
        to: "2026-05-12T23:59:59.999+08:00",
      });
    });
    expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: "2026-05-10T00:00:00.000+08:00",
        page: 1,
        pageSize: 20,
        to: "2026-05-12T23:59:59.999+08:00",
      }),
    );
  });

  it("renders quality result list and agent report", async () => {
    renderRoute("/chat/insights/quality");

    expect(
      await screen.findByRole("heading", { name: "服务质检" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "按咨询会话判断客户问题是否解决，辅助主管复核服务质量",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("quality-page-header")).toHaveClass(
      "sm:items-end",
    );
    expect(serviceMocks.getInsightQualityOverview).toHaveBeenCalledWith(
      {
        from: "2026-05-28T00:00:00.000+08:00",
        to: "2026-06-03T23:59:59.999+08:00",
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(serviceMocks.getInsightQualityAgentStats).toHaveBeenCalledWith(
      {
        from: "2026-05-28T00:00:00.000+08:00",
        to: "2026-06-03T23:59:59.999+08:00",
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(
      screen.queryByRole("region", { name: "质检概览" }),
    ).not.toBeInTheDocument();
    const qualityOverviewContent = screen.getByTestId(
      "quality-overview-content",
    );
    expect(qualityOverviewContent).toHaveClass("lg:grid-cols-2");
    const qualityMetrics = screen.getByRole("region", { name: "质检指标" });
    expect(qualityMetrics).toBeInTheDocument();
    expect(qualityMetrics).toHaveClass(
      "flex",
      "flex-col",
      "rounded-[8px]",
      "border",
      "bg-background",
    );
    const qualityDistribution = screen.getByRole("region", {
      name: "质检分布",
    });
    expect(qualityDistribution).toHaveClass(
      "rounded-[8px]",
      "border",
      "bg-background",
    );
    expect(
      within(qualityMetrics).getByText("2026-05-28 至 2026-06-03"),
    ).toBeInTheDocument();
    expect(
      within(qualityDistribution).getByText("2026-05-28 至 2026-06-03"),
    ).toBeInTheDocument();
    expect(within(qualityMetrics).getByText("会话数")).toBeInTheDocument();
    expect(within(qualityMetrics).getByText("22")).toBeInTheDocument();
    expect(within(qualityMetrics).getByText("质检会话数")).toBeInTheDocument();
    expect(within(qualityMetrics).getByText("19")).toBeInTheDocument();
    expect(within(qualityMetrics).getByText("质检覆盖率")).toBeInTheDocument();
    expect(within(qualityMetrics).getByText("质检通过率")).toBeInTheDocument();
    expect(
      within(qualityMetrics).getByTestId("quality-metric-grid"),
    ).toHaveClass("flex-1");
    expect(
      within(qualityMetrics).getByRole("progressbar", { name: "质检覆盖率" }),
    ).toHaveAttribute("aria-valuenow", "91");
    expect(
      within(qualityMetrics).getByRole("progressbar", { name: "质检通过率" }),
    ).toHaveAttribute("aria-valuenow", "43");
    expect(
      within(qualityDistribution).getByTestId(
        "quality-rule-distribution-chart",
      ),
    ).toHaveClass("size-[180px]");
    expect(within(qualityDistribution).getByText("112")).toBeInTheDocument();
    expect(
      within(qualityDistribution).getByText("命中次数"),
    ).toBeInTheDocument();
    expect(
      within(qualityDistribution).queryByText("规则"),
    ).not.toBeInTheDocument();
    expect(
      within(qualityDistribution).queryByText("命中占比"),
    ).not.toBeInTheDocument();
    expect(
      within(qualityDistribution).queryByText("总数"),
    ).not.toBeInTheDocument();
    expect(
      within(qualityDistribution).getByTestId(
        "quality-rule-distribution-scroll",
      ),
    ).toHaveAttribute("data-scrollbar-visibility", "hover");
    expect(
      within(qualityDistribution).getByTestId(
        "quality-rule-distribution-viewport",
      ),
    ).toHaveClass("pr-4");
    expect(
      within(qualityDistribution).getByTestId("quality-rule-distribution-list"),
    ).toBeInTheDocument();
    const distributionItems =
      within(qualityDistribution).getAllByRole("listitem");
    expect(distributionItems).toHaveLength(10);
    expect(
      within(qualityDistribution).getByText("客户问题是否解决"),
    ).toBeInTheDocument();
    expect(within(qualityDistribution).getByText("17.9%")).toBeInTheDocument();
    expect(within(qualityDistribution).getByText("20")).toBeInTheDocument();
    const otherItem = distributionItems.find((item) =>
      item.textContent?.includes("其他"),
    );
    expect(otherItem).toBeDefined();
    expect(within(otherItem!).getByText("3.6%")).toBeInTheDocument();
    expect(within(otherItem!).getByText("4")).toBeInTheDocument();
    expect(
      within(qualityDistribution).queryByText("推荐不恰当"),
    ).not.toBeInTheDocument();
    const qualityTabs = screen.getByRole("tablist");
    expect(
      within(qualityTabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["客服报表", "质检结果"]);
    expect(
      screen.getByRole("tab", { name: "客服报表", selected: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "质检结果", selected: false }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual([
      "客服账号",
      "接待会话数",
      "质检会话数",
      "质检覆盖率",
      "质检通过数",
      "质检未通过数",
      "质检通过率",
    ]);
    expect(screen.getByText("企微小助手1号")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "企微小助手1号" }),
    ).toBeInTheDocument();
    expect(screen.getByText("100.00%")).toBeInTheDocument();
    expect(screen.getByText("85.71%")).toBeInTheDocument();
    const callsBeforeQualityResults =
      serviceMocks.getInsightQualityResults.mock.calls.length;

    await userEvent.click(screen.getByRole("tab", { name: "质检结果" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightQualityResults).toHaveBeenCalledTimes(
        callsBeforeQualityResults + 1,
      );
    });
    expect(within(qualityMetrics).getByText("19")).toBeInTheDocument();
    expect(serviceMocks.getInsightQualityResults).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: "2026-05-28T00:00:00.000+08:00",
        page: 1,
        pageSize: 10,
        to: "2026-06-03T23:59:59.999+08:00",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(
      screen.getByRole("columnheader", { name: "客户" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "接待客服" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "摘要" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "时间" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "质检结果" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "操作" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("无明确问题")).not.toBeInTheDocument();
    expect(screen.getByText("客户反馈物流异常")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByText("回复质量")).not.toBeInTheDocument();
    expect(
      screen.queryByText("售后/物流/退款进度未确认"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("未通过 1/2")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "张三" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "客服一号" })).toBeInTheDocument();
    expect(screen.queryByText("会话 301")).not.toBeInTheDocument();
    expect(screen.queryByText("客户咨询退款到账时间")).not.toBeInTheDocument();

    await userEvent.hover(screen.getByText("未通过 1/2"));

    const ruleMenu = await screen.findByRole("menu");
    expect(within(ruleMenu).getAllByText("回复质量").length).toBeGreaterThan(0);
    expect(within(ruleMenu).getAllByText("未通过").length).toBeGreaterThan(0);
    expect(within(ruleMenu).getAllByText("明确下一步").length).toBeGreaterThan(
      0,
    );
    expect(within(ruleMenu).getAllByText("已通过").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("option", { name: "全部结果" }),
    );

    expect(screen.getByText("客户咨询退款到账时间")).toBeInTheDocument();
    expect(screen.getAllByText("已通过").length).toBeGreaterThan(0);
    expect(screen.queryByText("2 / 2")).not.toBeInTheDocument();
    expect(serviceMocks.getInsightQualityResults).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: "2026-05-28T00:00:00.000+08:00",
        page: 1,
        pageSize: 10,
        passed: undefined,
        to: "2026-06-03T23:59:59.999+08:00",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps quality distribution slots when fewer than ten rules are available", async () => {
    serviceMocks.getInsightQualityOverview.mockResolvedValueOnce({
      overview: {
        inspectedSessions: 6,
        inspectionRate: 1,
        passRate: 0.5,
        ruleDistribution: [
          {
            count: 7,
            ruleCode: "problem_resolution",
            ruleName: "客户问题是否解决",
          },
          { count: 3, ruleCode: "clear_next_step", ruleName: "是否明确下一步" },
        ],
        totalSessions: 6,
      },
    });

    renderRoute("/chat/insights/quality");

    const qualityDistribution = await screen.findByRole("region", {
      name: "质检分布",
    });
    const distributionItems =
      within(qualityDistribution).getAllByRole("listitem");

    expect(distributionItems).toHaveLength(10);
    expect(
      within(qualityDistribution).getByText("客户问题是否解决"),
    ).toBeInTheDocument();
    expect(within(qualityDistribution).getByText("70.0%")).toBeInTheDocument();
    expect(
      within(qualityDistribution).getByText("是否明确下一步"),
    ).toBeInTheDocument();
    expect(within(qualityDistribution).getByText("30.0%")).toBeInTheDocument();
    expect(
      within(qualityDistribution).queryByText("其他"),
    ).not.toBeInTheDocument();
    expect(
      distributionItems.slice(2).every((item) => item.textContent === ""),
    ).toBe(true);
  });

  it("aborts quality loading when the page unmounts", async () => {
    const qualityGate =
      createDeferred<
        Awaited<ReturnType<typeof serviceMocks.getInsightQualityOverview>>
      >();
    serviceMocks.getInsightQualityOverview.mockReturnValueOnce(qualityGate.promise);

    renderRoute("/chat/insights/quality");

    await waitFor(() => {
      expect(serviceMocks.getInsightQualityOverview).toHaveBeenCalled();
    });
    const requestOptions = serviceMocks.getInsightQualityOverview.mock.calls[0]?.[1];
    expect(requestOptions?.signal?.aborted).toBe(false);

    cleanup();

    expect(requestOptions?.signal?.aborted).toBe(true);
    qualityGate.resolve({
      overview: {
        inspectedSessions: 0,
        inspectionRate: 0,
        passRate: 0,
        ruleDistribution: [],
        totalSessions: 0,
      },
    });
    await expect(qualityGate.promise).resolves.toBeDefined();
  });

  it("updates follow-up status manually", async () => {
    renderRoute("/chat/insights/follow-ups");

    expect(
      await screen.findByRole("heading", { name: "待处理" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "由 AI 智能识别未解决的问题、或待跟进的事项，自动为你生成待办",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "集中处理风险、跟进和异常事项，状态只在洞察模块内生效",
      ),
    ).not.toBeInTheDocument();
    expect(serviceMocks.getInsightFollowUps).toHaveBeenCalledWith(
      {
        page: 1,
        pageSize: 10,
        status: "open",
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(
      screen.getByRole("table", { name: "待处理列表" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("columnheader").map((item) => item.textContent),
    ).toEqual(["客户", "概要", "优先级", "时间", "操作"]);
    expect(screen.getByRole("img", { name: "张三" })).toBeInTheDocument();
    expect(screen.getByText("确认快递状态")).toBeInTheDocument();
    expect(screen.queryByText("物流进度未确认")).not.toBeInTheDocument();
    expect(screen.queryByText("logistics_check")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "标记完成" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "忽略" }),
    ).not.toBeInTheDocument();

    const actionTrigger = screen.getByRole("button", { name: "处理" });
    expect(
      actionTrigger.querySelector('[data-icon-name="arrow-down-01"]'),
    ).toBeInTheDocument();
    await userEvent.click(actionTrigger);
    const actionMenu = await screen.findByRole("menu", { name: "处理待办" });
    expect(
      within(actionMenu).getByRole("menuitem", { name: "标记完成" }),
    ).toBeInTheDocument();
    expect(
      within(actionMenu).getByRole("menuitem", { name: "忽略" }),
    ).toBeInTheDocument();
    expect(
      within(actionMenu).queryByRole("menuitem", { name: "重新打开" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(actionMenu).getByRole("menuitem", { name: "标记完成" }),
    );

    await waitFor(() => {
      expect(serviceMocks.updateInsightActionStatus).toHaveBeenCalledWith(
        "801",
        "done",
      );
    });
  });

  it("shows a completed follow-up after switching to processed", async () => {
    renderRoute("/chat/insights/follow-ups");

    expect(
      await screen.findByRole("heading", { name: "待处理" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "处理" }));
    const actionMenu = await screen.findByRole("menu", { name: "处理待办" });
    await userEvent.click(
      within(actionMenu).getByRole("menuitem", { name: "标记完成" }),
    );

    await waitFor(() => {
      expect(serviceMocks.updateInsightActionStatus).toHaveBeenCalledWith(
        "801",
        "done",
      );
    });

    serviceMocks.getInsightFollowUps.mockResolvedValueOnce({
      items: [
        {
          actionItemId: "801",
          conversationId: "301",
          createdAt: 1_780_244_000_000,
          customerAvatarUrl: "https://example.com/customer-1.png",
          customerName: "张三",
          priority: "high",
          sessionId: "501",
          status: "done",
          title: "确认快递状态",
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });

    await userEvent.click(screen.getByRole("tab", { name: "已处理" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightFollowUps).toHaveBeenLastCalledWith(
        {
          page: 1,
          pageSize: 10,
          status: "processed",
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(await screen.findByText("确认快递状态")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
  });

  it("styles follow-up status badges by action state", async () => {
    serviceMocks.getInsightFollowUps.mockResolvedValueOnce({
      items: [
        {
          actionItemId: "801",
          conversationId: "301",
          createdAt: 1_780_244_000_000,
          customerAvatarUrl: "https://example.com/customer-1.png",
          customerName: "张三",
          priority: "high",
          sessionId: "501",
          status: "open",
          title: "待处理事项",
        },
        {
          actionItemId: "802",
          conversationId: "302",
          createdAt: 1_780_244_000_000,
          customerAvatarUrl: "https://example.com/customer-2.png",
          customerName: "李四",
          priority: "medium",
          sessionId: "502",
          status: "done",
          title: "已完成事项",
        },
        {
          actionItemId: "803",
          conversationId: "303",
          createdAt: 1_780_244_000_000,
          customerAvatarUrl: "https://example.com/customer-3.png",
          customerName: "王五",
          priority: "low",
          sessionId: "503",
          status: "dismissed",
          title: "已忽略事项",
        },
      ],
      page: 1,
      pageSize: 10,
      total: 3,
      totalPages: 1,
    });

    renderRoute("/chat/insights/follow-ups");

    const openRow = (await screen.findByText("待处理事项")).closest("tr");
    const doneRow = screen.getByText("已完成事项").closest("tr");
    const dismissedRow = screen.getByText("已忽略事项").closest("tr");
    expect(openRow).not.toBeNull();
    expect(doneRow).not.toBeNull();
    expect(dismissedRow).not.toBeNull();

    const openCells = within(openRow as HTMLElement).getAllByRole("cell");
    const openSummaryCell = openCells[1];
    expect(within(openSummaryCell).getByText("待处理")).toBeInTheDocument();
    expect(within(openSummaryCell).getByText("待处理事项")).toBeInTheDocument();
    expect(
      within(openSummaryCell)
        .getByText("待处理")
        .compareDocumentPosition(
          within(openSummaryCell).getByText("待处理事项"),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(openCells[3]).not.toHaveTextContent("暂无");
    const highPriority = within(openRow as HTMLElement).getByText("高");
    const mediumPriority = within(doneRow as HTMLElement).getByText("中");
    const lowPriority = within(dismissedRow as HTMLElement).getByText("低");
    expect(within(openRow as HTMLElement).getByText("待处理")).toHaveClass(
      "text-warning",
    );
    expect(within(openRow as HTMLElement).getByText("待处理")).not.toHaveClass(
      "line-through",
    );
    const doneStatus = within(doneRow as HTMLElement).getByText("已完成");
    const dismissedStatus = within(dismissedRow as HTMLElement).getByText(
      "已忽略",
    );
    expect(within(openRow as HTMLElement).getByText("待处理事项")).toHaveClass(
      "text-foreground",
    );
    expect(within(doneRow as HTMLElement).getByText("已完成事项")).toHaveClass(
      "text-foreground",
    );
    expect(
      within(dismissedRow as HTMLElement).getByText("已忽略事项"),
    ).toHaveClass("text-muted-foreground");
    expect(doneStatus).toHaveClass("text-success");
    expect(doneStatus).not.toHaveClass("line-through");
    expect(dismissedStatus).toHaveClass("text-muted-foreground");
    expect(dismissedStatus).not.toHaveClass("line-through");
    expect(highPriority).toHaveClass("text-destructive");
    expect(highPriority).toHaveClass("text-sm");
    expect(highPriority).not.toHaveClass("text-[11px]");
    expect(highPriority).not.toHaveClass("rounded-full");
    expect(highPriority).not.toHaveClass("bg-primary/12");
    expect(highPriority).not.toHaveClass("bg-destructive/12");
    expect(mediumPriority).toHaveClass("text-warning");
    expect(mediumPriority).toHaveClass("text-sm");
    expect(mediumPriority).not.toHaveClass("text-[11px]");
    expect(mediumPriority).not.toHaveClass("rounded-full");
    expect(mediumPriority).not.toHaveClass("bg-primary/12");
    expect(mediumPriority).not.toHaveClass("bg-amber-500/16");
    expect(lowPriority).toHaveClass("text-success");
    expect(lowPriority).toHaveClass("text-sm");
    expect(lowPriority).not.toHaveClass("text-[11px]");
    expect(lowPriority).not.toHaveClass("rounded-full");
    expect(lowPriority).not.toHaveClass("bg-primary/12");
    expect(lowPriority).not.toHaveClass("bg-emerald-500/12");
  });

  it("reopens processed follow-ups from the action menu", async () => {
    renderRoute("/chat/insights/follow-ups");

    expect(
      await screen.findByRole("heading", { name: "待处理" }),
    ).toBeInTheDocument();
    serviceMocks.getInsightFollowUps.mockResolvedValueOnce({
      items: [
        {
          actionItemId: "801",
          conversationId: "301",
          createdAt: 1_780_244_000_000,
          customerAvatarUrl: "https://example.com/customer-1.png",
          customerName: "张三",
          priority: "high",
          sessionId: "501",
          status: "done",
          title: "确认快递状态",
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    await userEvent.click(screen.getByRole("tab", { name: "已处理" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightFollowUps).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "processed" }),
        expect.any(Object),
      );
    });

    await userEvent.click(await screen.findByRole("button", { name: "处理" }));
    const actionMenu = await screen.findByRole("menu", { name: "处理待办" });
    expect(
      within(actionMenu).getByRole("menuitem", { name: "重新打开" }),
    ).toBeInTheDocument();
    expect(
      within(actionMenu).queryByRole("menuitem", { name: "标记完成" }),
    ).not.toBeInTheDocument();
    expect(
      within(actionMenu).queryByRole("menuitem", { name: "忽略" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(actionMenu).getByRole("menuitem", { name: "重新打开" }),
    );

    await waitFor(() => {
      expect(serviceMocks.updateInsightActionStatus).toHaveBeenCalledWith(
        "801",
        "open",
      );
    });
  });

  it("applies follow-up filters to pending insight queries", async () => {
    renderRoute("/chat/insights/follow-ups");

    expect(
      await screen.findByRole("heading", { name: "待处理" }),
    ).toBeInTheDocument();
    expect(serviceMocks.getInsightFollowUps).toHaveBeenCalledWith(
      {
        page: 1,
        pageSize: 10,
        status: "open",
      },
      expect.any(Object),
    );
    expect(
      screen.getByRole("button", { name: "日期范围 选择时间" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "优先级" }));
    expect(
      await screen.findByRole("option", { name: "全部优先级" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "选择优先级" }),
    ).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("option", { name: "高" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightFollowUps).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          priority: "high",
        }),
        expect.any(Object),
      );
    });

    await userEvent.click(screen.getByRole("combobox", { name: "优先级" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "全部优先级" }),
    );

    await waitFor(() => {
      expect(serviceMocks.getInsightFollowUps).toHaveBeenLastCalledWith(
        {
          page: 1,
          pageSize: 10,
          status: "open",
        },
        expect.any(Object),
      );
    });

    await userEvent.click(screen.getByRole("combobox", { name: "优先级" }));
    await userEvent.click(await screen.findByRole("option", { name: "高" }));

    expect(screen.getByRole("tab", { name: "待处理" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "已处理" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "全部" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "状态" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "已处理" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightFollowUps).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          priority: "high",
          status: "processed",
        }),
        expect.any(Object),
      );
    });

    await userEvent.click(
      screen.getByRole("button", { name: "日期范围 选择时间" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "昨天" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightFollowUps).toHaveBeenLastCalledWith(
        expect.objectContaining({
          from: "2026-06-02T00:00:00.000+08:00",
          page: 1,
          priority: "high",
          status: "processed",
          to: "2026-06-02T23:59:59.999+08:00",
        }),
        expect.any(Object),
      );
    });
  });

  it("aborts follow-up loading when the page unmounts", async () => {
    const followUpsGate =
      createDeferred<
        Awaited<ReturnType<typeof serviceMocks.getInsightFollowUps>>
      >();
    serviceMocks.getInsightFollowUps.mockReturnValueOnce(followUpsGate.promise);

    renderRoute("/chat/insights/follow-ups");

    await waitFor(() => {
      expect(serviceMocks.getInsightFollowUps).toHaveBeenCalled();
    });
    const requestOptions = serviceMocks.getInsightFollowUps.mock.calls[0]?.[1];
    expect(serviceMocks.getInsightFollowUps).toHaveBeenCalledWith(
      {
        page: 1,
        pageSize: 10,
        status: "open",
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(requestOptions?.signal?.aborted).toBe(false);

    cleanup();

    expect(requestOptions?.signal?.aborted).toBe(true);
    followUpsGate.resolve({ items: [], total: 0 });
    await expect(followUpsGate.promise).resolves.toBeDefined();
  });

  it("renders admin settings and P1 placeholders", async () => {
    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("个性化调整洞察策略、标签、质检规则和实体词库"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("洞察策略")[0]).toBeInTheDocument();
    expect(screen.getByText("会话切分规则")).toBeInTheDocument();
    expect(screen.queryByText("实时客服")).not.toBeInTheDocument();
    expect(screen.queryByText("私域运营")).not.toBeInTheDocument();
    expect(screen.queryByText("自定义")).not.toBeInTheDocument();
    expect(screen.getByText("未完结会话提前分析")).toBeInTheDocument();
    expect(
      screen.getByText("会话未结束时提前生成摘要、待办和业务归因"),
    ).toBeInTheDocument();
    expect(screen.getByText("未完结会话分析频率")).toBeInTheDocument();
    expect(
      screen.getByText(
        "控制未完结会话多久重新分析一次，会消耗更多 AI 分析次数",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "未完结会话分析频率" }),
    ).toHaveTextContent("标准（推荐）");
    expect(screen.getByText("准入规则")).toBeInTheDocument();
    expect(screen.getByText("有效会话门槛")).toBeInTheDocument();
    expect(
      screen.getByText(
        "会话中的消息数少于该数量时，AI 会跳过分析，避免得出无效结论",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("AI 置信度阈值")).toBeInTheDocument();
    expect(
      screen.getByText(
        "低于该阈值时，问题解决判断会标记为未知，且不会自动生成待办",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("低可信提示阈值")).not.toBeInTheDocument();
    expect(
      screen.queryByText("阈值越高，越多结果会提示人工复核"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    await userEvent.click(
      screen.getByRole("combobox", { name: "未完结会话分析频率" }),
    );
    const frequencyListbox = await screen.findByRole("listbox");
    expect(
      within(frequencyListbox).getByText("标准（推荐）"),
    ).toBeInTheDocument();
    expect(within(frequencyListbox).getByText("较快")).toBeInTheDocument();
    expect(within(frequencyListbox).getByText("高频")).toBeInTheDocument();
    expect(
      within(frequencyListbox).getByText("兼顾时效性和成本"),
    ).toBeInTheDocument();
    expect(
      within(frequencyListbox).getByText("追求更优的时效性，成本略有提升"),
    ).toBeInTheDocument();
    expect(
      within(frequencyListbox).getByText(
        "更早发现风险和待办，对成本不敏感时开启",
      ),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      screen.getByRole("combobox", { name: "单轮会话最长持续" }),
    );
    expect(
      await screen.findByRole("option", { name: "2 小时" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "24 小时" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "48 小时" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      screen.getByRole("combobox", { name: "会话结束后多久生成最终结果" }),
    );
    expect(
      await screen.findByRole("option", { name: "5 分钟" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "立即" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.clear(
      screen.getByRole("spinbutton", { name: "有效会话门槛" }),
    );
    await userEvent.type(
      screen.getByRole("spinbutton", { name: "有效会话门槛" }),
      "8",
    );
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(serviceMocks.updateInsightAnalysisPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          minAnalysisMessages: 8,
        }),
      );
    });

    await userEvent.click(
      screen.getByRole("switch", { name: "未完结会话提前分析" }),
    );
    expect(screen.queryByText("未完结会话分析频率")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();

    await userEvent.click(screen.getByRole("tab", { name: "意图配置" }));
    expect(screen.getByText("客户咨询物流或发货进度")).toBeInTheDocument();
    expect(screen.getByRole("table").parentElement).not.toHaveClass(
      "rounded-[8px]",
      "border",
    );
    await userEvent.click(screen.getByRole("button", { name: "新增意图" }));
    expect(
      await screen.findByRole("dialog", { name: "新增意图" }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("意图名称"), "价格咨询");
    await userEvent.type(screen.getByLabelText("意图编码"), "price_consult");
    await userEvent.click(screen.getByRole("combobox", { name: "权重" }));
    await userEvent.click(await screen.findByRole("option", { name: "3" }));
    await userEvent.type(screen.getByLabelText("别名"), "报价");
    await userEvent.type(
      screen.getByLabelText("判定标准"),
      "客户咨询商品价格或优惠",
    );
    await userEvent.type(screen.getByLabelText("正例"), "多少钱");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(serviceMocks.createInsightIntentConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          aliases: ["报价"],
          description: "客户咨询商品价格或优惠",
          intentCode: "price_consult",
          intentName: "价格咨询",
          positiveExamples: ["多少钱"],
          weight: 3,
        }),
      );
    });

    await userEvent.click(screen.getByRole("tab", { name: "质检规则" }));
    expect(screen.getByText("客户问题是否解决")).toBeInTheDocument();
    expect(screen.getByRole("table").parentElement).not.toHaveClass(
      "rounded-[8px]",
      "border",
    );

    await userEvent.click(screen.getByRole("tab", { name: "标签配置" }));
    expect(screen.getAllByText("标签配置")).toHaveLength(1);
    expect(screen.getByRole("table").parentElement).not.toHaveClass(
      "rounded-[8px]",
      "border",
    );
    await userEvent.click(screen.getByRole("button", { name: "新增标签" }));
    expect(
      await screen.findByRole("dialog", { name: "新增标签" }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("标签名称"), "高意向");
    await userEvent.type(screen.getByLabelText("标签编码"), "high_intent");
    await userEvent.type(
      screen.getByLabelText("判定标准"),
      "客户表达明确购买意向",
    );
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(serviceMocks.createInsightLabelConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "客户表达明确购买意向",
          labelCode: "high_intent",
          labelName: "高意向",
        }),
      );
    });

    await userEvent.click(screen.getByRole("tab", { name: "历史重刷" }));
    await waitFor(() => {
      expect(
        screen.getAllByText("标签 / 实体 / 意图").length,
      ).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText("部分完成")).toBeInTheDocument();
    expect(screen.getByText("20 / 20")).toBeInTheDocument();
    expect(screen.getByText("成功 18 / 失败 2")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "新建重刷任务" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "新建重刷任务" }));
    expect(
      screen.getByRole("dialog", { name: "新建重刷任务" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "重新识别标签、实体和意图，适合调整标签配置、实体词库或意图配置后使用。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "只重新评估服务质检结果，适合新增或调整质检规则后使用。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "重新生成该时间范围内的全部洞察结果，适合配置整体调整后使用，耗时最长。",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "创建任务" }));

    await waitFor(() => {
      expect(serviceMocks.createInsightRescanJob).toHaveBeenCalledWith(
        expect.objectContaining({
          analysisScope: "classification",
          from: expect.any(String),
        }),
      );
    });
    expect(serviceMocks.getInsightRescanTasks).toHaveBeenCalledTimes(2);

    cleanup();
    mockSession("admin");
    installInsightMocks();
    renderRoute("/chat/insights/business");

    expect(
      await screen.findByRole("heading", { level: 1, name: "经营洞察" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "从客户意图、业务标签、实体对象和链接文件四个维度查看经营主题，并追溯到对应会话",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /日期范围.*近7天.*2026-05-28.*2026-06-03/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("开始日期")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("结束日期")).not.toBeInTheDocument();
    expect(serviceMocks.getInsightBusinessTopics).toHaveBeenCalledWith(
      {
        dimension: "intent",
        from: "2026-05-28T00:00:00.000+08:00",
        to: "2026-06-03T23:59:59.999+08:00",
      },
      expect.any(Object),
    );
    await waitFor(() => {
      expect(
        serviceMocks.getInsightBusinessRelatedSessions,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          dimension: "intent",
          from: "2026-05-28T00:00:00.000+08:00",
          page: 1,
          pageSize: 20,
          topicCode: "31",
          to: "2026-06-03T23:59:59.999+08:00",
        }),
        expect.any(Object),
      );
    });
    expect(serviceMocks.getInsightOverview).not.toHaveBeenCalledWith({
      from: "2026-05-28T00:00:00.000+08:00",
      to: "2026-06-03T23:59:59.999+08:00",
    });
    expect(
      screen.getByRole("heading", { name: "客户意图 Top10" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "客户意图分布趋势" }),
    ).toBeInTheDocument();
    const businessOverviewPanel = screen.getByRole("region", {
      name: "客户意图 Top10",
    });
    const businessTrendPanel = screen.getByRole("region", {
      name: "客户意图分布趋势",
    });
    expect(
      businessOverviewPanel.compareDocumentPosition(businessTrendPanel),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      within(businessOverviewPanel).getByText("2026-05-28 至 2026-06-03"),
    ).toBeInTheDocument();
    expect(
      within(businessTrendPanel).getByText("2026-05-28 至 2026-06-03"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("recharts-bar-chart")).toHaveAttribute(
      "data-margin-left",
      "4",
    );
    const intentTrendTooltip = screen
      .getAllByTestId("recharts-tooltip")
      .find(
        (tooltip) =>
          tooltip.dataset.contentName === "IntentDistributionTrendTooltip",
      );
    expect(intentTrendTooltip).toHaveAttribute(
      "data-cursor-fill",
      "var(--muted-foreground)",
    );
    expect(intentTrendTooltip).toHaveAttribute(
      "data-cursor-fill-opacity",
      "0.1",
    );
    expect(screen.getByTestId("business-topic-list-scroll")).toHaveClass(
      "max-h-[260px]",
      "overflow-y-auto",
    );
    expect(
      screen.getByRole("heading", { name: "相关会话" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "客户意图 Top10" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("关注点会话")).not.toBeInTheDocument();
    expect(screen.queryByText("未解决会话")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "关注点趋势" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "关注点列表" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "业务洞察维度" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /客户意图/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /业务标签/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /实体对象/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /链接文件/ })).toBeInTheDocument();
    expect(screen.getAllByText("物流异常").length).toBeGreaterThan(0);
    expect(
      within(businessOverviewPanel).getByText("8 个会话提及"),
    ).toBeInTheDocument();
    expect(
      within(businessOverviewPanel).queryByText("8 次提及"),
    ).not.toBeInTheDocument();

    const relatedSessionsTable = screen.getByRole("table", {
      name: "相关会话",
    });
    expect(
      within(relatedSessionsTable).getByText("物流异常待跟进"),
    ).toBeInTheDocument();
    expect(
      within(relatedSessionsTable).getByRole("img", { name: "张三" }),
    ).toBeInTheDocument();
    expect(
      within(relatedSessionsTable).getByRole("img", { name: "客服一号" }),
    ).toBeInTheDocument();
    expect(
      within(relatedSessionsTable).queryByText("客户咨询退款到账时间"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "搜索相关会话" })).not.toBeInTheDocument();

    expect(
      screen.queryByRole("combobox", { name: "来源" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "排序" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("筛选")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /实体对象/ }));
    expect(
      screen.getByRole("heading", { name: "实体对象 Top10" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("白色羽绒服").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("tab", { name: /业务标签/ }));
    expect(
      screen.getByRole("heading", { name: "业务标签 Top10" }),
    ).toBeInTheDocument();
    expect(screen.getByText("8 个会话 10 次提及")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /链接文件/ }));
    await waitFor(() => {
      expect(serviceMocks.getInsightBusinessTopics).toHaveBeenCalledWith(
        expect.objectContaining({
          dimension: "asset",
          from: "2026-05-28T00:00:00.000+08:00",
          to: "2026-06-03T23:59:59.999+08:00",
        }),
        expect.any(Object),
      );
    });
    expect(
      screen.getByRole("heading", { name: "链接文件 Top10" }),
    ).toBeInTheDocument();
    const assetTop10List = screen.getByRole("list", { name: "链接文件 Top10" });
    expect(within(assetTop10List).getByText("红包活动")).toBeInTheDocument();
    expect(
      within(assetTop10List).getByText("H5链接 · 5 个会话 6 次提及"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(serviceMocks.getInsightBusinessRelatedSessions).toHaveBeenLastCalledWith(
        expect.not.objectContaining({
          keyword: expect.anything(),
        }),
        expect.any(Object),
      );
    });

    expect(screen.queryByText("链接文件按消息发生时间统计，单次最多选择 7 天")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /日期范围/ })).toHaveLength(1);

    expect(
      screen.getByRole("button", {
        name: /日期范围.*近7天.*2026-05-28.*2026-06-03/,
      }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /日期范围.*近7天.*2026-05-28.*2026-06-03/ }));
    await userEvent.click(await screen.findByRole("button", { name: "昨天" }));
    await waitFor(() => {
      expect(serviceMocks.getInsightBusinessTopics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dimension: "asset",
          from: "2026-06-02T00:00:00.000+08:00",
          to: "2026-06-02T23:59:59.999+08:00",
        }),
        expect.any(Object),
      );
    });

    await userEvent.click(screen.getByRole("button", { name: /日期范围.*昨天.*2026-06-02.*2026-06-02/ }));
    await userEvent.click(await screen.findByRole("button", { name: "重置" }));
    await userEvent.click(screen.getByRole("button", { name: "应用" }));
    await waitFor(() => {
      expect(serviceMocks.getInsightBusinessTopics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dimension: "asset",
          from: "2026-05-28T00:00:00.000+08:00",
          to: "2026-06-03T23:59:59.999+08:00",
        }),
        expect.any(Object),
      );
    });

    expect(
      within(relatedSessionsTable).getByText("物流异常待跟进"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(relatedSessionsTable).getByRole("button", { name: "详情" }),
    );

    expect(await screen.findByText("洞察详情")).toBeInTheDocument();
    expect(screen.getAllByText("未确认物流进展").length).toBeGreaterThan(0);
    expect(screen.getByText("客户问题是否解决")).toBeInTheDocument();
    expect(screen.getByText("未通过")).toBeInTheDocument();
    expect(
      screen.queryByText("未通过：problem_resolution"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("后续版本接入")).not.toBeInTheDocument();
  });

  it("loads business topics per selected tab instead of preloading every dimension", async () => {
    serviceMocks.getInsightBusinessTopics
      .mockResolvedValueOnce({
        dimension: "intent",
        intentTrend: [],
        topics: [
          {
            code: "31",
            dimension: "intent",
            mentionCount: 8,
            name: "物流异常",
            sessionCount: 8,
            share: 1,
          },
        ],
        totals: {
          mentionCount: 8,
          topicSessions: 8,
        },
        trend: [],
      })
      .mockResolvedValueOnce({
        dimension: "tag",
        intentTrend: [],
        topics: [
          {
            code: "11",
            dimension: "tag",
            mentionCount: 10,
            name: "退款咨询",
            sessionCount: 6,
            share: 1,
          },
        ],
        totals: {
          mentionCount: 10,
          topicSessions: 6,
        },
        trend: [
          {
            assetMentions: 0,
            date: "2026-06-01",
            entityMentions: 0,
            intentMentions: 0,
            tagMentions: 10,
            topicSessions: 6,
          },
        ],
      });

    renderRoute("/chat/insights/business");

    await waitFor(() => {
      expect(serviceMocks.getInsightBusinessTopics).toHaveBeenCalledWith(
        expect.objectContaining({ dimension: "intent" }),
        expect.any(Object),
      );
    });
    expect(serviceMocks.getInsightBusinessTopics).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("tab", { name: /业务标签/ }));

    await waitFor(() => {
      expect(serviceMocks.getInsightBusinessTopics).toHaveBeenCalledWith(
        expect.objectContaining({
          dimension: "tag",
          from: "2026-05-28T00:00:00.000+08:00",
          to: "2026-06-03T23:59:59.999+08:00",
        }),
        expect.any(Object),
      );
    });
    expect(serviceMocks.getInsightBusinessTopics).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "业务标签 Top10" })).toBeInTheDocument();
    expect(screen.getAllByText("退款咨询").length).toBeGreaterThan(0);
  });

  it("refreshes summary after toggling entity status", async () => {
    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    expect(serviceMocks.getInsightSettingsSummary).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("tab", { name: "实体词库" }));
    const entityRow = await screen.findByRole("row", { name: /白色羽绒服/ });
    await userEvent.click(within(entityRow).getByRole("switch"));

    await waitFor(() => {
      expect(
        serviceMocks.updateInsightEntityDictionaryItemStatus,
      ).toHaveBeenCalledWith("41", { status: 0 });
      expect(serviceMocks.getInsightSettingsSummary).toHaveBeenCalledTimes(2);
    });
  });

  it("shows enabled count with backend limits in the summary cards", async () => {
    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "洞察配置概览" });
    const cards = within(summary).getAllByRole("article");

    expect(cards.map((card) => card.textContent)).toEqual([
      "总开关未开启",
      "智能创建待办已开启",
      "智能意图识别已开启（2 / 20）",
      "智能质检已开启（1 / 10）",
      "智能标签已开启（3 / 20）",
      "智能实体识别已开启（2 / 20）",
    ]);
    expect(within(cards[0]).getByText("未开启")).toHaveClass(
      "text-muted-foreground",
    );
    expect(within(cards[1]).getByText("已开启")).toHaveClass("text-success");
  });

  it("keeps settings tabs on the existing configuration sections", async () => {
    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "洞察策略",
      "意图配置",
      "标签配置",
      "质检规则",
      "实体词库",
      "历史重刷",
    ]);
    expect(
      screen.queryByRole("tab", { name: "智能创建待办" }),
    ).not.toBeInTheDocument();
  });

  it("shows a blocking dialog instead of toast when enabling over the limit fails", async () => {
    serviceMocks.updateInsightEntityDictionaryItemStatus.mockRejectedValueOnce({
      code: "INSIGHT_CONFIG_ENABLED_LIMIT_REACHED",
      details: {
        configType: "entityDictionary",
        currentEnabled: 20,
        limit: 20,
      },
      message: "当前已启用 20 条（上限 20 条），请先停用其他配置",
    });

    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "实体词库" }));

    const disabledRow = await screen.findByRole("row", { name: /隐藏实体/ });
    await userEvent.click(within(disabledRow).getByRole("switch"));

    expect(
      await screen.findByRole("alertdialog", { name: "启用数量已达上限" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("当前已启用 20 条（上限 20 条），请先停用其他配置"),
    ).toBeInTheDocument();
  });

  it("shows a blocking dialog when creating over the total config limit fails", async () => {
    serviceMocks.createInsightLabelConfig.mockRejectedValueOnce({
      code: "INSIGHT_CONFIG_TOTAL_LIMIT_REACHED",
      details: {
        configType: "labelConfigs",
        currentTotal: 50,
        limit: 50,
      },
      message: "当前已有 50 条配置（上限 50 条），请先删除无用配置后再新建",
    });

    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "标签配置" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "新增标签" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "新增标签" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "标签名称" }),
      "挽留机会",
    );
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "标签编码" }),
      "retention",
    );
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "判定标准" }),
      "客户有流失风险",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(
      await screen.findByRole("alertdialog", { name: "配置数量已达上限" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "当前已有 50 条配置（上限 50 条），请先删除无用配置后再新建",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { hidden: true })).toBeInTheDocument();
    expect(screen.getByDisplayValue("挽留机会")).toBeInTheDocument();
  });

  it("inserts a newly created config at the top when the list is sorted newest first", async () => {
    serviceMocks.createInsightLabelConfig.mockResolvedValueOnce({
      description: "新建标签的说明",
      id: "99",
      includeInStatistics: true,
      labelCode: "new_label",
      labelName: "新增标签",
      negativeExamples: [],
      positiveExamples: [],
      status: 1,
    });

    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "标签配置" }));
    await userEvent.click(screen.getByRole("button", { name: "新增标签" }));

    expect(
      await screen.findByRole("dialog", { name: "新增标签" }),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: "标签名称" }),
      "新增标签",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "标签编码" }),
      "new_label",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "判定标准" }),
      "新建标签的说明",
    );
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    const labelRows = await screen.findAllByRole("row");
    const createdRow = labelRows.find((row) =>
      row.textContent?.includes("新增标签"),
    );
    const existingRow = labelRows.find((row) =>
      row.textContent?.includes("退款咨询"),
    );

    expect(createdRow).toBeDefined();
    expect(existingRow).toBeDefined();
    expect(labelRows.indexOf(createdRow!)).toBeLessThan(
      labelRows.indexOf(existingRow!),
    );
  });

  it("requires delete confirmation before removing a label config", async () => {
    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "标签配置" }));

    const labelRow = await screen.findByRole("row", { name: /退款咨询/ });
    await userEvent.click(
      within(labelRow).getByRole("button", { name: "删除" }),
    );

    expect(serviceMocks.deleteInsightLabelConfig).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("alertdialog", { name: "确认删除标签" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(serviceMocks.deleteInsightLabelConfig).not.toHaveBeenCalled();

    await userEvent.click(
      within(labelRow).getByRole("button", { name: "删除" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "确认删除" }),
    );

    await waitFor(() => {
      expect(serviceMocks.deleteInsightLabelConfig).toHaveBeenCalledWith("11");
    });
  });

  it("aborts business insight requests when the page unmounts", async () => {
    const businessGate =
      createDeferred<
        Awaited<ReturnType<typeof serviceMocks.getInsightBusinessTopics>>
      >();
    const relatedSessionsGate =
      createDeferred<
        Awaited<
          ReturnType<typeof serviceMocks.getInsightBusinessRelatedSessions>
        >
      >();
    serviceMocks.getInsightBusinessTopics.mockReturnValueOnce(businessGate.promise);
    serviceMocks.getInsightBusinessRelatedSessions.mockReturnValueOnce(
      relatedSessionsGate.promise,
    );

    renderRoute("/chat/insights/business");

    await waitFor(() => {
      expect(serviceMocks.getInsightBusinessTopics).toHaveBeenCalled();
    });
    const businessOptions = serviceMocks.getInsightBusinessTopics.mock.calls[0]?.[1];
    expect(serviceMocks.getInsightBusinessTopics).toHaveBeenCalledWith(
      {
        dimension: "intent",
        from: "2026-05-28T00:00:00.000+08:00",
        to: "2026-06-03T23:59:59.999+08:00",
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(businessOptions?.signal?.aborted).toBe(false);
    businessGate.resolve({
      dimension: "intent",
      intentTrend: [],
      topics: [
        {
          code: "31",
          dimension: "intent",
          mentionCount: 8,
          name: "物流异常",
          sessionCount: 8,
          share: 0.4,
        },
      ],
      totals: {
        mentionCount: 8,
        topicSessions: 8,
      },
      trend: [],
    });

    await waitFor(() => {
      expect(serviceMocks.getInsightBusinessRelatedSessions).toHaveBeenCalled();
    });
    const relatedSessionsOptions =
      serviceMocks.getInsightBusinessRelatedSessions.mock.calls[0]?.[1];
    expect(serviceMocks.getInsightBusinessRelatedSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        dimension: "intent",
        page: 1,
        pageSize: 20,
        topicCode: "31",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(relatedSessionsOptions?.signal?.aborted).toBe(false);

    cleanup();

    expect(businessOptions?.signal?.aborted).toBe(true);
    expect(relatedSessionsOptions?.signal?.aborted).toBe(true);
    relatedSessionsGate.resolve({
      dimension: "intent",
      items: [],
      page: 1,
      pageSize: 20,
      topicCode: "31",
      total: 0,
      totalPages: 0,
    });
    await expect(businessGate.promise).resolves.toBeDefined();
    await expect(relatedSessionsGate.promise).resolves.toBeDefined();
  });

  it("does not mount overview distribution with placeholder chart data before overview loads", async () => {
    serviceMocks.getInsightOverview.mockImplementation(
      () => new Promise(() => undefined),
    );

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    const distributionPanel = screen
      .getByRole("heading", { name: "AI 诊断" })
      .closest("section");

    expect(distributionPanel).not.toBeNull();
    expect(
      within(distributionPanel as HTMLElement).getByText("暂无数据"),
    ).toBeInTheDocument();
    expect(
      within(distributionPanel as HTMLElement).queryByText("暂无分布数据"),
    ).not.toBeInTheDocument();
    expect(
      within(distributionPanel as HTMLElement).queryByText("咨询会话"),
    ).not.toBeInTheDocument();
  });

  it("shows an empty overview distribution when returned resolution counts are all zero", async () => {
    serviceMocks.getInsightOverview.mockResolvedValue({
      ...serviceMocks.getInsightOverview.getMockImplementation()?.(),
      actionItemsOpen: 0,
      analysis: { failed: 0, partial: 0, ready: 0, stale: 0 },
      highRiskSessions: 0,
      problemSessions: 0,
      readySessions: 0,
      resolution: {
        noCustomerProblem: 0,
        partiallyResolved: 0,
        resolved: 0,
        unknown: 0,
        unresolved: 0,
      },
      totalSessions: 0,
      totals: {
        agentMessages: 0,
        consultingCustomers: 0,
        customerMessages: 0,
        logicalSessions: 0,
        messages: 0,
      },
      trend: [],
      unresolvedSessions: 0,
    });

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    const distributionPanel = screen
      .getByRole("heading", { name: "AI 诊断" })
      .closest("section");

    expect(distributionPanel).not.toBeNull();
    expect(
      within(distributionPanel as HTMLElement).getByText("暂无数据"),
    ).toBeInTheDocument();
    expect(
      within(distributionPanel as HTMLElement).queryByText("暂无分布数据"),
    ).not.toBeInTheDocument();
    expect(
      within(distributionPanel as HTMLElement).queryByText("咨询会话"),
    ).not.toBeInTheDocument();
  });

  it("validates required intent configuration dialog fields before submit", async () => {
    const intentDialog = await openSettingsDialog(
      "意图配置",
      "新增意图",
      "新增意图",
    );
    expect(intentDialog).toBeInTheDocument();
    await userEvent.click(
      within(intentDialog).getByRole("button", { name: "保存" }),
    );
    expect(await screen.findAllByText("请填写必填项")).toHaveLength(3);
    expect(serviceMocks.createInsightIntentConfig).not.toHaveBeenCalled();
  });

  it("validates required label configuration dialog fields before submit", async () => {
    const labelDialog = await openSettingsDialog(
      "标签配置",
      "新增标签",
      "新增标签",
    );
    expect(labelDialog).toBeInTheDocument();
    await userEvent.click(
      within(labelDialog).getByRole("button", { name: "保存" }),
    );
    expect(await screen.findAllByText("请填写必填项")).toHaveLength(3);
    expect(serviceMocks.createInsightLabelConfig).not.toHaveBeenCalled();
  });

  it("validates required qa rule dialog fields before submit", async () => {
    const qaDialog = await openSettingsDialog(
      "质检规则",
      "新增规则",
      "新增质检规则",
    );
    expect(qaDialog).toBeInTheDocument();
    await userEvent.click(
      within(qaDialog).getByRole("button", { name: "保存" }),
    );
    expect(await screen.findAllByText("请填写必填项")).toHaveLength(3);
    expect(serviceMocks.createInsightQaRuleConfig).not.toHaveBeenCalled();
  });

  it("validates required entity dictionary dialog fields before submit", async () => {
    const entityDialog = await openSettingsDialog(
      "实体词库",
      "新增实体",
      "新增实体",
    );
    expect(entityDialog).toBeInTheDocument();
    await userEvent.click(
      within(entityDialog).getByRole("button", { name: "保存" }),
    );
    expect(await screen.findAllByText("请填写必填项")).toHaveLength(2);
    expect(
      serviceMocks.createInsightEntityDictionaryItem,
    ).not.toHaveBeenCalled();
  });

  it("lets admins enable insights and update feature switches from settings", async () => {
    serviceMocks.updateInsightFeatureConfig.mockResolvedValue({
      entityEnabled: true,
      insightAvailable: true,
      insightEnabled: true,
      intentEnabled: true,
      labelEnabled: true,
      lastEnableTime: 1_780_300_000_000,
      qaEnabled: true,
      todoEnabled: true,
    });

    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("button", { name: "运行配置" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("未运行")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "智能意图识别" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "运行配置" }));
    const runDialog = await screen.findByRole("dialog", {
      name: "洞察运行配置",
    });

    expect(
      within(runDialog)
        .getAllByRole("switch")
        .map((item) => item.getAttribute("aria-label")),
    ).toEqual([
      "启用会话洞察",
      "智能创建待办",
      "智能意图识别",
      "智能质检",
      "智能标签",
      "智能实体识别",
    ]);
    await userEvent.click(screen.getByRole("switch", { name: "启用会话洞察" }));
    serviceMocks.getInsightSettingsSummary.mockResolvedValueOnce({
      enabledIntentCount: mockInsightSettings.intentConfigs.filter(
        (item) => item.status === 1,
      ).length,
      intentLimit: 20,
      intentSoftLimit: 15,
      enabledLabelCount: mockInsightSettings.labelConfigs.filter(
        (item) => item.status === 1,
      ).length,
      labelLimit: 20,
      labelSoftLimit: 15,
      enabledQaCount: mockInsightSettings.qaRuleConfigs.filter(
        (item) => item.status === 1,
      ).length,
      qaLimit: 10,
      qaSoftLimit: 8,
      enabledEntityCount: mockInsightSettings.entityDictionary.filter(
        (item) => item.status === 1,
      ).length,
      entityLimit: 20,
      entitySoftLimit: 15,
      entityEnabled: true,
      insightAvailable: true,
      insightEnabled: true,
      intentEnabled: true,
      labelEnabled: true,
      qaEnabled: true,
      todoEnabled: true,
    });
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(serviceMocks.updateInsightFeatureConfig).toHaveBeenCalledWith({
        entityEnabled: true,
        insightEnabled: true,
        intentEnabled: true,
        labelEnabled: true,
        qaEnabled: true,
        todoEnabled: true,
      });
    });
    expect(screen.queryByText("运行中")).not.toBeInTheDocument();

    serviceMocks.updateInsightFeatureConfig.mockResolvedValueOnce({
      entityEnabled: true,
      insightAvailable: true,
      insightEnabled: true,
      intentEnabled: false,
      labelEnabled: true,
      lastEnableTime: 1_780_300_000_000,
      qaEnabled: true,
      todoEnabled: true,
    });
    await userEvent.click(screen.getByRole("button", { name: "运行配置" }));
    await userEvent.click(screen.getByRole("switch", { name: "智能意图识别" }));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(serviceMocks.updateInsightFeatureConfig).toHaveBeenLastCalledWith({
        entityEnabled: true,
        insightEnabled: true,
        intentEnabled: false,
        labelEnabled: true,
        qaEnabled: true,
        todoEnabled: true,
      });
    });
  });

  it("disables the global insight switch when insights are not available", async () => {
    serviceMocks.getInsightSettingsSummary.mockResolvedValue({
      enabledIntentCount: mockInsightSettings.intentConfigs.filter(
        (item) => item.status === 1,
      ).length,
      intentLimit: 20,
      intentSoftLimit: 15,
      enabledLabelCount: mockInsightSettings.labelConfigs.filter(
        (item) => item.status === 1,
      ).length,
      labelLimit: 20,
      labelSoftLimit: 15,
      enabledQaCount: mockInsightSettings.qaRuleConfigs.filter(
        (item) => item.status === 1,
      ).length,
      qaLimit: 10,
      qaSoftLimit: 8,
      enabledEntityCount: mockInsightSettings.entityDictionary.filter(
        (item) => item.status === 1,
      ).length,
      entityLimit: 20,
      entitySoftLimit: 15,
      entityEnabled: mockInsightSettings.featureConfig.entityEnabled,
      insightAvailable: false,
      insightEnabled: mockInsightSettings.featureConfig.insightEnabled,
      intentEnabled: mockInsightSettings.featureConfig.intentEnabled,
      labelEnabled: mockInsightSettings.featureConfig.labelEnabled,
      qaEnabled: mockInsightSettings.featureConfig.qaEnabled,
      todoEnabled: mockInsightSettings.featureConfig.todoEnabled,
    });
    serviceMocks.getInsightFeatureConfig.mockResolvedValue({
      ...mockInsightSettings.featureConfig,
      insightAvailable: false,
    });

    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("button", { name: "运行配置" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("未运行")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "运行配置" }));
    expect(
      await screen.findByRole("dialog", { name: "洞察运行配置" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "启用会话洞察" })).toBeDisabled();
    expect(screen.getByText("当前账号暂未开通会话洞察")).toBeInTheDocument();
  });

  it("shows loading states while paginated insight sessions are loading", async () => {
    serviceMocks.getInsightOverviewSessions.mockImplementation(
      () => new Promise(() => undefined),
    );
    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    const overviewTable = screen.getByRole("table", { name: "咨询会话明细" });
    expect(
      within(overviewTable).getByRole("status", { name: "正在加载会话" }),
    ).toBeInTheDocument();

    cleanup();
    mockSession("admin");
    installInsightMocks();
    serviceMocks.getInsightBusinessRelatedSessions.mockImplementation(
      () => new Promise(() => undefined),
    );
    renderRoute("/chat/insights/business");

    expect(
      await screen.findByRole("heading", { level: 1, name: "经营洞察" }),
    ).toBeInTheDocument();
    const relatedSessionsTable = screen.getByRole("table", {
      name: "相关会话",
    });
    expect(
      within(relatedSessionsTable).getByRole("status", {
        name: "正在加载会话",
      }),
    ).toBeInTheDocument();

    cleanup();
    mockSession("admin");
    installInsightMocks();
    serviceMocks.getInsightQualityResults.mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    renderRoute("/chat/insights/quality");

    expect(
      await screen.findByRole("heading", { name: "服务质检" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "质检结果" }));
    expect(
      screen.getByRole("status", { name: "正在加载会话" }),
    ).toBeInTheDocument();

    cleanup();
    mockSession("admin");
    installInsightMocks();
    serviceMocks.getInsightFollowUps.mockImplementation(
      () => new Promise(() => undefined),
    );
    renderRoute("/chat/insights/follow-ups");

    expect(
      await screen.findByRole("heading", { name: "待处理" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "正在加载会话" }),
    ).toBeInTheDocument();
  });

  it("shows a loading row when switching quality result views", async () => {
    serviceMocks.getInsightQualityResults.mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    renderRoute("/chat/insights/quality");

    expect(
      await screen.findByRole("heading", { name: "服务质检" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "质检结果" }));

    expect(
      await screen.findByRole("status", { name: "正在加载会话" }),
    ).toBeInTheDocument();
  });

  it("shows a centered empty state for overview sessions", async () => {
    serviceMocks.getInsightOverviewSessions.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    const overviewTable = screen.getByRole("table", { name: "咨询会话明细" });
    const emptyCell = within(overviewTable).getByText("暂无数据");

    expect(emptyCell).toBeInTheDocument();
    expect(emptyCell).toHaveClass("text-center");
    expect(
      within(overviewTable).queryByText("当前时间范围内暂无咨询会话"),
    ).not.toBeInTheDocument();
  });

  it("hides settings content for non-admin users", async () => {
    mockSession("operator");
    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByText("仅管理员可查看洞察配置"),
    ).toBeInTheDocument();
  });
});
