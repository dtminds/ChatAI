import type {
  WorkflowEntryPolicy,
  WorkflowEntryEventType,
  WorkflowExecutionSpec,
  WorkflowNodeKind,
  WorkflowRuntimeStatus,
  WorkflowRunStatus,
  WorkflowStartConfig,
  WorkflowTaskStatus,
  WorkflowTaskMessage,
} from "@chatai/contracts";
import type { WorkflowActionFailureKind } from "@chatai/workflow-engine";

export type WorkflowRuntimeDefinitionRecord = {
  bizStatus: 0 | 1;
  publishedRevision: number | null;
  runtimeStatus: WorkflowRuntimeStatus;
};

export type WorkflowRuntimeRevisionRecord = {
  executionSpec: WorkflowExecutionSpec;
  revision: number;
};

export type WorkflowRuntimeControlReader = {
  findDefinition(uid: number, workflowId: string): Promise<WorkflowRuntimeDefinitionRecord | null>;
  findRevision(uid: number, workflowId: string, revision: number): Promise<WorkflowRuntimeRevisionRecord | null>;
};

export type WorkflowTriggerBindingRecord = {
  createdAt: Date;
  eventType: WorkflowEntryEventType;
  filter: WorkflowStartConfig;
  id: string;
  revision: number;
  status: 0 | 1;
  uid: number;
  updatedAt: Date;
  workflowId: string;
};

export type WorkflowTriggerBindingReader = {
  listActiveTriggerBindings(
    uid: number,
    eventType: WorkflowEntryEventType,
  ): Promise<WorkflowTriggerBindingRecord[]>;
};

export type WorkflowRunRecord = {
  createdAt: Date;
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

export type WorkflowOutboxRecord = {
  attempt: number;
  eventType: "workflow.task.ready";
  id: string;
  leaseExpiresAt: Date | null;
  leaseOwner: string | null;
  nextAttemptAt: Date;
  payload: WorkflowTaskMessage;
  sentAt: Date | null;
  status: "dead" | "leased" | "pending" | "republished" | "sent";
  taskVersion: number;
  uid: number;
};

export type WorkflowNodeMetricRecord = {
  completed: number;
  current: number;
  entered: number;
  nodeId: string;
  passed: number;
  revision: number;
  shardId: number;
  uid: number;
  updatedAt: Date;
  workflowId: string;
};

export type WorkflowNodeExecutionStatus = "completed" | "failed" | "retrying" | "running";

export type WorkflowNodeExecutionRecord = {
  errorCode: string | null;
  errorMessage: string | null;
  failureKind: WorkflowActionFailureKind | null;
  idempotencyKey: string;
  input: Record<string, unknown>;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  output: Record<string, unknown>;
  runId: string;
  sequence: number;
  status: WorkflowNodeExecutionStatus;
  uid: number;
};

export type WorkflowSchedulerRepository = {
  dispatchDueTasks(input: {
    limit: number;
    now: Date;
    shardIds?: number[];
  }): Promise<{ cancelled: number; deferred: number; dispatched: number }>;
};

export type WorkflowOutboxRepository = {
  claimOutboxBatch(input: {
    leaseExpiresAt: Date;
    leaseOwner: string;
    limit: number;
    now: Date;
  }): Promise<WorkflowOutboxRecord[]>;
  markOutboxFailed(input: {
    id: string;
    leaseOwner: string;
    nextAttemptAt: Date;
  }): Promise<boolean>;
  markOutboxDead(input: {
    failedAt: Date;
    id: string;
    leaseOwner: string;
  }): Promise<boolean>;
  markOutboxSent(input: {
    id: string;
    leaseOwner: string;
    sentAt: Date;
  }): Promise<boolean>;
  recoverExpiredOutboxLeases(input: { limit: number; now: Date }): Promise<number>;
};

export type WorkflowCreateRunInput = {
  context: Record<string, unknown>;
  entryEventId: string;
  entryPolicy: WorkflowEntryPolicy;
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

export type WorkflowActionExecutionFailureInput = {
  errorCode: string;
  errorMessage: string;
  expectedRunLockVersion: number;
  expectedTaskVersion: number;
  failureKind: WorkflowActionFailureKind;
  idempotencyKey: string;
  inbox: WorkflowCommitNodeResultInput["inbox"];
  now: Date;
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
  | { kind: "entry-policy-rejected" }
  | { action: "cancel" | "defer"; kind: "workflow-unavailable" };

export type WorkflowRuntimeRepository = WorkflowOutboxRepository & WorkflowSchedulerRepository & {
  aggregateNodeMetricEvents(input: { limit: number }): Promise<number>;
  cleanupProcessedNodeMetricEvents(input: { limit: number; processedBefore: Date }): Promise<number>;
  cleanupExpiredInbox(input: { limit: number; now: Date }): Promise<number>;
  cancelUnavailableWorkflowRuns(input: {
    afterRunId?: string;
    limit: number;
  }): Promise<{ cancelled: number; hasMore: boolean; lastRunId: string | null }>;
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
  prepareActionExecution(input: {
    expectedRunLockVersion: number;
    expectedTaskVersion: number;
    idempotencyKey: string;
    input: Record<string, unknown>;
    now: Date;
    runId: string;
    taskId: string;
    uid: number;
  }): Promise<{ execution: WorkflowNodeExecutionRecord; kind: "success" } | WorkflowRuntimeFailure>;
  scheduleActionRetry(input: WorkflowActionExecutionFailureInput & {
    dueAt: Date;
  }): Promise<{ kind: "success"; task: WorkflowTaskRecord } | WorkflowRuntimeFailure>;
  failActionExecution(input: WorkflowActionExecutionFailureInput): Promise<
    { kind: "success"; run: WorkflowRunRecord; task: WorkflowTaskRecord } | WorkflowRuntimeFailure
  >;
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
  listNodeMetrics(uid: number, workflowId: string, revision: number): Promise<WorkflowNodeMetricRecord[]>;
  recoverExpiredLeases(input: {
    limit: number;
    maxAttempts: number;
    now: Date;
  }): Promise<{ dead: number; recovered: number }>;
  reconcileRunTaskConsistency(input: {
    afterRunId?: string;
    afterTaskId?: string;
    inconsistentBefore: Date;
    limit: number;
    now: Date;
  }): Promise<{
    hasMoreRuns: boolean;
    hasMoreTasks: boolean;
    inconsistentRunsFailed: number;
    lastRunId: string | null;
    lastTaskId: string | null;
    runsChecked: number;
    staleTasksCancelled: number;
    tasksChecked: number;
    terminalRunTasksCancelled: number;
  }>;
  republishStalledDispatchedTasks(input: {
    dispatchedBefore: Date;
    limit: number;
    now: Date;
  }): Promise<number>;
};
