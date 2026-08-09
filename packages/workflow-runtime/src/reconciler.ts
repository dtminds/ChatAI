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

  aggregateNodeMetricEvents(input: { limit: number }) {
    return this.repository.aggregateNodeMetricEvents(input);
  }

  cleanupProcessedNodeMetricEvents(input: { limit: number; processedBefore: Date }) {
    return this.repository.cleanupProcessedNodeMetricEvents(input);
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
