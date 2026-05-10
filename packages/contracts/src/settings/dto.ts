import { Type, type Static } from "@sinclair/typebox";

export const SettingsSubAccountStatusSchema = Type.Union([
  Type.Literal("active"),
  Type.Literal("disabled"),
]);

export const SettingsSubAccountTypeSchema = Type.Union([
  Type.Literal(0),
  Type.Literal(1),
]);

export const SettingsWeComSeatSchema = Type.Object({
  avatarUrl: Type.String(),
  name: Type.String(),
  seatId: Type.String(),
});

export const SettingsSubAccountSchema = Type.Object({
  account: Type.String(),
  id: Type.String(),
  name: Type.String(),
  seats: Type.Array(SettingsWeComSeatSchema),
  status: SettingsSubAccountStatusSchema,
  type: SettingsSubAccountTypeSchema,
});

export const SettingsSubAccountsResponseSchema = Type.Object({
  seats: Type.Array(SettingsWeComSeatSchema),
  subAccounts: Type.Array(SettingsSubAccountSchema),
});

export const SettingsSubAccountCreateRequestSchema = Type.Object({
  account: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  password: Type.String({ minLength: 1 }),
  seatIds: Type.Array(Type.String()),
}, { additionalProperties: false });

export const SettingsSubAccountUpdateRequestSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  password: Type.Optional(Type.String()),
  seatIds: Type.Array(Type.String()),
}, { additionalProperties: false });

export const SettingsSubAccountStatusUpdateRequestSchema = Type.Object({
  status: SettingsSubAccountStatusSchema,
}, { additionalProperties: false });

export type SettingsSubAccountStatus = Static<
  typeof SettingsSubAccountStatusSchema
>;
export type SettingsSubAccountType = Static<typeof SettingsSubAccountTypeSchema>;
export type SettingsWeComSeat = Static<typeof SettingsWeComSeatSchema>;
export type SettingsSubAccount = Static<typeof SettingsSubAccountSchema>;
export type SettingsSubAccountsResponse = Static<
  typeof SettingsSubAccountsResponseSchema
>;
export type SettingsSubAccountCreateRequest = Static<
  typeof SettingsSubAccountCreateRequestSchema
>;
export type SettingsSubAccountUpdateRequest = Static<
  typeof SettingsSubAccountUpdateRequestSchema
>;
export type SettingsSubAccountStatusUpdateRequest = Static<
  typeof SettingsSubAccountStatusUpdateRequestSchema
>;
