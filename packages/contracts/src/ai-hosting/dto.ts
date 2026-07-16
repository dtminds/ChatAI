import { Type, type Static } from "@sinclair/typebox";

export const AI_HOSTING_AGENT_QUOTA_LIMIT = 20;
export const AI_HOSTING_KB_QUOTA_LIMIT = 20;
export const AI_HOSTING_KB_DOC_STORAGE_QUOTA_LIMIT = 1024 * 1024 * 1024;

export const AiHostingQuotaSchema = Type.Object({
  limit: Type.Number(),
  used: Type.Number(),
});

export const AiHostingQuotaOverviewSchema = Type.Object({
  agents: AiHostingQuotaSchema,
  kbDocs: AiHostingQuotaSchema,
  kbs: AiHostingQuotaSchema,
});

export const AiHostingAgentPromptConfigSchema = Type.Object({
  availableKbIds: Type.Array(Type.Number()),
  conditionLogic: Type.String(),
  handoffRules: Type.String({ maxLength: 2000 }),
  replyStyle: Type.Object({
    length: Type.String(),
    styleInstruction: Type.String({ maxLength: 2000 }),
  }, { additionalProperties: false }),
  role: Type.String({ maxLength: 2000 }),
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

export const AiHostingAgentKbSummarySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
});

export const AiHostingAgentListItemSchema = Type.Object({
  id: Type.String(),
  kbList: Type.Array(AiHostingAgentKbSummarySchema),
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

export const AiHostingAgentListResponseSchema = Type.Object(
  {
    agents: Type.Array(AiHostingAgentListItemSchema),
    pagination: Type.Object({
      page: Type.Number(),
      pageSize: Type.Number(),
      total: Type.Number(),
    }),
  },
  { additionalProperties: false },
);

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

export const AiHostingAgentTestMessageContentSchema = Type.Object({
  text: Type.Optional(Type.String()),
  type: Type.Union([
    Type.Literal("text"),
    Type.Literal("image"),
    Type.Literal("audio"),
  ]),
  url: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const AiHostingAgentTestMessageSchema = Type.Object({
  contents: Type.Array(AiHostingAgentTestMessageContentSchema, { minItems: 1 }),
  role: Type.Union([
    Type.Literal("user"),
    Type.Literal("assistant"),
  ]),
}, { additionalProperties: false });

export const AiHostingAgentTestRequestSchema = Type.Object({
  messages: Type.Array(AiHostingAgentTestMessageSchema, { minItems: 1 }),
  modelId: Type.String({ minLength: 1 }),
  promptConfig: AiHostingAgentPromptConfigSchema,
}, { additionalProperties: false });

export const AiHostingAgentTestAttachmentMaterialTypeSchema = Type.Union([
  Type.Literal("image"),
  Type.Literal("file"),
  Type.Literal("link"),
  Type.Literal("mini-program"),
]);

export const AiHostingAgentTestAttachmentMaterialSchema = Type.Object({
  content: Type.Record(Type.String(), Type.Unknown()),
  title: Type.String(),
  type: AiHostingAgentTestAttachmentMaterialTypeSchema,
}, { additionalProperties: false });

export const AiHostingAgentTestReplyItemSchema = Type.Union([
  Type.Object({
    content: Type.String(),
    type: Type.Union([
      Type.Literal("text"),
      Type.Literal("image"),
      Type.Literal("audio"),
    ]),
  }, { additionalProperties: false }),
  Type.Object({
    attachments: Type.Array(AiHostingAgentTestAttachmentMaterialSchema),
    chunkId: Type.String({ minLength: 1 }),
    type: Type.Literal("attachment"),
  }, { additionalProperties: false }),
]);

export const AiHostingAgentTestResponseSchema = Type.Object({
  action: Type.String(),
  reply: Type.Array(AiHostingAgentTestReplyItemSchema),
}, { additionalProperties: false });

export const AiHostingSettingsGroupChatSchema = Type.Object({
  agentId: Type.Union([Type.String(), Type.Null()]),
  fullAutoAuth: Type.Boolean(),
  replyMode: Type.Union([Type.Literal(1), Type.Literal(2), Type.Null()]),
  semiAutoAuth: Type.Boolean(),
});

export const AiHostingSettingsAccountSchema = Type.Object({
  agentId: Type.Union([Type.String(), Type.Null()]),
  avatarUrl: Type.String(),
  fullAutoAuth: Type.Boolean(),
  groupChat: AiHostingSettingsGroupChatSchema,
  id: Type.String(),
  name: Type.String(),
  semiAutoAuth: Type.Boolean(),
});

export const AiHostingSettingsAgentOptionSchema = Type.Object({
  id: Type.String(),
  isPublished: Type.Boolean(),
  name: Type.String(),
});

export const AiHostingSettingsResponseSchema = Type.Object({
  accounts: Type.Array(AiHostingSettingsAccountSchema),
  agents: Type.Array(AiHostingSettingsAgentOptionSchema),
  fullAutoAuthAvailable: Type.Boolean(),
});

export const AiHostingSettingsUpdateRequestSchema = Type.Object({
  agentId: Type.String({ minLength: 1 }),
  fullAutoAuth: Type.Boolean(),
  semiAutoAuth: Type.Boolean(),
  userSeatIds: Type.Array(Type.String(), { minItems: 1 }),
}, { additionalProperties: false });

export const AiHostingGroupSettingsUpdateRequestSchema = Type.Object({
  agentId: Type.String({ minLength: 1 }),
  fullAutoAuth: Type.Boolean(),
  replyMode: Type.Union([Type.Literal(1), Type.Literal(2)]),
  semiAutoAuth: Type.Boolean(),
  userSeatIds: Type.Array(Type.String(), { minItems: 1 }),
}, { additionalProperties: false });

export type AiHostingAgentPromptConfig = Static<typeof AiHostingAgentPromptConfigSchema>;
export type AiHostingQuota = Static<typeof AiHostingQuotaSchema>;
export type AiHostingQuotaOverview = Static<typeof AiHostingQuotaOverviewSchema>;
export type AiHostingModel = Static<typeof AiHostingModelSchema>;
export type AiHostingAgentModelSummary = Static<typeof AiHostingAgentModelSummarySchema>;
export type AiHostingAgentKbSummary = Static<typeof AiHostingAgentKbSummarySchema>;
export type AiHostingAgentListItem = Static<typeof AiHostingAgentListItemSchema>;
export type AiHostingAgentDetail = Static<typeof AiHostingAgentDetailSchema>;
export type AiHostingAgentListResponse = Static<typeof AiHostingAgentListResponseSchema>;
export type AiHostingModelListResponse = Static<typeof AiHostingModelListResponseSchema>;
export type AiHostingAgentSaveRequest = Static<typeof AiHostingAgentSaveRequestSchema>;
export type AiHostingAgentSettingsSaveRequest =
  Static<typeof AiHostingAgentSettingsSaveRequestSchema>;
export type AiHostingAgentRenameRequest = Static<typeof AiHostingAgentRenameRequestSchema>;
export type AiHostingAgentRemoveResponse = Static<typeof AiHostingAgentRemoveResponseSchema>;
export type AiHostingAgentTestMessageContent =
  Static<typeof AiHostingAgentTestMessageContentSchema>;
export type AiHostingAgentTestMessage = Static<typeof AiHostingAgentTestMessageSchema>;
export type AiHostingAgentTestRequest = Static<typeof AiHostingAgentTestRequestSchema>;
export type AiHostingAgentTestAttachmentMaterialType =
  Static<typeof AiHostingAgentTestAttachmentMaterialTypeSchema>;
export type AiHostingAgentTestAttachmentMaterial =
  Static<typeof AiHostingAgentTestAttachmentMaterialSchema>;
export type AiHostingAgentTestReplyItem = Static<typeof AiHostingAgentTestReplyItemSchema>;
export type AiHostingAgentTestResponse = Static<typeof AiHostingAgentTestResponseSchema>;
export type AiHostingSettingsAccount = Static<typeof AiHostingSettingsAccountSchema>;
export type AiHostingSettingsGroupChat = Static<typeof AiHostingSettingsGroupChatSchema>;
export type AiHostingSettingsAgentOption = Static<typeof AiHostingSettingsAgentOptionSchema>;
export type AiHostingSettingsResponse = Static<typeof AiHostingSettingsResponseSchema>;
export type AiHostingSettingsUpdateRequest =
  Static<typeof AiHostingSettingsUpdateRequestSchema>;
export type AiHostingGroupSettingsUpdateRequest =
  Static<typeof AiHostingGroupSettingsUpdateRequestSchema>;
