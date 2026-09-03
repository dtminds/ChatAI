import {
  DEFAULT_WORKFLOW_WAIT_EVENT_DELAY,
  WORKFLOW_WAIT_EVENT_DELAY_MAX_BY_UNIT,
  WORKFLOW_WAIT_EVENT_TIMEOUT_MAX_BY_UNIT,
} from "@chatai/contracts";
import type {
  WaitEventNodeData,
  WorkflowWaitEventDelayUnit,
  WorkflowWaitEventTimeoutUnit,
  WorkflowWaitEventType,
} from "../../types";
import { getWorkflowWaitEventDefinition } from "./events";

export const DEFAULT_WAIT_EVENT_TYPE: WorkflowWaitEventType = "message.received";
export const WAIT_EVENT_DELAY_MAX_BY_UNIT = WORKFLOW_WAIT_EVENT_DELAY_MAX_BY_UNIT;
export const WAIT_EVENT_TIMEOUT_MAX_BY_UNIT = WORKFLOW_WAIT_EVENT_TIMEOUT_MAX_BY_UNIT;

export function normalizeWaitEventType(value: unknown): WorkflowWaitEventType {
  return value === "message.received"
    ? value
    : DEFAULT_WAIT_EVENT_TYPE;
}

export function normalizeWaitEventTimeoutUnit(value: unknown): WorkflowWaitEventTimeoutUnit {
  return value === "minute" || value === "hour" || value === "day"
    ? value
    : "hour";
}

export function normalizeWaitEventDelayUnit(value: unknown): WorkflowWaitEventDelayUnit {
  return value === "second" || value === "minute" || value === "hour" || value === "day"
    ? value
    : DEFAULT_WORKFLOW_WAIT_EVENT_DELAY.unit;
}

export function normalizeWaitEventDelay(value: unknown): WaitEventNodeData["delay"] {
  const delay = isRecord(value) ? value : {};
  const unit = normalizeWaitEventDelayUnit(delay.unit);
  const minimum = unit === "second" ? 0 : 1;
  const parsedDuration = Math.trunc(Number(delay.duration));
  const duration = Number.isFinite(parsedDuration)
    ? Math.min(
        WAIT_EVENT_DELAY_MAX_BY_UNIT[unit],
        Math.max(minimum, parsedDuration),
      )
    : unit === DEFAULT_WORKFLOW_WAIT_EVENT_DELAY.unit
      ? DEFAULT_WORKFLOW_WAIT_EVENT_DELAY.duration
      : minimum;
  return { duration, unit };
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

export function getWaitEventMetric(data: Pick<WaitEventNodeData, "delay" | "event" | "timeout">) {
  const event = getWorkflowWaitEventDefinition(normalizeWaitEventType(data.event?.type));
  const delay = normalizeWaitEventDelay(data.delay);
  const timeout = normalizeWaitEventTimeout(data.timeout);
  return `等待${event.shortLabel} · 达到后等待 ${delay.duration} ${getWaitEventUnitLabel(delay.unit)} · 最长 ${timeout.duration} ${getWaitEventUnitLabel(timeout.unit)}`;
}

export function getWaitEventUnitLabel(unit: WorkflowWaitEventDelayUnit) {
  if (unit === "second") return "秒";
  if (unit === "minute") return "分钟";
  if (unit === "hour") return "小时";
  return "天";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
