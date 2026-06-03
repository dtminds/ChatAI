import { describe, expect, it } from "vitest";
import { buildInsightPromptMessages } from "../../../src/modules/insights/insight-prompt-builder";

describe("insight prompt builder", () => {
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
    expect(serialized).toContain("售后跟进");
    expect(serialized).toContain("玻尿酸补水面膜");
    expect(serialized).toContain("resolutionStatus");
    expect(serialized).toContain("2-6 个汉字");
    expect(serialized).toContain("正例：产品咨询、价格咨询、物流异常、退款申请、售后维修、发货催促、优惠咨询");
    expect(serialized).toContain("负例：客户询问了白色羽绒服多少钱");
    expect(serialized).toContain("customer_problem");
    expect(serialized).toContain("这条消息作为证据的原因");
    expect(serialized).toContain("risks 必须输出空数组");
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
    expect(JSON.stringify(userPayload.outputContract)).not.toContain(":0.8");
  });

  it("requires empty config-driven dimensions when tenant config is empty", () => {
    const prompt = buildInsightPromptMessages({
      context: {
        entityDictionary: [],
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
        qaFindings: unknown[];
        tags: unknown[];
      };
    };

    expect(serialized).toContain("配置为空时输出空数组");
    expect(serialized).toContain("tenantContext.entityDictionary");
    expect(serialized).toContain("tenantContext.labelConfigs");
    expect(serialized).toContain("tenantContext.qaRuleConfigs");
    expect(serialized).toContain("实体只能从 tenantContext.entityDictionary 中选择");
    expect(userPayload.outputContract.entities).toEqual([]);
    expect(userPayload.outputContract.tags).toEqual([]);
    expect(userPayload.outputContract.qaFindings).toEqual([]);
    expect(serialized).not.toContain("entityId");
    expect(serialized).not.toContain("entityType 使用 custom");
  });
});
