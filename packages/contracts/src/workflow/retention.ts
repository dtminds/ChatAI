import type { WorkflowEntryPolicy } from "./trigger.js";

export const WORKFLOW_ENTRY_WINDOW_MAX_DAYS = 90;
export const WORKFLOW_ENTRY_WINDOW_MAX_HOURS = 2_160;
export const WORKFLOW_RUN_RETENTION_DAYS = 180;
export const WORKFLOW_TASK_OUTBOX_RETENTION_DAYS = 30;

export function normalizeWorkflowEntryPolicy(policy: WorkflowEntryPolicy): WorkflowEntryPolicy;
export function normalizeWorkflowEntryPolicy(policy: unknown): unknown;
export function normalizeWorkflowEntryPolicy(policy: unknown): unknown {
  if (!policy || typeof policy !== "object" || !("mode" in policy) || policy.mode !== "rolling_window") {
    return structuredClone(policy);
  }
  if (!("windowSize" in policy) || typeof policy.windowSize !== "number" || !Number.isFinite(policy.windowSize)) {
    return structuredClone(policy);
  }
  if (!("windowUnit" in policy) || (policy.windowUnit !== "day" && policy.windowUnit !== "hour")) {
    return structuredClone(policy);
  }
  const maximum = policy.windowUnit === "hour"
    ? WORKFLOW_ENTRY_WINDOW_MAX_HOURS
    : WORKFLOW_ENTRY_WINDOW_MAX_DAYS;
  return {
    ...structuredClone(policy),
    windowSize: Math.min(maximum, policy.windowSize),
  };
}
