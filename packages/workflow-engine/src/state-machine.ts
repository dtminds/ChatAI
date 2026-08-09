import type {
  WorkflowRunStatus,
  WorkflowRuntimeStatus,
  WorkflowTaskStatus,
} from "@chatai/contracts";
import { WorkflowStateTransitionError } from "./errors.js";

const runTransitions: Record<WorkflowRunStatus, readonly WorkflowRunStatus[]> = {
  cancelled: [],
  completed: [],
  failed: [],
  queued: ["running", "cancelled", "failed"],
  running: ["running", "waiting", "completed", "failed", "cancelled"],
  waiting: ["running", "completed", "failed", "cancelled"],
};

const taskTransitions: Record<WorkflowTaskStatus, readonly WorkflowTaskStatus[]> = {
  cancelled: [],
  completed: [],
  dead: [],
  dispatched: ["running", "pending", "cancelled", "dead"],
  leased: ["dispatched", "pending", "cancelled", "dead"],
  pending: ["leased", "running", "cancelled", "dead"],
  running: ["completed", "pending", "cancelled", "dead"],
};

export function transitionRun(from: WorkflowRunStatus, to: WorkflowRunStatus) {
  if (!runTransitions[from]?.includes(to)) {
    throw new WorkflowStateTransitionError("run", from, to);
  }
  return to;
}

export function transitionTask(from: WorkflowTaskStatus, to: WorkflowTaskStatus) {
  if (!taskTransitions[from]?.includes(to)) {
    throw new WorkflowStateTransitionError("task", from, to);
  }
  return to;
}

export function createWorkflowActionIdempotencyKey({
  nodeId,
  runId,
  sequence,
  uid,
}: {
  nodeId: string;
  runId: string;
  sequence: number;
  uid: string;
}) {
  return `${uid}:${runId}:${nodeId}:${sequence}`;
}

export function getWorkflowExecutionBoundaryDecision({
  bizStatus,
  runtimeStatus,
}: {
  bizStatus: 0 | 1;
  runtimeStatus: WorkflowRuntimeStatus;
}): "cancel" | "defer" | "execute" {
  if (bizStatus === 0 || runtimeStatus === "inactive" || runtimeStatus === "stopped") {
    return "cancel";
  }
  return runtimeStatus === "paused" ? "defer" : "execute";
}
