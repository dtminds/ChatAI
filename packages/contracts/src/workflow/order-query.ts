import { Type, type Static } from "@sinclair/typebox";

export const WORKFLOW_ORDER_QUERY_PAGE_SIZE = 100;
export const WORKFLOW_ORDER_QUERY_MAX_SELECTED_SHOPS = 20;
export const WORKFLOW_ORDER_QUERY_MAX_LOOKBACK_DAYS = 360;
export const WORKFLOW_ORDER_QUERY_TIME_RANGE_REJECTION_DAYS =
  WORKFLOW_ORDER_QUERY_MAX_LOOKBACK_DAYS + 1;

const WorkflowOrderQueryVariablePathSegmentSchema = Type.String({
  maxLength: 128,
  minLength: 1,
  pattern: "^(?!(?:__proto__|prototype|constructor)$).+$",
});

export const WorkflowOrderQueryVariableSelectorSchema = Type.Array(
  WorkflowOrderQueryVariablePathSegmentSchema,
  { minItems: 2, maxItems: 4 },
);

export const WorkflowOrderQueryModeSchema = Type.Union([
  Type.Literal("order-number"),
  Type.Literal("conditions"),
]);

export const WorkflowOrderQueryRelativeUnitSchema = Type.Union([
  Type.Literal("day"),
  Type.Literal("hour"),
  Type.Literal("minute"),
]);

export const WorkflowOrderQueryTimeFieldSchema = Type.Union([
  Type.Literal("order-time"),
  Type.Literal("pay-time"),
  Type.Literal("finish-time"),
]);

const WorkflowOrderQueryRelativePointSchema = Type.Union([Type.Object({
  amount: Type.Integer({
    maximum: WORKFLOW_ORDER_QUERY_MAX_LOOKBACK_DAYS * 24 * 60,
    minimum: 0,
  }),
  time: Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }),
  unit: Type.Literal("day"),
}, { additionalProperties: false }), Type.Object({
  amount: Type.Integer({ minimum: 0, maximum: WORKFLOW_ORDER_QUERY_MAX_LOOKBACK_DAYS * 24 * 60 }),
  unit: Type.Union([Type.Literal("hour"), Type.Literal("minute")]),
}, { additionalProperties: false })]);

const WorkflowOrderQueryAbsoluteTimeSchema = Type.Object({
  endAt: Type.String({ maxLength: 16 }),
  mode: Type.Literal("absolute"),
  startAt: Type.String({ maxLength: 16 }),
}, { additionalProperties: false });

const WorkflowOrderQueryRelativeTimeSchema = Type.Object({
  end: WorkflowOrderQueryRelativePointSchema,
  mode: Type.Literal("relative"),
  start: WorkflowOrderQueryRelativePointSchema,
}, { additionalProperties: false });

const WorkflowOrderQueryDynamicTimeSchema = Type.Object({
  end: WorkflowOrderQueryVariableSelectorSchema,
  mode: Type.Literal("dynamic"),
  start: WorkflowOrderQueryVariableSelectorSchema,
}, { additionalProperties: false });

export const WorkflowOrderQueryTimeRangeSchema = Type.Union([
  WorkflowOrderQueryAbsoluteTimeSchema,
  WorkflowOrderQueryDynamicTimeSchema,
  WorkflowOrderQueryRelativeTimeSchema,
]);

export const WorkflowOrderQueryAmountSchema = Type.Object({
  max: Type.Optional(Type.Number({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 })),
  min: Type.Optional(Type.Number({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 })),
}, { additionalProperties: false });

export function hasValidWorkflowOrderQueryAmountPrecision(amount: {
  max?: number;
  min?: number;
}) {
  return [amount.min, amount.max].every(value => value === undefined
    || /^\d+(?:\.\d{1,2})?$/.test(String(value)));
}

export const WorkflowOrderQueryConditionSchema = Type.Object({
  amount: WorkflowOrderQueryAmountSchema,
  goodsName: Type.Optional(Type.String({ maxLength: 512, minLength: 1 })),
  orderStatus: Type.Optional(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 })),
  platformId: Type.Optional(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 })),
  timeRange: WorkflowOrderQueryTimeRangeSchema,
  timeField: WorkflowOrderQueryTimeFieldSchema,
  shopIds: Type.Array(
    Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    { maxItems: WORKFLOW_ORDER_QUERY_MAX_SELECTED_SHOPS, uniqueItems: true },
  ),
}, { additionalProperties: false });

export const WorkflowOrderQueryDraftConditionSchema = Type.Object({
  amount: WorkflowOrderQueryAmountSchema,
  goodsName: Type.Optional(Type.String({ maxLength: 512, minLength: 1 })),
  orderStatus: Type.Optional(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 })),
  platformId: Type.Optional(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 })),
  timeRange: WorkflowOrderQueryTimeRangeSchema,
  timeField: WorkflowOrderQueryTimeFieldSchema,
  shopIds: Type.Array(
    Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    { maxItems: WORKFLOW_ORDER_QUERY_MAX_SELECTED_SHOPS, uniqueItems: true },
  ),
}, { additionalProperties: false });

export const WorkflowOrderQueryDraftConfigSchema = Type.Union([
  Type.Object({
    mode: Type.Literal("order-number"),
    orderNumberSelector: Type.Optional(WorkflowOrderQueryVariableSelectorSchema),
  }, { additionalProperties: false }),
  Type.Object({
    conditions: Type.Optional(WorkflowOrderQueryDraftConditionSchema),
    mode: Type.Literal("conditions"),
  }, { additionalProperties: false }),
]);

export const WorkflowOrderQueryExecutionConfigSchema = Type.Union([
  Type.Object({
    mode: Type.Literal("order-number"),
    orderNumberSelector: WorkflowOrderQueryVariableSelectorSchema,
  }, { additionalProperties: false }),
  Type.Object({
    conditions: WorkflowOrderQueryConditionSchema,
    mode: Type.Literal("conditions"),
  }, { additionalProperties: false }),
]);

export const WorkflowOrderQueryCommandSchema = Type.Union([
  Type.Object({
    mode: Type.Literal("order-number"),
    orderNumber: Type.String({ maxLength: 64, minLength: 1 }),
  }, { additionalProperties: false }),
  Type.Object({
    amount: WorkflowOrderQueryAmountSchema,
    goodsName: Type.Optional(Type.String({ maxLength: 512, minLength: 1 })),
    mode: Type.Literal("conditions"),
    orderStatus: Type.Optional(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 })),
    timeField: WorkflowOrderQueryTimeFieldSchema,
    timeRange: Type.Tuple([
      Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$" }),
      Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$" }),
    ]),
    platformId: Type.Optional(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 })),
    shopIds: Type.Array(
      Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
      { maxItems: WORKFLOW_ORDER_QUERY_MAX_SELECTED_SHOPS, uniqueItems: true },
    ),
  }, { additionalProperties: false }),
]);

export const WorkflowOrderQueryResultSchema = Type.Object({
  netAmount: Type.Number({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  orderCount: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  totalAmount: Type.Number({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
}, { additionalProperties: false });

export const WorkflowOrderQueryTestRunVariableValueSchema = Type.Object({
  selector: WorkflowOrderQueryVariableSelectorSchema,
  value: Type.Union([
    Type.Number(),
    Type.String({ maxLength: 512 }),
  ]),
}, { additionalProperties: false });

export const WorkflowOrderQueryTestRunRequestSchema = Type.Union([
  Type.Object({
    expectedDraftVersion: Type.Integer({ minimum: 1 }),
    orderNumber: Type.String({ maxLength: 64, minLength: 1 }),
  }, { additionalProperties: false }),
  Type.Object({
    expectedDraftVersion: Type.Integer({ minimum: 1 }),
    externalUserId: Type.Optional(Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 })),
    variableValues: Type.Array(WorkflowOrderQueryTestRunVariableValueSchema, { maxItems: 2 }),
  }, { additionalProperties: false }),
]);

export const WorkflowOrderQueryTestRunOutputSchema = Type.Object({
  netAmount: Type.Number({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  orderCount: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  totalAmount: Type.Number({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
}, { additionalProperties: false });

export const WorkflowOrderQueryTestRunResponseSchema = Type.Object({
  output: WorkflowOrderQueryTestRunOutputSchema,
}, { additionalProperties: false });

export type WorkflowOrderQueryMode = Static<typeof WorkflowOrderQueryModeSchema>;
export type WorkflowOrderQueryTimeField = Static<typeof WorkflowOrderQueryTimeFieldSchema>;
export type WorkflowOrderQueryCondition = Static<typeof WorkflowOrderQueryConditionSchema>;
export type WorkflowOrderQueryDraftCondition = Static<typeof WorkflowOrderQueryDraftConditionSchema>;
export type WorkflowOrderQueryDraftConfig = Static<typeof WorkflowOrderQueryDraftConfigSchema>;
export type WorkflowOrderQueryExecutionConfig = Static<typeof WorkflowOrderQueryExecutionConfigSchema>;
export type WorkflowOrderQueryCommand = Static<typeof WorkflowOrderQueryCommandSchema>;
export type WorkflowOrderQueryResult = Static<typeof WorkflowOrderQueryResultSchema>;
export type WorkflowOrderQueryTestRunVariableValue = Static<
  typeof WorkflowOrderQueryTestRunVariableValueSchema
>;
export type WorkflowOrderQueryTestRunRequest = Static<typeof WorkflowOrderQueryTestRunRequestSchema>;
export type WorkflowOrderQueryTestRunOutput = Static<typeof WorkflowOrderQueryTestRunOutputSchema>;
export type WorkflowOrderQueryTestRunResponse = Static<typeof WorkflowOrderQueryTestRunResponseSchema>;
