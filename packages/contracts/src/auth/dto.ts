import { Type, type Static } from "@sinclair/typebox";

export const JwtUserSchema = Type.Object({
  subUserId: Type.String(),
  roles: Type.Array(Type.String()),
});

export type JwtUser = Static<typeof JwtUserSchema>;
