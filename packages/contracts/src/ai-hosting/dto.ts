import { Type, type Static } from "@sinclair/typebox";

export const AI_HOSTING_AGENT_QUOTA_LIMIT = 20;
export const AI_HOSTING_AGENT_CONDITION_LOGIC_MAX_LENGTH = 8000;
export const AI_HOSTING_AGENT_ROLE_MAX_LENGTH = 400;
export const AI_HOSTING_AGENT_STYLE_INSTRUCTION_MAX_LENGTH = 800;
export const AI_HOSTING_AGENT_HANDOFF_RULES_MAX_LENGTH = 2000;
export const AI_HOSTING_KB_QUOTA_LIMIT = 20;
export const AI_HOSTING_KB_DOC_STORAGE_QUOTA_LIMIT = 1024 * 1024 * 1024;

export function getAiHostingAgentConditionLogicCharacterCount(value: string) {
  const resourcePattern = /<resource\b[^>]*\/>/g;
  let characterCount = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = resourcePattern.exec(value))) {
    characterCount += match.index - lastIndex;

    const token = match[0] ?? "";
    const type = readAiHostingConditionLogicResourceAttribute(token, "type");
    const idAttribute = type === "knowledge_base" ? "kbId" : type === "skill" ? "skillId" : null;
    const id = idAttribute
      ? unescapeAiHostingConditionLogicResourceAttribute(
          readAiHostingConditionLogicResourceAttribute(token, idAttribute),
        )
      : "";

    if (id) {
      const name = unescapeAiHostingConditionLogicResourceAttribute(
        readAiHostingConditionLogicResourceAttribute(token, "name"),
      );
      characterCount += (name || id).length;
    } else {
      characterCount += token.length;
    }

    lastIndex = match.index + token.length;
  }

  return characterCount + value.length - lastIndex;
}

function readAiHostingConditionLogicResourceAttribute(token: string, attribute: string) {
  const matched = token.match(new RegExp(`${attribute}="([^"]*)"`));
  return matched?.[1] ?? "";
}

function unescapeAiHostingConditionLogicResourceAttribute(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

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
  availableSkillIds: Type.Array(Type.Number()),
  conditionLogic: Type.String(),
  handoffRules: Type.String({ maxLength: AI_HOSTING_AGENT_HANDOFF_RULES_MAX_LENGTH }),
  replyStyle: Type.Object({
    length: Type.String(),
    styleInstruction: Type.String({ maxLength: AI_HOSTING_AGENT_STYLE_INSTRUCTION_MAX_LENGTH }),
  }, { additionalProperties: false }),
  role: Type.String({ maxLength: AI_HOSTING_AGENT_ROLE_MAX_LENGTH }),
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
  autoLearnEnabled: Type.Boolean(),
  id: Type.String(),
  kbList: Type.Array(AiHostingAgentKbSummarySchema),
  model: AiHostingAgentModelSummarySchema,
  name: Type.String(),
  pendingSuggestionCount: Type.Number(),
  updatedAt: Type.Optional(Type.Number()),
});

export const AiHostingAgentAutoLearnUpdateRequestSchema = Type.Object(
  {
    enabled: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const AiHostingAgentAutoLearnUpdateResponseSchema = Type.Object(
  {
    autoLearnEnabled: Type.Boolean(),
    pendingSuggestionCount: Type.Number(),
  },
  { additionalProperties: false },
);

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

export const AiHostingAgentTestReplyItemSchema = Type.Object({
  content: Type.String(),
  type: Type.Union([
    Type.Literal("text"),
    Type.Literal("image"),
    Type.Literal("audio"),
  ]),
}, { additionalProperties: false });

export const AiHostingAgentTestResponseSchema = Type.Object({
  action: Type.String(),
  reply: Type.Array(AiHostingAgentTestReplyItemSchema),
}, { additionalProperties: false });

export const AiHostingGroupChatReplyModeSchema = Type.Union([
  Type.Literal(1),
  Type.Literal(2),
]);

export const AiHostingSettingsGroupChatSchema = Type.Object({
  agentId: Type.Union([Type.String(), Type.Null()]),
  fullAutoAuth: Type.Boolean(),
  replyMode: Type.Union([AiHostingGroupChatReplyModeSchema, Type.Null()]),
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
  replyMode: AiHostingGroupChatReplyModeSchema,
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
export type AiHostingAgentAutoLearnUpdateRequest =
  Static<typeof AiHostingAgentAutoLearnUpdateRequestSchema>;
export type AiHostingAgentAutoLearnUpdateResponse =
  Static<typeof AiHostingAgentAutoLearnUpdateResponseSchema>;
export type AiHostingAgentTestMessageContent =
  Static<typeof AiHostingAgentTestMessageContentSchema>;
export type AiHostingAgentTestMessage = Static<typeof AiHostingAgentTestMessageSchema>;
export type AiHostingAgentTestRequest = Static<typeof AiHostingAgentTestRequestSchema>;
export type AiHostingAgentTestReplyItem = Static<typeof AiHostingAgentTestReplyItemSchema>;
export type AiHostingAgentTestResponse = Static<typeof AiHostingAgentTestResponseSchema>;
export type AiHostingGroupChatReplyMode = Static<
  typeof AiHostingGroupChatReplyModeSchema
>;
export type AiHostingSettingsAccount = Static<typeof AiHostingSettingsAccountSchema>;
export type AiHostingSettingsGroupChat = Static<typeof AiHostingSettingsGroupChatSchema>;
export type AiHostingSettingsAgentOption = Static<typeof AiHostingSettingsAgentOptionSchema>;
export type AiHostingSettingsResponse = Static<typeof AiHostingSettingsResponseSchema>;
export type AiHostingSettingsUpdateRequest =
  Static<typeof AiHostingSettingsUpdateRequestSchema>;
export type AiHostingGroupSettingsUpdateRequest =
  Static<typeof AiHostingGroupSettingsUpdateRequestSchema>;
