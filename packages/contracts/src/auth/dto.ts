import { Type, type Static } from "@sinclair/typebox";

export const AuthLoginRequestSchema = Type.Object({
  account: Type.String(),
  altcha: Type.String(),
  password: Type.String(),
});

export const AuthLoginResponseSchema = Type.Object({
  accessToken: Type.String(),
  expiresIn: Type.Number(),
  refreshToken: Type.String(),
  subUser: Type.Object({
    account: Type.String(),
    displayName: Type.String(),
    subUserId: Type.String(),
  }),
  tokenType: Type.Literal("Bearer"),
});

export const AuthRefreshRequestSchema = Type.Object({
  refreshToken: Type.String(),
});

export const AuthRefreshResponseSchema = Type.Object({
  accessToken: Type.String(),
  expiresIn: Type.Number(),
  refreshToken: Type.String(),
  tokenType: Type.Literal("Bearer"),
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
export type JwtUser = Static<typeof JwtUserSchema>;
