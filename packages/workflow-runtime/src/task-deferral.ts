export const WORKFLOW_TASK_DEFER_REASON_CODES = [
  "WORKFLOW_ENTITLEMENT_UNAVAILABLE",
  "WORKFLOW_MESSAGE_RATE_LIMITED",
  "WORKFLOW_MESSAGE_SENDING_WINDOW_DEFERRED",
  "WORKFLOW_RUNTIME_NODE_UNSUPPORTED",
  "WORKFLOW_RUNTIME_PAUSED",
  "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED",
  "WORKFLOW_TASK_CAPACITY_UNAVAILABLE",
] as const;

export type WorkflowTaskDeferReasonCode = typeof WORKFLOW_TASK_DEFER_REASON_CODES[number];

export function isWorkflowTaskDeferReasonCode(value: string | null): value is WorkflowTaskDeferReasonCode {
  return value !== null && WORKFLOW_TASK_DEFER_REASON_CODES.includes(value as WorkflowTaskDeferReasonCode);
}
