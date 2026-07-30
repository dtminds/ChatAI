import { Type, type Static } from "@sinclair/typebox";

export const AgentSkillTemplateRecommendTypeSchema = Type.Union([
  Type.Literal("variable"),
  Type.Literal("tool"),
  Type.Literal("knowledge_base"),
]);

export const AgentSkillTemplateRecommendItemSchema = Type.Object(
  {
    description: Type.String(),
    title: Type.String(),
    type: AgentSkillTemplateRecommendTypeSchema,
  },
  { additionalProperties: false },
);

export const AgentSkillTemplateItemSchema = Type.Object(
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
    templates: Type.Array(AgentSkillTemplateItemSchema),
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
export type AgentSkillTemplateItem = Static<typeof AgentSkillTemplateItemSchema>;
export type AgentSkillTemplateMarketplaceResponse = Static<
  typeof AgentSkillTemplateMarketplaceResponseSchema
>;
export type AgentSkillTemplateRecommendItem = Static<
  typeof AgentSkillTemplateRecommendItemSchema
>;
export type AgentSkillTemplateRecommendType = Static<
  typeof AgentSkillTemplateRecommendTypeSchema
>;
