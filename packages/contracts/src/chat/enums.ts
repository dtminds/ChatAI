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

export type LoginStatus = Static<typeof LoginStatusSchema>;
export type TakeoverStatus = Static<typeof TakeoverStatusSchema>;
