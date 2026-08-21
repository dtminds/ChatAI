import type { WorkflowHistoryCleanupResult } from "@chatai/workflow-runtime";

type WorkflowReconciler = {
  aggregateNodeMetricEvents(input: { limit: number }): Promise<number>;
  cleanupProcessedNodeMetricEvents(input: { limit: number; processedBefore: Date }): Promise<number>;
  cancelUnavailableRuns(input: {
    afterRunId?: string;
    limit: number;
  }): Promise<{ cancelled: number; done: boolean; nextCursor: string | null }>;
  cleanupExpiredInbox(input: { limit: number; now: Date }): Promise<number>;
  cleanupWorkflowHistory(input: {
    limit: number;
    runBefore: Date;
    taskOutboxBefore: Date;
  }): Promise<WorkflowHistoryCleanupResult>;
  recoverExpiredLeases(input: {
    limit: number;
    maxAttempts: number;
    now: Date;
  }): Promise<{ dead: number; recovered: number }>;
  reconcileEventSubscriptions(input: {
    afterSubscriptionId?: string;
    limit: number;
  }): Promise<{
    cancelled: number;
    checked: number;
    hasMore: boolean;
    lastSubscriptionId: string | null;
  }>;
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
  recoverExpiredOutboxLeases(input: { limit: number; now: Date }): Promise<number>;
  processRevisionCleanups(input: {
    leaseDurationMs: number;
    leaseOwner: string;
    limit: number;
    maxAttempts: number;
    now: Date;
    retryDelayMs: number;
  }): Promise<{ cancelled: number; claimed: number; failed: number; obsolete: number }>;
};

export async function reconcileWorkflowRuntime(input: {
  afterEventSubscriptionId?: string;
  afterRunId?: string;
  afterConsistencyRunId?: string;
  afterConsistencyTaskId?: string;
  consistencyGraceMs: number;
  dispatchTimeoutMs: number;
  historyRetention?: {
    runBefore: Date;
    taskOutboxBefore: Date;
  };
  historyCleanupBatchSize: number;
  inboxCleanupBatchSize: number;
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
  maxTaskAttempts: number;
  now: Date;
  reconciler: WorkflowReconciler;
  retryDelayMs: number;
}) {
  const nodeMetricEventsAggregated = await input.reconciler.aggregateNodeMetricEvents({
    limit: input.limit,
  });
  const nodeMetricEventsDeleted = await input.reconciler.cleanupProcessedNodeMetricEvents({
    limit: input.inboxCleanupBatchSize,
    processedBefore: new Date(input.now.getTime() - 7 * 86_400_000),
  });
  const cancellation = await input.reconciler.cancelUnavailableRuns({
    afterRunId: input.afterRunId,
    limit: input.limit,
  });
  const revisionCleanup = await input.reconciler.processRevisionCleanups({
    leaseDurationMs: input.leaseDurationMs,
    leaseOwner: input.leaseOwner,
    limit: input.limit,
    maxAttempts: input.maxTaskAttempts,
    now: input.now,
    retryDelayMs: input.retryDelayMs,
  });
  const eventSubscriptions = await input.reconciler.reconcileEventSubscriptions({
    afterSubscriptionId: input.afterEventSubscriptionId,
    limit: input.limit,
  });
  const consistency = await input.reconciler.reconcileRunTaskConsistency({
    afterRunId: input.afterConsistencyRunId,
    afterTaskId: input.afterConsistencyTaskId,
    inconsistentBefore: new Date(input.now.getTime() - input.consistencyGraceMs),
    limit: input.limit,
    now: input.now,
  });
  const taskLeaseRecovery = await input.reconciler.recoverExpiredLeases({
    limit: input.limit,
    maxAttempts: input.maxTaskAttempts,
    now: input.now,
  });
  const stalledTasksRepublished = await input.reconciler.republishStalledDispatchedTasks({
    dispatchedBefore: new Date(input.now.getTime() - input.dispatchTimeoutMs),
    limit: input.limit,
    now: input.now,
  });
  const outboxLeasesRecovered = await input.reconciler.recoverExpiredOutboxLeases({
    limit: input.limit,
    now: input.now,
  });
  const inboxDeleted = await input.reconciler.cleanupExpiredInbox({
    limit: input.inboxCleanupBatchSize,
    now: input.now,
  });
  const history = input.historyRetention
    ? await input.reconciler.cleanupWorkflowHistory({
        limit: input.historyCleanupBatchSize,
        ...input.historyRetention,
      })
    : {
        hasMore: false,
        nodeExecutionsDeleted: 0,
        outboxDeleted: 0,
        runsDeleted: 0,
        tasksDeleted: 0,
      };
  return {
    cancelled: cancellation.cancelled,
    revisionCleanupCancelled: revisionCleanup.cancelled,
    revisionCleanupClaimed: revisionCleanup.claimed,
    revisionCleanupFailed: revisionCleanup.failed,
    revisionCleanupObsolete: revisionCleanup.obsolete,
    historyCleanupHasMore: history.hasMore,
    inboxDeleted,
    inconsistentRunsFailed: consistency.inconsistentRunsFailed,
    nextConsistencyRunCursor: consistency.hasMoreRuns ? consistency.lastRunId : null,
    nextConsistencyTaskCursor: consistency.hasMoreTasks ? consistency.lastTaskId : null,
    nextCursor: cancellation.done ? null : cancellation.nextCursor,
    nextEventSubscriptionCursor: eventSubscriptions.hasMore
      ? eventSubscriptions.lastSubscriptionId
      : null,
    nodeMetricEventsAggregated,
    nodeMetricEventsDeleted,
    nodeExecutionsDeleted: history.nodeExecutionsDeleted,
    stalledTasksRepublished,
    outboxLeasesRecovered,
    outboxDeleted: history.outboxDeleted,
    runsDeleted: history.runsDeleted,
    runsChecked: consistency.runsChecked,
    staleTasksCancelled: consistency.staleTasksCancelled,
    eventSubscriptionsCancelled: eventSubscriptions.cancelled,
    eventSubscriptionsChecked: eventSubscriptions.checked,
    taskLeasesDead: taskLeaseRecovery.dead,
    taskLeasesRecovered: taskLeaseRecovery.recovered,
    tasksChecked: consistency.tasksChecked,
    tasksDeleted: history.tasksDeleted,
    terminalRunTasksCancelled: consistency.terminalRunTasksCancelled,
  };
}
