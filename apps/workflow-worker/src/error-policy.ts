import { WorkflowRuntimeError } from "@chatai/workflow-runtime";

const ENTRY_CONSUMED_CODES = new Set([
  "WORKFLOW_RUNTIME_INACTIVE",
  "WORKFLOW_RUNTIME_PAUSED",
  "WORKFLOW_RUNTIME_STOPPED",
  "WORKFLOW_RUNTIME_UNAVAILABLE",
]);

const TASK_CONSUMED_CODES = new Set([
  "WORKFLOW_RUNTIME_INACTIVE",
  "WORKFLOW_RUNTIME_PAUSED",
  "WORKFLOW_RUNTIME_STOPPED",
  "WORKFLOW_RUNTIME_UNAVAILABLE",
  "WORKFLOW_TASK_ALREADY_PROCESSED",
  "WORKFLOW_TASK_NOT_FOUND",
  "WORKFLOW_TASK_STALE",
]);

export function classifyEntryError(error: unknown): "ack" | "nack" {
  return error instanceof WorkflowRuntimeError && ENTRY_CONSUMED_CODES.has(error.code)
    ? "ack"
    : "nack";
}

export function classifyTaskError(error: unknown): "ack" | "nack" {
  return error instanceof WorkflowRuntimeError && TASK_CONSUMED_CODES.has(error.code)
    ? "ack"
    : "nack";
}
