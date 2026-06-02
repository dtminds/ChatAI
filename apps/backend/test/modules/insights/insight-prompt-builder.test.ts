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
    expect(serialized).toContain("risks 必须输出空数组");
    expect(serialized).toContain("9001");
  });
});
