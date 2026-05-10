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

export const SettingsManagedAccountOnlineStatusSchema = Type.Union([
  Type.Literal("online"),
  Type.Literal("offline"),
]);

export const SettingsManagedAccountSubAccountSchema = Type.Object({
  account: Type.String(),
  id: Type.String(),
  isTakingOver: Type.Boolean(),
  name: Type.String(),
  status: SettingsSubAccountStatusSchema,
  type: SettingsSubAccountTypeSchema,
});

export const SettingsManagedAccountSchema = Type.Object({
  avatarUrl: Type.String(),
  id: Type.String(),
  name: Type.String(),
  onlineStatus: SettingsManagedAccountOnlineStatusSchema,
  subAccounts: Type.Array(SettingsManagedAccountSubAccountSchema),
});

export const SettingsManagedAccountsResponseSchema = Type.Object({
  managedAccounts: Type.Array(SettingsManagedAccountSchema),
  subAccounts: Type.Array(SettingsManagedAccountSubAccountSchema),
});

export const SettingsManagedAccountSubAccountsUpdateRequestSchema = Type.Object({
  subAccountIds: Type.Array(Type.String()),
}, { additionalProperties: false });

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
export type SettingsManagedAccountOnlineStatus = Static<
  typeof SettingsManagedAccountOnlineStatusSchema
>;
export type SettingsManagedAccountSubAccount = Static<
  typeof SettingsManagedAccountSubAccountSchema
>;
export type SettingsManagedAccount = Static<typeof SettingsManagedAccountSchema>;
export type SettingsManagedAccountsResponse = Static<
  typeof SettingsManagedAccountsResponseSchema
>;
export type SettingsManagedAccountSubAccountsUpdateRequest = Static<
  typeof SettingsManagedAccountSubAccountsUpdateRequestSchema
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
