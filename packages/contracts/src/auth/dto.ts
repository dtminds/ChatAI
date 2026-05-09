import { Type, type Static } from "@sinclair/typebox";

export const AuthLoginRequestSchema = Type.Object({
  account: Type.String(),
  altcha: Type.String(),
  password: Type.String(),
});

export const AuthLoginResponseSchema = Type.Object({
  accessToken: Type.String(),
  expiresIn: Type.Number(),
  subUser: Type.Object({
    displayName: Type.String(),
    subUserId: Type.String(),
  }),
  tokenType: Type.Literal("Bearer"),
});

export const JwtUserSchema = Type.Object({
  subUserId: Type.String(),
  roles: Type.Array(Type.String()),
});

export type AuthLoginRequest = Static<typeof AuthLoginRequestSchema>;
export type AuthLoginResponse = Static<typeof AuthLoginResponseSchema>;
export type JwtUser = Static<typeof JwtUserSchema>;
