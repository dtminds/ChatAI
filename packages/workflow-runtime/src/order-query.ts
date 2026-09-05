import {
  isWorkflowNodeExecutionConfig,
  WORKFLOW_ORDER_QUERY_TIME_RANGE_REJECTION_DAYS,
  WorkflowOrderQueryCommandSchema,
  WorkflowOrderQueryResultSchema,
  type WorkflowOrderQueryCommand,
  type WorkflowOrderQueryExecutionConfig,
  type WorkflowOrderQueryResult,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";
import { createCapabilityCommandError } from "./capability-command-error.js";
import { readWorkflowOrderNumber } from "./order-number.js";
import { requireWorkflowVariableValue } from "./variable-content.js";

const WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1_000;

export const WORKFLOW_ORDER_QUERY_CAPABILITY_BINDING = {
  completeWithoutExecution: completeWorkflowOrderQueryWithoutExecution,
  createCommand: createWorkflowOrderQueryCommand,
  definition: {
    capabilityKey: "customer.order.query",
    commandSchema: WorkflowOrderQueryCommandSchema,
    contractVersion: 1,
    kind: "query",
    resultSchema: WorkflowOrderQueryResultSchema,
  },
  mapResult({ result }) {
    return mapWorkflowOrderQueryResult(result);
  },
  nodeKind: "order-query",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowOrderQueryCommandSchema,
  typeof WorkflowOrderQueryResultSchema,
  "query"
>;

export function createWorkflowOrderQueryCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowOrderQueryCommand {
  const config = requireWorkflowOrderQueryExecutionConfig(input.config);
  if (config.mode === "order-number") {
    const orderNumber = readWorkflowOrderNumber(requireWorkflowVariableValue(
      config.orderNumberSelector,
      input.context,
      orderQueryCommandError,
    ));
    if (!orderNumber) {
      throw orderQueryCommandError("Order Query order number did not resolve to usable text");
    }
    return { mode: "order-number", orderNumber: orderNumber.orderNumber };
  }
  if (!input.context.identities.xyId) {
    throw orderQueryCommandError("Order Query customer xyId is unavailable in the Run context");
  }
  const timeRange = resolveOrderTimeRange(config.conditions.timeRange, input.context);
  if (config.conditions.timeRange.mode !== "dynamic") {
    assertOrderTimeRangeWithinLookback(
      timeRange,
      input.context.currentNodeLifecycle.enteredAt,
    );
  }
  return {
    amount: structuredClone(config.conditions.amount),
    ...(config.conditions.goodsName === undefined
      ? {}
      : { goodsName: config.conditions.goodsName }),
    mode: "conditions",
    ...(config.conditions.platformId === undefined
      ? {}
      : { platformId: config.conditions.platformId }),
    shopIds: [...config.conditions.shopIds],
    timeField: config.conditions.timeField,
    timeRange,
    ...(config.conditions.orderStatus === undefined
      ? {}
      : { orderStatus: config.conditions.orderStatus }),
  };
}

function completeWorkflowOrderQueryWithoutExecution(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}) {
  const config = requireWorkflowOrderQueryExecutionConfig(input.config);
  if (config.mode !== "order-number") return undefined;
  const value = requireWorkflowVariableValue(
    config.orderNumberSelector,
    input.context,
    orderQueryCommandError,
  );
  return readWorkflowOrderNumber(value) === null
    ? { netAmount: 0, orderCount: 0, totalAmount: 0 }
    : undefined;
}

export function mapWorkflowOrderQueryResult(
  result: WorkflowOrderQueryResult,
): Record<string, unknown> {
  return {
    netAmount: result.netAmount,
    orderCount: result.orderCount,
    totalAmount: result.totalAmount,
  };
}

function requireWorkflowOrderQueryExecutionConfig(
  config: Record<string, unknown>,
): WorkflowOrderQueryExecutionConfig {
  if (!isWorkflowNodeExecutionConfig("order-query", config)) {
    throw orderQueryCommandError("Order Query execution config failed schema validation");
  }
  return structuredClone(config) as WorkflowOrderQueryExecutionConfig;
}

function resolveOrderTimeRange(
  timeRange: Extract<WorkflowOrderQueryExecutionConfig, { mode: "conditions" }>["conditions"]["timeRange"],
  context: WorkflowCapabilityCommandContext,
): [string, string] {
  if (timeRange.mode === "absolute") {
    return [
      `${timeRange.startAt.replace("T", " ")}:00`,
      `${timeRange.endAt.replace("T", " ")}:59`,
    ];
  }
  if (timeRange.mode === "dynamic") {
    const start = resolveDynamicTimeReference(timeRange.start, context);
    const end = resolveDynamicTimeReference(timeRange.end, context);
    if (start >= end) {
      throw orderQueryCommandError("Order Query dynamic time requires start before end");
    }
    return [formatWorkflowLocalDateTime(start), formatWorkflowLocalDateTime(end)];
  }
  const enteredAt = context.currentNodeLifecycle.enteredAt;
  const now = enteredAt ? new Date(enteredAt) : null;
  if (!now || Number.isNaN(now.getTime())) {
    throw orderQueryCommandError("Order Query relative time requires current node enteredAt");
  }
  const start = resolveRelativePoint(now, timeRange.start, 0);
  const end = resolveRelativePoint(now, timeRange.end, 59);
  if (start > end) {
    throw orderQueryCommandError("Order Query relative time is reversed");
  }
  return [formatWorkflowLocalDateTime(start), formatWorkflowLocalDateTime(end)];
}

function resolveDynamicTimeReference(
  selector: WorkflowVariableSelector,
  context: WorkflowCapabilityCommandContext,
) {
  const value = requireWorkflowVariableValue(selector, context, orderQueryCommandError);
  if (typeof value !== "string") {
    throw orderQueryCommandError(`Order Query ${selector.join(".")} time reference is invalid`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isSafeInteger(timestamp)) {
    throw orderQueryCommandError(`Order Query ${selector.join(".")} time reference is invalid`);
  }
  return new Date(timestamp);
}

function resolveRelativePoint(
  now: Date,
  point: Extract<
    Extract<WorkflowOrderQueryExecutionConfig, { mode: "conditions" }>["conditions"]["timeRange"],
    { mode: "relative" }
  >["start"],
  second: 0 | 59,
) {
  const unitMilliseconds = point.unit === "day"
    ? 86_400_000
    : point.unit === "hour"
      ? 3_600_000
      : 60_000;
  const shifted = new Date(now.getTime() - point.amount * unitMilliseconds);
  const [hour, minute] = point.time.split(":").map(Number);
  const local = new Date(shifted.getTime() + WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS);
  local.setUTCHours(hour!, minute!, second, 0);
  return new Date(local.getTime() - WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS);
}

function formatWorkflowLocalDateTime(value: Date) {
  return new Date(value.getTime() + WORKFLOW_TIMEZONE_OFFSET_MILLISECONDS)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function assertOrderTimeRangeWithinLookback(
  timeRange: [string, string],
  enteredAt: string | undefined,
) {
  const enteredAtMilliseconds = enteredAt ? Date.parse(enteredAt) : Number.NaN;
  const startMilliseconds = parseWorkflowLocalDateTime(timeRange[0]);
  const endMilliseconds = parseWorkflowLocalDateTime(timeRange[1]);
  if (!Number.isFinite(enteredAtMilliseconds)
    || !Number.isFinite(startMilliseconds)
    || !Number.isFinite(endMilliseconds)) {
    throw orderQueryCommandError("Order Query time range could not be validated");
  }
  const minute = 60_000;
  const now = Math.floor(enteredAtMilliseconds / minute) * minute;
  const start = Math.floor(startMilliseconds / minute) * minute;
  const end = Math.floor(endMilliseconds / minute) * minute;
  const rejectionThreshold = WORKFLOW_ORDER_QUERY_TIME_RANGE_REJECTION_DAYS * 86_400_000;
  if (start <= now - rejectionThreshold || end <= now - rejectionThreshold) {
    throw orderQueryCommandError("Order Query time range starts before the 360-day lookback");
  }
  if (end - start >= rejectionThreshold) {
    throw orderQueryCommandError("Order Query time range exceeds the 360-day maximum span");
  }
}

function parseWorkflowLocalDateTime(value: string) {
  return Date.parse(`${value.replace(" ", "T")}+08:00`);
}

const orderQueryCommandError = createCapabilityCommandError(
  "WORKFLOW_ORDER_QUERY_COMMAND_INVALID",
);
