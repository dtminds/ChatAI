import {
  isWorkflowNodeExecutionConfig,
  WORKFLOW_ORDER_QUERY_MAX_LOOKBACK_DAYS,
  WORKFLOW_ORDER_QUERY_TIME_RANGE_REJECTION_DAYS,
  type WorkflowOrderQueryDraftCondition,
  type WorkflowOrderQueryDraftConfig,
  type WorkflowVariableSelector,
} from "@chatai/contracts";

const WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1_000;
const ORDER_QUERY_MAX_LOOKBACK_MILLISECONDS =
  WORKFLOW_ORDER_QUERY_MAX_LOOKBACK_DAYS * 86_400_000;
const ORDER_QUERY_TIME_RANGE_REJECTION_MILLISECONDS =
  WORKFLOW_ORDER_QUERY_TIME_RANGE_REJECTION_DAYS * 86_400_000;

export type OrderQueryConditionValidationErrors = {
  amount?: string;
  timeRange?: string;
};

type RelativePoint = Extract<
  WorkflowOrderQueryDraftCondition["timeRange"],
  { mode: "relative" }
>["start"];

export function createDefaultOrderQueryConditions(): WorkflowOrderQueryDraftCondition {
  return {
    amount: {},
    shopIds: [],
    timeField: "order-time",
    timeRange: createDefaultOrderQueryDynamicTimeRange(),
  };
}

export function createDefaultOrderQueryDynamicTimeRange() {
  return {
    end: ["current-node-lifecycle", "enteredAt"] as WorkflowVariableSelector,
    mode: "dynamic" as const,
    start: ["trigger", "occurredAt"] as WorkflowVariableSelector,
  };
}

export function createDefaultOrderQueryRelativeTimeRange() {
  return {
    end: { amount: 0, time: "23:59", unit: "day" as const },
    mode: "relative" as const,
    start: { amount: 30, time: "00:00", unit: "day" as const },
  };
}

export function normalizeOrderQuerySelector(value: unknown): WorkflowVariableSelector | undefined {
  return Array.isArray(value)
    && value.length >= 2
    && value.length <= 4
    && value.every(part => typeof part === "string" && part.trim())
    ? [...value] as WorkflowVariableSelector
    : undefined;
}

export function getOrderQueryMetric(config: WorkflowOrderQueryDraftConfig) {
  if (config.mode === "order-number") {
    return config.orderNumberSelector ? "按订单号查询" : "待配置订单号";
  }
  return config.conditions ? "按条件查询" : "待配置查询条件";
}

export function isOrderQueryReady(config: WorkflowOrderQueryDraftConfig) {
  return isWorkflowNodeExecutionConfig("order-query", config);
}

export function isOrderNumberVariable(valueType: { kind: string }) {
  return valueType.kind === "string" || valueType.kind === "number";
}

export function validateOrderQueryConditions(
  conditions: WorkflowOrderQueryDraftCondition,
  now: Date = new Date(),
): OrderQueryConditionValidationErrors {
  const errors: OrderQueryConditionValidationErrors = {};
  if (conditions.amount.min !== undefined
    && conditions.amount.max !== undefined
    && conditions.amount.min > conditions.amount.max) {
    errors.amount = "最低金额不能大于最高金额";
  }
  const timeRangeError = validateOrderQueryTimeRange(conditions.timeRange, now);
  if (timeRangeError) errors.timeRange = timeRangeError;
  return errors;
}

function validateOrderQueryTimeRange(
  timeRange: WorkflowOrderQueryDraftCondition["timeRange"],
  now: Date,
) {
  if (timeRange.mode === "dynamic") return undefined;
  const nowMilliseconds = Math.floor(now.getTime() / 60_000) * 60_000;
  let startMilliseconds: number | undefined;
  let endMilliseconds: number | undefined;
  if (timeRange.mode === "absolute") {
    startMilliseconds = parseOrderQueryLocalDateTime(timeRange.startAt);
    endMilliseconds = parseOrderQueryLocalDateTime(timeRange.endAt);
    if (startMilliseconds === undefined || endMilliseconds === undefined) {
      return "请选择完整的开始和结束时间";
    }
  } else {
    if ([timeRange.start, timeRange.end].some(point =>
      getRelativeLookbackMilliseconds(point) > ORDER_QUERY_MAX_LOOKBACK_MILLISECONDS)) {
      return "时间不能早于360天前";
    }
    startMilliseconds = resolveRelativePoint(now, timeRange.start);
    endMilliseconds = resolveRelativePoint(now, timeRange.end);
  }
  if (startMilliseconds > endMilliseconds) return "开始时间不能晚于结束时间";
  if (startMilliseconds <= nowMilliseconds - ORDER_QUERY_TIME_RANGE_REJECTION_MILLISECONDS
    || endMilliseconds <= nowMilliseconds - ORDER_QUERY_TIME_RANGE_REJECTION_MILLISECONDS) {
    return "时间不能早于360天前";
  }
  if (endMilliseconds - startMilliseconds >= ORDER_QUERY_TIME_RANGE_REJECTION_MILLISECONDS) {
    return "时间跨度不能超过360天";
  }
  return undefined;
}

function parseOrderQueryLocalDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T((?:[01]\d|2[0-3])):([0-5]\d)$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const localMilliseconds = Date.UTC(year, month - 1, day, hour, minute);
  const normalized = new Date(localMilliseconds);
  if (normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
    || normalized.getUTCHours() !== hour
    || normalized.getUTCMinutes() !== minute) {
    return undefined;
  }
  return localMilliseconds - WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS;
}

function resolveRelativePoint(now: Date, point: RelativePoint) {
  const shifted = new Date(now.getTime() - getRelativeLookbackMilliseconds(point));
  const [hour, minute] = point.time.split(":").map(Number);
  const local = new Date(shifted.getTime() + WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS);
  local.setUTCHours(hour!, minute!, 0, 0);
  return local.getTime() - WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS;
}

function getRelativeLookbackMilliseconds(point: RelativePoint) {
  const unitMilliseconds = point.unit === "day"
    ? 86_400_000
    : point.unit === "hour"
      ? 3_600_000
      : 60_000;
  return point.amount * unitMilliseconds;
}
