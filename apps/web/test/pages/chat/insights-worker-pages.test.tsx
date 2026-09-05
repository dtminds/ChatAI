import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
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

  it("does not retain the removed insights follow-ups route", async () => {
    renderRoute("/chat/insights/follow-ups");

    expect(await screen.findByText("页面不存在")).toBeInTheDocument();
  });

  it("renders the basic overview with the normal AI structure", async () => {
    serviceMocks.getInsightCapabilities.mockResolvedValue({
      canManageInsights: true,
      canViewWorkerObservability: false,
      insightAvailable: true,
      mode: "basic",
    });
    serviceMocks.getInsightOverview.mockResolvedValue({
      ...(await serviceMocks.getInsightOverview()),
      mode: "basic",
    });
    serviceMocks.getInsightOverviewSessions.mockResolvedValue({
      items: [
        {
          agentMessageCount: 4,
          agentName: "客服一号",
          analysisStatus: "ready",
          conversationId: "301",
          customerMessageCount: 6,
          customerName: "张三",
          endedAt: 1_780_244_950_000,
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
      mode: "basic",
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    renderRoute("/chat/insights");

    expect(
      await screen.findByRole("heading", { level: 1, name: "会话数据总览" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("AI 诊断").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "查看会话洞察依赖说明" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "查看 AI 诊断说明" }),
    ).toBeInTheDocument();
    expect(serviceMocks.getInsightFilterOptions).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("物流异常待跟进")).toBeInTheDocument();
    expect(screen.getByText("未启用")).toBeInTheDocument();
    expect(screen.queryByText("待分析")).not.toBeInTheDocument();
    expect(serviceMocks.getInsightOverviewSessions).toHaveBeenCalledWith({
      analysisStatus: undefined,
      entityId: undefined,
      from: expect.any(String),
      intentId: undefined,
      keyword: undefined,
      page: 1,
      pageSize: 20,
      problemScope: undefined,
      resolutionStatus: undefined,
      tagId: undefined,
      to: expect.any(String),
    });

    await userEvent.hover(
      screen.getByRole("button", { name: "查看 AI 诊断说明" }),
    );
    expect(
      await screen.findByText("该功能依赖会话洞察，当前暂未开启"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("按本轮会话内容判断，不代表后续处理状态"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "详情" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightDetail).toHaveBeenCalledWith("501");
      expect(serviceMocks.getInsightSessionMessages).toHaveBeenCalledWith("501");
    });
  });

  it("renders AI pages in basic mode and keeps their normal data requests", async () => {
    serviceMocks.getInsightCapabilities.mockResolvedValue({
      canManageInsights: true,
      canViewWorkerObservability: false,
      insightAvailable: true,
      mode: "basic",
    });

    renderRoute("/chat/insights/quality");

    expect(await screen.findByRole("heading", { name: "服务质检" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "查看会话洞察依赖说明" }),
    ).toHaveLength(2);
    expect(serviceMocks.getInsightQualityOverview).toHaveBeenCalledTimes(1);
    expect(serviceMocks.getInsightQualityAgentStats).toHaveBeenCalledTimes(1);
  });

  it("renders AI route variants in basic mode without changing page structure", async () => {
    serviceMocks.getInsightCapabilities.mockResolvedValue({
      canManageInsights: true,
      canViewWorkerObservability: false,
      insightAvailable: true,
      mode: "basic",
    });

    for (const path of [
      "/chat/insights/quality/",
      "/CHAT/INSIGHTS/QUALITY",
    ]) {
      renderRoute(path);

      expect(await screen.findByRole("heading", { name: "服务质检" })).toBeInTheDocument();
      expect(serviceMocks.getInsightQualityOverview).toHaveBeenCalled();
      expect(serviceMocks.getInsightQualityAgentStats).toHaveBeenCalled();

      cleanup();
      installInsightMocks();
      serviceMocks.getInsightCapabilities.mockResolvedValue({
        canManageInsights: true,
        canViewWorkerObservability: false,
        insightAvailable: true,
        mode: "basic",
      });
    }
  });

  it("keeps worker observability navigation available in basic-mode AI pages", async () => {
    serviceMocks.getInsightCapabilities.mockResolvedValue({
      canManageInsights: true,
      canViewWorkerObservability: true,
      insightAvailable: false,
      mode: "basic",
    });

    renderRoute("/chat/insights/quality");

    expect(await screen.findByRole("heading", { name: "服务质检" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "运行观测" }),
    ).toHaveAttribute("href", "/chat/insights/worker-observability");
    expect(serviceMocks.getInsightQualityOverview).toHaveBeenCalledTimes(1);
  });

  it("lets an observer use worker observability in basic mode and inspect another UID", async () => {
    serviceMocks.getInsightCapabilities.mockResolvedValue({
      canManageInsights: true,
      canViewWorkerObservability: true,
      insightAvailable: false,
      mode: "basic",
    });

    renderRoute("/chat/insights/worker-observability");

    expect(
      await screen.findByRole("heading", { level: 1, name: "运行观测" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "运行观测" }),
    ).toHaveAttribute("href", "/chat/insights/worker-observability");
    await waitFor(() => {
      expect(serviceMocks.getInsightsWorkerSummary).toHaveBeenCalledTimes(1);
      expect(serviceMocks.getInsightsWorkerUids).toHaveBeenCalledWith(
        {
          page: 1,
          pageSize: 50,
          state: undefined,
          uid: undefined,
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(screen.getByText("可能长时间运行（聚合判断）")).toBeInTheDocument();
    expect(screen.getByText(/已运行 16 分钟/)).toBeInTheDocument();
    expect(screen.getByText("最近上报 worker-a:1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "2002" }));

    expect(
      await screen.findByRole("dialog", { name: "UID 2002" }),
    ).toBeInTheDocument();
    expect(serviceMocks.getInsightsWorkerUidDetail).toHaveBeenCalledWith(
      2002,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(
      within(screen.getByRole("dialog", { name: "UID 2002" })).getByText("3001"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole("dialog", { name: "UID 2002" })).getByRole(
        "button",
        { name: "刷新 UID 详情" },
      ),
    );
    await waitFor(() => {
      expect(serviceMocks.getInsightsWorkerUidDetail).toHaveBeenCalledTimes(2);
    });
  });

  it("clears detail loading when an in-flight UID detail is closed", async () => {
    serviceMocks.getInsightCapabilities.mockResolvedValue({
      canManageInsights: true,
      canViewWorkerObservability: true,
      insightAvailable: false,
      mode: "basic",
    });
    const detailGate = createDeferred();
    serviceMocks.getInsightsWorkerUidDetail.mockReturnValueOnce(detailGate.promise);
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");

    try {
      renderRoute("/chat/insights/worker-observability");

      await userEvent.click(
        await screen.findByRole("button", { name: "2002" }),
      );
      const detailDialog = await screen.findByRole("dialog", { name: "UID 2002" });
      const requestOptions = serviceMocks.getInsightsWorkerUidDetail.mock.calls[0]?.[1];

      expect(requestOptions?.signal?.aborted).toBe(false);
      expect(
        within(detailDialog).getByRole("button", { name: "刷新 UID 详情" }),
      ).toBeDisabled();

      await userEvent.click(
        within(detailDialog).getByRole("button", { name: "关闭" }),
      );
      await waitFor(() => {
        expect(requestOptions?.signal?.aborted).toBe(true);
        expect(screen.queryByRole("dialog", { name: "UID 2002" })).not.toBeInTheDocument();
      });

      visibility.mockReturnValue("hidden");
      await userEvent.click(screen.getByRole("button", { name: "2002" }));

      const reopenedDialog = await screen.findByRole("dialog", { name: "UID 2002" });
      expect(
        within(reopenedDialog).getByRole("button", { name: "刷新 UID 详情" }),
      ).toBeEnabled();
      expect(serviceMocks.getInsightsWorkerUidDetail).toHaveBeenCalledTimes(1);
    } finally {
      visibility.mockRestore();
    }
  });

  it("does not request cross-tenant worker data for a non-observer direct route", async () => {
    serviceMocks.getInsightCapabilities.mockResolvedValue({
      canManageInsights: true,
      canViewWorkerObservability: false,
      insightAvailable: true,
      mode: "insight",
    });

    renderRoute("/chat/insights/worker-observability");

    expect(
      await screen.findByRole("heading", { name: "无权查看运行观测" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "运行观测" })).not.toBeInTheDocument();
    expect(serviceMocks.getInsightsWorkerSummary).not.toHaveBeenCalled();
    expect(serviceMocks.getInsightsWorkerUids).not.toHaveBeenCalled();
    expect(serviceMocks.getInsightsWorkerUidDetail).not.toHaveBeenCalled();
  });

  it("keeps the last worker snapshot visible when a refresh fails", async () => {
    serviceMocks.getInsightCapabilities.mockResolvedValue({
      canManageInsights: true,
      canViewWorkerObservability: true,
      insightAvailable: false,
      mode: "basic",
    });

    renderRoute("/chat/insights/worker-observability");

    await waitFor(() => {
      expect(serviceMocks.getInsightsWorkerSummary).toHaveBeenCalledTimes(1);
      expect(serviceMocks.getInsightsWorkerUids).toHaveBeenCalledTimes(1);
    });
    serviceMocks.getInsightsWorkerSummary.mockRejectedValueOnce(
      new Error("refresh failed"),
    );
    serviceMocks.getInsightsWorkerUids.mockRejectedValueOnce(
      new Error("refresh failed"),
    );

    await userEvent.click(screen.getByRole("button", { name: "刷新运行观测" }));

    expect(
      await screen.findByText("刷新失败，当前展示上次结果"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2002" })).toBeInTheDocument();
  });

  it("interprets pasted worker pipeline summary logs in a dialog", async () => {
    serviceMocks.getInsightCapabilities.mockResolvedValue({
      canManageInsights: true,
      canViewWorkerObservability: true,
      insightAvailable: false,
      mode: "basic",
    });

    renderRoute("/chat/insights/worker-observability");

    await waitFor(() => {
      expect(serviceMocks.getInsightsWorkerSummary).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole("button", { name: "解读 Worker 日志" }));
    const dialog = await screen.findByRole("dialog", { name: "Worker 日志解读" });
    expect(dialog).toBeInTheDocument();

    const textarea = screen.getByRole("textbox", { name: "Worker 日志原文" });
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          eventCode: "insights_worker.pipeline_summary",
          jobsClaimed: 0,
          pipeline: "analysis",
          ticksFailed: 0,
          ticksRun: 20,
          ticksSucceeded: 20,
          windowSeconds: 60,
        }),
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "分析" }));

    expect(await screen.findByText("管线运行汇总")).toBeInTheDocument();
    expect(screen.getByText(/健康空闲/)).toBeInTheDocument();
    expect(screen.getByText("成功完成的 tick 次数")).toBeInTheDocument();
  });

  it("polls only while visible and does not overlap worker refreshes", async () => {
    serviceMocks.getInsightCapabilities.mockResolvedValue({
      canManageInsights: true,
      canViewWorkerObservability: true,
      insightAvailable: false,
      mode: "basic",
    });
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    try {
      renderRoute("/chat/insights/worker-observability");

      await waitFor(() => {
        expect(serviceMocks.getInsightsWorkerSummary).toHaveBeenCalledTimes(1);
        expect(serviceMocks.getInsightsWorkerUids).toHaveBeenCalledTimes(1);
      });
      expect(
        setIntervalSpy.mock.calls.some(([, delay]) => delay === 30_000),
      ).toBe(true);

      await userEvent.click(
        await screen.findByRole("button", { name: "2002" }),
      );
      await screen.findByRole("dialog", { name: "UID 2002" });
      expect(
        setIntervalSpy.mock.calls.some(([, delay]) => delay === 15_000),
      ).toBe(true);

      const summarySnapshot = await serviceMocks.getInsightsWorkerSummary.mock
        .results[0]?.value;
      const uidSnapshot = await serviceMocks.getInsightsWorkerUids.mock
        .results[0]?.value;
      let resolveSummary!: (value: unknown) => void;
      let resolveUids!: (value: unknown) => void;
      serviceMocks.getInsightsWorkerSummary.mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveSummary = resolve;
        }),
      );
      serviceMocks.getInsightsWorkerUids.mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveUids = resolve;
        }),
      );

      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        document.dispatchEvent(new Event("visibilitychange"));
        await Promise.resolve();
      });

      expect(serviceMocks.getInsightsWorkerSummary).toHaveBeenCalledTimes(2);
      expect(serviceMocks.getInsightsWorkerUids).toHaveBeenCalledTimes(2);

      visibility.mockReturnValue("hidden");
      await act(async () => {
        resolveSummary(summarySnapshot);
        resolveUids(uidSnapshot);
        await Promise.resolve();
      });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(serviceMocks.getInsightsWorkerSummary).toHaveBeenCalledTimes(2);
      expect(serviceMocks.getInsightsWorkerUids).toHaveBeenCalledTimes(2);

      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      await waitFor(() => {
        expect(serviceMocks.getInsightsWorkerSummary).toHaveBeenCalledTimes(3);
        expect(serviceMocks.getInsightsWorkerUids).toHaveBeenCalledTimes(3);
      });
    } finally {
      setIntervalSpy.mockRestore();
      visibility.mockRestore();
    }
  });


});
