import { Type, type Static } from "@sinclair/typebox";

export const AiHostingAgentPromptConfigSchema = Type.Object({
  conditionLogic: Type.String(),
  handoffRules: Type.String(),
  replyStyle: Type.Object({
    length: Type.String(),
    styleInstruction: Type.String(),
  }, { additionalProperties: false }),
  role: Type.String(),
}, { additionalProperties: false });

export const AiHostingModelSchema = Type.Object({
  description: Type.String(),
  id: Type.String(),
  label: Type.String(),
  model: Type.String(),
  name: Type.String(),
  supportMultimodal: Type.Boolean(),
});

export const AiHostingAgentModelSummarySchema = Type.Object({
  id: Type.String(),
  label: Type.String(),
  model: Type.String(),
  name: Type.String(),
});

export const AiHostingAgentListItemSchema = Type.Object({
  id: Type.String(),
  knowledgeBases: Type.Array(Type.String()),
  model: AiHostingAgentModelSummarySchema,
  name: Type.String(),
  updatedAt: Type.Optional(Type.Number()),
});

export const AiHostingAgentDetailSchema = Type.Object({
  hasUnpublishedChanges: Type.Boolean(),
  id: Type.String(),
  model: AiHostingAgentModelSummarySchema,
  modelId: Type.String(),
  name: Type.String(),
  promptConfig: AiHostingAgentPromptConfigSchema,
  publishedAt: Type.Optional(Type.Number()),
  updatedAt: Type.Optional(Type.Number()),
});

export const AiHostingAgentListResponseSchema = Type.Object({
  agents: Type.Array(AiHostingAgentListItemSchema),
  pagination: Type.Object({
    page: Type.Number(),
    pageSize: Type.Number(),
    total: Type.Number(),
  }),
});

export const AiHostingModelListResponseSchema = Type.Object({
  models: Type.Array(AiHostingModelSchema),
});

export const AiHostingAgentSaveRequestSchema = Type.Object({
  modelId: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1, maxLength: 50 }),
  promptConfig: AiHostingAgentPromptConfigSchema,
}, { additionalProperties: false });

export const AiHostingAgentSettingsSaveRequestSchema = Type.Object({
  modelId: Type.String({ minLength: 1 }),
  promptConfig: AiHostingAgentPromptConfigSchema,
}, { additionalProperties: false });

export const AiHostingAgentRenameRequestSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 50 }),
}, { additionalProperties: false });

export const AiHostingAgentRemoveResponseSchema = Type.Object({
  deleted: Type.Boolean(),
});

export type AiHostingAgentPromptConfig = Static<typeof AiHostingAgentPromptConfigSchema>;
export type AiHostingModel = Static<typeof AiHostingModelSchema>;
export type AiHostingAgentModelSummary = Static<typeof AiHostingAgentModelSummarySchema>;
export type AiHostingAgentListItem = Static<typeof AiHostingAgentListItemSchema>;
export type AiHostingAgentDetail = Static<typeof AiHostingAgentDetailSchema>;
export type AiHostingAgentListResponse = Static<typeof AiHostingAgentListResponseSchema>;
export type AiHostingModelListResponse = Static<typeof AiHostingModelListResponseSchema>;
export type AiHostingAgentSaveRequest = Static<typeof AiHostingAgentSaveRequestSchema>;
export type AiHostingAgentSettingsSaveRequest =
  Static<typeof AiHostingAgentSettingsSaveRequestSchema>;
export type AiHostingAgentRenameRequest = Static<typeof AiHostingAgentRenameRequestSchema>;
export type AiHostingAgentRemoveResponse = Static<typeof AiHostingAgentRemoveResponseSchema>;
