import type {
  WorkflowNodeKind,
  WorkflowRunStatus,
  WorkflowTaskStatus,
} from "@chatai/contracts";

export type WorkflowRunRecord = {
  context: Record<string, unknown>;
  currentNodeId: string;
  entryEventId: string;
  id: string;
  lockVersion: number;
  nextExecuteAt: Date | null;
  revision: number;
  sequence: number;
  shardId: number;
  status: WorkflowRunStatus;
  subjectId: string;
  uid: number;
  workflowId: string;
};

export type WorkflowTaskRecord = {
  attempt: number;
  dueAt: Date;
  id: string;
  leaseExpiresAt: Date | null;
  leaseOwner: string | null;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  revision: number;
  runId: string;
  sequence: number;
  shardId: number;
  status: WorkflowTaskStatus;
  taskType: string;
  taskVersion: number;
  uid: number;
  workflowId: string;
};

export type WorkflowCreateRunInput = {
  context: Record<string, unknown>;
  entryEventId: string;
  initialNodeId: string;
  initialNodeKind: WorkflowNodeKind;
  occurredAt: Date;
  revision: number;
  shardId: number;
  subjectId: string;
  uid: number;
  workflowId: string;
};

export type WorkflowCommitNodeResultInput = {
  context?: Record<string, unknown>;
  expectedRunLockVersion: number;
  expectedTaskVersion: number;
  inbox: {
    consumer: string;
    expiresAt: Date;
    messageId: string;
  };
  nextTask?: {
    dispatchImmediately?: boolean;
    dueAt: Date;
    nodeId: string;
    nodeKind: WorkflowNodeKind;
    taskType: string;
  };
  nodeExecution: {
    errorCode?: string;
    errorMessage?: string;
    idempotencyKey: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  };
  runId: string;
  taskId: string;
  uid: number;
};

export type WorkflowRuntimeMutationResult<T> =
  | { kind: "success"; value: T }
  | { kind: "already-processed" }
  | { kind: "conflict" }
  | { kind: "not-found" };

type WorkflowRuntimeFailure =
  | { kind: "already-processed" }
  | { kind: "conflict" }
  | { kind: "not-found" }
  | { action: "cancel" | "defer"; kind: "workflow-unavailable" };

export type WorkflowRuntimeRepository = {
  cancelWorkflowBatch(input: {
    afterRunId?: string;
    limit: number;
    uid: number;
    workflowId: string;
  }): Promise<{ cancelled: number; hasMore: boolean; lastRunId: string | null }>;
  claimTask(input: {
    expectedTaskVersion: number;
    leaseExpiresAt: Date;
    leaseOwner: string;
    taskId: string;
    uid: number;
  }): Promise<{ kind: "success"; task: WorkflowTaskRecord } | WorkflowRuntimeFailure>;
  commitNodeResult(input: WorkflowCommitNodeResultInput): Promise<
    | { kind: "success"; nextTask: WorkflowTaskRecord | null; run: WorkflowRunRecord }
    | WorkflowRuntimeFailure
  >;
  createRunWithInitialTask(input: WorkflowCreateRunInput): Promise<
    | {
        deduplicated: boolean;
        kind: "success";
        run: WorkflowRunRecord;
        task: WorkflowTaskRecord;
      }
    | WorkflowRuntimeFailure
  >;
  findRun(uid: number, runId: string): Promise<WorkflowRunRecord | null>;
  findTask(uid: number, taskId: string): Promise<WorkflowTaskRecord | null>;
  recoverExpiredLeases(input: { limit: number; now: Date }): Promise<number>;
};
