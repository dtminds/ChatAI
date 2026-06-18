export type AgentToneStyle =
  | "friendly"
  | "professional"
  | "lively"
  | "restrained"
  | "efficient"
  | "gentle";

export type AgentReplyLength = "concise" | "standard" | "detailed";

export type ConditionalLogicSegment =
  | { type: "text"; value: string }
  | { type: "knowledgeBase"; id: string };

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

export const agentNameMaxLength = 16;

export const agentModelOptions = [
  { label: "默认模型", value: "default-model" },
  { label: "Doubao-2.0-lite", value: "doubao-2.0-lite" },
] as const;

export const agentToneStyleOptions: Array<{
  emoji?: string;
  label: string;
  value: AgentToneStyle;
}> = [
  { emoji: "😊", label: "亲切自然", value: "friendly" },
  { label: "专业顾问", value: "professional" },
  { label: "活泼", value: "lively" },
  { label: "高级克制", value: "restrained" },
  { label: "高效客服", value: "efficient" },
  { label: "温柔陪伴", value: "gentle" },
];

export const agentReplyLengthOptions: Array<{
  label: string;
  value: AgentReplyLength;
}> = [
  { label: "简洁", value: "concise" },
  { label: "标准", value: "standard" },
  { label: "充分", value: "detailed" },
];

export const defaultAgentSettingsForm: AgentSettingsForm = {
  name: "",
  model: agentModelOptions[0].value,
  toneStyle: "friendly",
  replyLength: "concise",
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
  {
    id: "preview-user-1",
    role: "customer",
    content: "我想了解下晨间护肤",
  },
  {
    id: "preview-agent-1",
    role: "agent",
    content: "你好，请问有什么可以帮您？",
  },
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
