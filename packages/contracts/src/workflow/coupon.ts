import { Type, type Static } from "@sinclair/typebox";

export const WORKFLOW_COUPON_MAX_NUMBER = 5;
export const WORKFLOW_COUPON_PAGE_SIZE = 10;
export const WORKFLOW_COUPON_MAX_PAGE_SIZE = 50;
export const WORKFLOW_COUPON_MAX_PAGE = 1000;

const CouponIdSchema = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const CouponNumberSchema = Type.Integer({ minimum: 1, maximum: WORKFLOW_COUPON_MAX_NUMBER });

export const WorkflowCouponSnapshotSchema = Type.Object({
  couponId: CouponIdSchema,
  couponName: Type.String({ minLength: 1, maxLength: 256 }),
  couponContent: Type.String({ maxLength: 2048 }),
  couponType: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)]),
}, { additionalProperties: false });

export const WorkflowCouponResourceSchema = Type.Object({
  couponId: CouponIdSchema,
  couponName: Type.String({ minLength: 1, maxLength: 256 }),
  couponContent: Type.String({ maxLength: 2048 }),
  couponType: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)]),
  stocks: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  limitNum: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
}, { additionalProperties: false });

export const WorkflowCouponDraftConfigSchema = Type.Object({
  coupon: Type.Optional(WorkflowCouponSnapshotSchema),
  number: CouponNumberSchema,
}, { additionalProperties: false });

export const WorkflowCouponExecutionConfigSchema = Type.Object({
  couponId: CouponIdSchema,
  number: CouponNumberSchema,
}, { additionalProperties: false });

export const WorkflowCouponCommandSchema = WorkflowCouponExecutionConfigSchema;
export const WorkflowCouponResultSchema = Type.Object({}, { additionalProperties: false });

export const WorkflowCouponListQuerySchema = Type.Object({
  couponId: Type.Optional(CouponIdSchema),
  couponName: Type.Optional(Type.String({ maxLength: 256 })),
  page: Type.Integer({ minimum: 1, maximum: WORKFLOW_COUPON_MAX_PAGE, default: 1 }),
  pageSize: Type.Integer({ minimum: 1, maximum: WORKFLOW_COUPON_MAX_PAGE_SIZE, default: WORKFLOW_COUPON_PAGE_SIZE }),
}, { additionalProperties: false });

export const WorkflowCouponListResponseSchema = Type.Object({
  items: Type.Array(WorkflowCouponResourceSchema, { maxItems: WORKFLOW_COUPON_MAX_PAGE_SIZE }),
  total: Type.Integer({ minimum: 0 }),
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1, maximum: WORKFLOW_COUPON_MAX_PAGE_SIZE }),
  hasNext: Type.Boolean(),
}, { additionalProperties: false });

export type WorkflowCouponSnapshot = Static<typeof WorkflowCouponSnapshotSchema>;
export type WorkflowCouponResource = Static<typeof WorkflowCouponResourceSchema>;
export type WorkflowCouponDraftConfig = Static<typeof WorkflowCouponDraftConfigSchema>;
export type WorkflowCouponCommand = Static<typeof WorkflowCouponCommandSchema>;
export type WorkflowCouponListQuery = Static<typeof WorkflowCouponListQuerySchema>;
export type WorkflowCouponListResponse = Static<typeof WorkflowCouponListResponseSchema>;
