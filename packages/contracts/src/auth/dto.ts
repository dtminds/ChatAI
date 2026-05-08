import { Type, type Static } from "@sinclair/typebox";

export const JwtUserSchema = Type.Object({
  employeeId: Type.String(),
  roles: Type.Array(Type.String()),
});

export type JwtUser = Static<typeof JwtUserSchema>;
