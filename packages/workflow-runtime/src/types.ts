import type {
  WorkflowEntryPolicy,
  WorkflowEntryEventType,
  WorkflowExecutionSpec,
  WorkflowJsonObject,
  WorkflowNodeKind,
  WorkflowRuntimeStatus,
  WorkflowRunStatus,
  WorkflowStatusReason,
  WorkflowSubjectType,
  WorkflowTaskStatus,
  WorkflowTaskMessage,
  WorkflowTriggerBindingFilter,
  WorkflowType,
} from "@chatai/contracts";
import type { WorkflowActionFailureKind } from "@chatai/workflow-engine";

export type WorkflowRuntimeDefinitionRecord = {
  bizStatus: 0 | 1;
  publishedRevision: number | null;
  runtimeStatus: WorkflowRuntimeStatus;
  statusReason: WorkflowStatusReason;
  workflowType: WorkflowType;
};

export type WorkflowRuntimeRevisionRecord = {
  executionSpec: WorkflowExecutionSpec;
  revision: number;
  subjectType: WorkflowSubjectType;
  workflowType: WorkflowType;
};

export type WorkflowRuntimeControlReader = {
  applyEntitlementLoss(input: {
    opSubUserId: string;
    transition: "pause" | "stop";
    uid: number;
    workflowType: WorkflowType;
  }): Promise<{ affectedDefinitions: number }>;
  findDefinition(uid: number, workflowId: string): Promise<WorkflowRuntimeDefinitionRecord | null>;
  findRevision(uid: number, workflowId: string, revision: number): Promise<WorkflowRuntimeRevisionRecord | null>;
};

export type WorkflowTriggerBindingRecord = {
  createdAt: Date;
  eventType: WorkflowEntryEventType;
  filter: WorkflowTriggerBindingFilter;
  id: string;
  revision: number;
  status: 0 | 1;
  subjectType: WorkflowSubjectType;
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

export type WorkflowEventSubscriptionStatus =
  | "waiting"
  | "triggered"
  | "timed_out"
  | "cancelled";

export type WorkflowEventSubscriptionRecord = {
  collectUntil: Date | null;
  createdAt: Date;
  effectiveFrom: Date;
  eventType: WorkflowEntryEventType;
  expiresAt: Date;
  id: string;
  nodeId: string;
  revision: number;
  runId: string;
  seatId: number | null;
  status: WorkflowEventSubscriptionStatus;
  subjectId: string;
  subjectType: WorkflowSubjectType;
  taskId: string;
  triggerEventId: string | null;
  uid: number;
  updatedAt: Date;
  workflowId: string;
};

export type WorkflowEventSubscriptionEventRecord = {
  collectedAt: Date;
  eventId: string;
  id: string;
  occurredAt: Date;
  projection: WorkflowJsonObject;
  subscriptionId: string;
  uid: number;
};

export type WorkflowEventSubscriptionReader = {
  listMatchingEventSubscriptions(
    uid: number,
    subjectType: WorkflowSubjectType,
    eventType: WorkflowEntryEventType,
    subjectId: string,
    seatId: number | null,
    eventOccurredAt: Date,
    observedAt: Date,
  ): Promise<WorkflowEventSubscriptionRecord[]>;
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
  subjectType: WorkflowSubjectType;
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

export type WorkflowHistoryCleanupResult = {
  hasMore: boolean;
  nodeExecutionsDeleted: number;
  outboxDeleted: number;
  runsDeleted: number;
  tasksDeleted: number;
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
  subjectType: WorkflowSubjectType;
  uid: number;
  workflowId: string;
  workflowType: WorkflowType;
};

export type WorkflowBeginEventWaitInput = {
  effectiveFrom: Date;
  eventType: WorkflowEntryEventType;
  expectedRunLockVersion: number;
  expectedTaskVersion: number;
  expiresAt: Date;
  inbox: WorkflowCommitNodeResultInput["inbox"];
  now: Date;
  runId: string;
  seatId: number | null;
  taskId: string;
  uid: number;
};

export type WorkflowRecordEventSubscriptionInput = {
  collectUntil: Date;
  eventId: string;
  eventOccurredAt: Date;
  projection: WorkflowJsonObject;
  recordedAt: Date;
  subscriptionId: string;
  uid: number;
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

export type WorkflowInboxMessageInput = {
  consumer: string;
  expiresAt: Date;
  messageId: string;
  processedAt: Date;
  uid: number;
};

export type WorkflowInboxRepository = {
  hasProcessedInboxMessage(input: Pick<
    WorkflowInboxMessageInput,
    "consumer" | "messageId"
  >): Promise<boolean>;
  recordProcessedInboxMessage(input: WorkflowInboxMessageInput): Promise<boolean>;
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

export type WorkflowRuntimeRepository = WorkflowInboxRepository
  & WorkflowEventSubscriptionReader
  & WorkflowOutboxRepository
  & WorkflowSchedulerRepository & {
  aggregateNodeMetricEvents(input: { limit: number }): Promise<number>;
  cleanupProcessedNodeMetricEvents(input: { limit: number; processedBefore: Date }): Promise<number>;
  cleanupExpiredInbox(input: { limit: number; now: Date }): Promise<number>;
  cleanupWorkflowHistory(input: {
    limit: number;
    runBefore: Date;
    taskOutboxBefore: Date;
  }): Promise<WorkflowHistoryCleanupResult>;
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
  beginEventWait(input: WorkflowBeginEventWaitInput): Promise<
    | {
        kind: "success";
        run: WorkflowRunRecord;
        subscription: WorkflowEventSubscriptionRecord;
        task: WorkflowTaskRecord;
      }
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
  deferTask(input: {
    dueAt: Date;
    expectedTaskVersion: number;
    taskId: string;
    uid: number;
  }): Promise<{ kind: "success"; task: WorkflowTaskRecord } | WorkflowRuntimeFailure>;
  findRun(uid: number, runId: string): Promise<WorkflowRunRecord | null>;
  findEventSubscriptionByTask(
    uid: number,
    taskId: string,
  ): Promise<WorkflowEventSubscriptionRecord | null>;
  listEventSubscriptionEvents(
    uid: number,
    subscriptionId: string,
  ): Promise<WorkflowEventSubscriptionEventRecord[]>;
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
  reconcileEventSubscriptions(input: {
    afterSubscriptionId?: string;
    limit: number;
  }): Promise<{
    cancelled: number;
    checked: number;
    hasMore: boolean;
    lastSubscriptionId: string | null;
  }>;
  republishStalledDispatchedTasks(input: {
    dispatchedBefore: Date;
    limit: number;
    now: Date;
  }): Promise<number>;
  timeoutEventSubscription(input: {
    subscriptionId: string;
    timedOutAt: Date;
    uid: number;
  }): Promise<
    | { kind: "success"; subscription: WorkflowEventSubscriptionRecord }
    | WorkflowRuntimeFailure
  >;
  recordEventSubscriptionEvent(input: WorkflowRecordEventSubscriptionInput): Promise<
    | {
        firstEvent: boolean;
        kind: "success";
        run: WorkflowRunRecord;
        subscription: WorkflowEventSubscriptionRecord;
        task: WorkflowTaskRecord;
      }
    | WorkflowRuntimeFailure
  >;
};
