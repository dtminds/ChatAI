import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { routerConfig } from "@/router";
import { useAuthStore } from "@/store/auth-store";

const serviceMocks = vi.hoisted(() => ({
  createInsightRescanJob: vi.fn(),
  getInsightBusiness: vi.fn(),
  getInsightBusinessRelatedSessions: vi.fn(),
  getInsightDetail: vi.fn(),
  getInsightFollowUps: vi.fn(),
  getInsightMessageContext: vi.fn(),
  getInsightOverview: vi.fn(),
  getInsightOverviewSessions: vi.fn(),
  getInsightQuality: vi.fn(),
  getInsightSettings: vi.fn(),
  createInsightIntentConfig: vi.fn(),
  createInsightLabelConfig: vi.fn(),
  updateInsightAnalysisPolicy: vi.fn(),
  updateInsightEntityDictionaryItem: vi.fn(),
  updateInsightEntityDictionaryItemStatus: vi.fn(),
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

vi.mock("@/pages/chat/insights/api/insights-service", () => serviceMocks);

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const React = await import("react");

  return {
    ...actual,
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

function installInsightMocks() {
  serviceMocks.getInsightOverview.mockResolvedValue({
    actionItemsOpen: 3,
    analysis: { failed: 1, partial: 2, ready: 18, stale: 1 },
    entityHotspots: [
      {
        entityId: "p1",
        entityName: "白色羽绒服",
        entityType: "product",
        mentionCount: 12,
        negativeCount: 2,
        riskSessionCount: 3,
        sessionCount: 9,
      },
    ],
    highRiskSessions: 2,
    intentDistribution: [
      { count: 8, intentCode: "logistics", intentLabel: "查物流" },
      { count: 2, intentCode: "ai_customer_service_info", intentLabel: "咨询AI客服系统相关信息" },
    ],
    negativeSessions: 4,
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
        agentMessageCount: 3,
        agentName: "客服一号",
        analysisStatus: "ready",
        conversationId: "301",
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerMessageCount: 5,
        customerName: "张三",
        assets: [
          { assetCode: "https://example.com/promo", assetName: "红包活动", assetType: "link" },
        ],
        entities: [
          { entityId: "sku-1", entityName: "白色羽绒服", entityType: "product" },
        ],
        intents: [
          { intentCode: "logistics_delay", intentLabel: "物流异常" },
        ],
        lastMessageAt: 1_780_244_950_000,
        messageCount: 8,
        problemSummary: "客户反馈物流异常",
        resolutionStatus: "unresolved",
        sessionId: "501",
        startedAt: 1_780_243_200_000,
        summaryCustomerIntent: "查物流",
        tags: [
          { tagCode: "logistics_issue", tagName: "物流异常" },
        ],
      },
      {
        agentAvatarUrl: "https://example.com/agent-2.png",
        agentMessageCount: 2,
        agentName: "客服二号",
        analysisStatus: "partial",
        conversationId: "302",
        customerAvatarUrl: "https://example.com/customer-2.png",
        customerMessageCount: 3,
        customerName: "李四",
        entities: [],
        intents: [
          { intentCode: "refund", intentLabel: "退款咨询" },
          { intentCode: "ai_customer_service_info", intentLabel: "咨询AI客服系统相关信息" },
        ],
        lastMessageAt: 1_780_244_500_000,
        messageCount: 5,
        problemSummary: "客户咨询退款到账时间",
        resolutionStatus: "resolved",
        sessionId: "502",
        startedAt: 1_780_244_000_000,
        summaryCustomerIntent: "退款咨询",
        tags: [
          { tagCode: "refund", tagName: "退款咨询" },
        ],
      },
      {
        agentAvatarUrl: "https://example.com/agent-3.png",
        agentMessageCount: 1,
        agentName: "客服三号",
        analysisStatus: "ready",
        conversationId: "303",
        customerAvatarUrl: "https://example.com/customer-3.png",
        customerMessageCount: 1,
        customerName: "赵六",
        entities: [],
        intents: [],
        lastMessageAt: 1_780_243_500_000,
        messageCount: 2,
        problemSummary: "消息不足，无法判断客户问题",
        resolutionStatus: "unknown",
        sessionId: "503",
        startedAt: 1_780_243_400_000,
        summaryCustomerIntent: "消息不足",
        tags: [],
      },
    ],
    page: 1,
    pageSize: 20,
    total: 3,
    totalPages: 1,
  });
  serviceMocks.getInsightBusiness.mockResolvedValue({
    assetHotspots: [
      {
        actionItemsOpen: 0,
        code: "https://example.com/promo",
        dimension: "asset",
        mentionCount: 6,
        name: "红包活动",
        negativeRate: 0,
        negativeSessions: 0,
        sessionCount: 5,
        share: 0.25,
        type: "link",
        unresolvedRate: 0.2,
        unresolvedSessions: 1,
      },
    ],
    entityHotspots: [
      {
        actionItemsOpen: 1,
        code: "sku-1",
        dimension: "entity",
        mentionCount: 12,
        name: "白色羽绒服",
        negativeRate: 0.22,
        negativeSessions: 2,
        sessionCount: 9,
        share: 0.45,
        type: "product",
        unresolvedRate: 0.33,
        unresolvedSessions: 3,
      },
    ],
    intentDistribution: [
      {
        actionItemsOpen: 1,
        code: "logistics_delay",
        dimension: "intent",
        mentionCount: 8,
        name: "物流异常",
        negativeRate: 0.25,
        negativeSessions: 2,
        sessionCount: 8,
        share: 0.4,
        unresolvedRate: 0.375,
        unresolvedSessions: 3,
      },
    ],
    intentTrend: [
      {
        date: "2026-06-01",
        intentCode: "logistics_delay",
        intentName: "物流异常",
        sessionCount: 3,
      },
      {
        date: "2026-06-01",
        intentCode: "price_consult",
        intentName: "价格咨询",
        sessionCount: 2,
      },
      {
        date: "2026-06-02",
        intentCode: "logistics_delay",
        intentName: "物流异常",
        sessionCount: 5,
      },
    ],
    qualityTopics: [
      {
        actionItemsOpen: 1,
        code: "sku-1",
        dimension: "entity",
        mentionCount: 12,
        name: "白色羽绒服",
        negativeRate: 0.22,
        negativeSessions: 2,
        sessionCount: 9,
        share: 0.45,
        type: "product",
        unresolvedRate: 0.33,
        unresolvedSessions: 3,
      },
    ],
    tagDistribution: [
      {
        actionItemsOpen: 1,
        code: "logistics_issue",
        dimension: "tag",
        mentionCount: 10,
        name: "物流异常",
        negativeRate: 0.2,
        negativeSessions: 2,
        sessionCount: 8,
        share: 0.4,
        unresolvedRate: 0.375,
        unresolvedSessions: 3,
      },
    ],
    totals: {
      actionItemsOpen: 3,
      analyzedSessions: 18,
      assetMentions: 6,
      entityMentions: 12,
      intentMentions: 8,
      negativeSessions: 4,
      tagMentions: 10,
      topicSessions: 16,
      unresolvedSessions: 5,
    },
    trend: [
      {
        assetMentions: 2,
        date: "2026-06-01",
        entityMentions: 5,
        intentMentions: 3,
        negativeSessions: 1,
        tagMentions: 4,
        topicSessions: 7,
        unresolvedSessions: 2,
      },
      {
        assetMentions: 4,
        date: "2026-06-02",
        entityMentions: 7,
        intentMentions: 5,
        negativeSessions: 3,
        tagMentions: 6,
        topicSessions: 9,
        unresolvedSessions: 3,
      },
    ],
  });
  serviceMocks.getInsightBusinessRelatedSessions.mockResolvedValue({
    items: [
      {
        agentAvatarUrl: "https://example.com/agent-1.png",
        agentMessageCount: 3,
        agentName: "客服一号",
        analysisStatus: "ready",
        conversationId: "301",
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerMessageCount: 5,
        customerName: "张三",
        entities: [
          { entityId: "sku-1", entityName: "白色羽绒服", entityType: "product" },
        ],
        intents: [
          { intentCode: "logistics_delay", intentLabel: "物流异常" },
        ],
        lastMessageAt: 1_780_244_950_000,
        messageCount: 8,
        problemSummary: "客户反馈物流异常",
        resolutionStatus: "unresolved",
        sessionId: "501",
        startedAt: 1_780_243_200_000,
        summaryCustomerIntent: "查物流",
        tags: [
          { tagCode: "logistics_issue", tagName: "物流异常" },
        ],
      },
    ],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  });
  serviceMocks.getInsightQuality.mockResolvedValue({
    agentStats: [
      {
        agentAvatarUrl: "https://example.com/agent-report.png",
        agentName: "企微小助手1号",
        agentSeatId: "seat-1",
        partial: 2,
        problemSessions: 21,
        resolved: 18,
        totalSessions: 13,
        unresolved: 3,
        unresolvedRate: 0.1429,
      },
    ],
    overview: {
      analyzedSessions: 20,
      noCustomerProblem: 6,
      partial: 3,
      problemSessions: 14,
      resolved: 6,
      totalSessions: 22,
      unresolved: 5,
    },
    unresolvedReasons: [
      { count: 3, reasonCode: "logistics_pending", reasonLabel: "售后/物流/退款进度未确认" },
    ],
    unresolvedSessions: [
      {
        agentAvatarUrl: "https://example.com/agent-1.png",
        agentName: "客服一号",
        conversationId: "301",
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerName: "张三",
        evidenceMessageIds: ["9001", "9002"],
        lastCustomerMessageAt: 1_780_244_100_000,
        problemSummary: "客户反馈物流异常",
        resolutionStatus: "unresolved",
        sessionId: "501",
        severity: "high",
        unresolvedReason: "售后/物流/退款进度未确认",
      },
      {
        agentAvatarUrl: "https://example.com/agent-2.png",
        agentName: "客服二号",
        conversationId: "302",
        customerAvatarUrl: "https://example.com/customer-2.png",
        customerName: "李四",
        evidenceMessageIds: ["9004"],
        lastCustomerMessageAt: 1_780_244_500_000,
        problemSummary: "客户咨询退款到账时间",
        resolutionStatus: "resolved",
        sessionId: "502",
        severity: "medium",
        unresolvedReason: "",
      },
    ],
  });
  serviceMocks.getInsightFollowUps.mockResolvedValue({
    items: [
      {
        actionItemId: "801",
        actionType: "logistics_check",
        conversationId: "301",
        customerAvatarUrl: "https://example.com/customer-1.png",
        customerName: "张三",
        evidenceMessageIds: ["9002"],
        lastCustomerMessageAt: 1_780_244_100_000,
        priority: "high",
        reason: "物流进度未确认",
        sessionId: "501",
        status: "open",
        title: "确认快递状态",
      },
    ],
    total: 1,
  });
  serviceMocks.getInsightDetail.mockResolvedValue({
    actionItems: [],
    analysisStatus: "ready",
    currentSnapshotId: "7001",
    entities: [
      {
        entityId: "sku-1",
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
        reason: "客户明确反馈物流不更新",
      },
      {
        dimensionType: "problem_resolution",
        evidenceRole: "unresolved_signal",
        messageId: "9002",
        reason: "当前会话未确认物流处理结果",
      },
    ],
    evidenceMessages: [
      {
        contentText: "帮您催一下快递",
        contentType: "text",
        messageId: "9001",
        msgtime: 1_780_244_000_000,
        senderName: "客服一号",
        senderRole: "agent",
      },
      {
        contentText: "还没收到货，物流也不更新",
        contentType: "text",
        messageId: "9002",
        msgtime: 1_780_244_100_000,
        senderName: "张三",
        senderRole: "customer",
      },
    ],
    evidenceMessageRecords: [
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
    sessionMessageRecords: [
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
        evidenceMessageIds: ["9002"],
        passed: false,
        reason: "未确认物流进展",
        ruleCode: "problem_resolution",
      },
    ],
    risks: [
      {
        evidenceMessageIds: ["9002"],
        reason: "客户可能给出差评",
        riskLevel: "high",
        riskType: "bad_review",
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
      customerIntent: "查物流",
      followUp: "确认快递状态",
      processSummary: "客服要求客户等待",
      resultSummary: "未确认物流进展",
    },
    tags: [
      {
        confidence: 0.91,
        evidenceMessageIds: ["9002"],
        tagCode: "logistics_issue",
        tagName: "物流异常",
      },
    ],
  });
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
  serviceMocks.getInsightSettings.mockResolvedValue({
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
      {
        aliases: ["雨伞"],
        canonicalName: "黑色雨伞",
        enabled: true,
        entityType: "product",
        id: "42",
        includeInAggregation: true,
      },
      {
        aliases: [],
        canonicalName: "隐藏实体",
        enabled: false,
        entityType: "product",
        id: "43",
        includeInAggregation: true,
      },
    ],
    intentConfigs: [
      {
        aliases: ["查快递"],
        description: "客户咨询物流或发货进度",
        enabled: true,
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
        enabled: true,
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
        enabled: false,
        id: "33",
        includeInStatistics: true,
        intentCode: "hidden_intent",
        intentName: "隐藏意图",
        weight: 3,
      },
    ],
    labelConfigs: [
      {
        enabled: true,
        id: "11",
        includeInStatistics: true,
        labelCode: "refund",
        labelName: "退款咨询",
      },
      {
        enabled: true,
        id: "12",
        includeInStatistics: true,
        labelCode: "price_sensitive",
        labelName: "价格敏感",
      },
      {
        enabled: true,
        id: "13",
        includeInStatistics: true,
        labelCode: "high_intent",
        labelName: "高意向",
      },
      {
        enabled: false,
        id: "14",
        includeInStatistics: true,
        labelCode: "hidden_label",
        labelName: "隐藏标签",
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
  });
  serviceMocks.updateInsightActionStatus.mockResolvedValue({
    actionItemId: "801",
    status: "done",
  });
  serviceMocks.createInsightRescanJob.mockResolvedValue({
    jobId: "8801",
    status: "accepted",
  });
  serviceMocks.createInsightLabelConfig.mockResolvedValue({
    enabled: true,
    id: "12",
    includeInStatistics: true,
    labelCode: "high_intent",
    labelName: "高意向",
  });
  serviceMocks.createInsightIntentConfig.mockResolvedValue({
    aliases: ["报价"],
    description: "客户咨询价格",
    enabled: true,
    id: "34",
    includeInStatistics: true,
    intentCode: "price_consult",
    intentName: "价格咨询",
    negativeExamples: [],
    positiveExamples: ["多少钱"],
    weight: 3,
  });
}

async function applyDateRangePreset(label: string, expectedFrom: string, expectedTo: string) {
  await userEvent.click(screen.getByRole("button", { name: /日期范围/ }));
  await userEvent.click(await screen.findByRole("button", { name: label }));
  await userEvent.click(screen.getByRole("button", { name: "应用" }));

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
  expect(screen.getByRole("button", {
    name: new RegExp(`日期范围.*${label}.*${expectedFrom}.*${expectedTo}`),
  })).toBeInTheDocument();
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
    vi.useRealTimers();
  });

  it("renders overview navigation, metrics and detail evidence", async () => {
    renderRoute("/chat/insights");

    expect(await screen.findByRole("heading", { level: 1, name: "会话数据总览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /日期范围.*近7天.*2026-05-28.*2026-06-03/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("开始日期")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("结束日期")).not.toBeInTheDocument();
    expect(serviceMocks.getInsightOverview).toHaveBeenCalledWith({
      from: "2026-05-28T00:00:00.000+08:00",
      to: "2026-06-03T23:59:59.999+08:00",
    });
    expect(serviceMocks.getInsightOverviewSessions).toHaveBeenCalledWith({
      analysisStatus: undefined,
      entityName: undefined,
      from: "2026-05-28T00:00:00.000+08:00",
      intentCode: undefined,
      keyword: undefined,
      page: 1,
      pageSize: 20,
      problemScope: undefined,
      resolutionStatus: undefined,
      tagCode: undefined,
      to: "2026-06-03T23:59:59.999+08:00",
    });
    expect(screen.getByRole("link", { name: /服务质检/ })).toHaveAttribute("href", "/chat/insights/quality");
    expect(screen.queryByRole("link", { name: /分析明细/ })).not.toBeInTheDocument();
    expect(screen.getByText("逻辑会话数")).toBeInTheDocument();
    expect(screen.getAllByText("22").length).toBeGreaterThan(0);
    expect(screen.getByText("咨询用户数")).toBeInTheDocument();
    expect(screen.getByText("消息数")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^消息数/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "逻辑会话明细" })).toBeInTheDocument();
    expect(screen.getByText("客户反馈物流异常")).toBeInTheDocument();
    expect(screen.getAllByText("消息不足").length).toBeGreaterThan(0);
    expect(screen.queryByText("待复核")).not.toBeInTheDocument();
    expect(screen.queryByText("待判断")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: "解决状态" }));
    expect(await screen.findByRole("option", { name: "无需客服处理" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "无明确问题" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("优先处理队列")).not.toBeInTheDocument();
    expect(screen.queryByText("分析完成率和异常状态")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "张三" })).toBeInTheDocument();
    expect(screen.queryByText("会话 301")).not.toBeInTheDocument();
    expect(document.querySelector("#insightTrendArea stop[offset='100%']")).toHaveAttribute("stop-opacity", "0");

    await waitFor(() => {
      expect(serviceMocks.getInsightSettings).toHaveBeenCalled();
    });
    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    let advancedFilters = await screen.findByRole("menu", { name: /更多筛选/ });
    expect(within(advancedFilters).queryByRole("menuitemradio", { name: "退款咨询" })).not.toBeInTheDocument();
    await userEvent.click(within(advancedFilters).getByRole("menuitem", { name: "标签" }));
    let refundTagOption = await screen.findByRole("menuitemradio", { name: "退款咨询" });
    expect(refundTagOption).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "高意向" })).toBeInTheDocument();
    expect(within(advancedFilters).queryByRole("menuitemradio", { name: "物流异常" })).not.toBeInTheDocument();
    expect(within(advancedFilters).queryByRole("menuitemradio", { name: "隐藏标签" })).not.toBeInTheDocument();
    await userEvent.click(refundTagOption);

    await waitFor(() => {
      expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          tagCode: "refund",
        }),
      );
    });
    expect(serviceMocks.getInsightOverview).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    advancedFilters = await screen.findByRole("menu", { name: /更多筛选/ });
    await userEvent.click(within(advancedFilters).getByRole("menuitem", { name: "实体" }));
    expect(await screen.findByRole("menuitemradio", { name: "白色羽绒服" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "黑色雨伞" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "隐藏实体" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    advancedFilters = await screen.findByRole("menu", { name: /更多筛选/ });
    await userEvent.click(within(advancedFilters).getByRole("menuitem", { name: /标签/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "全部标签" }));
    await userEvent.click(screen.getByRole("combobox", { name: "问题范围" }));
    await userEvent.click(await screen.findByRole("option", { name: "有客户问题" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          problemScope: "problem",
        }),
      );
    });

    await userEvent.click(screen.getByRole("combobox", { name: "问题范围" }));
    await userEvent.click(await screen.findByRole("option", { name: "未解决/部分解决" }));

    await waitFor(() => {
      expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          problemScope: "unresolved",
        }),
      );
    });

    await userEvent.click(screen.getAllByRole("button", { name: /查看详情/ })[0]);

    expect(await screen.findByText("洞察详情")).toBeInTheDocument();
    const detailDialog = screen.getByRole("dialog", { name: "洞察详情" });
    const insightRegion = screen.getByRole("region", { name: "洞察结论" });
    const conversationRegion = screen.getByRole("region", { name: "本轮对话" });
    expect(insightRegion).toBeInTheDocument();
    expect(conversationRegion).toBeInTheDocument();
    expect(within(detailDialog).getAllByRole("img", { name: "张三" }).length).toBeGreaterThan(0);
    expect(within(detailDialog).getAllByRole("img", { name: "客服一号" }).length).toBeGreaterThan(0);
    expect(within(detailDialog).getByText(/生成于/)).toBeInTheDocument();
    expect(within(detailDialog).queryByText("已完成")).not.toBeInTheDocument();
    expect(screen.getAllByText("物流异常").length).toBeGreaterThan(0);
    expect(screen.getAllByText("白色羽绒服").length).toBeGreaterThan(0);
    expect(screen.getByText("物流停滞怎么处理")).toBeInTheDocument();
    expect(screen.getAllByText("还没收到货，物流也不更新").length).toBeGreaterThan(0);
    expect(within(conversationRegion).getByText("客户问题")).toBeInTheDocument();
    expect(within(conversationRegion).getByText("客户问题")).toHaveAttribute(
      "title",
      expect.stringContaining("客户明确反馈物流不更新"),
    );
    expect(within(detailDialog).queryByText("2 条证据")).not.toBeInTheDocument();
    expect(within(detailDialog).queryByText("+1")).not.toBeInTheDocument();
    expect(within(insightRegion).queryByText("判定依据")).not.toBeInTheDocument();
    expect(within(insightRegion).queryByText("客户明确反馈物流不更新")).not.toBeInTheDocument();
    expect(within(insightRegion).queryByText("当前会话未确认物流处理结果")).not.toBeInTheDocument();
    expect(within(conversationRegion).queryByText("客户明确反馈物流不更新")).not.toBeInTheDocument();
    expect(within(conversationRegion).queryByText("当前会话未确认物流处理结果")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("history-message-item").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("link", { name: "跳转聊天" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看上下文" })).not.toBeInTheDocument();
    expect(serviceMocks.getInsightMessageContext).not.toHaveBeenCalled();
  });

  it("applies date range presets to insight overview queries", async () => {
    renderRoute("/chat/insights");

    expect(await screen.findByRole("heading", { level: 1, name: "会话数据总览" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /日期范围.*近7天/ }));
    expect(await screen.findByText("2026年5月")).toBeInTheDocument();
    expect(screen.getByText("2026年6月")).toBeInTheDocument();
    expect(screen.queryByText("2026年7月")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "昨天" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "近7天" }));
    expect(screen.getByText("2026年5月")).toBeInTheDocument();
    expect(screen.getByText("2026年6月")).toBeInTheDocument();
    expect(screen.queryByText("2026年7月")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "本月" }));
    expect(screen.getByText("2026年5月")).toBeInTheDocument();
    expect(screen.getByText("2026年6月")).toBeInTheDocument();
    expect(screen.queryByText("2026年7月")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "近7天" }));
    await userEvent.click(screen.getByRole("button", { name: "应用" }));

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
    expect(screen.getByRole("button", { name: /日期范围.*近7天.*2026-05-28.*2026-06-03/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /日期范围.*近7天/ }));
    await userEvent.click(await screen.findByRole("button", { name: "昨天" }));
    const yesterdayButton = screen.getByRole("button", { name: /2026年6月2日/ });
    expect(yesterdayButton).toHaveAttribute("data-range-single", "true");
    expect(yesterdayButton).toHaveClass("rounded-[10px]");
    expect(yesterdayButton).not.toHaveClass("rounded-r-none");
    expect(yesterdayButton).not.toHaveClass("rounded-l-none");
    await userEvent.click(screen.getByRole("button", { name: "应用" }));
    await waitFor(() => {
      expect(serviceMocks.getInsightOverview).toHaveBeenLastCalledWith({
        from: "2026-06-02T00:00:00.000+08:00",
        to: "2026-06-02T23:59:59.999+08:00",
      });
    });
    expect(screen.getByRole("button", { name: /日期范围.*昨天.*2026-06-02.*2026-06-02/ })).toBeInTheDocument();
    await applyDateRangePreset("本周", "2026-06-01", "2026-06-03");
    await applyDateRangePreset("上周", "2026-05-25", "2026-05-31");
    await applyDateRangePreset("本月", "2026-06-01", "2026-06-03");
    await applyDateRangePreset("上月", "2026-05-01", "2026-05-31");

    await userEvent.click(screen.getByRole("button", { name: /日期范围.*上月/ }));
    expect(
      document.querySelector("[data-outside='true'][aria-selected='true']:not([data-hidden='true'])"),
    ).not.toBeInTheDocument();
  });

  it("keeps advanced session filters inside the more filters dropdown", async () => {
    renderRoute("/chat/insights");

    expect(await screen.findByRole("heading", { level: 1, name: "会话数据总览" })).toBeInTheDocument();
    await waitFor(() => {
      expect(serviceMocks.getInsightSettings).toHaveBeenCalled();
    });

    expect(screen.getByRole("textbox", { name: "搜索问题摘要和诉求" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "解决状态" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "标签" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "实体" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "意图" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "分析状态" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    const advancedFilters = await screen.findByRole("menu", { name: /更多筛选/ });
    expect(within(advancedFilters).queryByRole("menuitemradio", { name: "退款咨询" })).not.toBeInTheDocument();
    await userEvent.click(within(advancedFilters).getByRole("menuitem", { name: "标签" }));
    const refundTagOption = await screen.findByRole("menuitemradio", { name: "退款咨询" });
    await userEvent.click(refundTagOption);

    await waitFor(() => {
      expect(serviceMocks.getInsightOverviewSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          tagCode: "refund",
        }),
      );
    });
    expect(screen.getByRole("button", { name: "更多筛选" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除筛选 标签：退款咨询" })).toBeInTheDocument();
  });

  it("keeps long advanced filter option labels on one line", async () => {
    renderRoute("/chat/insights");

    expect(await screen.findByRole("heading", { level: 1, name: "会话数据总览" })).toBeInTheDocument();
    await waitFor(() => {
      expect(serviceMocks.getInsightSettings).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    const advancedFilters = await screen.findByRole("menu", { name: /更多筛选/ });
    await userEvent.click(within(advancedFilters).getByRole("menuitem", { name: "意图" }));

    const longIntentOption = await screen.findByRole("menuitemradio", {
      name: "咨询AI客服系统相关信息",
    });
    expect(within(longIntentOption).getByText("咨询AI客服系统相关信息")).toHaveClass("truncate");
  });

  it("starts a new custom date range when clicking the calendar after a complete range is selected", async () => {
    renderRoute("/chat/insights");

    expect(await screen.findByRole("heading", { level: 1, name: "会话数据总览" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /日期范围.*近7天/ }));
    await userEvent.click(screen.getByRole("button", { name: /2026年5月10日/ }));
    expect(screen.getByRole("button", { name: "应用" })).toBeDisabled();
    expect(screen.getByText("请选择完整范围")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2026年6月9日/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /2026年6月10日/ })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /2026年5月12日/ }));
    expect(screen.getByRole("button", { name: /2026年5月10日/ })).toHaveClass("rounded-l-[10px]");
    expect(screen.getByRole("button", { name: /2026年5月10日/ })).toHaveClass("rounded-r-none");
    expect(screen.getByRole("button", { name: /2026年5月11日/ })).toHaveClass("rounded-none");
    expect(screen.getByRole("button", { name: /2026年5月12日/ })).toHaveClass("rounded-l-none");
    expect(screen.getByRole("button", { name: /2026年5月12日/ })).toHaveClass("rounded-r-[10px]");
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

  it("renders quality problem list and agent report", async () => {
    renderRoute("/chat/insights/quality?resolutionStatus=unresolved");

    expect(await screen.findByRole("heading", { name: "服务质检" })).toBeInTheDocument();
    expect(screen.getByText("客户问题是否解决")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "问题列表" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "客服报表" })).toBeInTheDocument();
    expect(screen.getByText("无需客服处理")).toBeInTheDocument();
    expect(screen.queryByText("无明确问题")).not.toBeInTheDocument();
    expect(screen.getByText("客户反馈物流异常")).toBeInTheDocument();
    expect(screen.getAllByText("售后/物流/退款进度未确认").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "张三" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "客服一号" })).toBeInTheDocument();
    expect(screen.queryByText("会话 301")).not.toBeInTheDocument();
    expect(screen.queryByText("客户咨询退款到账时间")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "全部问题" }));

    expect(screen.getByText("客户咨询退款到账时间")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "客服报表" }));

    expect(screen.getByRole("columnheader", { name: "客服账号" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "接待会话数" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "客户问题数" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "质检通过数" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "质检未通过数" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "质检通过率" })).toBeInTheDocument();
    expect(screen.getByText("企微小助手1号")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "企微小助手1号" })).toBeInTheDocument();
    expect(screen.getByText("85.71%")).toBeInTheDocument();
  });

  it("updates follow-up status manually", async () => {
    renderRoute("/chat/insights/follow-ups");

    expect(await screen.findByRole("heading", { name: "待处理" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "张三" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "标记完成" }));

    await waitFor(() => {
      expect(serviceMocks.updateInsightActionStatus).toHaveBeenCalledWith("801", "done");
    });
  });

  it("renders admin settings and P1 placeholders", async () => {
    renderRoute("/chat/insights/settings");

    expect(await screen.findByRole("heading", { name: "洞察配置" })).toBeInTheDocument();
    expect(screen.getAllByText("洞察策略")[0]).toBeInTheDocument();
    expect(screen.getByText("会话切分规则")).toBeInTheDocument();
    expect(screen.queryByText("实时客服")).not.toBeInTheDocument();
    expect(screen.queryByText("私域运营")).not.toBeInTheDocument();
    expect(screen.queryByText("自定义")).not.toBeInTheDocument();
    expect(screen.getByText("未完结会话提前分析")).toBeInTheDocument();
    expect(screen.getByText("未完结会话分析频率")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    await userEvent.click(screen.getByRole("combobox", { name: "未完结会话分析频率" }));
    const frequencyListbox = await screen.findByRole("listbox");
    expect(within(frequencyListbox).getByText("标准（推荐）")).toBeInTheDocument();
    expect(within(frequencyListbox).getByText("较快")).toBeInTheDocument();
    expect(within(frequencyListbox).getByText("高频")).toBeInTheDocument();
    expect(within(frequencyListbox).getByText("兼顾时效性和成本")).toBeInTheDocument();
    expect(within(frequencyListbox).getByText("追求更优的时效性，成本略有提升")).toBeInTheDocument();
    expect(within(frequencyListbox).getByText("更早发现风险和待办，对成本不敏感时开启")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("combobox", { name: "单轮会话最长持续" }));
    expect(await screen.findByRole("option", { name: "2 小时" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "24 小时" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "48 小时" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("combobox", { name: "会话结束后多久生成最终结果" }));
    expect(await screen.findByRole("option", { name: "5 分钟" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "立即" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("switch", { name: "未完结会话提前分析" }));
    expect(screen.queryByText("未完结会话分析频率")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();

    await userEvent.click(screen.getByRole("tab", { name: "意图配置" }));
    expect(screen.getByText("客户咨询物流或发货进度")).toBeInTheDocument();
    expect(screen.getByRole("table").parentElement).not.toHaveClass("rounded-[8px]", "border");
    await userEvent.click(screen.getByRole("button", { name: "新增意图" }));
    expect(await screen.findByRole("dialog", { name: "新增意图" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("意图名称"), "价格咨询");
    await userEvent.type(screen.getByLabelText("意图编码"), "price_consult");
    await userEvent.click(screen.getByRole("combobox", { name: "权重" }));
    await userEvent.click(await screen.findByRole("option", { name: "3" }));
    await userEvent.type(screen.getByLabelText("别名"), "报价");
    await userEvent.type(screen.getByLabelText("判定标准"), "客户咨询商品价格或优惠");
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
    expect(screen.getByRole("table").parentElement).not.toHaveClass("rounded-[8px]", "border");

    await userEvent.click(screen.getByRole("tab", { name: "标签体系" }));
    expect(screen.getAllByText("标签体系")).toHaveLength(1);
    expect(screen.getByRole("table").parentElement).not.toHaveClass("rounded-[8px]", "border");
    await userEvent.click(screen.getByRole("button", { name: "新增标签" }));
    expect(await screen.findByRole("dialog", { name: "新增标签" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("标签名称"), "高意向");
    await userEvent.type(screen.getByLabelText("标签编码"), "high_intent");
    await userEvent.type(screen.getByLabelText("判定标准"), "客户表达明确购买意向");
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

    cleanup();
    mockSession("admin");
    installInsightMocks();
    renderRoute("/chat/insights/business");

    expect(await screen.findByRole("heading", { level: 1, name: "经营洞察" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /日期范围.*近7天.*2026-05-28.*2026-06-03/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("开始日期")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("结束日期")).not.toBeInTheDocument();
    expect(serviceMocks.getInsightBusiness).toHaveBeenCalledWith({
      from: "2026-05-28T00:00:00.000+08:00",
      to: "2026-06-03T23:59:59.999+08:00",
    });
    await waitFor(() => {
      expect(serviceMocks.getInsightBusinessRelatedSessions).toHaveBeenCalledWith(
        expect.objectContaining({
          dimension: "intent",
          from: "2026-05-28T00:00:00.000+08:00",
          page: 1,
          pageSize: 20,
          topicCode: "logistics_delay",
          to: "2026-06-03T23:59:59.999+08:00",
        }),
      );
    });
    expect(serviceMocks.getInsightOverview).not.toHaveBeenCalledWith({
      from: "2026-05-28T00:00:00.000+08:00",
      to: "2026-06-03T23:59:59.999+08:00",
    });
    expect(screen.getByRole("heading", { name: "客户意图 Top10" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "客户意图分布趋势" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "相关会话" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "客户意图 Top10" })).toBeInTheDocument();
    expect(screen.queryByText("关注点会话")).not.toBeInTheDocument();
    expect(screen.queryByText("未解决会话")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "关注点趋势" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "关注点列表" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /客户意图/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /业务标签/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /实体对象/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /链接文件/ })).toBeInTheDocument();
    expect(screen.getAllByText("物流异常").length).toBeGreaterThan(0);

    const relatedSessionsTable = screen.getByRole("table", { name: "相关会话" });
    expect(within(relatedSessionsTable).getByText("客户反馈物流异常")).toBeInTheDocument();
    expect(within(relatedSessionsTable).getByRole("img", { name: "张三" })).toBeInTheDocument();
    expect(within(relatedSessionsTable).getByRole("img", { name: "客服一号" })).toBeInTheDocument();
    expect(within(relatedSessionsTable).queryByText("客户咨询退款到账时间")).not.toBeInTheDocument();

    expect(screen.queryByRole("combobox", { name: "来源" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "排序" })).not.toBeInTheDocument();
    expect(screen.queryByText("筛选")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /实体对象/ }));
    expect(screen.getByRole("heading", { name: "实体对象 Top10" })).toBeInTheDocument();
    expect(screen.getAllByText("白色羽绒服").length).toBeGreaterThan(0);

    await userEvent.type(screen.getByRole("textbox", { name: "搜索相关会话" }), "物流异常");
    expect(within(relatedSessionsTable).getByText("客户反馈物流异常")).toBeInTheDocument();

    await userEvent.click(within(relatedSessionsTable).getByRole("button", { name: "查看详情" }));

    expect(await screen.findByText("洞察详情")).toBeInTheDocument();
    expect(screen.getByText("未确认物流进展")).toBeInTheDocument();
    expect(screen.queryByText("后续版本接入")).not.toBeInTheDocument();
  });

  it("validates required insight configuration dialog fields before submit", async () => {
    renderRoute("/chat/insights/settings");

    expect(await screen.findByRole("heading", { name: "洞察配置" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "意图配置" }));
    await userEvent.click(screen.getByRole("button", { name: "新增意图" }));
    expect(await screen.findByRole("dialog", { name: "新增意图" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findAllByText("请填写必填项")).toHaveLength(3);
    expect(serviceMocks.createInsightIntentConfig).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "取消" }));

    await userEvent.click(screen.getByRole("tab", { name: "标签体系" }));
    await userEvent.click(screen.getByRole("button", { name: "新增标签" }));
    expect(await screen.findByRole("dialog", { name: "新增标签" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findAllByText("请填写必填项")).toHaveLength(3);
    expect(serviceMocks.createInsightLabelConfig).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "取消" }));

    await userEvent.click(screen.getByRole("tab", { name: "质检规则" }));
    await userEvent.click(screen.getByRole("button", { name: "新增规则" }));
    expect(await screen.findByRole("dialog", { name: "新增规则" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findAllByText("请填写必填项")).toHaveLength(3);
    expect(serviceMocks.createInsightQaRuleConfig).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "取消" }));

    await userEvent.click(screen.getByRole("tab", { name: "实体词库" }));
    await userEvent.click(screen.getByRole("button", { name: "新增实体" }));
    expect(await screen.findByRole("dialog", { name: "新增实体" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findAllByText("请填写必填项")).toHaveLength(2);
    expect(serviceMocks.createInsightEntityDictionaryItem).not.toHaveBeenCalled();
  });

  it("shows table loading states while overview and business sessions are loading", async () => {
    serviceMocks.getInsightOverviewSessions.mockImplementation(() => new Promise(() => undefined));
    renderRoute("/chat/insights");

    expect(await screen.findByRole("heading", { level: 1, name: "会话数据总览" })).toBeInTheDocument();
    const overviewTable = screen.getByRole("table", { name: "逻辑会话明细" });
    expect(within(overviewTable).getByRole("status", { name: "正在加载会话" })).toBeInTheDocument();

    cleanup();
    mockSession("admin");
    installInsightMocks();
    serviceMocks.getInsightBusinessRelatedSessions.mockImplementation(() => new Promise(() => undefined));
    renderRoute("/chat/insights/business");

    expect(await screen.findByRole("heading", { level: 1, name: "经营洞察" })).toBeInTheDocument();
    const relatedSessionsTable = screen.getByRole("table", { name: "相关会话" });
    expect(within(relatedSessionsTable).getByRole("status", { name: "正在加载会话" })).toBeInTheDocument();
  });

  it("hides settings content for non-admin users", async () => {
    mockSession("operator");
    renderRoute("/chat/insights/settings");

    expect(await screen.findByText("仅管理员可查看洞察配置")).toBeInTheDocument();
  });
});
