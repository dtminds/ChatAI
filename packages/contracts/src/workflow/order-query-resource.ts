import { Type, type Static } from "@sinclair/typebox";

export const WorkflowOrderPlatformSchema = Type.Object({
  id: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  name: Type.String({ maxLength: 256, minLength: 1 }),
}, { additionalProperties: false });

export const WorkflowOrderShopSchema = Type.Object({
  id: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  model: Type.Integer({ maximum: 3, minimum: 1 }),
  name: Type.String({ maxLength: 256, minLength: 1 }),
  platformId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
}, { additionalProperties: false });

export const WorkflowOrderStatusSchema = Type.Object({
  name: Type.String({ maxLength: 256, minLength: 1 }),
  status: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
}, { additionalProperties: false });

export const WorkflowOrderPlatformListResponseSchema = Type.Object({
  platforms: Type.Array(WorkflowOrderPlatformSchema, { maxItems: 100 }),
}, { additionalProperties: false });

export const WorkflowOrderShopListQuerySchema = Type.Object({
  platformIds: Type.Optional(Type.String({
    maxLength: 1024,
    pattern: "^[1-9][0-9]*(,[1-9][0-9]*)*$",
  })),
}, { additionalProperties: false });

export const WorkflowOrderShopListResponseSchema = Type.Object({
  shops: Type.Array(WorkflowOrderShopSchema, { maxItems: 500 }),
}, { additionalProperties: false });

export const WorkflowOrderStatusListResponseSchema = Type.Object({
  statuses: Type.Array(WorkflowOrderStatusSchema, { maxItems: 100 }),
}, { additionalProperties: false });

export type WorkflowOrderPlatform = Static<typeof WorkflowOrderPlatformSchema>;
export type WorkflowOrderShop = Static<typeof WorkflowOrderShopSchema>;
export type WorkflowOrderStatus = Static<typeof WorkflowOrderStatusSchema>;
export type WorkflowOrderPlatformListResponse = Static<typeof WorkflowOrderPlatformListResponseSchema>;
export type WorkflowOrderShopListResponse = Static<typeof WorkflowOrderShopListResponseSchema>;
export type WorkflowOrderStatusListResponse = Static<typeof WorkflowOrderStatusListResponseSchema>;
