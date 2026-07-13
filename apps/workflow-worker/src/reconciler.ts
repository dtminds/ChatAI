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
};

export async function reconcileWorkflowRuntime(input: {
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
  limit: number;
  maxTaskAttempts: number;
  now: Date;
  reconciler: WorkflowReconciler;
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
    historyCleanupHasMore: history.hasMore,
    inboxDeleted,
    inconsistentRunsFailed: consistency.inconsistentRunsFailed,
    nextConsistencyRunCursor: consistency.hasMoreRuns ? consistency.lastRunId : null,
    nextConsistencyTaskCursor: consistency.hasMoreTasks ? consistency.lastTaskId : null,
    nextCursor: cancellation.done ? null : cancellation.nextCursor,
    nodeMetricEventsAggregated,
    nodeMetricEventsDeleted,
    nodeExecutionsDeleted: history.nodeExecutionsDeleted,
    stalledTasksRepublished,
    outboxLeasesRecovered,
    outboxDeleted: history.outboxDeleted,
    runsDeleted: history.runsDeleted,
    runsChecked: consistency.runsChecked,
    staleTasksCancelled: consistency.staleTasksCancelled,
    taskLeasesDead: taskLeaseRecovery.dead,
    taskLeasesRecovered: taskLeaseRecovery.recovered,
    tasksChecked: consistency.tasksChecked,
    tasksDeleted: history.tasksDeleted,
    terminalRunTasksCancelled: consistency.terminalRunTasksCancelled,
  };
}
