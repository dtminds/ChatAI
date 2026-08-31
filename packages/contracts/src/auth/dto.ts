import { Type, type Static } from "@sinclair/typebox";

export const AccountRoleSchema = Type.Union([
  Type.Literal("owner"),
  Type.Literal("admin"),
  Type.Literal("operator"),
  Type.Literal("viewer"),
]);

export const AccountPermissionSchema = Type.Union([
  Type.Literal("chat.access"),
  Type.Literal("chat.send"),
  Type.Literal("chat.takeover"),
  Type.Literal("settings.access"),
  Type.Literal("settings.subAccounts.manage"),
  Type.Literal("settings.managedAccounts.manage"),
  Type.Literal("settings.sidebar.manage"),
]);

export const AccountTypeSchema = Type.Union([
  Type.Literal("main"),
  Type.Literal("sub"),
]);

export const AuthAccessModeSchema = Type.Union([
  Type.Literal("standard"),
  Type.Literal("support_readonly"),
]);

export const SUPPORT_INVESTIGATION_REASONS = [
  "排障：页面加载异常",
  "排障：数据显示异常",
  "排障：消息收发异常",
  "排障：账号或席位异常",
  "排障：响应缓慢",
  "排障：AI 功能异常",
  "排障：其他问题",
  "产品观测",
] as const;

export const SupportInvestigationReasonSchema = Type.Union([
  Type.Literal("排障：页面加载异常"),
  Type.Literal("排障：数据显示异常"),
  Type.Literal("排障：消息收发异常"),
  Type.Literal("排障：账号或席位异常"),
  Type.Literal("排障：响应缓慢"),
  Type.Literal("排障：AI 功能异常"),
  Type.Literal("排障：其他问题"),
  Type.Literal("产品观测"),
]);

export const AuthSubUserSchema = Type.Object({
  accessMode: Type.Optional(AuthAccessModeSchema),
  accountType: AccountTypeSchema,
  canStartSupportInvestigation: Type.Optional(Type.Boolean()),
  displayName: Type.String(),
  permissions: Type.Array(AccountPermissionSchema),
  role: AccountRoleSchema,
  subUserId: Type.String(),
  uid: Type.Number(),
});

export const AuthLoginRequestSchema = Type.Object({
  account: Type.String(),
  altcha: Type.String(),
  password: Type.String(),
});

export const AuthEmbedSsoRequestSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 2048 }),
  uid: Type.String({ minLength: 1, maxLength: 2048 }),
});

export const AuthLoginResponseSchema = Type.Object({
  expiresIn: Type.Number(),
  subUser: AuthSubUserSchema,
});

export const AuthEmbedSsoResponseSchema = Type.Object({
  accessToken: Type.String({ minLength: 1 }),
  expiresIn: Type.Number(),
  subUser: AuthSubUserSchema,
});

export const AuthRefreshRequestSchema = Type.Object({});

export const AuthRefreshResponseSchema = Type.Object({
  expiresIn: Type.Number(),
  subUser: AuthSubUserSchema,
});

export const AuthSessionResponseSchema = Type.Object({
  subUser: AuthSubUserSchema,
});

export const SupportInvestigationTargetAccountSchema = Type.Object({
  accountType: AccountTypeSchema,
  displayName: Type.String(),
  maskedAccount: Type.String(),
  role: AccountRoleSchema,
  subUserId: Type.String(),
  uid: Type.Number(),
});

export const SupportInvestigationAccountListResponseSchema = Type.Object({
  accounts: Type.Array(SupportInvestigationTargetAccountSchema),
});

export const SupportInvestigationStartRequestSchema = Type.Object({
  reason: SupportInvestigationReasonSchema,
  subUserId: Type.String({ minLength: 1 }),
  uid: Type.Integer({ minimum: 1 }),
});

export const SupportInvestigationStartResponseSchema = Type.Object({
  expiresIn: Type.Number(),
  subUser: AuthSubUserSchema,
});

export const JwtUserSchema = Type.Object({
  accessMode: Type.Optional(AuthAccessModeSchema),
  actorSubUserId: Type.Optional(Type.String()),
  actorUid: Type.Optional(Type.Number()),
  investigationReason: Type.Optional(SupportInvestigationReasonSchema),
  roles: Type.Array(Type.String()),
  sessionId: Type.String(),
  sessionVersion: Type.Number(),
  subUserId: Type.String(),
  uid: Type.Number(),
});

export type AuthLoginRequest = Static<typeof AuthLoginRequestSchema>;
export type AuthEmbedSsoRequest = Static<typeof AuthEmbedSsoRequestSchema>;
export type AuthLoginResponse = Static<typeof AuthLoginResponseSchema>;
export type AuthEmbedSsoResponse = Static<typeof AuthEmbedSsoResponseSchema>;
export type AuthRefreshRequest = Static<typeof AuthRefreshRequestSchema>;
export type AuthRefreshResponse = Static<typeof AuthRefreshResponseSchema>;
export type AuthSessionResponse = Static<typeof AuthSessionResponseSchema>;
export type SupportInvestigationTargetAccount = Static<
  typeof SupportInvestigationTargetAccountSchema
>;
export type SupportInvestigationAccountListResponse = Static<
  typeof SupportInvestigationAccountListResponseSchema
>;
export type SupportInvestigationStartRequest = Static<
  typeof SupportInvestigationStartRequestSchema
>;
export type SupportInvestigationStartResponse = Static<
  typeof SupportInvestigationStartResponseSchema
>;
export type SupportInvestigationReason = Static<
  typeof SupportInvestigationReasonSchema
>;
export type JwtUser = Static<typeof JwtUserSchema>;
export type AccountRole = Static<typeof AccountRoleSchema>;
export type AccountPermission = Static<typeof AccountPermissionSchema>;
export type AccountType = Static<typeof AccountTypeSchema>;
export type AuthAccessMode = Static<typeof AuthAccessModeSchema>;
export type AuthSubUser = Static<typeof AuthSubUserSchema>;
