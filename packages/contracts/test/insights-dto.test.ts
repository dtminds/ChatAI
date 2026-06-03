import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  InsightActionStatusSchema,
  InsightAnalysisPolicyUpdateRequestSchema,
  InsightEntityDictionaryMutationRequestSchema,
  InsightDetailResponseSchema,
  InsightLabelConfigMutationRequestSchema,
  InsightQaRuleConfigMutationRequestSchema,
  InsightSettingsResponseSchema,
  InsightSessionizationSettingsUpdateRequestSchema,
  InsightsBusinessResponseSchema,
  InsightsFollowUpsResponseSchema,
  InsightsOverviewResponseSchema,
  InsightsQualityResponseSchema,
  InsightsRescanRequestSchema,
} from "../src/insights/dto";

describe("insights DTOs", () => {
  it("accepts overview responses with priority queue and analysis status", () => {
    expect(
      Value.Check(InsightsOverviewResponseSchema, {
        actionItemsOpen: 7,
        analysis: {
          failed: 1,
          partial: 2,
          ready: 30,
          stale: 3,
        },
        entityHotspots: [
          {
            entityId: "entity-1",
            entityName: "白色羽绒服",
            entityType: "product",
            mentionCount: 12,
            negativeCount: 2,
            riskSessionCount: 1,
            sessionCount: 8,
          },
        ],
        highRiskSessions: 3,
        intentDistribution: [
          {
            count: 10,
            intentCode: "after_sale.refund",
            intentLabel: "退款",
          },
        ],
        negativeSessions: 5,
        problemSessions: 20,
        readySessions: 30,
        sessions: [
          {
            agentMessageCount: 3,
            analysisStatus: "ready",
            conversationId: "301",
            customerMessageCount: 5,
            customerName: "张三",
            messageCount: 8,
            resolutionStatus: "unresolved",
            sessionId: "session-1",
            startedAt: 1780243200000,
            summaryCustomerIntent: "退款咨询",
          },
        ],
        totalSessions: 36,
        totals: {
          agentMessages: 120,
          consultingCustomers: 28,
          customerMessages: 180,
          logicalSessions: 36,
          messages: 300,
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

  it("accepts business topic analytics responses", () => {
    expect(
      Value.Check(InsightsBusinessResponseSchema, {
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
            negativeRate: 0.25,
            negativeSessions: 2,
            sessionCount: 8,
            share: 0.4,
            type: "product",
            unresolvedRate: 0.125,
            unresolvedSessions: 1,
          },
        ],
        intentDistribution: [
          {
            actionItemsOpen: 0,
            code: "after_sale.refund",
            dimension: "intent",
            mentionCount: 10,
            name: "退款",
            negativeRate: 0.1,
            negativeSessions: 1,
            sessionCount: 10,
            share: 0.5,
            unresolvedRate: 0.2,
            unresolvedSessions: 2,
          },
        ],
        qualityTopics: [],
        tagDistribution: [],
        totals: {
          actionItemsOpen: 3,
          analyzedSessions: 30,
          assetMentions: 6,
          entityMentions: 12,
          intentMentions: 10,
          negativeSessions: 5,
          tagMentions: 16,
          topicSessions: 20,
          unresolvedSessions: 4,
        },
        trend: [
          {
            assetMentions: 6,
            date: "2026-06-01",
            entityMentions: 5,
            intentMentions: 4,
            negativeSessions: 2,
            tagMentions: 6,
            topicSessions: 8,
            unresolvedSessions: 1,
          },
        ],
      }),
    ).toBe(true);
  });

  it("requires quality result evidence and resolution status", () => {
    expect(
      Value.Check(InsightsQualityResponseSchema, {
        agentStats: [
          {
            agentName: "客服一号",
            agentSeatId: "101",
            partial: 1,
            problemSessions: 6,
            resolved: 4,
            totalSessions: 8,
            unresolved: 1,
            unresolvedRate: 0.125,
          },
        ],
        overview: {
          analyzedSessions: 9,
          noCustomerProblem: 2,
          partial: 1,
          problemSessions: 7,
          resolved: 5,
          totalSessions: 10,
          unresolved: 1,
        },
        unresolvedReasons: [
          {
            count: 1,
            reasonCode: "reply_not_cover_problem",
            reasonLabel: "回复未覆盖客户问题",
          },
        ],
        unresolvedSessions: [
          {
            agentName: "客服一号",
            conversationId: "301",
            customerName: "张三",
            evidenceMessageIds: ["9001"],
            lastCustomerMessageAt: 1780243200000,
            problemSummary: "客户询问退款进度",
            resolutionStatus: "unresolved",
            sessionId: "session-1",
            severity: "high",
            unresolvedReason: "客服未确认退款处理进度",
          },
        ],
      }),
    ).toBe(true);
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
            actionType: "follow_up",
            conversationId: "301",
            customerName: "张三",
            evidenceMessageIds: ["9001"],
            lastCustomerMessageAt: 1780243200000,
            priority: "high",
            reason: "客户仍在追问退款进度",
            sessionId: "session-1",
            status: "open",
            title: "确认退款进度并回复客户",
          },
        ],
        total: 1,
      }),
    ).toBe(true);
  });

  it("accepts detail responses with evidence message contexts", () => {
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
        evidenceMessages: [
          {
            contentText: "退款什么时候到账？",
            contentType: "text",
            messageId: "9001",
            msgtime: 1780243200000,
            senderName: "张三",
            senderRole: "customer",
          },
        ],
        evidenceMessageRecords: [
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
        sessionMessageRecords: [
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
        qaFindings: [],
        risks: [],
        sentiment: [],
        session: {
          conversationId: "301",
          customerName: "张三",
          phase: "live",
          sessionId: "session-1",
          startedAt: 1780240000000,
        },
        summary: {
          customerIntent: "询问退款进度",
          followUp: "确认退款状态后回复客户",
          processSummary: "客户追问退款，客服尚未给出进度",
          resultSummary: "未解决",
        },
        tags: [],
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
          ruleFallbackEnabled: true,
        },
        entityDictionary: [
          {
            aliases: ["白鸭绒外套"],
            canonicalName: "白色羽绒服",
            enabled: true,
            entityType: "product",
            id: "1",
            includeInAggregation: true,
          },
        ],
        labelConfigs: [
          {
            enabled: true,
            id: "1",
            includeInStatistics: true,
            labelCode: "price_sensitive",
            labelName: "价格敏感",
          },
        ],
        qaRuleConfigs: [
          {
            enabled: true,
            id: "1",
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
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightsRescanRequestSchema, {
        from: "2026-06-01T00:00:00.000Z",
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
        ruleFallbackEnabled: true,
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightLabelConfigMutationRequestSchema, {
        description: "客户对价格较敏感",
        enabled: true,
        includeInStatistics: true,
        labelCode: "price_sensitive",
        labelName: "价格敏感",
        negativeExamples: ["只问库存"],
        positiveExamples: ["太贵了"],
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightQaRuleConfigMutationRequestSchema, {
        applicableScene: "售后",
        enabled: true,
        judgmentCriteria: "客户问题需要有明确处理结果",
        ruleCode: "problem_resolution",
        ruleName: "客户问题是否解决",
        severity: "high",
      }),
    ).toBe(true);

    expect(
      Value.Check(InsightEntityDictionaryMutationRequestSchema, {
        aliases: ["直播间羽绒服"],
        attributes: { brand: "A" },
        canonicalName: "白色羽绒服",
        enabled: true,
        entityType: "product",
        includeInAggregation: true,
      }),
    ).toBe(true);
  });
});
