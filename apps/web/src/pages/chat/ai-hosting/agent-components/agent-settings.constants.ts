export type AgentToneStyle =
  | "亲切自然"
  | "专业顾问"
  | "活泼"
  | "高级克制"
  | "高效客服"
  | "温柔陪伴";

export type AgentReplyLength = "简洁" | "标准" | "充分";

export type ConditionalLogicSegment =
  | { type: "text"; value: string }
  | { type: "knowledgeBase"; id: string; name?: string };

export type AgentSettingsForm = {
  communicationStyle: string;
  conditionalLogic: ConditionalLogicSegment[];
  model: string;
  name: string;
  replyLength: AgentReplyLength;
  roleDescription: string;
  toneStyle: AgentToneStyle;
  transferToHumanConditions: string;
};

export type KnowledgeBaseOption = {
  id: string;
  name: string;
};

export const mockKnowledgeBaseOptions: KnowledgeBaseOption[] = [
  { id: "kb-skincare", name: "美妆知识大全" },
  { id: "kb-makeup", name: "彩妆精选" },
  { id: "kb-after-sales", name: "售后集合" },
  { id: "kb-product", name: "商品咨询知识库" },
  { id: "kb-policy", name: "活动政策知识库" },
];

export const agentNameMaxLength = 50;
export const agentLongTextMaxLength = 2000;
export const agentPreviewTestMessageLimit = 20;

export const agentModelOptions = [
  { label: "默认模型", model: "default-model", value: "0" },
] as const;

export const agentToneStyleOptions: Array<{
  emoji?: string;
  label: string;
  value: AgentToneStyle;
}> = [
  { emoji: "😊", label: "亲切自然", value: "亲切自然" },
  { label: "专业顾问", value: "专业顾问" },
  { label: "活泼", value: "活泼" },
  { label: "高级克制", value: "高级克制" },
  { label: "高效客服", value: "高效客服" },
  { label: "温柔陪伴", value: "温柔陪伴" },
];

export const agentCommunicationStyleTemplates: Array<{
  description: string;
  emoji?: string;
  label: string;
  value: AgentToneStyle;
}> = [
  {
    description: "语气亲切自然，像真人客服一样耐心回应客户，适度使用礼貌表达和轻松语气，避免生硬、模板化或过度营销。",
    emoji: "😊",
    label: "亲切自然",
    value: "亲切自然",
  },
  {
    description: "表达专业、准确、可信，优先说明依据、适用场景和注意事项，避免夸大承诺，适合需要建立信任的咨询场景。",
    label: "专业顾问",
    value: "专业顾问",
  },
  {
    description: "语气轻快有感染力，适度突出亮点和使用体验，适合新品介绍、活动推荐和种草转化，但不要过度催促客户。",
    label: "活泼种草",
    value: "活泼",
  },
  {
    description: "表达克制、高级、简洁，少用感叹和夸张词，重点突出品质、质感和专业判断，适合高客单价或品牌调性较稳的场景。",
    label: "高级克制",
    value: "高级克制",
  },
  {
    description: "回复直接高效，优先给出结论、步骤和下一步动作，减少铺垫和闲聊，适合售后处理、流程咨询和高频标准问题。",
    label: "高效客服",
    value: "高效客服",
  },
  {
    description: "语气温柔、有耐心，优先安抚客户情绪并确认诉求，适合投诉、退款、敏感问题和需要陪伴式沟通的场景。",
    label: "温柔陪伴",
    value: "温柔陪伴",
  },
];

export const agentReplyLengthOptions: Array<{
  label: string;
  value: AgentReplyLength;
}> = [
  { label: "简洁", value: "简洁" },
  { label: "标准", value: "标准" },
  { label: "充分", value: "充分" },
];

export const defaultAgentSettingsForm: AgentSettingsForm = {
  name: "",
  model: agentModelOptions[0].value,
  toneStyle: "亲切自然",
  replyLength: "简洁",
  roleDescription: "",
  communicationStyle: "",
  conditionalLogic: [{ type: "text", value: "" }],
  transferToHumanConditions: "",
};

export const agentSettingsFieldHints = {
  roleDescription: "定义 Agent 在对话中的身份和服务边界，例如品牌客服、专属导购、售后助手或专业顾问",
  communicationStyle: "配置 Agent 在不同沟通场景中的表达习惯，例如客户称呼、表情使用、营销积极度、安抚方式和禁用表达",
  conditionalLogic:
    "配置 Agent 在不同客户问题、业务场景或会话状态下的处理方式，例如商品咨询调用知识库",
  transferToHumanConditions: "设置 Agent 必须转交人工客服的场景，例如知识未命中、AI 不确定、客户情绪负面、退款投诉、客户要求真人等",
} as const;

export type AgentPreviewMessage = {
  id: string;
  role: "customer" | "agent";
  content: string;
};

export const agentPreviewSeedMessages: AgentPreviewMessage[] = [
  // {
  //   id: "preview-user-1",
  //   role: "customer",
  //   content: "我想了解下晨间护肤",
  // },
  // {
  //   id: "preview-agent-1",
  //   role: "agent",
  //   content: "你好，请问有什么可以帮您？",
  // },
];

export type AgentGenerateForm = {
  aiRole: string;
  industry: string;
  servicesProducts: string;
};

export const defaultAgentGenerateForm: AgentGenerateForm = {
  industry: "",
  servicesProducts: "",
  aiRole: "",
};

export const agentIndustryOptions = [
  { label: "美妆护肤", value: "beauty" },
  { label: "电商零售", value: "ecommerce" },
  { label: "教育培训", value: "education" },
  { label: "医疗健康", value: "healthcare" },
  { label: "金融服务", value: "finance" },
  { label: "其他", value: "other" },
] as const;

export const agentAiRoleOptions = [
  { label: "品牌客服", value: "brand-service" },
  { label: "专属导购", value: "personal-shopper" },
  { label: "售后助手", value: "after-sales" },
  { label: "专业顾问", value: "consultant" },
] as const;

export const agentGenerateProgressSteps = [
  { label: "输入文本", progress: 15 },
  { label: "分析业务场景", progress: 35 },
  { label: "生成角色设定", progress: 55 },
  { label: "生成沟通风格", progress: 75 },
  { label: "生成条件逻辑", progress: 90 },
  { label: "配置完成", progress: 100 },
] as const;
