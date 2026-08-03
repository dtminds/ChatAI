import { Type, type Static } from "@sinclair/typebox";

export const AgentSkillTemplateRecommendTypeSchema = Type.Union([
  Type.Literal("variable"),
  Type.Literal("tool"),
  Type.Literal("knowledge_base"),
]);

export const AgentSkillTemplateRecommendVariableTypeSchema = Type.Union([
  Type.Literal("custom_field"),
  Type.Literal("work_tag"),
  Type.Literal("mall_tag"),
  Type.Literal("auto_tag"),
  Type.Literal("system_variable"),
]);

export const AgentSkillTemplateRecommendItemSchema = Type.Object(
  {
    description: Type.String(),
    title: Type.String(),
    type: AgentSkillTemplateRecommendTypeSchema,
    /** 仅 variable 推荐项可能带；无 title 时用于映射展示名 */
    variableType: Type.Optional(AgentSkillTemplateRecommendVariableTypeSchema),
  },
  { additionalProperties: false },
);

export const AgentSkillTemplateListItemSchema = Type.Object(
  {
    description: Type.String(),
    icon: Type.String(),
    id: Type.String(),
    name: Type.String(),
    tip: Type.String(),
  },
  { additionalProperties: false },
);

export const AgentSkillTemplateDetailSchema = Type.Object(
  {
    applyScene: Type.String(),
    content: Type.String(),
    description: Type.String(),
    icon: Type.String(),
    id: Type.String(),
    name: Type.String(),
    recommendResources: Type.Array(AgentSkillTemplateRecommendItemSchema),
    tip: Type.String(),
  },
  { additionalProperties: false },
);

export const AgentSkillTemplateGroupSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    templates: Type.Array(AgentSkillTemplateListItemSchema),
  },
  { additionalProperties: false },
);

export const AgentSkillTemplateMarketplaceResponseSchema = Type.Object(
  {
    groups: Type.Array(AgentSkillTemplateGroupSchema),
  },
  { additionalProperties: false },
);

export type AgentSkillTemplateGroup = Static<typeof AgentSkillTemplateGroupSchema>;
export type AgentSkillTemplateDetail = Static<typeof AgentSkillTemplateDetailSchema>;
export type AgentSkillTemplateListItem = Static<
  typeof AgentSkillTemplateListItemSchema
>;
export type AgentSkillTemplateMarketplaceResponse = Static<
  typeof AgentSkillTemplateMarketplaceResponseSchema
>;
export type AgentSkillTemplateRecommendItem = Static<
  typeof AgentSkillTemplateRecommendItemSchema
>;
export type AgentSkillTemplateRecommendType = Static<
  typeof AgentSkillTemplateRecommendTypeSchema
>;
export type AgentSkillTemplateRecommendVariableType = Static<
  typeof AgentSkillTemplateRecommendVariableTypeSchema
>;
