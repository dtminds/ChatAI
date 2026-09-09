import { Type, type Static } from "@sinclair/typebox";
import {
  normalizeWorkflowLocalDateTimeToSecond,
  normalizeWorkflowLocalTimeToSecond,
} from "./local-date-time.js";

export const WORKFLOW_ORDER_QUERY_MAX_SELECTED_SHOPS = 20;
export const WORKFLOW_ORDER_QUERY_MAX_LOOKBACK_DAYS = 360;
export const WORKFLOW_ORDER_QUERY_MAX_AMOUNT = 100_000;
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
  time: Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$" }),
  unit: Type.Literal("day"),
}, { additionalProperties: false }), Type.Object({
  amount: Type.Integer({ minimum: 0, maximum: WORKFLOW_ORDER_QUERY_MAX_LOOKBACK_DAYS * 24 * 60 }),
  unit: Type.Union([Type.Literal("hour"), Type.Literal("minute")]),
}, { additionalProperties: false })]);

const WorkflowOrderQueryAbsoluteTimeSchema = Type.Object({
  endAt: Type.String({ maxLength: 19 }),
  mode: Type.Literal("absolute"),
  startAt: Type.String({ maxLength: 19 }),
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
  max: Type.Optional(Type.Number({ maximum: WORKFLOW_ORDER_QUERY_MAX_AMOUNT, minimum: 0 })),
  min: Type.Optional(Type.Number({ maximum: WORKFLOW_ORDER_QUERY_MAX_AMOUNT, minimum: 0 })),
}, { additionalProperties: false });

export function hasValidWorkflowOrderQueryAmountPrecision(amount: {
  max?: number;
  min?: number;
}) {
  return [amount.min, amount.max].every(value => value === undefined
    || /^\d+(?:\.\d{1,2})?$/.test(String(value)));
}

export function isWorkflowOrderQueryRelativeRangeComplete(
  range: Static<typeof WorkflowOrderQueryRelativeTimeSchema>,
) {
  const { start, end } = range;
  if ([start, end].some(point => getWorkflowOrderQueryRelativeLookbackMilliseconds(point)
    > WORKFLOW_ORDER_QUERY_MAX_LOOKBACK_DAYS * 86_400_000)) {
    return false;
  }
  if (start.unit !== "day" && end.unit !== "day") {
    return getWorkflowOrderQueryRelativeLookbackMilliseconds(start)
      >= getWorkflowOrderQueryRelativeLookbackMilliseconds(end);
  }
  if (start.unit === "day" && end.unit === "day") {
    return start.amount > end.amount
      || (start.amount === end.amount && start.time <= end.time);
  }
  const midnight = Date.parse("2000-01-01T00:00:00+08:00");
  return [midnight, midnight + 86_400_000 - 1].some(anchor =>
    resolveWorkflowOrderQueryRelativePoint(anchor, start)
      <= resolveWorkflowOrderQueryRelativePoint(anchor, end));
}

function getWorkflowOrderQueryRelativeLookbackMilliseconds(
  point: Static<typeof WorkflowOrderQueryRelativePointSchema>,
) {
  const unitMilliseconds = point.unit === "day"
    ? 86_400_000
    : point.unit === "hour"
      ? 3_600_000
      : 60_000;
  return point.amount * unitMilliseconds;
}

function resolveWorkflowOrderQueryRelativePoint(
  enteredAt: number,
  point: Static<typeof WorkflowOrderQueryRelativePointSchema>,
) {
  if (point.unit !== "day") {
    return enteredAt - getWorkflowOrderQueryRelativeLookbackMilliseconds(point);
  }
  const offsetMilliseconds = 8 * 3_600_000;
  const local = new Date(
    enteredAt - getWorkflowOrderQueryRelativeLookbackMilliseconds(point) + offsetMilliseconds,
  );
  const [hours, minutes, seconds] = point.time.split(":").map(Number);
  local.setUTCHours(hours!, minutes!, seconds!, 0);
  return local.getTime() - offsetMilliseconds;
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

/**
 * Upgrades minute-only order-query values at read boundaries. Keep malformed
 * values intact so execution validation reports configuration errors instead of
 * replacing the user's conditions with defaults.
 */
export function normalizeWorkflowOrderQueryConfigTimePrecision<T>(value: T): T {
  if (!isRecord(value) || value.mode !== "conditions" || !isRecord(value.conditions)) return value;
  const timeRange = normalizeWorkflowOrderQueryTimeRangeTimePrecision(value.conditions.timeRange);
  if (timeRange === value.conditions.timeRange) return value;
  return {
    ...value,
    conditions: { ...value.conditions, timeRange },
  } as T;
}

export function normalizeWorkflowOrderQueryTimeRangeTimePrecision<T>(value: T): T {
  if (!isRecord(value)) return value;
  if (value.mode === "absolute") {
    return {
      ...value,
      endAt: normalizeWorkflowLocalDateTimeToSecond(value.endAt, true) ?? value.endAt,
      startAt: normalizeWorkflowLocalDateTimeToSecond(value.startAt, false) ?? value.startAt,
    } as T;
  }
  if (value.mode !== "relative") return value;
  return {
    ...value,
    end: normalizeOrderQueryRelativePointTimePrecision(value.end, true),
    start: normalizeOrderQueryRelativePointTimePrecision(value.start, false),
  } as T;
}

function normalizeOrderQueryRelativePointTimePrecision(value: unknown, end: boolean) {
  if (!isRecord(value) || value.unit !== "day") return value;
  const time = normalizeWorkflowLocalTimeToSecond(value.time, end);
  return time === undefined ? value : { ...value, time };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
