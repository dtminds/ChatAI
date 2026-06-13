import { Type, type Static } from "@sinclair/typebox";

export const LoginStatusSchema = Type.Union([
  Type.Literal("ONLINE"),
  Type.Literal("OFFLINE"),
  Type.Literal("UNKNOWN"),
]);

export const TakeoverStatusSchema = Type.Union([
  Type.Literal("NONE"),
  Type.Literal("TAKEN_BY_ME"),
  Type.Literal("TAKEN_BY_OTHER"),
]);

export const ConversationCustodyModeSchema = Type.Union([
  Type.Literal("full"),
  Type.Literal("semi"),
]);

export const CONVERSATION_CUSTODY_MODE = {
  FULL: "full",
  SEMI: "semi",
} as const;

export const GROUP_MEMBER_TYPE = {
  NORMAL: 0,
  ADMIN: 1,
  OWNER: 2,
} as const;

export const CHAT_TYPE = {
  SINGLE: 1,
  GROUP: 2,
} as const;

export const MATERIAL_COLLECTION_BIZ_TYPE = {
  EXPRESSION: 1,
  FILE: 2,
  MINI_PROGRAM: 3,
  H5: 4,
} as const;

export const MATERIAL_COLLECTION_GROUP_MAX_COUNT = 20;

export const MaterialCollectionBizTypeSchema = Type.Union([
  Type.Literal(MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION),
  Type.Literal(MATERIAL_COLLECTION_BIZ_TYPE.FILE),
  Type.Literal(MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM),
  Type.Literal(MATERIAL_COLLECTION_BIZ_TYPE.H5),
]);

export type LoginStatus = Static<typeof LoginStatusSchema>;
export type TakeoverStatus = Static<typeof TakeoverStatusSchema>;
export type ConversationCustodyMode = Static<typeof ConversationCustodyModeSchema>;
export type MaterialCollectionBizType = Static<
  typeof MaterialCollectionBizTypeSchema
>;
