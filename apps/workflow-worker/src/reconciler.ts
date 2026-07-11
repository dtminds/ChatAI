type WorkflowReconciler = {
  cancelUnavailableRuns(input: {
    afterRunId?: string;
    limit: number;
  }): Promise<{ cancelled: number; done: boolean; nextCursor: string | null }>;
  cleanupExpiredInbox(input: { limit: number; now: Date }): Promise<number>;
  recoverExpiredLeases(input: {
    limit: number;
    maxAttempts: number;
    now: Date;
  }): Promise<{ dead: number; recovered: number }>;
  republishStalledDispatchedTasks(input: {
    dispatchedBefore: Date;
    limit: number;
    now: Date;
  }): Promise<number>;
  recoverExpiredOutboxLeases(input: { limit: number; now: Date }): Promise<number>;
};

export async function reconcileWorkflowRuntime(input: {
  afterRunId?: string;
  dispatchTimeoutMs: number;
  inboxCleanupBatchSize: number;
  limit: number;
  maxTaskAttempts: number;
  now: Date;
  reconciler: WorkflowReconciler;
}) {
  const cancellation = await input.reconciler.cancelUnavailableRuns({
    afterRunId: input.afterRunId,
    limit: input.limit,
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
  return {
    cancelled: cancellation.cancelled,
    inboxDeleted,
    nextCursor: cancellation.done ? null : cancellation.nextCursor,
    stalledTasksRepublished,
    outboxLeasesRecovered,
    taskLeasesDead: taskLeaseRecovery.dead,
    taskLeasesRecovered: taskLeaseRecovery.recovered,
  };
}
