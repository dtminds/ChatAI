import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import {
  resetWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { routerConfig } from "@/router";
import { useAuthStore } from "@/store/auth-store";
import { useWorkbenchStore } from "@/store/workbench-store";

const serviceMocks = vi.hoisted(() => ({
  activatePresetInsightEntityDictionaryItem: vi.fn(),
  activatePresetInsightIntentConfig: vi.fn(),
  activatePresetInsightLabelConfig: vi.fn(),
  activatePresetInsightQaRuleConfig: vi.fn(),
  createInsightRescanJob: vi.fn(),
  getInsightBusinessRelatedSessions: vi.fn(),
  getInsightBusinessTopics: vi.fn(),
  getInsightCapabilities: vi.fn(),
  getInsightDetail: vi.fn(),
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
  getInsightsWorkerSummary: vi.fn(),
  getInsightsWorkerUidDetail: vi.fn(),
  getInsightsWorkerUids: vi.fn(),
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
}));

const ticketServiceMocks = vi.hoisted(() => ({
  updateTicket: vi.fn(),
}));
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
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
    },
    {
      aliases: ["雨伞"],
      entityCode: "black-umbrella",
      entityName: "黑色雨伞",
      status: 1,
      id: "42",
    },
    {
      aliases: [],
      entityCode: "hidden",
      entityName: "隐藏实体",
      status: 0,
      id: "43",
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
      description: "客户咨询物流或发货进度",
      status: 1,
      id: "31",
      intentCode: "logistics",
      intentName: "查物流",
      negativeExamples: [],
      positiveExamples: ["快递什么时候到"],
      weight: 8,
    },
    {
      description: "客户咨询AI客服系统相关信息",
      status: 1,
      id: "32",
      intentCode: "ai_customer_service_info",
      intentName: "咨询AI客服系统相关信息",
      negativeExamples: [],
      positiveExamples: ["AI客服支持什么功能"],
      weight: 6,
    },
    {
      status: 0,
      id: "33",
      intentCode: "hidden_intent",
      intentName: "隐藏意图",
      weight: 3,
    },
  ],
  labelConfigs: [
    {
      status: 1,
      id: "11",
      labelCode: "refund",
      labelName: "退款咨询",
    },
    {
      status: 1,
      id: "12",
      labelCode: "price_sensitive",
      labelName: "价格敏感",
    },
    {
      status: 1,
      id: "13",
      labelCode: "high_intent",
      labelName: "高意向",
    },
    {
      status: 0,
      id: "14",
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
vi.mock("@/pages/chat/tickets/api/tickets-service", () => ticketServiceMocks);
vi.mock("sonner", () => ({ Toaster: () => null, toast }));

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
        canEdit: true,
        status: "open",
        ticketId: "801",
        title: "跟进物流是否已更新",
      },
      {
        canEdit: true,
        status: "done",
        ticketId: "802",
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

function createMockInsightSettingsSummary(insightEnabled = false) {
  return {
    enabledIntentCount: mockInsightSettings.intentConfigs.filter(
      (item) => item.status === 1,
    ).length,
    intentLimit: 15,
    intentSoftLimit: 12,
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
    insightEnabled,
    intentEnabled: mockInsightSettings.featureConfig.intentEnabled,
    labelEnabled: mockInsightSettings.featureConfig.labelEnabled,
    qaEnabled: mockInsightSettings.featureConfig.qaEnabled,
    todoEnabled: mockInsightSettings.featureConfig.todoEnabled,
  };
}

function installInsightMocks() {
  serviceMocks.getInsightCapabilities.mockResolvedValue({
    canManageInsights: true,
    canViewWorkerObservability: false,
    insightAvailable: true,
    mode: "insight",
  });
  serviceMocks.getInsightOverview.mockResolvedValue({
    actionItemsOpen: 3,
    analysis: { failed: 1, partial: 2, ready: 18, stale: 1 },
    comparisonAvailable: true,
    mode: "insight",
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
        agentMessageCount: 4,
        agentAvatarUrl: "https://example.com/agent-1.png",
        agentName: "客服一号",
        analysisStatus: "ready",
        conversationId: "301",
        customerMessageCount: 6,
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerName: "张三",
        lastMessageAt: 1_780_244_950_000,
        messageCount: 10,
        problemSummary: "客户反馈物流异常",
        resolutionStatus: "unresolved",
        sessionId: "501",
        sessionState: "ended",
        startedAt: 1_780_243_200_000,
        summarySessionTitle: "物流异常待跟进",
      },
      {
        agentMessageCount: 3,
        agentAvatarUrl: "https://example.com/agent-2.png",
        agentName: "客服二号",
        analysisStatus: "partial",
        conversationId: "302",
        customerMessageCount: 4,
        customerAvatarUrl: "https://example.com/customer-2.png",
        customerName: "李四",
        lastMessageAt: 1_780_244_500_000,
        messageCount: 7,
        problemSummary: "客户咨询退款到账时间",
        resolutionStatus: "resolved",
        sessionId: "502",
        sessionState: "ended",
        startedAt: 1_780_244_000_000,
        summarySessionTitle: "退款到账咨询",
      },
      {
        agentMessageCount: 1,
        agentAvatarUrl: "https://example.com/agent-3.png",
        agentName: "客服三号",
        analysisStatus: "ready",
        conversationId: "303",
        customerMessageCount: 1,
        customerAvatarUrl: "https://example.com/customer-3.png",
        customerName: "赵六",
        lastMessageAt: 1_780_243_500_000,
        messageCount: 2,
        problemSummary: "",
        resolutionStatus: "unknown",
        sessionId: "503",
        sessionState: "ended",
        startedAt: 1_780_243_400_000,
        summarySessionTitle: "",
      },
      {
        agentMessageCount: 2,
        agentAvatarUrl: "https://example.com/agent-4.png",
        agentName: "客服四号",
        analysisStatus: "analyzing",
        conversationId: "304",
        customerMessageCount: 3,
        customerAvatarUrl: "https://example.com/customer-4.png",
        customerName: "孙七",
        lastMessageAt: 1_780_245_500_000,
        messageCount: 5,
        problemSummary: "",
        resolutionStatus: "unknown",
        sessionId: "504",
        sessionState: "open",
        startedAt: 1_780_245_000_000,
        summarySessionTitle: "",
      },
    ],
    mode: "insight",
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
        agentMessageCount: 4,
        agentAvatarUrl: "https://example.com/agent-1.png",
        agentName: "客服一号",
        analysisStatus: "ready",
        conversationId: "301",
        customerMessageCount: 6,
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerName: "张三",
        lastMessageAt: 1_780_244_950_000,
        messageCount: 10,
        problemSummary: "客户反馈物流异常",
        resolutionStatus: "unresolved",
        sessionId: "501",
        sessionState: "ended",
        startedAt: 1_780_243_200_000,
        summarySessionTitle: "物流异常待跟进",
      },
    ],
    mode: "insight",
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
      .filter((item) => item.status === 1)
      .map((item) => ({
        code: item.entityCode,
        id: item.id,
        name: item.entityName,
      })),
    intents: mockInsightSettings.intentConfigs
      .filter((item) => item.status === 1)
      .map((item) => ({
        code: item.intentCode,
        id: item.id,
        name: item.intentName,
      })),
    tags: mockInsightSettings.labelConfigs
      .filter((item) => item.status === 1)
      .map((item) => ({
        code: item.labelCode,
        id: item.id,
        name: item.labelName,
      })),
  });
  serviceMocks.getInsightSettings.mockResolvedValue(mockInsightSettings);
  serviceMocks.getInsightSettingsSummary.mockResolvedValue(
    createMockInsightSettingsSummary(mockInsightSettings.featureConfig.insightEnabled),
  );
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
  ticketServiceMocks.updateTicket.mockResolvedValue({ ticket: {} });
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
  serviceMocks.getInsightsWorkerSummary.mockResolvedValue({
    analysisJobs: {
      expiredLease: 0,
      failedLast24h: 1,
      pending: 2,
      retrying: 0,
      running: 1,
    },
    discovery: {
      auditIdGap: 12,
      cursorAuditId: 9000,
      hasBacklog: true,
      sourceHeadAuditId: 9012,
    },
    observedAt: 1_780_300_000_000,
    observedUids: {
      blocked: 0,
      error: 1,
      idle: 1,
      processing: 0,
      queued: 1,
      retrying: 0,
      total: 3,
    },
    pipelines: [
      {
        activity: "idle",
        health: "healthy",
        lastSuccessAt: 1_780_299_990_000,
        pipeline: "discovery",
        reportedAt: 1_780_300_000_000,
        reportedBy: "worker-a:1",
      },
      {
        activity: "possibly_stalled",
        health: "degraded",
        lastStartedAt: 1_780_299_040_000,
        pipeline: "sessionization",
        reportedAt: 1_780_300_000_000,
        reportedBy: "worker-a:1",
        runningDurationMs: 960_000,
      },
      {
        activity: "idle",
        health: "degraded",
        lastErrorCode: "LLM_TIMEOUT",
        lastFailureAt: 1_780_299_980_000,
        pipeline: "analysis",
        reportedAt: 1_780_300_000_000,
        reportedBy: "worker-a:1",
      },
    ],
    sessionizationJobs: {
      expiredLease: 0,
      pending: 1,
      retrying: 0,
      running: 1,
    },
    sessions: {
      open: 4,
      overdue: 1,
    },
  });
  serviceMocks.getInsightsWorkerUids.mockResolvedValue({
    items: [
      {
        analysis: {
          failedLast24h: 0,
          pending: 1,
          processing: 0,
          queueAgeMs: 60_000,
          retrying: 0,
          state: "queued",
        },
        cursor: {
          cursorAuditId: 8990,
          cursorMsgtime: 1_780_299_900_000,
          updateTime: 1_780_299_990_000,
        },
        overallState: "queued",
        sessionization: {
          attempt: 0,
          jobId: "3001",
          maxAttempts: 2,
          queueAgeMs: 60_000,
          runAfter: 1_780_299_940_000,
          state: "queued",
        },
        sessions: {
          open: 1,
          overdue: 0,
        },
        uid: 2002,
      },
    ],
    observedAt: 1_780_300_000_000,
    page: 1,
    pageSize: 50,
    total: 1,
    totalPages: 1,
  });
  serviceMocks.getInsightsWorkerUidDetail.mockResolvedValue({
    analysis: {
      failedLast24h: 0,
      pending: 1,
      processing: 0,
      queueAgeMs: 60_000,
      retrying: 0,
      state: "queued",
    },
    cursor: {
      cursorAuditId: 8990,
      cursorMsgtime: 1_780_299_900_000,
      updateTime: 1_780_299_990_000,
    },
    hasPendingMessages: true,
    observedAt: 1_780_300_000_000,
    overallState: "queued",
    recentAnalysisRuns: [],
    recentErrors: [],
    recentRescans: [],
    recentSessions: [
      {
        nextCloseAt: 1_780_300_060_000,
        sessionId: "5001",
        startedAt: 1_780_299_800_000,
        status: "open",
      },
    ],
    sessionization: {
      attempt: 0,
      jobId: "3001",
      maxAttempts: 2,
      queueAgeMs: 60_000,
      runAfter: 1_780_299_940_000,
      state: "queued",
    },
    sessions: {
      earliestNextCloseAt: 1_780_300_060_000,
      open: 1,
      overdue: 0,
    },
    sourceHead: {
      auditId: 9012,
      msgtime: 1_780_299_999_000,
    },
    uid: 2002,
  });
  serviceMocks.createInsightLabelConfig.mockResolvedValue({
    status: 1,
    id: "15",
    labelCode: "high_intent",
    labelName: "高意向",
  });
  serviceMocks.createInsightIntentConfig.mockResolvedValue({
    description: "客户咨询价格",
    status: 1,
    id: "34",
    intentCode: "price_consult",
    intentName: "价格咨询",
    negativeExamples: [],
    positiveExamples: ["多少钱"],
    weight: 3,
  });
  serviceMocks.activatePresetInsightIntentConfig.mockResolvedValue({
    description: "客户询问价格、折扣、优惠券、满减等价格相关问题",
    id: "190",
    intentCode: "sys_price_consult",
    intentName: "价格咨询",
    negativeExamples: [],
    positiveExamples: ["这个多少钱"],
    status: 0,
    weight: 8,
  });
  serviceMocks.activatePresetInsightLabelConfig.mockResolvedValue({
    description: "客户明确表达购买意向",
    id: "191",
    labelCode: "sys_high_purchase_intent",
    labelName: "高购买意向",
    negativeExamples: [],
    positiveExamples: [],
    status: 0,
  });
  serviceMocks.activatePresetInsightQaRuleConfig.mockResolvedValue({
    applicableScene: "全场景",
    description: "检查客服服务态度是否礼貌、耐心、专业",
    id: "192",
    judgmentCriteria: "客服需使用礼貌用语，不得出现反问、讽刺、推诿或不耐烦表达；客户情绪激动时应先安抚再处理问题",
    negativeExamples: ["你自己看说明啊"],
    positiveExamples: ["非常抱歉给您带来不便，我来帮您处理"],
    ruleCode: "sys_service_attitude",
    ruleName: "服务态度",
    severity: "medium",
    status: 0,
  });
  serviceMocks.activatePresetInsightEntityDictionaryItem.mockResolvedValue({
    aliases: ["直播价", "直播专属", "限时秒杀"],
    entityCode: "sys_live_room_promotion",
    entityName: "直播间活动",
    id: "194",
    status: 0,
  });
  serviceMocks.updateInsightEntityDictionaryItemStatus.mockImplementation(
    async (id: string, payload: { status: 0 | 1 }) => ({
      ...mockInsightSettings.entityDictionary.find((item) => item.id === id),
      ...payload,
      id,
    }),
  );
}

describe("conversation insights pages", () => {
  beforeAll(async () => {
    await Promise.all([
      import("@/pages/chat/insights/insights-overview-page"),
      import("@/pages/chat/insights/insights-quality-page"),
      import("@/pages/chat/insights/insights-business-page"),
      import("@/pages/chat/insights/insights-settings-page"),
      import("@/pages/chat/insights/insights-worker-observability-page"),
    ]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-03T10:00:00+08:00"));
    mockSession("admin");
    installInsightMocks();
  });

  afterEach(() => {
    cleanup();
    useWorkbenchStore.getState().resetWorkbenchSession();
    resetWorkbenchService();
    document.body.removeAttribute("data-scroll-locked");
    document.body.style.removeProperty("pointer-events");
    vi.useRealTimers();
  });

  it("renders admin settings and P1 placeholders", async () => {
    serviceMocks.getInsightSettingsSummary.mockResolvedValue(
      createMockInsightSettingsSummary(true),
    );
    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("个性化调整洞察策略、标签、质检规则和实体词库"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("洞察策略")[0]).toBeInTheDocument();
    expect(screen.getByText("服务会话规则")).toBeInTheDocument();
    expect(screen.getByText("AI 洞察规则")).toBeInTheDocument();
    expect(screen.queryByText("实时客服")).not.toBeInTheDocument();
    expect(screen.queryByText("私域运营")).not.toBeInTheDocument();
    expect(screen.queryByText("自定义")).not.toBeInTheDocument();
    expect(screen.getByText("未完结会话提前洞察")).toBeInTheDocument();
    expect(
      screen.getByText("会话未结束时，系统会检查是否出现值得提前关注的客户诉求、风险或处理进展"),
    ).toBeInTheDocument();
    expect(screen.getByText("未完结会话检查敏感度")).toBeInTheDocument();
    expect(
      screen.getByText(
        "控制系统检查未完结会话变化的敏感程度，越敏感会消耗更多 AI 分析次数",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "未完结会话检查敏感度" }),
    ).toHaveTextContent("标准（推荐）");
    expect(screen.getByText("有效会话门槛")).toBeInTheDocument();
    expect(
      screen.getByText(
        "会话中的消息数少于该数量时，AI 会跳过分析，避免得出无效结论",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("AI 置信度阈值")).toBeInTheDocument();
    expect(
      screen.getByText(
        "低于该阈值时，问题解决判断会标记为未知，且不会自动创建工单",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("低可信提示阈值")).not.toBeInTheDocument();
    expect(
      screen.queryByText("阈值越高，越多结果会提示人工复核"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    await userEvent.click(
      screen.getByRole("combobox", { name: "未完结会话检查敏感度" }),
    );
    const frequencyListbox = await screen.findByRole("listbox");
    expect(
      within(frequencyListbox).getByText("标准（推荐）"),
    ).toBeInTheDocument();
    expect(within(frequencyListbox).getByText("较快")).toBeInTheDocument();
    expect(within(frequencyListbox).getByText("高频")).toBeInTheDocument();
    expect(
      within(frequencyListbox).getByText("兼顾提前发现和 AI 成本"),
    ).toBeInTheDocument();
    expect(
      within(frequencyListbox).getByText("更快检查客户诉求和风险变化"),
    ).toBeInTheDocument();
    expect(
      within(frequencyListbox).getByText(
        "更高频检查关键变化，对成本不敏感时开启",
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
      screen.getByRole("switch", { name: "未完结会话提前洞察" }),
    );
    expect(screen.queryByText("未完结会话检查敏感度")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();

    await userEvent.click(screen.getByRole("tab", { name: "意图配置" }));
    expect(screen.getByText("客户咨询物流或发货进度")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "新增意图" }));
    expect(
      await screen.findByRole("dialog", { name: "新增意图" }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("意图名称"), "价格咨询");
    await userEvent.type(screen.getByRole("textbox", { name: "ID" }), "price_consult");
    await userEvent.click(screen.getByRole("combobox", { name: "权重" }));
    await userEvent.click(await screen.findByRole("option", { name: "3" }));
    await userEvent.type(
      screen.getByLabelText("判定标准"),
      "客户咨询商品价格或优惠",
    );
    await userEvent.type(screen.getByLabelText("正例"), "多少钱");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(serviceMocks.createInsightIntentConfig).toHaveBeenCalledWith(
        expect.objectContaining({
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

    await userEvent.click(screen.getByRole("tab", { name: "标签配置" }));
    expect(screen.getAllByText("标签配置")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "新增标签" }));
    expect(
      await screen.findByRole("dialog", { name: "新增标签" }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("标签名称"), "高意向");
    await userEvent.type(screen.getByRole("textbox", { name: "ID" }), "high_intent");
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
    const rescanFromInput = screen.getByLabelText("开始时间");
    expect(new Date(rescanFromInput.getAttribute("min") ?? "").getTime()).toBe(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    );
    expect(new Date(rescanFromInput.getAttribute("max") ?? "").getTime()).toBe(
      Date.now(),
    );
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
    expect(screen.getByTestId("business-topic-list-scroll")).toBeInTheDocument();
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
  }, 20_000);

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

  it("disables manual rescan creation while insights are disabled", async () => {
    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "历史重刷" }));

    expect(
      await screen.findByRole("button", { name: "新建重刷任务" }),
    ).toBeDisabled();
    expect(serviceMocks.createInsightRescanJob).not.toHaveBeenCalled();
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
    const summary = await screen.findByRole("region", { name: "洞察配置概览" });
    const cards = within(summary).getAllByRole("article");

    expect(cards.map((card) => card.textContent)).toEqual([
      "总开关未开启",
      "智能创建工单已开启",
      "智能意图识别已开启（2 / 15）",
      "智能质检已开启（1 / 10）",
      "智能标签已开启（3 / 20）",
      "智能实体识别已开启（2 / 20）",
    ]);
    expect(within(cards[0]).getByText("未开启")).toBeInTheDocument();
    expect(within(cards[1]).getByText("已开启")).toBeInTheDocument();
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
      screen.queryByRole("tab", { name: "智能创建工单" }),
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
      within(dialog).getByRole("textbox", { name: "ID" }),
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
      screen.getByRole("textbox", { name: "ID" }),
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

  it("shows inactive system presets with add-only actions and locks preset identity fields after activation", async () => {
    serviceMocks.listInsightIntentConfigs.mockResolvedValueOnce([
      {
        description: "客户询问价格、折扣、优惠券、满减等价格相关问题",
        id: "preset:sys_price_consult",
        intentCode: "sys_price_consult",
        intentName: "价格咨询",
        negativeExamples: [],
        positiveExamples: ["这个多少钱"],
        status: 0,
        weight: 8,
      },
    ]);

    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "意图配置" }));

    expect(await screen.findByText("价格咨询")).toBeInTheDocument();
    expect(screen.getByText("sys_price_consult")).toBeInTheDocument();
    expect(screen.getByText("预置")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "添加预置配置" }));

    await waitFor(() => {
      expect(serviceMocks.activatePresetInsightIntentConfig).toHaveBeenCalledWith(
        "sys_price_consult",
      );
    });
    expect(await screen.findByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByText("预置")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(await screen.findByRole("dialog", { name: "编辑意图" })).toBeInTheDocument();
    expect(screen.getByLabelText("意图名称")).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "ID" })).toBeDisabled();
  });

  it("restores the inactive preset row after deleting an activated system preset", async () => {
    serviceMocks.listInsightIntentConfigs.mockResolvedValueOnce([
      {
        description: "客户询问价格、折扣、优惠券、满减等价格相关问题",
        id: "preset:sys_price_consult",
        intentCode: "sys_price_consult",
        intentName: "价格咨询",
        negativeExamples: [],
        positiveExamples: ["这个多少钱"],
        status: 0,
        weight: 8,
      },
    ]);

    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "意图配置" }));

    await userEvent.click(await screen.findByRole("button", { name: "添加预置配置" }));
    await waitFor(() => {
      expect(serviceMocks.activatePresetInsightIntentConfig).toHaveBeenCalledWith(
        "sys_price_consult",
      );
    });

    const activatedRow = await screen.findByRole("row", { name: /价格咨询/ });
    expect(within(activatedRow).getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(within(activatedRow).getByRole("button", { name: "删除" })).toBeInTheDocument();

    await userEvent.click(within(activatedRow).getByRole("button", { name: "删除" }));
    await userEvent.click(await screen.findByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(serviceMocks.deleteInsightIntentConfig).toHaveBeenCalledWith("190");
    });

    const restoredRow = await screen.findByRole("row", { name: /价格咨询/ });
    expect(within(restoredRow).getByRole("cell", { name: "-" })).toBeInTheDocument();
    expect(within(restoredRow).getByRole("button", { name: "添加预置配置" })).toBeInTheDocument();
    expect(within(restoredRow).queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(within(restoredRow).queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });

  it("restores deleted preset candidates to their original list position", async () => {
    serviceMocks.listInsightIntentConfigs.mockResolvedValueOnce([
      {
        description: "客户询问价格、折扣、优惠券、满减等价格相关问题",
        id: "preset:sys_price_consult",
        intentCode: "sys_price_consult",
        intentName: "价格咨询",
        negativeExamples: [],
        positiveExamples: ["这个多少钱"],
        status: 0,
        weight: 8,
      },
      {
        description: "客户咨询私域活动、直播活动、满减、赠品等活动信息",
        id: "preset:sys_campaign_consult",
        intentCode: "sys_campaign_consult",
        intentName: "活动咨询",
        negativeExamples: [],
        positiveExamples: ["最近有什么活动"],
        status: 0,
        weight: 8,
      },
      {
        description: "客户咨询会员权益、积分、优惠券、社群福利等权益信息",
        id: "preset:sys_benefit_consult",
        intentCode: "sys_benefit_consult",
        intentName: "权益咨询",
        negativeExamples: [],
        positiveExamples: ["会员有什么权益"],
        status: 0,
        weight: 8,
      },
    ]);
    serviceMocks.activatePresetInsightIntentConfig.mockResolvedValueOnce({
      description: "客户咨询私域活动、直播活动、满减、赠品等活动信息",
      id: "191",
      intentCode: "sys_campaign_consult",
      intentName: "活动咨询",
      negativeExamples: [],
      positiveExamples: ["最近有什么活动"],
      status: 0,
      weight: 8,
    });

    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "意图配置" }));

    const campaignCandidateRow = await screen.findByRole("row", { name: /活动咨询/ });
    await userEvent.click(
      within(campaignCandidateRow).getByRole("button", { name: "添加预置配置" }),
    );
    await waitFor(() => {
      expect(serviceMocks.activatePresetInsightIntentConfig).toHaveBeenCalledWith(
        "sys_campaign_consult",
      );
    });

    const activatedRow = await screen.findByRole("row", { name: /活动咨询/ });
    await userEvent.click(within(activatedRow).getByRole("button", { name: "删除" }));
    await userEvent.click(await screen.findByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(serviceMocks.deleteInsightIntentConfig).toHaveBeenCalledWith("191");
    });

    const rows = await screen.findAllByRole("row");
    const priceRow = rows.find((row) => row.textContent?.includes("价格咨询"));
    const restoredCampaignRow = rows.find((row) => row.textContent?.includes("活动咨询"));
    const benefitRow = rows.find((row) => row.textContent?.includes("权益咨询"));

    expect(priceRow).toBeDefined();
    expect(restoredCampaignRow).toBeDefined();
    expect(benefitRow).toBeDefined();
    expect(rows.indexOf(priceRow!)).toBeLessThan(rows.indexOf(restoredCampaignRow!));
    expect(rows.indexOf(restoredCampaignRow!)).toBeLessThan(rows.indexOf(benefitRow!));
    expect(
      within(restoredCampaignRow!).getByRole("button", { name: "添加预置配置" }),
    ).toBeInTheDocument();
  });

  it("reloads preset candidates after deleting a system preset that was already active on page load", async () => {
    serviceMocks.listInsightIntentConfigs
      .mockResolvedValueOnce([
        {
          description: "客户询问价格、折扣、优惠券、满减等价格相关问题",
          id: "190",
          intentCode: "sys_price_consult",
          intentName: "价格咨询",
          negativeExamples: [],
          positiveExamples: ["这个多少钱"],
          status: 1,
          weight: 8,
        },
      ])
      .mockResolvedValueOnce([
        {
          description: "客户询问价格、折扣、优惠券、满减等价格相关问题",
          id: "preset:sys_price_consult",
          intentCode: "sys_price_consult",
          intentName: "价格咨询",
          negativeExamples: [],
          positiveExamples: ["这个多少钱"],
          status: 0,
          weight: 8,
        },
      ]);

    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByRole("heading", { name: "洞察配置" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "意图配置" }));

    const activeRow = await screen.findByRole("row", { name: /价格咨询/ });
    expect(within(activeRow).getByRole("button", { name: "删除" })).toBeInTheDocument();

    await userEvent.click(within(activeRow).getByRole("button", { name: "删除" }));
    await userEvent.click(await screen.findByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(serviceMocks.deleteInsightIntentConfig).toHaveBeenCalledWith("190");
    });
    await waitFor(() => {
      expect(serviceMocks.listInsightIntentConfigs).toHaveBeenCalledTimes(2);
    });

    const restoredRow = await screen.findByRole("row", { name: /价格咨询/ });
    expect(within(restoredRow).getByRole("cell", { name: "-" })).toBeInTheDocument();
    expect(within(restoredRow).getByRole("button", { name: "添加预置配置" })).toBeInTheDocument();
    expect(within(restoredRow).queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(within(restoredRow).queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
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
      "智能创建工单",
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
      intentLimit: 15,
      intentSoftLimit: 12,
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

  it("hides settings content for non-admin users", async () => {
    mockSession("operator");
    renderRoute("/chat/insights/settings");

    expect(
      await screen.findByText("仅管理员可查看洞察配置"),
    ).toBeInTheDocument();
  });
  it("disables the global insight switch when insights are not available", async () => {
    serviceMocks.getInsightSettingsSummary.mockResolvedValue({
      enabledIntentCount: mockInsightSettings.intentConfigs.filter(
        (item) => item.status === 1,
      ).length,
      intentLimit: 15,
      intentSoftLimit: 12,
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
    const insightSwitch = screen.getByRole("switch", { name: "启用会话洞察" });
    expect(insightSwitch).toBeDisabled();
    expect(screen.getByText("当前账号暂未开通会话洞察")).toBeInTheDocument();
    await userEvent.hover(insightSwitch);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "当前账号暂未开通会话洞察",
    );
  });


});
