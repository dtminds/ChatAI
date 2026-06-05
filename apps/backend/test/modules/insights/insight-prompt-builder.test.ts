import { describe, expect, it } from "vitest";
import {
  buildInsightClassificationPromptMessages,
  buildInsightPromptMessages,
  buildInsightQaPromptMessages,
  buildInsightSummaryPromptMessages,
} from "../../../src/modules/insights/insight-prompt-builder";

describe("insight prompt builder", () => {
  it("builds focused prompts for summary, QA and classification steps", () => {
    const baseInput = {
      context: {
        entityDictionary: [
          {
            aliases: ["SKU-001"],
            canonicalName: "玻尿酸补水面膜",
            entityType: "product",
            includeInAggregation: true,
          },
        ],
        intentConfigs: [
          {
            aliases: ["查快递"],
            includeInStatistics: true,
            intentCode: "logistics_delay",
            intentName: "物流异常",
            negativeExamples: [],
            positiveExamples: ["物流不更新"],
            weight: 8,
          },
        ],
        labelConfigs: [
          {
            includeInStatistics: true,
            labelCode: "logistics",
            labelName: "物流咨询",
            negativeExamples: [],
            positiveExamples: ["快递什么时候到"],
          },
        ],
        qaRuleConfigs: [
          {
            judgmentCriteria: "客服需要给出下一步处理动作",
            negativeExamples: [],
            positiveExamples: [],
            ruleCode: "after_sales_followup",
            ruleName: "售后跟进",
            severity: "high" as const,
          },
        ],
      },
      messages: [
        {
          aiText: "快递一直没更新",
          contentStatus: "ready" as const,
          conversationId: "301",
          evidenceLabel: "[9001]",
          includedForAi: true,
          meaningfulForBoundary: true,
          messageType: "text",
          occurredAt: 1_780_244_000_000,
          senderRole: "customer" as const,
          sourceMessageId: "9001",
        },
      ],
    };
    const priorConclusions = {
      actionItems: [],
      problemResolution: {
        confidence: 0.8,
        evidence: [],
        evidenceMessageIds: ["9001"],
        problemDetected: true,
        problemSummary: "客户反馈物流异常",
        resolutionStatus: "unresolved" as const,
      },
      summary: {
        confidence: 0.8,
        customerIntent: "查物流",
        processSummary: "客服尚未处理",
        resultSummary: "未解决",
      },
    };

    const summaryPrompt = buildInsightSummaryPromptMessages(baseInput);
    const qaPrompt = buildInsightQaPromptMessages({ ...baseInput, priorConclusions });
    const classificationPrompt = buildInsightClassificationPromptMessages({ ...baseInput, priorConclusions });
    const summaryContract = JSON.parse(summaryPrompt[1]?.content ?? "{}").outputContract;
    const summaryPayload = JSON.parse(summaryPrompt[1]?.content ?? "{}");
    const qaPayload = JSON.parse(qaPrompt[1]?.content ?? "{}");
    const classificationPayload = JSON.parse(classificationPrompt[1]?.content ?? "{}");

    expect(Object.keys(summaryContract).sort()).toEqual([
      "actionItems",
      "faqCandidates",
      "problemResolution",
      "sentiment",
      "summary",
    ]);
    expect(summaryPayload.tenantContext).toEqual({
      intentConfigs: [
        expect.objectContaining({
          intentCode: "logistics_delay",
          intentName: "物流异常",
        }),
      ],
    });
    expect(JSON.stringify(summaryPayload.tenantContext)).not.toContain("qaRuleConfigs");
    expect(JSON.stringify(summaryPayload.tenantContext)).not.toContain("labelConfigs");
    expect(JSON.stringify(summaryPayload.tenantContext)).not.toContain("entityDictionary");
    expect(qaPayload.outputContract).toEqual({
      qaFindings: [
        {
          confidence: "<number 0-1>",
          evidenceMessageIds: ["<sourceMessageId>"],
          passed: "<boolean>",
          reason: "<string: 判定理由>",
          ruleCode: "<来自 tenantContext.qaRuleConfigs.ruleCode>",
          severity: "<high|medium|low>",
        },
      ],
    });
    expect(qaPayload.priorConclusions.problemResolution.problemSummary).toBe("客户反馈物流异常");
    expect(classificationPayload.outputContract).toMatchObject({
      entities: expect.any(Array),
      intents: expect.any(Array),
      tags: expect.any(Array),
    });
    expect(JSON.stringify(classificationPayload.outputContract)).not.toContain("qaFindings");
    expect(JSON.stringify(classificationPayload.outputContract)).not.toContain("problemResolution");
  });

  it("injects tenant labels, QA rules, entity dictionary and strict output rules", () => {
    const prompt = buildInsightPromptMessages({
      context: {
        entityDictionary: [
          {
            aliases: ["SKU-001", "补水面膜"],
            attributes: { category: "美妆" },
            canonicalName: "玻尿酸补水面膜",
            entityType: "product",
            includeInAggregation: true,
          },
        ],
        intentConfigs: [
          {
            aliases: ["查快递"],
            description: "客户关注发货或快递进度",
            includeInStatistics: true,
            intentCode: "logistics_delay",
            intentName: "物流异常",
            negativeExamples: ["询问售后退款"],
            positiveExamples: ["快递什么时候到"],
            weight: 8,
          },
        ],
        labelConfigs: [
          {
            description: "客户关注发货或快递进度",
            includeInStatistics: true,
            labelCode: "logistics",
            labelName: "物流咨询",
            negativeExamples: ["询问售后退款"],
            positiveExamples: ["快递什么时候到"],
          },
        ],
        qaRuleConfigs: [
          {
            applicableScene: "售后咨询",
            judgmentCriteria: "客户明确反馈问题后，客服需要给出下一步处理动作",
            negativeExamples: ["客服只回复好的"],
            positiveExamples: ["客服说明已登记并给出处理时效"],
            ruleCode: "after_sales_followup",
            ruleName: "售后跟进",
            severity: "high",
          },
        ],
      },
      messages: [
        {
          aiText: "快递一直没更新",
          contentStatus: "ready",
          conversationId: "301",
          evidenceLabel: "[9001]",
          includedForAi: true,
          meaningfulForBoundary: true,
          messageType: "text",
          occurredAt: 1_780_244_000_000,
          senderRole: "customer",
          sourceMessageId: "9001",
        },
      ],
    });
    const serialized = JSON.stringify(prompt);

    expect(prompt[0]).toMatchObject({ role: "system" });
    expect(serialized).toContain("物流咨询");
    expect(serialized).toContain("物流异常");
    expect(serialized).toContain("tenantContext.intentConfigs");
    expect(serialized).toContain("售后跟进");
    expect(serialized).toContain("玻尿酸补水面膜");
    expect(serialized).toContain("resolutionStatus");
    expect(serialized).toContain("2-6 个汉字");
    expect(serialized).toContain("summary.customerIntent 必须优先使用命中的 tenantContext.intentConfigs.intentName");
    expect(serialized).toContain("未配置的意图不得输出到 intents");
    expect(serialized).toContain("customer_problem");
    expect(serialized).toContain("这条消息作为证据的原因");
    expect(serialized).not.toContain("risks");
    expect(serialized).toContain("9001");
  });

  it("uses schema-style placeholders instead of concrete example values in the output contract", () => {
    const prompt = buildInsightPromptMessages({
      context: {
        entityDictionary: [
          {
            aliases: ["补水面膜"],
            canonicalName: "玻尿酸补水面膜",
            entityType: "product",
            includeInAggregation: true,
          },
        ],
        intentConfigs: [
          {
            aliases: ["查快递"],
            includeInStatistics: true,
            intentCode: "logistics_delay",
            intentName: "物流异常",
            negativeExamples: [],
            positiveExamples: [],
            weight: 8,
          },
        ],
        labelConfigs: [
          {
            includeInStatistics: true,
            labelCode: "logistics",
            labelName: "物流咨询",
            negativeExamples: [],
            positiveExamples: [],
          },
        ],
        qaRuleConfigs: [
          {
            negativeExamples: [],
            positiveExamples: [],
            ruleCode: "reply_timely",
            ruleName: "及时回复",
            severity: "medium",
          },
        ],
      },
      messages: [
        {
          aiText: "快递一直没更新",
          contentStatus: "ready",
          conversationId: "301",
          evidenceLabel: "[9001]",
          includedForAi: true,
          meaningfulForBoundary: true,
          messageType: "text",
          occurredAt: 1_780_244_000_000,
          senderRole: "customer",
          sourceMessageId: "9001",
        },
      ],
    });
    const userPayload = JSON.parse(prompt[1]?.content ?? "{}") as {
      outputContract: {
        entities: Array<{ confidence: unknown }>;
        intents: Array<{ intentCode: unknown; intentLabel: unknown }>;
        problemResolution: { confidence: unknown; resolutionStatus: unknown };
        summary: { confidence: unknown };
      };
    };

    expect(userPayload.outputContract.summary.confidence).toBe("<number 0-1>");
    expect(userPayload.outputContract.problemResolution.confidence).toBe("<number 0-1>");
    expect(userPayload.outputContract.problemResolution.resolutionStatus).toBe(
      "<resolved|partially_resolved|unresolved|no_customer_problem|unknown>",
    );
    expect(userPayload.outputContract.entities[0]?.confidence).toBe("<number 0-1>");
    expect(userPayload.outputContract.intents[0]?.intentCode).toBe("<来自 tenantContext.intentConfigs.intentCode>");
    expect(userPayload.outputContract.intents[0]?.intentLabel).toBe("<来自 tenantContext.intentConfigs.intentName>");
    expect(JSON.stringify(userPayload.outputContract)).not.toContain(":0.8");
  });

  it("requires empty config-driven dimensions when tenant config is empty", () => {
    const prompt = buildInsightPromptMessages({
      context: {
        entityDictionary: [],
        intentConfigs: [],
        labelConfigs: [],
        qaRuleConfigs: [],
      },
      messages: [
        {
          aiText: "想了解 AI 客服知识库",
          contentStatus: "ready",
          conversationId: "301",
          evidenceLabel: "[9001]",
          includedForAi: true,
          meaningfulForBoundary: true,
          messageType: "text",
          occurredAt: 1_780_244_000_000,
          senderRole: "customer",
          sourceMessageId: "9001",
        },
      ],
    });
    const serialized = JSON.stringify(prompt);
    const userPayload = JSON.parse(prompt[1]?.content ?? "{}") as {
      outputContract: {
        entities: unknown[];
        intents: unknown[];
        qaFindings: unknown[];
        tags: unknown[];
      };
    };

    expect(serialized).toContain("配置为空时输出空数组");
    expect(serialized).toContain("tenantContext.entityDictionary");
    expect(serialized).toContain("tenantContext.intentConfigs");
    expect(serialized).toContain("tenantContext.labelConfigs");
    expect(serialized).toContain("tenantContext.qaRuleConfigs");
    expect(serialized).toContain("实体只能从 tenantContext.entityDictionary 中选择");
    expect(serialized).toContain("意图只能从 tenantContext.intentConfigs 中选择");
    expect(userPayload.outputContract.entities).toEqual([]);
    expect(userPayload.outputContract.intents).toEqual([]);
    expect(userPayload.outputContract.tags).toEqual([]);
    expect(userPayload.outputContract.qaFindings).toEqual([]);
    expect(serialized).not.toContain("entityId");
    expect(serialized).not.toContain("entityType 使用 custom");
  });

  it("passes only compact textual previous session context as background", () => {
    const prompt = buildInsightPromptMessages({
      messages: [
        {
          aiText: "这个订单今天还能发吗",
          contentStatus: "ready",
          conversationId: "301",
          evidenceLabel: "[9001]",
          includedForAi: true,
          meaningfulForBoundary: true,
          messageType: "text",
          occurredAt: 1_780_244_000_000,
          senderRole: "customer",
          sourceMessageId: "9001",
        },
      ],
      previousSessionContexts: [
        {
          endedAt: 1_780_100_000_000,
          followUp: "建议继续关注补发物流",
          problemSummary: "客户反馈之前订单少发",
          processSummary: "客服登记少发并承诺补寄",
          resolutionStatus: "partially_resolved",
          resultSummary: "已登记补寄，物流未确认",
          sessionId: "200",
          startedAt: 1_780_090_000_000,
          unresolvedReason: "尚未提供补寄单号",
        },
      ],
    });
    const userPayload = JSON.parse(prompt[1]?.content ?? "{}") as {
      previousSessionContexts: Array<Record<string, unknown>>;
    };
    const previousContextJson = JSON.stringify(userPayload.previousSessionContexts);

    expect(prompt[0]?.content).toContain("前序逻辑会话摘要只能作为背景");
    expect(prompt[0]?.content).toContain("不得改变当前逻辑会话的问题是否解决判定边界");
    expect(userPayload.previousSessionContexts).toEqual([
      {
        endedAt: 1_780_100_000_000,
        followUp: "建议继续关注补发物流",
        problemSummary: "客户反馈之前订单少发",
        processSummary: "客服登记少发并承诺补寄",
        resolutionStatus: "partially_resolved",
        resultSummary: "已登记补寄，物流未确认",
        sessionId: "200",
        startedAt: 1_780_090_000_000,
        unresolvedReason: "尚未提供补寄单号",
      },
    ]);
    expect(previousContextJson).not.toContain("tagCode");
    expect(previousContextJson).not.toContain("entityName");
    expect(previousContextJson).not.toContain("intentCode");
    expect(previousContextJson).not.toContain("polarity");
    expect(previousContextJson).not.toContain("evidenceMessageIds");
  });
});
