import type {
  WorkflowEntryPolicy,
  WorkflowEntryEventType,
  WorkflowExecutionSpec,
  WorkflowInferenceRequest,
  WorkflowInferenceMessageListRequest,
  WorkflowInferenceMessageListResult,
  WorkflowInferenceResult,
  WorkflowExecutionNode,
  WorkflowJsonObject,
  WorkflowLlmTestAttemptStatus,
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
import type { WorkflowCapabilityFailureKind } from "@chatai/workflow-engine";
import type { WorkflowTaskDeferReasonCode } from "./task-deferral.js";

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

export type WorkflowRuntimeSnapshotKey = {
  revision: number;
  workflowId: string;
};

export type WorkflowRuntimeSnapshotRecord = {
  definition: WorkflowRuntimeDefinitionRecord;
  revision: WorkflowRuntimeRevisionRecord;
  uid: number;
  workflowId: string;
};

export type WorkflowRuntimeSnapshotReadResult = {
  invalidKeys: WorkflowRuntimeSnapshotKey[];
  snapshots: WorkflowRuntimeSnapshotRecord[];
};

export type WorkflowPublishedRevisionResolver = (input: {
  uid: number;
  workflowId: string;
}) => Promise<WorkflowRuntimeRevisionRecord | null>;

export type WorkflowRuntimeControlReader = {
  deactivateWorkflowForEntitlementLoss(input: {
    opSubUserId: string;
    uid: number;
    workflowId: string;
    workflowType: WorkflowType;
  }): Promise<{ affectedDefinitions: number }>;
  findDefinition(uid: number, workflowId: string): Promise<WorkflowRuntimeDefinitionRecord | null>;
  findRevision(uid: number, workflowId: string, revision: number): Promise<WorkflowRuntimeRevisionRecord | null>;
  findRuntimeSnapshots(
    uid: number,
    keys: readonly WorkflowRuntimeSnapshotKey[],
  ): Promise<WorkflowRuntimeSnapshotReadResult>;
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
  createdAt: Date;
  effectiveFrom: Date;
  eventType: WorkflowEntryEventType;
  expiresAt: Date;
  id: string;
  nodeId: string;
  revision: number;
  resumeAt: Date | null;
  runId: string;
  seatId: number | null;
  status: WorkflowEventSubscriptionStatus;
  subjectId: string;
  subjectType: WorkflowSubjectType;
  taskId: string;
  triggerEventId: string | null;
  triggerOccurredAt: Date | null;
  triggerProjection: WorkflowJsonObject | null;
  uid: number;
  updatedAt: Date;
  workflowId: string;
};

export type WorkflowEventSubscriptionReader = {
  listMatchingEventSubscriptions(
    uid: number,
    subjectType: WorkflowSubjectType,
    eventType: WorkflowEntryEventType,
    subjectId: string,
    seatId: number | null,
    eventOccurredAt: Date,
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
  terminalReason: string | null;
  uid: number;
  workflowId: string;
};

export type WorkflowTaskRecord = {
  attempt: number;
  createdAt: Date;
  dueAt: Date;
  id: string;
  lastErrorCode: string | null;
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
  incomplete: number;
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

export type WorkflowInferenceJobStatus =
  | "pending"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorkflowInferenceJobRecord = {
  attempt: number;
  contractVersion: number;
  createdAt: Date;
  deadlineAt: Date;
  errorCode: string | null;
  errorMessage: string | null;
  executionKey: string;
  failureKind: WorkflowCapabilityFailureKind | null;
  id: string;
  leaseExpiresAt: Date | null;
  leaseOwner: string | null;
  nextAttemptAt: Date;
  nodeId: string;
  nodeKind: "ai-intent" | "llm";
  pausedAt: Date | null;
  payload: WorkflowInferenceRequest;
  result: WorkflowInferenceResult | null;
  runId: string;
  sequence: number;
  status: WorkflowInferenceJobStatus;
  taskId: string;
  uid: number;
  updatedAt: Date;
};

export type WorkflowLlmTestAttemptRecord = {
  attempt: number;
  completedAt: Date | null;
  contractVersion: number;
  createdAt: Date;
  deadlineAt: Date;
  errorCode: string | null;
  errorMessage: string | null;
  executionKey: string;
  expiresAt: Date;
  id: string;
  inputValues: WorkflowJsonObject;
  leaseExpiresAt: Date | null;
  leaseOwner: string | null;
  node: WorkflowExecutionNode;
  nodeId: string;
  opSubUserId: string;
  output: WorkflowJsonObject | null;
  payload: WorkflowInferenceMessageListRequest;
  result: WorkflowInferenceMessageListResult | null;
  startedAt: Date | null;
  status: WorkflowLlmTestAttemptStatus;
  uid: number;
  updatedAt: Date;
  workflowId: string;
};

export type WorkflowLlmTestAttemptRepository = {
  cancelLlmTestAttempt(input: {
    attemptId: string;
    cancelledAt: Date;
    uid: number;
    workflowId: string;
  }): Promise<boolean>;
  claimLlmTestAttemptBatch(input: {
    leaseExpiresAt: Date;
    leaseOwner: string;
    limit: number;
    now: Date;
  }): Promise<WorkflowLlmTestAttemptRecord[]>;
  cleanupExpiredLlmTestAttempts(input: { limit: number; now: Date }): Promise<number>;
  completeLlmTestAttempt(input: {
    attemptId: string;
    completedAt: Date;
    leaseOwner: string;
    output: WorkflowJsonObject;
    result: WorkflowInferenceMessageListResult;
  }): Promise<boolean>;
  createLlmTestAttempt(input: {
    contractVersion: number;
    createdAt: Date;
    deadlineAt: Date;
    executionKey: string;
    expiresAt: Date;
    inputValues: WorkflowJsonObject;
    node: WorkflowExecutionNode;
    opSubUserId: string;
    payload: WorkflowInferenceMessageListRequest;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowLlmTestAttemptRecord>;
  failLlmTestAttempt(input: {
    attemptId: string;
    errorCode: string;
    errorMessage: string;
    failedAt: Date;
    leaseOwner: string;
    status: "failed" | "timed_out";
  }): Promise<boolean>;
  expireTimedOutLlmTestAttempts(input: { limit: number; now: Date }): Promise<number>;
  expireLlmTestAttempt(input: {
    attemptId: string;
    now: Date;
    uid: number;
    workflowId: string;
  }): Promise<boolean>;
  findLlmTestAttempt(input: {
    attemptId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowLlmTestAttemptRecord | null>;
  renewLlmTestAttemptLease(input: {
    attemptId: string;
    leaseExpiresAt: Date;
    leaseOwner: string;
  }): Promise<boolean>;
};

export type WorkflowBeginInferenceInput = {
  contractVersion: number;
  deadlineAt: Date;
  executionKey: string;
  expectedRunLockVersion: number;
  expectedTaskVersion: number;
  inbox: WorkflowCommitNodeResultInput["inbox"];
  now: Date;
  payload: WorkflowInferenceRequest;
  runId: string;
  taskId: string;
  uid: number;
};

export type WorkflowInferenceRepository = {
  beginInference(input: WorkflowBeginInferenceInput): Promise<
    | { created: boolean; job: WorkflowInferenceJobRecord; kind: "success"; run: WorkflowRunRecord; task: WorkflowTaskRecord }
    | WorkflowRuntimeFailure
  >;
  claimInferenceBatch(input: {
    leaseExpiresAt: Date;
    leaseOwner: string;
    limit: number;
    now: Date;
  }): Promise<WorkflowInferenceJobRecord[]>;
  completeInference(input: {
    completedAt: Date;
    id: string;
    leaseOwner: string;
    result: WorkflowInferenceResult;
  }): Promise<boolean>;
  failInference(input: {
    errorCode: string;
    errorMessage: string;
    failedAt: Date;
    failureKind: WorkflowCapabilityFailureKind;
    id: string;
    leaseOwner: string;
  }): Promise<boolean>;
  findInferenceByExecutionKey(uid: number, executionKey: string): Promise<WorkflowInferenceJobRecord | null>;
  recoverInferenceJobs(input: {
    limit: number;
    maxAttempts: number;
    now: Date;
  }): Promise<{ expired: number; recovered: number }>;
  renewInferenceLease(input: {
    id: string;
    leaseExpiresAt: Date;
    leaseOwner: string;
  }): Promise<boolean>;
  retryInference(input: {
    errorCode: string;
    errorMessage: string;
    failureKind: WorkflowCapabilityFailureKind;
    id: string;
    leaseOwner: string;
    nextAttemptAt: Date;
  }): Promise<boolean>;
  transitionInferenceJobs(input: {
    transitionedAt: Date;
    transition: "cancel" | "pause" | "resume";
    uid: number;
    workflowIds: string[];
  }): Promise<void>;
};

export type WorkflowNodeExecutionStatus = "completed" | "failed" | "retrying" | "running";

export type WorkflowNodeExecutionRecord = {
  errorCode: string | null;
  errorMessage: string | null;
  failureKind: WorkflowCapabilityFailureKind | null;
  executionKey: string;
  input: Record<string, unknown>;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  output: Record<string, unknown>;
  runId: string;
  revision: number;
  sequence: number;
  sourceOutletId: string | null;
  status: WorkflowNodeExecutionStatus;
  uid: number;
};

export type WorkflowRevisionCleanupStatus =
  | "pending"
  | "leased"
  | "done"
  | "obsolete"
  | "dead";

export type WorkflowRevisionCleanupRecord = {
  afterRunId: string | null;
  attempt: number;
  id: string;
  lastErrorCode: string | null;
  leaseExpiresAt: Date | null;
  leaseOwner: string | null;
  nextAttemptAt: Date;
  nodeId: string;
  nodeKind: "wait" | "wait-event";
  revision: number;
  status: WorkflowRevisionCleanupStatus;
  uid: number;
  workflowId: string;
};

export type WorkflowSchedulerRepository = {
  dispatchDueTasks(input: {
    limit: number;
    now: Date;
  }): Promise<{ cancelled: number; dispatched: number; suspended: number }>;
  processTaskStatusTransitionBatch(input: {
    leaseExpiresAt: Date;
    leaseOwner: string;
    limit: number;
    maxAttempts: number;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<{
    claimed: boolean;
    dead: number;
    failed: number;
    hasMore: boolean;
    transitioned: number;
  }>;
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
  markOutboxSentBatch(input: {
    ids: string[];
    leaseOwner: string;
    sentAt: Date;
  }): Promise<number>;
  recoverExpiredOutboxLeases(input: { limit: number; now: Date }): Promise<number>;
};

export type WorkflowCreateRunInput = {
  activeRunLimit: number;
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

export type WorkflowTriggerEventSubscriptionInput = {
  eventId: string;
  eventOccurredAt: Date;
  projection: WorkflowJsonObject;
  recordedAt: Date;
  resumeAt: Date;
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
  nodeExecution: {
    errorCode?: string;
    errorMessage?: string;
    executionKey: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    sourceOutletId?: string;
  };
  runId: string;
  sourceOutletId?: string;
  taskId: string;
  uid: number;
};

export type WorkflowBeginFixedWaitInput = {
  dueAt: Date;
  expectedRunLockVersion: number;
  expectedTaskVersion: number;
  inbox: WorkflowCommitNodeResultInput["inbox"];
  now: Date;
  runId: string;
  taskId: string;
  uid: number;
};

export type WorkflowInboxMessageInput = {
  capacityRejectedCount: number;
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

export type WorkflowCapabilityExecutionFailureInput = {
  errorCode: string;
  errorMessage: string;
  expectedRunLockVersion: number;
  expectedTaskVersion: number;
  failureKind: WorkflowCapabilityFailureKind;
  executionKey: string;
  inbox: WorkflowCommitNodeResultInput["inbox"];
  now: Date;
  runId: string;
  taskId: string;
  uid: number;
};

type WorkflowRuntimeFailure =
  | { kind: "already-processed" }
  | { kind: "conflict" }
  | { kind: "not-found" }
  | { kind: "entry-policy-rejected" }
  | { action: "cancel" | "defer"; kind: "workflow-unavailable" };

export type WorkflowRuntimeRepository = WorkflowInboxRepository
  & WorkflowEventSubscriptionReader
  & WorkflowInferenceRepository
  & WorkflowOutboxRepository
  & WorkflowSchedulerRepository & {
  configurePublishedRevisionResolver?(resolver: WorkflowPublishedRevisionResolver): void;
  deactivateWorkflowForEntitlementLoss(input: {
    opSubUserId: string;
    uid: number;
    workflowId: string;
    workflowType: WorkflowType;
  }): Promise<{ affectedDefinitions: number }>;
  aggregateNodeMetricEvents(input: { limit: number }): Promise<number>;
  cleanupProcessedNodeMetricEvents(input: { limit: number; processedBefore: Date }): Promise<number>;
  cleanupExpiredInbox(input: { limit: number; now: Date }): Promise<number>;
  cleanupWorkflowHistory(input: {
    limit: number;
    runBefore: Date;
    taskOutboxBefore: Date;
  }): Promise<WorkflowHistoryCleanupResult>;
  claimRevisionCleanupBatch(input: {
    leaseExpiresAt: Date;
    leaseOwner: string;
    limit: number;
    maxAttempts: number;
    now: Date;
  }): Promise<WorkflowRevisionCleanupRecord[]>;
  failRevisionCleanup(input: {
    cleanupId: string;
    errorCode: string;
    leaseOwner: string;
    maxAttempts: number;
    nextAttemptAt: Date;
  }): Promise<boolean>;
  processRevisionCleanupBatch(input: {
    cleanupId: string;
    leaseOwner: string;
    limit: number;
    now: Date;
  }): Promise<
    | {
        cancelled: number;
        hasMore: boolean;
        kind: "success";
        status: "done" | "obsolete" | "pending";
      }
    | { kind: "conflict" | "not-found" }
  >;
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
  prepareCapabilityExecution(input: {
    expectedRunLockVersion: number;
    expectedTaskVersion: number;
    executionKey: string;
    input: Record<string, unknown>;
    now: Date;
    runId: string;
    taskId: string;
    uid: number;
  }): Promise<{ execution: WorkflowNodeExecutionRecord; kind: "success" } | WorkflowRuntimeFailure>;
  scheduleCapabilityRetry(input: WorkflowCapabilityExecutionFailureInput & {
    dueAt: Date;
  }): Promise<{ kind: "success"; task: WorkflowTaskRecord } | WorkflowRuntimeFailure>;
  failCapabilityExecution(input: WorkflowCapabilityExecutionFailureInput): Promise<
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
  beginFixedWait(input: WorkflowBeginFixedWaitInput): Promise<
    | { kind: "success"; run: WorkflowRunRecord; task: WorkflowTaskRecord }
    | Exclude<WorkflowRuntimeFailure, { action: "cancel" | "defer"; kind: "workflow-unavailable" }>
    | { action: "cancel"; kind: "workflow-unavailable" }
  >;
  createRunWithInitialTask(input: WorkflowCreateRunInput): Promise<
    | {
        deduplicated: boolean;
        kind: "success";
        run: WorkflowRunRecord;
        task: WorkflowTaskRecord;
      }
    | { kind: "capacity-rejected" }
    | { kind: "active-run-rejected" }
    | WorkflowRuntimeFailure
  >;
  deferTask(input: {
    dueAt: Date;
    expectedTaskVersion: number;
    reasonCode: WorkflowTaskDeferReasonCode;
    taskId: string;
    uid: number;
  }): Promise<{ kind: "success"; run: WorkflowRunRecord; task: WorkflowTaskRecord } | WorkflowRuntimeFailure>;
  findRun(uid: number, runId: string): Promise<WorkflowRunRecord | null>;
  findEventSubscriptionByTask(
    uid: number,
    taskId: string,
  ): Promise<WorkflowEventSubscriptionRecord | null>;
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
    taskStatusesReconciled: number;
    tasksChecked: number;
    terminalRunTasksCancelled: number;
  }>;
  listActiveCapacityTenants(input: {
    afterUid?: number;
    limit: number;
  }): Promise<{
    hasMore: boolean;
    lastUid: number | null;
    uids: number[];
  }>;
  listActiveRunWorkflowIds(input: {
    uid: number;
    workflowTypes: WorkflowType[];
  }): Promise<Array<{ workflowId: string; workflowType: WorkflowType }>>;
  reconcileTenantCapacityCounts(input: {
    afterUid?: number;
    limit: number;
  }): Promise<{
    checked: number;
    corrected: number;
    hasMore: boolean;
    lastUid: number | null;
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
  triggerEventSubscription(input: WorkflowTriggerEventSubscriptionInput): Promise<
    | {
        kind: "success";
        run: WorkflowRunRecord;
        subscription: WorkflowEventSubscriptionRecord;
        task: WorkflowTaskRecord;
      }
    | WorkflowRuntimeFailure
  >;
};
