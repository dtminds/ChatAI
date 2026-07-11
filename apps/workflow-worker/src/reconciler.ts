type WorkflowReconciler = {
  cancelUnavailableRuns(input: {
    afterRunId?: string;
    limit: number;
  }): Promise<{ cancelled: number; done: boolean; nextCursor: string | null }>;
  recoverExpiredLeases(input: { limit: number; now: Date }): Promise<number>;
  recoverExpiredOutboxLeases(input: { limit: number; now: Date }): Promise<number>;
};

export async function reconcileWorkflowRuntime(input: {
  afterRunId?: string;
  limit: number;
  now: Date;
  reconciler: WorkflowReconciler;
}) {
  const [taskLeasesRecovered, outboxLeasesRecovered, cancellation] = await Promise.all([
    input.reconciler.recoverExpiredLeases({ limit: input.limit, now: input.now }),
    input.reconciler.recoverExpiredOutboxLeases({ limit: input.limit, now: input.now }),
    input.reconciler.cancelUnavailableRuns({
      afterRunId: input.afterRunId,
      limit: input.limit,
    }),
  ]);
  return {
    cancelled: cancellation.cancelled,
    nextCursor: cancellation.done ? null : cancellation.nextCursor,
    outboxLeasesRecovered,
    taskLeasesRecovered,
  };
}
