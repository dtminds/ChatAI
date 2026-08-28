import {
  WORKFLOW_RUNTIME_BATCH_LIMIT,
  type WorkflowSchedulerRepository,
} from "@chatai/workflow-runtime";

export async function scheduleWorkflowTasks(input: {
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
  maxAttempts: number;
  now: Date;
  repository: WorkflowSchedulerRepository;
  retryDelayMs: number;
}) {
  let transitionError: unknown;
  let transition = { claimed: false, dead: 0, failed: 0, hasMore: false, transitioned: 0 };
  try {
    transition = await input.repository.processTaskStatusTransitionBatch({
      leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
      leaseOwner: input.leaseOwner,
      limit: WORKFLOW_RUNTIME_BATCH_LIMIT,
      maxAttempts: input.maxAttempts,
      nextAttemptAt: new Date(input.now.getTime() + input.retryDelayMs),
      now: input.now,
    });
  } catch (error) {
    transitionError = error;
  }

  let dispatched;
  try {
    dispatched = await input.repository.dispatchDueTasks({
      limit: input.limit,
      now: input.now,
    });
  } catch (dispatchError) {
    if (transitionError) {
      throw new AggregateError(
        [transitionError, dispatchError],
        "Workflow Task transition and due dispatch both failed",
      );
    }
    throw dispatchError;
  }
  if (transitionError) throw transitionError;
  return {
    ...dispatched,
    taskTransitionClaimed: transition.claimed ? 1 : 0,
    taskTransitionDead: transition.dead,
    taskTransitionFailed: transition.failed,
    taskTransitionHasMore: transition.hasMore,
    taskTransitioned: transition.transitioned,
  };
}
