import type {
  MessageQueryNodeData,
  WorkflowTimeRange,
  WorkflowVariableSelector,
} from "../../types";
import {
  areWorkflowVariableSelectorsEqual,
  isWorkflowMessageQueryExecutionConfigComplete,
  isMessageQueryRelativeTimeRange,
} from "@chatai/contracts";

export const MESSAGE_QUERY_LIMIT_MIN = 1;
export const MESSAGE_QUERY_LIMIT_MAX = 50;
export function createDefaultMessageQueryRelativeTimeRange(): Extract<WorkflowTimeRange, { mode: "relative" }> {
  return {
    mode: "relative",
    start: { amount: 30, unit: "day", time: "00:00" },
    end: { amount: 0, unit: "day", time: "23:59" },
  };
}
export function createDefaultMessageQueryTimeRange(): WorkflowTimeRange {
  return {
    end: ["current-node-lifecycle", "enteredAt"],
    mode: "dynamic",
    start: ["trigger", "occurredAt"],
  };
}

export function normalizeMessageQueryTimeRange(value: unknown): WorkflowTimeRange {
  if (!isRecord(value)) return createDefaultMessageQueryTimeRange();

  if (value.mode === "relative") {
    return isMessageQueryRelativeTimeRange(value)
      ? structuredClone(value)
      : createDefaultMessageQueryRelativeTimeRange();
  }

  if (value.mode === "fixed") {
    return {
      endAt: typeof value.endAt === "string" ? value.endAt : "",
      mode: "fixed",
      startAt: typeof value.startAt === "string" ? value.startAt : "",
    };
  }

  if (value.mode === "dynamic") {
    return {
      end: normalizeTimeReferenceSelector(
        value.end,
        ["current-node-lifecycle", "enteredAt"],
      ),
      mode: "dynamic",
      start: normalizeTimeReferenceSelector(
        value.start,
        ["trigger", "occurredAt"],
      ),
    };
  }

  return createDefaultMessageQueryTimeRange();
}

export function normalizeMessageQueryLimit(value: unknown) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed)
    ? Math.min(MESSAGE_QUERY_LIMIT_MAX, Math.max(MESSAGE_QUERY_LIMIT_MIN, parsed))
    : 10;
}

export function normalizeMessageQueryTake(value: unknown): MessageQueryNodeData["take"] {
  return value === "earliest" ? "earliest" : "latest";
}

export function getMessageQueryMetric(data: Pick<MessageQueryNodeData, "limit" | "take">) {
  return `${data.take === "latest" ? "最新" : "最早"} ${data.limit} 条消息`;
}

export function getMessageQueryStatus(data: Pick<MessageQueryNodeData, "timeRange">) {
  const timeRange = normalizeMessageQueryTimeRange(data.timeRange);
  const configured = isWorkflowMessageQueryExecutionConfigComplete({
    limit: 1,
    take: "latest",
    timeRange,
  });

  return configured ? "ready" as const : "warning" as const;
}

export const areDynamicTimeReferencesEqual = areWorkflowVariableSelectorsEqual;

export function getDynamicTimeReferenceLabel(
  selector: WorkflowVariableSelector,
  resolveLabel: (selector: WorkflowVariableSelector) => string | undefined,
) {
  return resolveLabel(selector) ?? "时间变量不可用";
}

function normalizeTimeReferenceSelector(
  value: unknown,
  fallback: WorkflowVariableSelector,
): WorkflowVariableSelector {
  return normalizeSelector(value) ?? [...fallback];
}

function normalizeSelector(value: unknown) {
  return !Array.isArray(value)
    || value.length < 2
    || value.length > 4
    || !value.every((part) => typeof part === "string" && part.trim())
    ? undefined
    : [...value] as WorkflowVariableSelector;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
