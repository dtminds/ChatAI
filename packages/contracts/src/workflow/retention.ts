import type { WorkflowEntryPolicy } from "./trigger.js";

export const WORKFLOW_ENTRY_WINDOW_MAX_DAYS = 90;
export const WORKFLOW_ENTRY_WINDOW_MAX_HOURS = 2_160;
export const WORKFLOW_ENTRY_MAX_ENTRIES = 10;
export const WORKFLOW_INBOX_RETENTION_DAYS = 31;
export const WORKFLOW_RUN_RETENTION_DAYS = 180;
export const WORKFLOW_TASK_OUTBOX_RETENTION_DAYS = 30;

export function normalizeWorkflowEntryPolicy(policy: WorkflowEntryPolicy): WorkflowEntryPolicy;
export function normalizeWorkflowEntryPolicy(policy: unknown): unknown;
export function normalizeWorkflowEntryPolicy(policy: unknown): unknown {
  if (!policy || typeof policy !== "object" || !("mode" in policy)) {
    return structuredClone(policy);
  }
  const normalized = structuredClone(policy);
  if (
    "maxEntries" in normalized
    && typeof normalized.maxEntries === "number"
    && Number.isFinite(normalized.maxEntries)
  ) {
    normalized.maxEntries = Math.min(WORKFLOW_ENTRY_MAX_ENTRIES, normalized.maxEntries);
  }
  if (normalized.mode !== "rolling_window") return normalized;
  if (!("windowSize" in policy) || typeof policy.windowSize !== "number" || !Number.isFinite(policy.windowSize)) {
    return normalized;
  }
  if (!("windowUnit" in policy) || (policy.windowUnit !== "day" && policy.windowUnit !== "hour")) {
    return normalized;
  }
  const maximum = policy.windowUnit === "hour"
    ? WORKFLOW_ENTRY_WINDOW_MAX_HOURS
    : WORKFLOW_ENTRY_WINDOW_MAX_DAYS;
  return {
    ...normalized,
    windowSize: Math.min(maximum, policy.windowSize),
  };
}
