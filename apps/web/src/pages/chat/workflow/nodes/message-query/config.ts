import type {
  MessageQueryNodeData,
  WorkflowDynamicTimeReference,
  WorkflowTimeRange,
  WorkflowVariableSelector,
} from "../../types";

export const MESSAGE_QUERY_LIMIT_MIN = 1;
export const MESSAGE_QUERY_LIMIT_MAX = 50;
export function createDefaultMessageQueryTimeRange(): WorkflowTimeRange {
  return {
    end: { field: "enteredAt", kind: "current-node-lifecycle" },
    mode: "dynamic",
    start: { field: "occurredAt", kind: "workflow-trigger" },
  };
}

export function normalizeMessageQueryTimeRange(value: unknown): WorkflowTimeRange {
  if (!isRecord(value)) return createDefaultMessageQueryTimeRange();

  if (value.mode === "fixed") {
    return {
      endAt: typeof value.endAt === "string" ? value.endAt : "",
      mode: "fixed",
      startAt: typeof value.startAt === "string" ? value.startAt : "",
    };
  }

  if (value.mode === "dynamic") {
    return {
      end: normalizeDynamicTimeReference(
        value.end,
        { field: "enteredAt", kind: "current-node-lifecycle" },
      ),
      mode: "dynamic",
      start: normalizeDynamicTimeReference(
        value.start,
        { field: "occurredAt", kind: "workflow-trigger" },
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

export function getDynamicTimeReferenceLabel(
  reference: WorkflowDynamicTimeReference,
  resolveNodeTitle: (nodeId: string) => string | undefined,
  resolveOutputLabel: (selector: WorkflowVariableSelector) => string | undefined,
) {
  const source = reference.kind === "workflow-trigger"
    ? "开始.触发时间"
    : reference.kind === "current-node-lifecycle"
      ? "当前节点.进入时间"
      : reference.kind === "node-lifecycle"
        ? `${resolveNodeTitle(reference.nodeId) ?? "前序节点不可用"}.${reference.field === "enteredAt" ? "进入时间" : "退出时间"}`
        : resolveOutputLabel(reference.selector) ?? "前序节点时间不可用";

  return source;
}

function normalizeDynamicTimeReference(
  value: unknown,
  fallback: WorkflowDynamicTimeReference,
): WorkflowDynamicTimeReference {
  if (!isRecord(value)) return cloneDynamicTimeReference(fallback);

  if (value.kind === "workflow-trigger" && value.field === "occurredAt") {
    return { field: "occurredAt", kind: "workflow-trigger" };
  }
  if (value.kind === "current-node-lifecycle" && value.field === "enteredAt") {
    return { field: "enteredAt", kind: "current-node-lifecycle" };
  }
  if (
    value.kind === "node-lifecycle"
    && typeof value.nodeId === "string"
    && value.nodeId.trim()
    && (value.field === "enteredAt" || value.field === "exitedAt")
  ) {
    return { field: value.field, kind: "node-lifecycle", nodeId: value.nodeId };
  }
  if (value.kind === "node-output") {
    const selector = normalizeSelector(value.selector);
    if (selector) return { kind: "node-output", selector };
  }

  return cloneDynamicTimeReference(fallback);
}

function normalizeSelector(value: unknown) {
  return Array.isArray(value)
    && value.length === 3
    && value[0] === "node"
    && value.every((part) => typeof part === "string" && part.trim())
    ? [...value]
    : undefined;
}

function cloneDynamicTimeReference(reference: WorkflowDynamicTimeReference) {
  return {
    ...reference,
    ...(reference.kind === "node-output" ? { selector: [...reference.selector] } : {}),
  } as WorkflowDynamicTimeReference;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
