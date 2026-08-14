import type { WorkflowRuntimeRepository } from "./types.js";

export class WorkflowRuntimeReconciler {
  constructor(private readonly repository: WorkflowRuntimeRepository) {}

  recoverExpiredLeases(input: { limit: number; maxAttempts: number; now: Date }) {
    return this.repository.recoverExpiredLeases(input);
  }

  republishStalledDispatchedTasks(input: { dispatchedBefore: Date; limit: number; now: Date }) {
    return this.repository.republishStalledDispatchedTasks(input);
  }

  cleanupExpiredInbox(input: { limit: number; now: Date }) {
    return this.repository.cleanupExpiredInbox(input);
  }

  cleanupWorkflowHistory(
    input: Parameters<WorkflowRuntimeRepository["cleanupWorkflowHistory"]>[0],
  ) {
    return this.repository.cleanupWorkflowHistory(input);
  }

  recoverExpiredOutboxLeases(input: { limit: number; now: Date }) {
    return this.repository.recoverExpiredOutboxLeases(input);
  }

  reconcileRunTaskConsistency(
    input: Parameters<WorkflowRuntimeRepository["reconcileRunTaskConsistency"]>[0],
  ) {
    return this.repository.reconcileRunTaskConsistency(input);
  }

  reconcileEventSubscriptions(
    input: Parameters<WorkflowRuntimeRepository["reconcileEventSubscriptions"]>[0],
  ) {
    return this.repository.reconcileEventSubscriptions(input);
  }

  aggregateNodeMetricEvents(input: { limit: number }) {
    return this.repository.aggregateNodeMetricEvents(input);
  }

  cleanupProcessedNodeMetricEvents(input: { limit: number; processedBefore: Date }) {
    return this.repository.cleanupProcessedNodeMetricEvents(input);
  }

  async processRevisionCleanups(input: {
    leaseDurationMs: number;
    leaseOwner: string;
    limit: number;
    maxAttempts: number;
    now: Date;
    retryDelayMs: number;
  }) {
    const requests = await this.repository.claimRevisionCleanupBatch({
      leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
      leaseOwner: input.leaseOwner,
      limit: input.limit,
      maxAttempts: input.maxAttempts,
      now: input.now,
    });
    let cancelled = 0;
    let failed = 0;
    let obsolete = 0;
    for (const request of requests) {
      try {
        const result = await this.repository.processRevisionCleanupBatch({
          cleanupId: request.id,
          leaseOwner: input.leaseOwner,
          limit: input.limit,
          now: input.now,
        });
        if (result.kind !== "success") {
          throw new Error(`Workflow Revision cleanup ${result.kind}`);
        }
        cancelled += result.cancelled;
        if (result.status === "obsolete") obsolete += 1;
      } catch (error) {
        failed += 1;
        await this.repository.failRevisionCleanup({
          cleanupId: request.id,
          errorCode: error instanceof Error
            ? error.message.slice(0, 128)
            : "WORKFLOW_REVISION_CLEANUP_FAILED",
          leaseOwner: input.leaseOwner,
          maxAttempts: input.maxAttempts,
          nextAttemptAt: new Date(input.now.getTime() + input.retryDelayMs),
        });
      }
    }
    return { cancelled, claimed: requests.length, failed, obsolete };
  }

  async cancelStoppedWorkflow(input: {
    afterRunId?: string;
    limit: number;
    uid: number;
    workflowId: string;
  }) {
    const result = await this.repository.cancelWorkflowBatch(input);
    return {
      cancelled: result.cancelled,
      done: !result.hasMore,
      nextCursor: result.lastRunId,
    };
  }

  async cancelUnavailableRuns(input: { afterRunId?: string; limit: number }) {
    const result = await this.repository.cancelUnavailableWorkflowRuns(input);
    return {
      cancelled: result.cancelled,
      done: !result.hasMore,
      nextCursor: result.lastRunId,
    };
  }
}
