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

export const AuthSubUserSchema = Type.Object({
  accountType: AccountTypeSchema,
  displayName: Type.String(),
  permissions: Type.Array(AccountPermissionSchema),
  role: AccountRoleSchema,
  subUserId: Type.String(),
});

export const AuthLoginRequestSchema = Type.Object({
  account: Type.String(),
  altcha: Type.String(),
  password: Type.String(),
});

export const AuthLoginResponseSchema = Type.Object({
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

export const JwtUserSchema = Type.Object({
  roles: Type.Array(Type.String()),
  sessionId: Type.String(),
  sessionVersion: Type.Number(),
  subUserId: Type.String(),
});

export type AuthLoginRequest = Static<typeof AuthLoginRequestSchema>;
export type AuthLoginResponse = Static<typeof AuthLoginResponseSchema>;
export type AuthRefreshRequest = Static<typeof AuthRefreshRequestSchema>;
export type AuthRefreshResponse = Static<typeof AuthRefreshResponseSchema>;
export type AuthSessionResponse = Static<typeof AuthSessionResponseSchema>;
export type JwtUser = Static<typeof JwtUserSchema>;
export type AccountRole = Static<typeof AccountRoleSchema>;
export type AccountPermission = Static<typeof AccountPermissionSchema>;
export type AccountType = Static<typeof AccountTypeSchema>;
export type AuthSubUser = Static<typeof AuthSubUserSchema>;
