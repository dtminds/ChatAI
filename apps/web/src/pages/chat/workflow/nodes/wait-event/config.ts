import { WORKFLOW_WAIT_DURATION_MAX_BY_UNIT } from "@chatai/contracts";
import type {
  WaitEventNodeData,
  WorkflowWaitEventTimeoutUnit,
  WorkflowWaitEventType,
} from "../../types";
import { getWorkflowWaitEventDefinition } from "./events";

export const DEFAULT_WAIT_EVENT_TYPE: WorkflowWaitEventType = "customer.message.received";
export const WAIT_EVENT_TIMEOUT_MAX_BY_UNIT = {
  ...WORKFLOW_WAIT_DURATION_MAX_BY_UNIT,
  day: 15,
} as const;

export function normalizeWaitEventType(value: unknown): WorkflowWaitEventType {
  return value === "customer.message.received"
    ? value
    : DEFAULT_WAIT_EVENT_TYPE;
}

export function normalizeWaitEventTimeoutUnit(value: unknown): WorkflowWaitEventTimeoutUnit {
  return value === "minute" || value === "hour" || value === "day"
    ? value
    : "hour";
}

export function normalizeWaitEventTimeout(
  value: unknown,
): WaitEventNodeData["timeout"] {
  const timeout = isRecord(value) ? value : {};
  const unit = normalizeWaitEventTimeoutUnit(timeout.unit);
  const parsedDuration = Math.trunc(Number(timeout.duration));
  const duration = Number.isFinite(parsedDuration)
    ? Math.min(
        WAIT_EVENT_TIMEOUT_MAX_BY_UNIT[unit],
        Math.max(1, parsedDuration),
      )
    : unit === "hour" ? 24 : 1;

  return { duration, unit };
}

export function getWaitEventMetric(data: Pick<WaitEventNodeData, "event" | "timeout">) {
  const event = getWorkflowWaitEventDefinition(normalizeWaitEventType(data.event?.type));
  const timeout = normalizeWaitEventTimeout(data.timeout);
  return `等待${event.shortLabel} · 最长 ${timeout.duration} ${getWaitEventUnitLabel(timeout.unit)}`;
}

export function getWaitEventUnitLabel(unit: WorkflowWaitEventTimeoutUnit) {
  if (unit === "minute") return "分钟";
  if (unit === "hour") return "小时";
  return "天";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
