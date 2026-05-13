import { Type, type Static } from "@sinclair/typebox";

export const AuthLoginRequestSchema = Type.Object({
  account: Type.String(),
  altcha: Type.String(),
  password: Type.String(),
});

export const AuthLoginResponseSchema = Type.Object({
  expiresIn: Type.Number(),
  subUser: Type.Object({
    displayName: Type.String(),
    subUserId: Type.String(),
  }),
});

export const AuthRefreshRequestSchema = Type.Object({});

export const AuthRefreshResponseSchema = Type.Object({
  expiresIn: Type.Number(),
});

export const AuthSessionResponseSchema = Type.Object({
  subUser: Type.Object({
    displayName: Type.String(),
    subUserId: Type.String(),
  }),
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
