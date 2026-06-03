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
    "<role>",
    "你是客服会话洞察分析器，服务对象是电商/私域客服团队。你的任务是只基于当前逻辑会话内的消息，完成会话摘要、问题是否解决、质检规则判定、标签提取、情感/意图/实体提取和待跟进事项识别。",
    "</role>",
    "<output_format>",
    "只输出一个合法 JSON object，不要输出 Markdown、解释文字或代码块。",
    "必须输出完整字段：summary, sentiment, tags, qaFindings, problemResolution, entities, intents, risks, actionItems, faqCandidates。",
    "</output_format>",
    "<evidence_rules>",
    "所有 evidenceMessageIds 必须来自输入 messages.sourceMessageId；没有证据时输出空数组，不允许编造消息 ID。",
    "problemResolution.evidence 必须说明关键证据消息、证据角色和引用原因，用于前端高亮对话消息。",
    "</evidence_rules>",
    "<analysis_rules>",
    "问题是否解决只判断当前逻辑会话内是否解决，不要推断会话外后续处理。",
    "summary.customerIntent 必须是 2-6 个汉字的短意图标签，优先使用 XX问题/XX咨询/XX需求/XX异常/XX申请 等格式，不要写完整句子，不要复述 problemSummary。",
    "customerIntent 正例：产品咨询、价格咨询、物流异常、退款申请、售后维修、发货催促、优惠咨询。",
    "customerIntent 负例：客户询问了白色羽绒服多少钱（太长）、咨询（太模糊）、关于退款（介词结构）。",
    "problemResolution.problemSummary 才用于描述客户提出的具体问题，可写成一句完整摘要。",
    "置信度 confidence 取 0 到 1 之间的小数；证据不足时降低 confidence，不要强行下结论。",
    "</analysis_rules>",
    "<config_rules>",
    "标签只能从 tenantContext.labelConfigs 中选择；实体只能从 tenantContext.entityDictionary 中选择；质检只能评估 tenantContext.qaRuleConfigs 中启用的规则；配置为空时输出空数组。",
    "消息里出现但词库未配置的实体不得输出。",
    "风险关注已并入质检规则和待办触发，risks 必须输出空数组。",
    "</config_rules>",
  ].join("\n");
}

function buildUserPrompt(messages: AiMessageInput[], context: InsightPromptContext) {
  return JSON.stringify({
    outputContract: buildOutputContract(context),
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

function buildOutputContract(context: InsightPromptContext) {
  return {
    actionItems: [
      {
        actionType: "<follow_up|refund_check|logistics_check|complaint_handle|custom>",
        dueHint: "<string optional: 处理时效或时间提示>",
        evidenceMessageIds: ["<sourceMessageId>"],
        priority: "<high|medium|low>",
        title: "<string: 待跟进事项标题>",
      },
    ],
    entities: context.entityDictionary.length > 0 ? [
      {
        confidence: "<number 0-1>",
        entityId: "<来自 tenantContext.entityDictionary.canonicalName 或 aliases>",
        entityName: "<来自 tenantContext.entityDictionary.canonicalName>",
        entityType: "<来自 tenantContext.entityDictionary.entityType>",
        evidenceMessageIds: ["<sourceMessageId>"],
        sentiment: "<positive|neutral|negative|mixed> optional",
      },
    ] : [],
    faqCandidates: [
      {
        answerHint: "<string: 建议答案方向>",
        evidenceMessageIds: ["<sourceMessageId>"],
        question: "<string: 可沉淀为知识库的问题>",
        status: "<candidate>",
      },
    ],
    intents: [
      {
        confidence: "<number 0-1>",
        evidenceMessageIds: ["<sourceMessageId>"],
        intentCode: "<string: 英文或拼音稳定编码>",
        intentLabel: "<string: 中文意图名称>",
      },
    ],
    problemResolution: {
      confidence: "<number 0-1>",
      evidence: [
        {
          evidenceRole: "<customer_problem|agent_solution|closure_signal|unresolved_signal>",
          messageId: "<sourceMessageId>",
          reason: "<string: 这条消息作为证据的原因>",
        },
      ],
      evidenceMessageIds: ["<sourceMessageId>"],
      problemDetected: "<boolean>",
      problemSummary: "<string: 客户提到的问题；没有问题时为空字符串>",
      resolutionStatus: "<resolved|partially_resolved|unresolved|no_customer_problem|unknown>",
      unresolvedReason: "<string optional: 未解决或部分解决时必须说明理由>",
    },
    qaFindings: context.qaRuleConfigs.length > 0 ? [
      {
        confidence: "<number 0-1>",
        evidenceMessageIds: ["<sourceMessageId>"],
        passed: "<boolean>",
        reason: "<string: 判定理由>",
        ruleCode: "<来自 tenantContext.qaRuleConfigs.ruleCode>",
        severity: "<high|medium|low>",
      },
    ] : [],
    risks: [],
    sentiment: [
      {
        confidence: "<number 0-1>",
        evidenceMessageIds: ["<sourceMessageId>"],
        polarity: "<positive|neutral|negative|mixed|unknown>",
        reason: "<string: 情绪判定理由>",
      },
    ],
    summary: {
      confidence: "<number 0-1>",
      customerIntent: "<string: 2-6 个汉字短意图标签>",
      followUp: "<string optional: 后续建议>",
      processSummary: "<string: 客服处理过程摘要>",
      resultSummary: "<string: 当前结果摘要>",
    },
    tags: context.labelConfigs.length > 0 ? [
      {
        confidence: "<number 0-1>",
        evidenceMessageIds: ["<sourceMessageId>"],
        tagCode: "<来自 tenantContext.labelConfigs.labelCode>",
        tagName: "<来自 tenantContext.labelConfigs.labelName>",
      },
    ] : [],
  };
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
