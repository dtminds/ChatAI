import type { WorkflowTaskDeferReasonCode } from "./task-deferral.js";

export type WorkflowTaskCapacityLease = {
  leaseId: string;
  token: string;
};

export type WorkflowTaskCapacityAvailability =
  | { available: number; kind: "available"; reserved?: number }
  | { kind: "unavailable" };

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
  availability(): Promise<WorkflowTaskCapacityAvailability>;
  acquire(input: {
    leaseDurationMs: number;
    now: Date;
    taskId: string;
    taskVersion: number;
    uid: number;
  }): Promise<WorkflowTaskCapacityAdmission>;
  reserve(input: {
    leaseDurationMs: number;
    taskId: string;
    taskVersion: number;
    uid: number;
  }): Promise<
    | { kind: "reserved"; lease: WorkflowTaskCapacityLease }
    | { kind: "active" }
    | Extract<WorkflowTaskCapacityAdmission, { kind: "deferred" }>
  >;
  renew(input: {
    lease: WorkflowTaskCapacityLease;
    leaseDurationMs: number;
    uid: number;
  }): Promise<void>;
  release(input: {
    lease: WorkflowTaskCapacityLease;
    uid: number;
  }): Promise<void>;
  releaseReservation(input: {
    lease: WorkflowTaskCapacityLease;
    uid: number;
  }): Promise<void>;
};
