import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { routerConfig } from "@/router";
import { useAuthStore } from "@/store/auth-store";

const serviceMocks = vi.hoisted(() => ({
  createInsightRescanJob: vi.fn(),
  getInsightDetail: vi.fn(),
  getInsightFollowUps: vi.fn(),
  getInsightOverview: vi.fn(),
  getInsightQuality: vi.fn(),
  getInsightSettings: vi.fn(),
  updateInsightActionStatus: vi.fn(),
}));

vi.mock("@/pages/chat/insights/api/insights-service", () => serviceMocks);

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
    ],
    negativeSessions: 4,
    problemSessions: 11,
    readySessions: 18,
    totalSessions: 22,
    unresolvedSessions: 5,
  });
  serviceMocks.getInsightQuality.mockResolvedValue({
    agentStats: [],
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
        agentName: "客服一号",
        conversationId: "301",
        customerName: "张三",
        evidenceMessageIds: ["9001", "9002"],
        lastCustomerMessageAt: 1_780_244_100_000,
        problemSummary: "客户反馈物流异常",
        resolutionStatus: "unresolved",
        sessionId: "501",
        severity: "high",
        unresolvedReason: "售后/物流/退款进度未确认",
      },
    ],
  });
  serviceMocks.getInsightFollowUps.mockResolvedValue({
    items: [
      {
        actionItemId: "801",
        actionType: "logistics_check",
        conversationId: "301",
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
      conversationId: "301",
      customerName: "张三",
      endedAt: 1_780_245_000_000,
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
  serviceMocks.getInsightSettings.mockResolvedValue({
    analysisPolicy: {
      finalAnalysisEnabled: true,
      liveAnalysisEnabled: true,
      liveMinIntervalMinutes: 10,
      liveMinNewMeaningfulMessages: 6,
      lowConfidenceThreshold: 0.6,
      ruleFallbackEnabled: true,
    },
    entityDictionary: [
      {
        aliases: ["白鸭绒外套"],
        canonicalName: "白色羽绒服",
        enabled: true,
        entityType: "product",
        includeInAggregation: true,
      },
    ],
    labelConfigs: [
      {
        enabled: true,
        includeInStatistics: true,
        labelCode: "price_sensitive",
        labelName: "价格敏感",
      },
    ],
    qaRuleConfigs: [
      {
        enabled: true,
        ruleCode: "problem_resolution",
        ruleName: "客户问题是否解决",
        severity: "high",
      },
    ],
    riskConfigs: [
      {
        enabled: true,
        priorityBoost: 10,
        riskCode: "bad_review",
        riskName: "差评风险",
        severity: "high",
      },
    ],
    sessionization: {
      analysisDelayMinutes: 10,
      hardMaxDurationHours: 48,
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
}

describe("conversation insights pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession("admin");
    installInsightMocks();
  });

  it("renders overview navigation, metrics and detail evidence", async () => {
    renderRoute("/chat/insights");

    expect(await screen.findByRole("heading", { name: "总览" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /服务质检/ })).toHaveAttribute("href", "/chat/insights/quality");
    expect(screen.getByText("逻辑会话数")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();
    expect(screen.getAllByText("白色羽绒服").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /查看高风险会话/ }));

    expect(await screen.findByText("洞察详情")).toBeInTheDocument();
    expect(screen.getAllByText("物流异常").length).toBeGreaterThan(0);
    expect(screen.getAllByText("白色羽绒服").length).toBeGreaterThan(0);
    expect(screen.getByText("物流停滞怎么处理")).toBeInTheDocument();
    expect(screen.getByText("还没收到货，物流也不更新")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "跳转聊天" })).toHaveAttribute(
      "href",
      "/chat?conversationId=301&messageId=9002",
    );
  });

  it("renders quality unresolved sessions", async () => {
    renderRoute("/chat/insights/quality?resolutionStatus=unresolved");

    expect(await screen.findByRole("heading", { name: "服务质检" })).toBeInTheDocument();
    expect(screen.getByText("客户问题是否解决")).toBeInTheDocument();
    expect(screen.getByText("客户反馈物流异常")).toBeInTheDocument();
    expect(screen.getAllByText("售后/物流/退款进度未确认").length).toBeGreaterThan(0);
  });

  it("updates follow-up status manually", async () => {
    renderRoute("/chat/insights/follow-ups");

    expect(await screen.findByRole("heading", { name: "待处理" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "标记完成" }));

    await waitFor(() => {
      expect(serviceMocks.updateInsightActionStatus).toHaveBeenCalledWith("801", "done");
    });
  });

  it("renders admin settings and P1 placeholders", async () => {
    renderRoute("/chat/insights/settings");

    expect(await screen.findByRole("heading", { name: "洞察配置" })).toBeInTheDocument();
    expect(screen.getByText("切片策略")).toBeInTheDocument();
    expect(screen.getByText("客户问题是否解决")).toBeInTheDocument();

    cleanup();
    mockSession("admin");
    installInsightMocks();
    renderRoute("/chat/insights/business");

    expect(await screen.findByRole("heading", { level: 1, name: "经营洞察" })).toBeInTheDocument();
    expect(screen.getByText("后续版本接入")).toBeInTheDocument();
  });

  it("hides settings content for non-admin users", async () => {
    mockSession("operator");
    renderRoute("/chat/insights/settings");

    expect(await screen.findByText("仅管理员可查看洞察配置")).toBeInTheDocument();
  });
});
