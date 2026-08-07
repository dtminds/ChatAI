import { Type, type Static } from "@sinclair/typebox";
import {
  AiHostingAgentResourceInvalidReasonSchema,
  AiHostingAgentResourceStatusSchema,
} from "./dto.js";

export const AGENT_SKILL_NAME_MAX_LENGTH = 30;
export const AGENT_SKILL_APPLY_SCENE_MAX_LENGTH = 500;
export const AGENT_SKILL_CONTENT_MAX_LENGTH = 8000;
export const AGENT_SKILL_KB_MAX_COUNT = 10;

export const AGENT_SKILL_TOOL_CATALOG = [
  {
    description: "根据客户提供的订单号查询订单信息",
    id: "search_order",
    name: "订单查询",
  },
  {
    description: "根据订单号查询小程序订单的物流状态与轨迹信息",
    id: "search_mall_order_logistics",
    name: "小程序订单物流查询",
  },
  {
    description: "为小程序订单添加或更新备注",
    id: "remark_mall_order",
    name: "小程序订单备注",
  },
  {
    description: "根据客户提供的订单号代客转积分",
    id: "transfer_mall_point",
    name: "代客转积分",
  },
  {
    description: "将客户提供的订单号，关联绑定至客户画像",
    id: "bind_order",
    name: "绑定订单",
  },
] as const;

/** 暂时不在插入/选择工具列表展示；目录仍保留以便已有技能解析 */
export const AGENT_SKILL_HIDDEN_TOOL_IDS = ["bind_order"] as const;

export function isAgentSkillToolVisible(toolId: string) {
  return !(AGENT_SKILL_HIDDEN_TOOL_IDS as readonly string[]).includes(toolId);
}

export const AGENT_SKILL_VISIBLE_TOOL_CATALOG = AGENT_SKILL_TOOL_CATALOG.filter(
  (tool) => isAgentSkillToolVisible(tool.id),
);

export function getAgentSkillContentCharacterCount(value: string) {
  const resourcePattern = /<resource\b[^>]*\/>/g;
  let characterCount = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = resourcePattern.exec(value))) {
    characterCount += match.index - lastIndex;
    const token = match[0] ?? "";
    const name = unescapeSkillResourceAttribute(
      readSkillResourceAttribute(token, "name"),
    );
    characterCount += name ? name.length : token.length;
    lastIndex = match.index + token.length;
  }

  return characterCount + value.length - lastIndex;
}

function readSkillResourceAttribute(token: string, attribute: string) {
  return token.match(new RegExp(`${attribute}="([^"]*)"`))?.[1] ?? "";
}

function unescapeSkillResourceAttribute(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export const AgentSkillStatusSchema = Type.Union([
  Type.Literal("enabled"),
  Type.Literal("disabled"),
]);

// additionalProperties 必须为 true：Fastify 默认 removeAdditional=true，
// anyOf 试校验其它分支时会把同级字段（如 select_sub_ids）剥掉，导致 work_tag/mall_tag 误报缺字段。
const skillVariableObjectOptions = { additionalProperties: true } as const;

const SkillCustomFieldVariableSchema = Type.Object(
  {
    name: Type.String(),
    select_id: Type.Number(),
    type: Type.Literal("custom_field"),
  },
  skillVariableObjectOptions,
);

const SkillWorkTagVariableSchema = Type.Object(
  {
    name: Type.String(),
    select_id: Type.Number(),
    select_sub_ids: Type.Array(Type.Number()),
    type: Type.Literal("work_tag"),
  },
  skillVariableObjectOptions,
);

const SkillMallTagVariableSchema = Type.Object(
  {
    name: Type.String(),
    select_id: Type.Number(),
    select_sub_ids: Type.Array(Type.Number()),
    type: Type.Literal("mall_tag"),
  },
  skillVariableObjectOptions,
);

const SkillAutoTagVariableSchema = Type.Object(
  {
    name: Type.String(),
    select_key: Type.String(),
    type: Type.Literal("auto_tag"),
  },
  skillVariableObjectOptions,
);

const SkillSystemVariableSchema = Type.Object(
  {
    name: Type.String(),
    select_key: Type.String(),
    type: Type.Literal("system_variable"),
  },
  skillVariableObjectOptions,
);

export const AgentSkillVariableSchema = Type.Union([
  SkillCustomFieldVariableSchema,
  SkillWorkTagVariableSchema,
  SkillMallTagVariableSchema,
  SkillAutoTagVariableSchema,
  SkillSystemVariableSchema,
]);

export const AgentSkillSaveRequestSchema = Type.Object(
  {
    applyScene: Type.String({ maxLength: AGENT_SKILL_APPLY_SCENE_MAX_LENGTH }),
    content: Type.String(),
    kbs: Type.Array(Type.Number(), { maxItems: AGENT_SKILL_KB_MAX_COUNT }),
    name: Type.String({ minLength: 1, maxLength: AGENT_SKILL_NAME_MAX_LENGTH }),
    tools: Type.Array(Type.String()),
    variables: Type.Array(AgentSkillVariableSchema),
  },
  { additionalProperties: false },
);

export const AgentSkillStatusUpdateRequestSchema = Type.Object(
  {
    status: AgentSkillStatusSchema,
  },
  { additionalProperties: false },
);

export const AgentSkillListItemSchema = Type.Object(
  {
    applyScene: Type.String(),
    createdAt: Type.String(),
    id: Type.String(),
    name: Type.String(),
    status: AgentSkillStatusSchema,
    updatedAt: Type.String(),
  },
  { additionalProperties: false },
);

export const AgentSkillKnowledgeBaseResourceSchema = Type.Object(
  {
    id: Type.String(),
    invalidReason: Type.Optional(AiHostingAgentResourceInvalidReasonSchema),
    kbId: Type.Number(),
    name: Type.String(),
    status: AiHostingAgentResourceStatusSchema,
  },
  { additionalProperties: false },
);

export const AgentSkillToolResourceSchema = Type.Object(
  {
    id: Type.String(),
    invalidReason: Type.Optional(AiHostingAgentResourceInvalidReasonSchema),
    name: Type.String(),
    status: AiHostingAgentResourceStatusSchema,
    toolKey: Type.String(),
  },
  { additionalProperties: false },
);

export const AgentSkillVariableResourceSchema = Type.Object(
  {
    id: Type.String(),
    invalidReason: Type.Optional(AiHostingAgentResourceInvalidReasonSchema),
    name: Type.String(),
    status: AiHostingAgentResourceStatusSchema,
    variable: AgentSkillVariableSchema,
  },
  { additionalProperties: false },
);

export const AgentSkillResourcesSchema = Type.Object(
  {
    knowledgeBases: Type.Array(AgentSkillKnowledgeBaseResourceSchema),
    tools: Type.Array(AgentSkillToolResourceSchema),
    variables: Type.Array(AgentSkillVariableResourceSchema),
  },
  { additionalProperties: false },
);

export const AgentSkillDetailSchema = Type.Object(
  {
    applyScene: Type.String(),
    content: Type.String(),
    createdAt: Type.String(),
    id: Type.String(),
    kbs: Type.Array(Type.Number()),
    name: Type.String(),
    resources: AgentSkillResourcesSchema,
    status: AgentSkillStatusSchema,
    tools: Type.Array(Type.String()),
    updatedAt: Type.String(),
    variables: Type.Array(AgentSkillVariableSchema),
  },
  { additionalProperties: false },
);

export const AgentSkillListResponseSchema = Type.Object(
  {
    pagination: Type.Object(
      {
        page: Type.Number(),
        pageSize: Type.Number(),
        total: Type.Number(),
      },
      { additionalProperties: false },
    ),
    skills: Type.Array(AgentSkillListItemSchema),
  },
  { additionalProperties: false },
);

export const AgentSkillMutationResponseSchema = Type.Object(
  {
    id: Type.String(),
  },
  { additionalProperties: false },
);

export const AgentSkillResourceAuthResponseSchema = Type.Object(
  {
    authorized: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const AgentSkillResourceAuthUpdateRequestSchema = Type.Object(
  {
    authorized: Type.Literal(true),
  },
  { additionalProperties: false },
);

export type AgentSkillDetail = Static<typeof AgentSkillDetailSchema>;
export type AgentSkillKnowledgeBaseResource = Static<
  typeof AgentSkillKnowledgeBaseResourceSchema
>;
export type AgentSkillListItem = Static<typeof AgentSkillListItemSchema>;
export type AgentSkillListResponse = Static<typeof AgentSkillListResponseSchema>;
export type AgentSkillMutationResponse = Static<typeof AgentSkillMutationResponseSchema>;
export type AgentSkillResourceAuthResponse = Static<
  typeof AgentSkillResourceAuthResponseSchema
>;
export type AgentSkillResourceAuthUpdateRequest = Static<
  typeof AgentSkillResourceAuthUpdateRequestSchema
>;
export type AgentSkillResources = Static<typeof AgentSkillResourcesSchema>;
export type AgentSkillSaveRequest = Static<typeof AgentSkillSaveRequestSchema>;
export type AgentSkillStatus = Static<typeof AgentSkillStatusSchema>;
export type AgentSkillStatusUpdateRequest = Static<
  typeof AgentSkillStatusUpdateRequestSchema
>;
export type AgentSkillVariable = Static<typeof AgentSkillVariableSchema>;
export type AgentSkillToolResource = Static<typeof AgentSkillToolResourceSchema>;
export type AgentSkillVariableResource = Static<typeof AgentSkillVariableResourceSchema>;
