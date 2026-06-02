import type { AiMessageInput } from "./insights.types.js";

export type InsightPromptLabelConfig = {
  description?: string;
  includeInStatistics: boolean;
  labelCode: string;
  labelName: string;
  negativeExamples: string[];
  positiveExamples: string[];
};

export type InsightPromptQaRuleConfig = {
  applicableScene?: string;
  description?: string;
  judgmentCriteria?: string;
  negativeExamples: string[];
  positiveExamples: string[];
  ruleCode: string;
  ruleName: string;
  severity: "high" | "low" | "medium";
};

export type InsightPromptEntityDictionaryItem = {
  aliases: string[];
  attributes?: Record<string, unknown>;
  canonicalName: string;
  entityType: string;
  includeInAggregation: boolean;
};

export type InsightPromptContext = {
  entityDictionary: InsightPromptEntityDictionaryItem[];
  labelConfigs: InsightPromptLabelConfig[];
  qaRuleConfigs: InsightPromptQaRuleConfig[];
};

export type InsightPromptMessage = {
  content: string;
  role: "system" | "user";
};

export function buildInsightPromptMessages(input: {
  context?: InsightPromptContext;
  messages: AiMessageInput[];
}): InsightPromptMessage[] {
  return [
    {
      content: buildSystemPrompt(),
      role: "system",
    },
    {
      content: buildUserPrompt(input.messages, input.context ?? emptyPromptContext),
      role: "user",
    },
  ];
}

const emptyPromptContext: InsightPromptContext = {
  entityDictionary: [],
  labelConfigs: [],
  qaRuleConfigs: [],
};

function buildSystemPrompt() {
  return [
    "你是客服会话洞察分析器，服务对象是电商/私域客服团队。",
    "你的任务是只基于当前逻辑会话内的消息，完成会话摘要、问题是否解决、质检规则判定、标签提取、情感/意图/实体提取和待跟进事项识别。",
    "只输出一个 JSON object，不要输出 Markdown、解释文字或代码块。",
    "所有 evidenceMessageIds 必须来自输入 messages.sourceMessageId；没有证据时输出空数组，不允许编造消息 ID。",
    "问题是否解决只判断当前逻辑会话内是否解决，不要推断会话外后续处理。",
    "标签只能从 tenantContext.labelConfigs 中选择；没有命中的标签时 tags 输出空数组。",
    "质检只能评估 tenantContext.qaRuleConfigs 中启用的规则；没有配置规则时 qaFindings 输出空数组。",
    "实体优先匹配 tenantContext.entityDictionary；可提取消息里明确出现但词库未配置的实体，entityType 使用 custom。",
    "风险关注已并入质检规则和待办触发，risks 必须输出空数组。",
    "置信度 confidence 取 0 到 1 之间的小数；证据不足时降低 confidence，不要强行下结论。",
    "必须输出完整字段：summary, sentiment, tags, qaFindings, problemResolution, entities, intents, risks, actionItems, faqCandidates。",
  ].join("\n");
}

function buildUserPrompt(messages: AiMessageInput[], context: InsightPromptContext) {
  return JSON.stringify({
    outputContract: {
      actionItems: [
        {
          actionType: "follow_up | refund_check | logistics_check | complaint_handle | custom",
          dueHint: "可选，处理时效或时间提示",
          evidenceMessageIds: ["sourceMessageId"],
          priority: "high | medium | low",
          title: "待跟进事项标题",
        },
      ],
      entities: [
        {
          confidence: 0.8,
          entityId: "优先使用词库标准名称或稳定编码",
          entityName: "实体名称",
          entityType: "product | order | promotion | custom",
          evidenceMessageIds: ["sourceMessageId"],
          sentiment: "positive | neutral | negative | mixed，可选",
        },
      ],
      faqCandidates: [
        {
          answerHint: "建议答案方向",
          evidenceMessageIds: ["sourceMessageId"],
          question: "可沉淀为知识库的问题",
          status: "candidate",
        },
      ],
      intents: [
        {
          confidence: 0.8,
          evidenceMessageIds: ["sourceMessageId"],
          intentCode: "英文或拼音稳定编码",
          intentLabel: "中文意图名称",
        },
      ],
      problemResolution: {
        confidence: 0.8,
        evidenceMessageIds: ["sourceMessageId"],
        problemDetected: true,
        problemSummary: "客户提到的问题；没有问题时为空字符串",
        resolutionStatus: "resolved | partially_resolved | unresolved | no_customer_problem | unknown",
        unresolvedReason: "未解决或部分解决时必须说明理由",
      },
      qaFindings: [
        {
          confidence: 0.8,
          evidenceMessageIds: ["sourceMessageId"],
          passed: false,
          reason: "判定理由",
          ruleCode: "必须来自 tenantContext.qaRuleConfigs.ruleCode",
          severity: "high | medium | low",
        },
      ],
      risks: [],
      sentiment: [
        {
          confidence: 0.8,
          evidenceMessageIds: ["sourceMessageId"],
          polarity: "positive | neutral | negative | mixed | unknown",
          reason: "情绪判定理由",
        },
      ],
      summary: {
        confidence: 0.8,
        customerIntent: "客户主要诉求",
        followUp: "可选，后续建议",
        processSummary: "客服处理过程摘要",
        resultSummary: "当前结果摘要",
      },
      tags: [
        {
          confidence: 0.8,
          evidenceMessageIds: ["sourceMessageId"],
          tagCode: "必须来自 tenantContext.labelConfigs.labelCode",
          tagName: "必须来自 tenantContext.labelConfigs.labelName",
        },
      ],
    },
    resolutionStatusGuide: {
      no_customer_problem: "客户没有提出需要客服解决的问题，例如寒暄、确认信息、单纯感谢",
      partially_resolved: "客服给出部分处理或承诺，但仍缺少关键结果、确认或闭环",
      resolved: "客户问题在当前逻辑会话内已有明确答复、处理结果或客户确认接受",
      unknown: "消息不足，无法判断",
      unresolved: "客户问题没有被回应、没有处理方案，或客服答复明显未解决问题",
    },
    tenantContext: normalizeContext(context),
    messages: messages
      .filter((message) => message.includedForAi !== false)
      .map((message) => ({
        content: message.aiText,
        contentStatus: message.contentStatus,
        messageType: message.messageType,
        senderRole: message.senderRole,
        sourceMessageId: message.sourceMessageId,
        time: message.occurredAt,
      })),
  });
}

function normalizeContext(context: InsightPromptContext) {
  return {
    entityDictionary: context.entityDictionary.slice(0, 80).map((item) => ({
      aliases: item.aliases.slice(0, 8),
      attributes: item.attributes,
      canonicalName: item.canonicalName,
      entityType: item.entityType,
      includeInAggregation: item.includeInAggregation,
    })),
    labelConfigs: context.labelConfigs.slice(0, 50).map((item) => ({
      description: item.description,
      includeInStatistics: item.includeInStatistics,
      labelCode: item.labelCode,
      labelName: item.labelName,
      negativeExamples: item.negativeExamples.slice(0, 5),
      positiveExamples: item.positiveExamples.slice(0, 5),
    })),
    qaRuleConfigs: context.qaRuleConfigs.slice(0, 40).map((item) => ({
      applicableScene: item.applicableScene,
      description: item.description,
      judgmentCriteria: item.judgmentCriteria,
      negativeExamples: item.negativeExamples.slice(0, 5),
      positiveExamples: item.positiveExamples.slice(0, 5),
      ruleCode: item.ruleCode,
      ruleName: item.ruleName,
      severity: item.severity,
    })),
  };
}
