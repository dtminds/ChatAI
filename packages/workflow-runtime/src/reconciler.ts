import type { WorkflowRuntimeRepository } from "./types.js";

export class WorkflowRuntimeReconciler {
  constructor(private readonly repository: WorkflowRuntimeRepository) {}

  recoverExpiredLeases(input: { limit: number; now: Date }) {
    return this.repository.recoverExpiredLeases(input);
  }

  recoverExpiredOutboxLeases(input: { limit: number; now: Date }) {
    return this.repository.recoverExpiredOutboxLeases(input);
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
