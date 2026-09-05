import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { WorkflowMessagesV1Schema } from "./messages.js";
import { isValidWorkflowLocalDateTime } from "./local-date-time.js";

export const WORKFLOW_MESSAGE_QUERY_MAX_LOOKBACK_DAYS = 90;
export const WORKFLOW_MESSAGE_QUERY_TIME_RANGE_REJECTION_DAYS =
  WORKFLOW_MESSAGE_QUERY_MAX_LOOKBACK_DAYS + 1;

const WorkflowMessageQueryRelativePointSchema = Type.Object({
  amount: Type.Integer({ minimum: 0, maximum: WORKFLOW_MESSAGE_QUERY_MAX_LOOKBACK_DAYS * 24 * 60 }),
  time: Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }),
  unit: Type.Union([Type.Literal("day"), Type.Literal("hour"), Type.Literal("minute")]),
}, { additionalProperties: false });

export const WorkflowMessageQueryRelativeTimeRangeSchema = Type.Object({
  mode: Type.Literal("relative"),
  start: WorkflowMessageQueryRelativePointSchema,
  end: WorkflowMessageQueryRelativePointSchema,
}, { additionalProperties: false });

export type WorkflowMessageQueryRelativePoint = Static<typeof WorkflowMessageQueryRelativePointSchema>;

export function isMessageQueryRelativeTimeRange(value: unknown): value is Static<typeof WorkflowMessageQueryRelativeTimeRangeSchema> {
  return Value.Check(WorkflowMessageQueryRelativeTimeRangeSchema, value);
}

export function getMessageQueryRelativeAmountMax(unit: WorkflowMessageQueryRelativePoint["unit"]) {
  return WORKFLOW_MESSAGE_QUERY_MAX_LOOKBACK_DAYS * (unit === "day" ? 1 : unit === "hour" ? 24 : 24 * 60);
}

export function isMessageQueryRelativeRangeComplete(
  range: Static<typeof WorkflowMessageQueryRelativeTimeRangeSchema>,
) {
  const { start, end } = range;
  if ([start, end].some(point => point.amount > getMessageQueryRelativeAmountMax(point.unit))) return false;
  const minutes = (point: WorkflowMessageQueryRelativePoint) =>
    point.amount * (point.unit === "day" ? 1440 : point.unit === "hour" ? 60 : 1);
  const difference = minutes(start) - minutes(end);
  return difference > -1440 && (difference > 0 || start.time <= end.time);
}

export function resolveMessageQueryRelativePoint(
  enteredAt: number,
  point: WorkflowMessageQueryRelativePoint,
  end: boolean,
) {
  const unitMs = point.unit === "day" ? 86_400_000 : point.unit === "hour" ? 3_600_000 : 60_000;
  const offsetMs = 8 * 3_600_000;
  const local = new Date(enteredAt - point.amount * unitMs + offsetMs);
  const [hours, minutes] = point.time.split(":").map(Number);
  local.setUTCHours(hours!, minutes!, end ? 59 : 0, end ? 999 : 0);
  return local.getTime() - offsetMs;
}

export function isMessageQueryRelativeRangeWithinBounds(
  enteredAt: number,
  rangeStart: number,
  rangeEnd: number,
) {
  const maximumSpan = WORKFLOW_MESSAGE_QUERY_TIME_RANGE_REJECTION_DAYS * 86_400_000;
  return Number.isFinite(enteredAt)
    && rangeStart < rangeEnd
    && rangeStart > enteredAt - maximumSpan
    && rangeEnd > enteredAt - maximumSpan
    && rangeEnd - rangeStart < maximumSpan;
}

export function isMessageQueryFixedRangeWithinBounds(
  now: number,
  startAt: string,
  endAt: string,
) {
  return isValidWorkflowLocalDateTime(startAt)
    && isValidWorkflowLocalDateTime(endAt)
    && isMessageQueryRelativeRangeWithinBounds(
      now,
      Date.parse(`${startAt}:00+08:00`),
      Date.parse(`${endAt}:59.999+08:00`),
    );
}

const WorkflowMessageQueryTimestampSchema = Type.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{3}Z$",
});

export const WorkflowMessageQueryCommandSchema = Type.Object({
  limit: Type.Integer({ maximum: 50, minimum: 1 }),
  rangeEnd: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  rangeStart: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
  seatId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  take: Type.Union([Type.Literal("earliest"), Type.Literal("latest")]),
}, { additionalProperties: false });

export const WorkflowMessageQueryResultSchema = Type.Object({
  messageCount: Type.Integer({ maximum: 50, minimum: 0 }),
  messages: WorkflowMessagesV1Schema,
  rangeEnd: WorkflowMessageQueryTimestampSchema,
  rangeStart: WorkflowMessageQueryTimestampSchema,
}, { additionalProperties: false });

export type WorkflowMessageQueryCommand = Static<typeof WorkflowMessageQueryCommandSchema>;
export type WorkflowMessageQueryResult = Static<typeof WorkflowMessageQueryResultSchema>;
