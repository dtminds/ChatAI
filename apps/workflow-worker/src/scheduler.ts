import {
  WORKFLOW_RUNTIME_BATCH_LIMIT,
  type WorkflowTaskCapacityPort,
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
  taskCapacityPort?: WorkflowTaskCapacityPort;
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
    if (!input.taskCapacityPort) {
      dispatched = await input.repository.dispatchDueTasks({
        limit: input.limit,
        now: input.now,
      });
    } else {
      const availability = await input.taskCapacityPort.availability();
      if (availability.kind === "unavailable" || availability.available <= 0) {
        dispatched = { cancelled: 0, dispatched: 0, suspended: 0 };
      } else {
        const candidates = await input.repository.listDueTaskCandidates({
          // Keep the candidate window bounded by the normal scheduler batch.
          // A tenant quota rejection must not hide later candidates while a
          // global slot is still available.
          limit: input.limit,
          now: input.now,
        });
        const reservations = new Map<string, {
          lease: Extract<Awaited<ReturnType<WorkflowTaskCapacityPort["reserve"]>>, { kind: "reserved" }>['lease'];
          uid: number;
        }>();
        for (const candidate of candidates) {
          const reservation = await input.taskCapacityPort.reserve({
            leaseDurationMs: input.leaseDurationMs,
            taskId: candidate.taskId,
            taskVersion: candidate.taskVersion + 1,
            uid: candidate.uid,
          });
          if (reservation.kind === "reserved") {
            reservations.set(candidate.taskId, { lease: reservation.lease, uid: candidate.uid });
            continue;
          }
          if (reservation.kind === "deferred"
            && reservation.reasonCode === "WORKFLOW_TASK_CAPACITY_UNAVAILABLE") break;
        }
        const reservedCandidates = candidates.filter(candidate => reservations.has(candidate.taskId));
        try {
          const result = await input.repository.dispatchReservedTasks({
            candidates: reservedCandidates,
            now: input.now,
          });
          const dispatchedIds = new Set(result.dispatched.map(candidate => candidate.taskId));
          await Promise.all([...reservations]
            .filter(([taskId]) => !dispatchedIds.has(taskId))
            .map(([, reservation]) => input.taskCapacityPort!.releaseReservation({
              lease: reservation.lease,
              uid: reservation.uid,
            })));
          dispatched = {
            cancelled: result.cancelled,
            dispatched: result.dispatched.length,
            suspended: result.suspended,
          };
        } catch (error) {
          await Promise.all([...reservations.values()].map(reservation =>
            input.taskCapacityPort!.releaseReservation({
              lease: reservation.lease,
              uid: reservation.uid,
            })));
          throw error;
        }
      }
    }
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
