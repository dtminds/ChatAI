import type { WorkflowTaskDeferReasonCode } from "./task-deferral.js";

export type WorkflowTaskCapacityLease = {
  leaseId: string;
  token: string;
};

export type WorkflowTaskCapacityAdmission =
  | { kind: "allowed"; lease: WorkflowTaskCapacityLease }
  | {
      kind: "deferred";
      reasonCode: Extract<
        WorkflowTaskDeferReasonCode,
        "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED" | "WORKFLOW_TASK_CAPACITY_UNAVAILABLE"
      >;
      retryAt: Date;
    };

export type WorkflowTaskCapacityPort = {
  acquire(input: {
    now: Date;
    taskId: string;
    taskVersion: number;
    uid: number;
  }): Promise<WorkflowTaskCapacityAdmission>;
  release(input: {
    lease: WorkflowTaskCapacityLease;
    uid: number;
  }): Promise<void>;
};
