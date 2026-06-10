import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  InsightActionStatusSchema,
  InsightAnalysisPolicyUpdateRequestSchema,
  InsightBusinessTopicSchema,
  InsightBusinessTrendPointSchema,
  InsightBusinessTopicsResponseSchema,
  InsightEntityDictionaryMutationRequestSchema,
  InsightDetailResponseSchema,
  InsightFilterOptionsResponseSchema,
  InsightIntentConfigMutationRequestSchema,
  InsightLabelConfigMutationRequestSchema,
  InsightOverviewSessionsResponseSchema,
  InsightQaRuleConfigMutationRequestSchema,
  InsightRescanTaskListResponseSchema,
  InsightSettingsResponseSchema,
  InsightSettingsSummaryResponseSchema,
  InsightSessionMessagesResponseSchema,
  InsightSessionizationSettingsUpdateRequestSchema,
  InsightsFollowUpsResponseSchema,
  InsightsOverviewResponseSchema,
  InsightsQualityAgentStatsResponseSchema,
  InsightsQualityOverviewResponseSchema,
  InsightsQualityResultsResponseSchema,
  InsightsRescanRequestSchema,
} from "../src/insights/dto";

describe("insights DTOs", () => {
  it("accepts overview responses with statistics only", () => {
    expect(
      Value.Check(InsightsOverviewResponseSchema, {
        actionItemsOpen: 7,
        analysis: {
          failed: 1,
          partial: 2,
          ready: 30,
          stale: 3,
        },
        problemSessions: 20,
        readySessions: 30,
        resolution: {
          noCustomerProblem: 10,
          partiallyResolved: 3,
          resolved: 6,
          unknown: 16,
          unresolved: 1,
        },
        totalSessions: 36,
        totals: {
          agentMessages: 120,
          consultingCustomers: 28,
          customerMessages: 180,
          logicalSessions: 36,
          messages: 300,
        },
        comparison: {
          agentMessages: {
            current: 120,
            delta: 30,
            deltaRate: 0.3333333333333333,
            previous: 90,
          },
          consultingCustomers: {
            current: 28,
            delta: -2,
            deltaRate: -0.06666666666666667,
            previous: 30,
          },
          customerMessages: {
            current: 180,
            delta: 0,
            deltaRate: 0,
            previous: 180,
          },
          logicalSessions: {
            current: 36,
            delta: 6,
            deltaRate: 0.2,
            previous: 30,
          },
          messages: {
            current: 300,
            delta: 50,
            deltaRate: 0.2,
            previous: 250,
          },
        },
        trend: [
          {
            agentMessages: 50,
            consultingCustomers: 12,
            customerMessages: 80,
            date: "2026-06-01",
            logicalSessions: 16,
            messages: 130,
          },
        ],
        unresolvedSessions: 4,
      }),
    ).toBe(true);
  });

  it("accepts overview session list responses separately", () => {
    expect(
      Value.Check(InsightOverviewSessionsResponseSchema, {
        items: [
          {
            analysisStatus: "ready",
            conversationId: "301",
            customerName: "张三",
            resolutionStatus: "unresolved",
            sessionId: "session-1",
            startedAt: 1780243200000,
            summarySessionTitle: "退款进度咨询",
          },
        ],
        page: 1,
        pageSize: 20,
        total: 36,
        totalPages: 2,
      }),
    ).toBe(true);
  });

  it("accepts per-dimension business topic responses", () => {
    expect(
      Value.Check(InsightBusinessTopicsResponseSchema, {
        dimension: "asset",
        intentTrend: [],
        topics: [
          {
            code: "701",
            dimension: "asset",
            mentionCount: 6,
            name: "红包活动",
            sessionCount: 5,
            share: 0.25,
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
      }),
    ).toBe(true);
    expect(InsightBusinessTopicSchema.properties).not.toHaveProperty("actionItemsOpen");
    expect(InsightBusinessTopicSchema.properties).not.toHaveProperty("negativeRate");
    expect(InsightBusinessTopicSchema.properties).not.toHaveProperty("negativeSessions");
    expect(InsightBusinessTopicsResponseSchema.properties.totals.properties).not.toHaveProperty("negativeSessions");
    expect(InsightBusinessTrendPointSchema.properties).not.toHaveProperty("negativeSessions");
    expect(InsightBusinessTopicSchema.properties).not.toHaveProperty("unresolvedRate");
    expect(InsightBusinessTopicSchema.properties).not.toHaveProperty("unresolvedSessions");
  });

  it("accepts split quality responses with required blocks", () => {
    const overview = {
      analyzedSessions: 9,
      inspectedSessions: 8,
      inspectionRate: 0.8,
      noCustomerProblem: 2,
      partial: 1,
      passRate: 0.75,
      problemSessions: 7,
      resolved: 5,
      ruleDistribution: [
        { count: 2, ruleCode: "reply_quality", ruleName: "回复质量" },
      ],
      totalSessions: 10,
      unresolved: 1,
    };
    const agentStats = [
      {
        agentName: "客服一号",
        agentSeatId: "101",
        failedSessions: 2,
        inspectedSessions: 6,
        passedSessions: 4,
        totalSessions: 8,
        passRate: 4 / 6,
      },
    ];
    const qualityResults = [
      {
        agentName: "客服一号",
        conversationId: "301",
        customerName: "张三",
        passed: false,
        passedRules: 2,
        rules: [
          {
            passed: false,
            ruleCode: "reply_quality",
            ruleName: "回复质量",
          },
          {
            passed: true,
            ruleCode: "clear_next_step",
            ruleName: "明确下一步",
          },
          { passed: true, ruleCode: "tone", ruleName: "服务语气" },
        ],
        sessionId: "session-1",
        startedAt: 1780243200000,
        summary: "客户咨询退款处理进度，客服未确认后续状态",
        totalRules: 3,
      },
    ];
    const qualityResultsPage = {
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    };

    expect(Value.Check(InsightsQualityOverviewResponseSchema, { overview })).toBe(true);
    expect(Value.Check(InsightsQualityAgentStatsResponseSchema, { agentStats })).toBe(true);
    expect(Value.Check(InsightsQualityResultsResponseSchema, { qualityResultsPage, qualityResults })).toBe(true);
  });

  it("accepts follow-up action statuses and rejects unknown status", () => {
    expect(Value.Check(InsightActionStatusSchema, "open")).toBe(true);
    expect(Value.Check(InsightActionStatusSchema, "done")).toBe(true);
    expect(Value.Check(InsightActionStatusSchema, "dismissed")).toBe(true);
    expect(Value.Check(InsightActionStatusSchema, "closed")).toBe(false);

    expect(
      Value.Check(InsightsFollowUpsResponseSchema, {
        items: [
          {
            actionItemId: "act-1",
            conversationId: "301",
            createdAt: 1780243000000,
            customerName: "张三",
            priority: "high",
            sessionId: "session-1",
            status: "open",
            title: "确认退款进度并回复客户",
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      }),
    ).toBe(true);
    expect(
      Value.Check(InsightsFollowUpsResponseSchema, {
        items: [
          {
            actionItemId: "act-1",
            actionType: "follow_up",
            conversationId: "301",
            createdAt: 1780243000000,
            customerName: "张三",
            priority: "high",
            sessionId: "session-1",
            status: "open",
            title: "确认退款进度并回复客户",
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      }),
    ).toBe(false);
    expect(
      Value.Check(InsightsFollowUpsResponseSchema, {
        items: [
          {
            actionItemId: "act-1",
            conversationId: "301",
            createdAt: 1780243000000,
            customerName: "张三",
            priority: "high",
            reason: "客户仍在追问退款进度",
            sessionId: "session-1",
            status: "open",
            title: "确认退款进度并回复客户",
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      }),
    ).toBe(false);
    expect(
      Value.Check(InsightsFollowUpsResponseSchema, {
        items: [
          {
            actionItemId: "act-1",
            conversationId: "301",
            createdAt: 1780243000000,
            customerName: "张三",
            evidenceMessageIds: ["9001"],
            priority: "high",
            sessionId: "session-1",
            status: "open",
            title: "确认退款进度并回复客户",
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      }),
    ).toBe(false);
    expect(
      Value.Check(InsightsFollowUpsResponseSchema, {
        items: [
          {
            actionItemId: "act-1",
            conversationId: "301",
            createdAt: 1780243000000,
            customerName: "张三",
            lastCustomerMessageAt: 1780243200000,
            priority: "high",
            sessionId: "session-1",
            status: "open",
            title: "确认退款进度并回复客户",
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      }),
    ).toBe(false);
  });

  it("accepts detail responses without embedded conversation messages", () => {
    expect(
      Value.Check(InsightDetailResponseSchema, {
        actionItems: [],
        analysisStatus: "ready",
        currentSnapshotId: "snapshot-1",
        entities: [],
        evidenceItems: [
          {
            dimensionType: "problem_resolution",
            evidenceRole: "customer_problem",
            messageId: "9001",
            reason: "客户明确询问退款进度",
          },
        ],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0.9,
          evidenceMessageIds: ["9001"],
          problemDetected: true,
          problemSummary: "客户询问退款进度",
          resolutionStatus: "unresolved",
          unresolvedReason: "客服未确认进度",
        },
        qaFindings: [
          {
            evidenceMessageIds: ["9001"],
            passed: false,
            reason: "未确认退款进度",
            ruleCode: "problem_resolution",
            ruleName: "客户问题是否解决",
          },
        ],
        sentiment: [],
        session: {
          conversationId: "301",
          customerName: "张三",
          generatedAt: 1780245000000,
          phase: "live",
          sessionId: "session-1",
          startedAt: 1780240000000,
        },
        summary: {
          sessionTitle: "退款进度咨询",
          text: "客户追问退款进度，客服尚未给出明确进度。",
        },
        tags: [],
      }),
    ).toBe(true);
    expect(
      Value.Check(InsightDetailResponseSchema, {
        actionItems: [],
        analysisStatus: "ready",
        currentSnapshotId: "snapshot-1",
        entities: [],
        evidenceItems: [],
        evidenceMessageRecords: [],
        evidenceMessages: [],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0.9,
          evidenceMessageIds: [],
          problemDetected: false,
          problemSummary: "",
          resolutionStatus: "unknown",
        },
        qaFindings: [],
        risks: [],
        sentiment: [],
        session: {
          conversationId: "301",
          customerName: "张三",
          generatedAt: 1780245000000,
          phase: "live",
          sessionId: "session-1",
          startedAt: 1780240000000,
        },
        sessionMessageRecords: [],
        summary: {
          customerIntent: "询问退款进度",
          followUp: "确认退款状态后回复客户",
          processSummary: "客户追问退款，客服尚未给出进度",
          resultSummary: "未解决",
        },
        tags: [],
      }),
    ).toBe(false);
  });

  it("accepts session message responses separately from detail responses", () => {
    expect(
      Value.Check(InsightSessionMessagesResponseSchema, {
        messages: [
          {
            content: { text: "退款什么时候到账？" },
            contentType: "text",
            conversationId: "301",
            customerId: "customer-1",
            messageId: "external-msg-9001",
            seatId: "seat-1",
            senderType: "customer",
            seq: 9001,
            status: "sent",
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts seed-backed settings responses and rescan requests", () => {
    expect(
      Value.Check(InsightSettingsResponseSchema, {
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
            id: "1",
            includeInAggregation: true,
            status: 1,
          },
        ],
        featureConfig: {
          entityEnabled: true,
          insightEnabled: false,
          intentEnabled: true,
          labelEnabled: true,
          qaEnabled: true,
          todoEnabled: false,
        },
        intentConfigs: [
          {
            aliases: ["退款", "退钱"],
            description: "客户咨询退款、退货退款或退款到账问题",
            id: "1",
            includeInStatistics: true,
            intentCode: "after_sale.refund",
            intentName: "退款咨询",
            negativeExamples: ["只咨询发货时间"],
            positiveExamples: ["退款什么时候到账"],
            status: 1,
            weight: 8,
          },
        ],
        labelConfigs: [
          {
            id: "1",
            includeInStatistics: true,
            labelCode: "price_sensitive",
            labelName: "价格敏感",
            status: 1,
          },
        ],
        qaRuleConfigs: [
          {
            id: "1",
            ruleCode: "problem_resolution",
            ruleName: "客户问题是否解决",
            severity: "high",
            status: 1,
          },
        ],
        sessionization: {
          analysisDelayMinutes: 10,
          hardMaxDurationHours: 8,
          idleTimeoutMinutes: 120,
          lateArrivalWindowMinutes: 30,
          preset: "custom",
        },
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightsRescanRequestSchema, {
        analysisScope: "qaFindings",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-02T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      Value.Check(InsightsRescanRequestSchema, {
        analysisScope: "classification",
        from: "2026-06-01T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      Value.Check(InsightsRescanRequestSchema, {
        analysisScope: "sentiment",
        from: "2026-06-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("accepts compact insight filter options", () => {
    expect(
      Value.Check(InsightFilterOptionsResponseSchema, {
        entities: [{ id: "41", name: "白色羽绒服" }],
        intents: [{ id: "1", name: "产品咨询" }],
        tags: [{ id: "11", name: "高意向" }],
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightFilterOptionsResponseSchema, {
        intents: [
          {
            code: "product_consult",
            description: "不应该返回配置详情",
            id: "1",
            name: "产品咨询",
          },
        ],
        entities: [],
        tags: [],
      }),
    ).toBe(false);
  });

  it("accepts rescan task list responses", () => {
    expect(
      Value.Check(InsightRescanTaskListResponseSchema, {
        items: [
          {
            analysisScope: "classification",
            createTime: 1_780_243_200_000,
            createdBy: "客服主管",
            failedSessions: 2,
            finishedAt: 1_780_246_800_000,
            from: "2026-06-01T00:00:00.000Z",
            progressText: "20 / 20",
            queuedSessions: 20,
            startedAt: 1_780_243_300_000,
            status: "partial",
            succeededSessions: 18,
            taskId: "901",
            to: "2026-06-02T00:00:00.000Z",
            totalSessions: 20,
            updateTime: 1_780_246_800_000,
          },
        ],
        total: 1,
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightSettingsSummaryResponseSchema, {
        enabledIntentCount: 2,
        intentLimit: 20,
        intentSoftLimit: 15,
        enabledLabelCount: 3,
        labelLimit: 20,
        labelSoftLimit: 15,
        enabledQaCount: 1,
        qaLimit: 10,
        qaSoftLimit: 8,
        enabledEntityCount: 2,
        entityLimit: 20,
        entitySoftLimit: 15,
        entityEnabled: true,
        insightAvailable: true,
        insightEnabled: false,
        intentEnabled: true,
        labelEnabled: true,
        qaEnabled: true,
        todoEnabled: false,
      }),
    ).toBe(true);
  });

  it("accepts insight configuration mutation requests", () => {
    expect(
      Value.Check(InsightSessionizationSettingsUpdateRequestSchema, {
        analysisDelayMinutes: 10,
        hardMaxDurationHours: 8,
        idleTimeoutMinutes: 90,
        lateArrivalWindowMinutes: 20,
        preset: "custom",
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightAnalysisPolicyUpdateRequestSchema, {
        finalAnalysisEnabled: true,
        liveAnalysisEnabled: true,
        liveMinIntervalMinutes: 8,
        liveMinNewMeaningfulMessages: 5,
        lowConfidenceThreshold: 0.55,
        minAnalysisMessages: 5,
        ruleFallbackEnabled: true,
      }),
    ).toBe(true);
    expect(
      Value.Check(InsightAnalysisPolicyUpdateRequestSchema, {
        finalAnalysisEnabled: true,
        liveAnalysisEnabled: true,
        liveMinIntervalMinutes: 8,
        liveMinNewMeaningfulMessages: 5,
        lowConfidenceThreshold: 0.55,
        ruleFallbackEnabled: true,
      }),
    ).toBe(false);
    expect(
      Value.Check(InsightAnalysisPolicyUpdateRequestSchema, {
        finalAnalysisEnabled: true,
        liveAnalysisEnabled: true,
        liveMinIntervalMinutes: 8,
        liveMinNewMeaningfulMessages: 5,
        lowConfidenceThreshold: 0.55,
        minAnalysisMessages: 0,
        ruleFallbackEnabled: true,
      }),
    ).toBe(false);

    expect(
      Value.Check(InsightLabelConfigMutationRequestSchema, {
        description: "客户对价格较敏感",
        includeInStatistics: true,
        labelCode: "price_sensitive",
        labelName: "价格敏感",
        negativeExamples: ["只问库存"],
        positiveExamples: ["太贵了"],
        status: 1,
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightIntentConfigMutationRequestSchema, {
        aliases: ["退款", "退钱"],
        description: "客户咨询退款、退货退款或退款到账问题",
        includeInStatistics: true,
        intentCode: "after_sale.refund",
        intentName: "退款咨询",
        negativeExamples: ["只咨询发货时间"],
        positiveExamples: ["退款什么时候到账"],
        status: 1,
        weight: 8,
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightQaRuleConfigMutationRequestSchema, {
        applicableScene: "售后",
        judgmentCriteria: "客户问题需要有明确处理结果",
        ruleCode: "problem_resolution",
        ruleName: "客户问题是否解决",
        severity: "high",
        status: 1,
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightEntityDictionaryMutationRequestSchema, {
        aliases: ["直播间羽绒服"],
        attributes: { brand: "A" },
        entityCode: "white-coat",
        entityName: "白色羽绒服",
        includeInAggregation: true,
        status: 1,
      }),
    ).toBe(true);
  });
});
