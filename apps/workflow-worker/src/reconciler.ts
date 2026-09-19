import type {
  WorkflowHistoryCleanupResult,
  WorkflowTaskCapacityPort,
} from "@chatai/workflow-runtime";

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
  deactivateUnentitledWorkflows(input: {
    afterUid?: number;
    limit: number;
  }): Promise<{
    checksUnavailable: number;
    hasMore: boolean;
    lastUid: number | null;
    tenantsChecked: number;
    workflowsDeactivated: number;
  }>;
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
    taskStatusesReconciled: number;
    tasksChecked: number;
    terminalRunTasksCancelled: number;
  }>;
  reconcileTenantCapacityCounts(input: {
    afterUid?: number;
    limit: number;
  }): Promise<{
    checked: number;
    corrected: number;
    hasMore: boolean;
    lastUid: number | null;
  }>;
  republishStalledDispatchedTasks(input: {
    dispatchedBefore: Date;
    limit: number;
    now: Date;
  }): Promise<number>;
  listStalledDispatchedTasks(input: {
    dispatchedBefore: Date;
    limit: number;
  }): Promise<Array<{ taskId: string; taskVersion: number; uid: number }>>;
  republishReservedTasks(input: {
    candidates: Array<{ taskId: string; taskVersion: number; uid: number }>;
    now: Date;
  }): Promise<Array<{ taskId: string; taskVersion: number; uid: number }>>;
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
  afterCapacityUid?: number;
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
  taskCapacityPort?: WorkflowTaskCapacityPort;
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
  const capacityCounts = await input.reconciler.reconcileTenantCapacityCounts({
    afterUid: input.afterCapacityUid,
    limit: input.limit,
  });
  const taskLeaseRecovery = await input.reconciler.recoverExpiredLeases({
    limit: input.limit,
    maxAttempts: input.maxTaskAttempts,
    now: input.now,
  });
  let stalledTasksRepublished = 0;
  if (!input.taskCapacityPort) {
    stalledTasksRepublished = await input.reconciler.republishStalledDispatchedTasks({
      dispatchedBefore: new Date(input.now.getTime() - input.dispatchTimeoutMs),
      limit: input.limit,
      now: input.now,
    });
  } else {
    const stalled = await input.reconciler.listStalledDispatchedTasks({
      dispatchedBefore: new Date(input.now.getTime() - input.dispatchTimeoutMs),
      limit: input.limit,
    });
    const reservations = new Map<string, {
      lease: Extract<
        Awaited<ReturnType<WorkflowTaskCapacityPort["reserve"]>>,
        { kind: "reserved" }
      >["lease"];
      uid: number;
    }>();
    for (const candidate of stalled) {
      const reservation = await input.taskCapacityPort.reserve({
        leaseDurationMs: input.leaseDurationMs,
        taskId: candidate.taskId,
        taskVersion: candidate.taskVersion,
        uid: candidate.uid,
      });
      if (reservation.kind === "reserved") {
        reservations.set(candidate.taskId, { lease: reservation.lease, uid: candidate.uid });
      } else if (reservation.kind === "deferred"
        && reservation.reasonCode === "WORKFLOW_TASK_CAPACITY_UNAVAILABLE") {
        break;
      }
    }
    try {
      const republishCandidates = stalled.filter(candidate => reservations.has(candidate.taskId));
      const republished = await input.reconciler.republishReservedTasks({
        candidates: republishCandidates,
        now: input.now,
      });
      const republishedIds = new Set(republished.map(candidate => candidate.taskId));
      await Promise.all([...reservations]
        .filter(([taskId]) => !republishedIds.has(taskId))
        .map(([, reservation]) => input.taskCapacityPort!.releaseReservation(reservation)));
      stalledTasksRepublished = republished.length;
    } catch (error) {
      await Promise.all([...reservations.values()].map(reservation =>
        input.taskCapacityPort!.releaseReservation(reservation)));
      throw error;
    }
  }
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
    capacityCountsChecked: capacityCounts.checked,
    capacityCountsCorrected: capacityCounts.corrected,
    revisionCleanupCancelled: revisionCleanup.cancelled,
    revisionCleanupClaimed: revisionCleanup.claimed,
    revisionCleanupFailed: revisionCleanup.failed,
    revisionCleanupObsolete: revisionCleanup.obsolete,
    historyCleanupHasMore: history.hasMore,
    inboxDeleted,
    inconsistentRunsFailed: consistency.inconsistentRunsFailed,
    nextConsistencyRunCursor: consistency.hasMoreRuns ? consistency.lastRunId : null,
    nextConsistencyTaskCursor: consistency.hasMoreTasks ? consistency.lastTaskId : null,
    nextCapacityCursor: capacityCounts.hasMore ? capacityCounts.lastUid : null,
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
    taskStatusesReconciled: consistency.taskStatusesReconciled,
    tasksChecked: consistency.tasksChecked,
    tasksDeleted: history.tasksDeleted,
    terminalRunTasksCancelled: consistency.terminalRunTasksCancelled,
  };
}

export async function reconcileWorkflowEntitlements(input: {
  afterUid?: number;
  limit: number;
  reconciler: Pick<WorkflowReconciler, "deactivateUnentitledWorkflows">;
}) {
  const result = await input.reconciler.deactivateUnentitledWorkflows({
    afterUid: input.afterUid,
    limit: input.limit,
  });
  return {
    entitlementChecksUnavailable: result.checksUnavailable,
    entitlementTenantsChecked: result.tenantsChecked,
    entitlementWorkflowsDeactivated: result.workflowsDeactivated,
    nextEntitlementCursor: result.hasMore ? result.lastUid : null,
  };
}
