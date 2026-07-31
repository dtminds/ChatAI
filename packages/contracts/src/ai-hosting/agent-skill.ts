import { Type, type Static } from "@sinclair/typebox";

export const AGENT_SKILL_NAME_MAX_LENGTH = 30;
export const AGENT_SKILL_APPLY_SCENE_MAX_LENGTH = 500;
export const AGENT_SKILL_KB_MAX_COUNT = 10;

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

export const AgentSkillDetailSchema = Type.Object(
  {
    applyScene: Type.String(),
    content: Type.String(),
    createdAt: Type.String(),
    id: Type.String(),
    kbs: Type.Array(Type.Number()),
    name: Type.String(),
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

export type AgentSkillDetail = Static<typeof AgentSkillDetailSchema>;
export type AgentSkillListItem = Static<typeof AgentSkillListItemSchema>;
export type AgentSkillListResponse = Static<typeof AgentSkillListResponseSchema>;
export type AgentSkillMutationResponse = Static<typeof AgentSkillMutationResponseSchema>;
export type AgentSkillSaveRequest = Static<typeof AgentSkillSaveRequestSchema>;
export type AgentSkillStatus = Static<typeof AgentSkillStatusSchema>;
export type AgentSkillStatusUpdateRequest = Static<
  typeof AgentSkillStatusUpdateRequestSchema
>;
export type AgentSkillVariable = Static<typeof AgentSkillVariableSchema>;
