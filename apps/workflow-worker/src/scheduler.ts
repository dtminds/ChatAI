import {
  WORKFLOW_RUNTIME_BATCH_LIMIT,
  type WorkflowSchedulerRepository,
} from "@chatai/workflow-runtime";

export async function scheduleWorkflowTasks(input: {
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
  now: Date;
  repository: WorkflowSchedulerRepository;
}) {
  await input.repository.processTaskStatusTransitionBatch({
    leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
    leaseOwner: input.leaseOwner,
    limit: WORKFLOW_RUNTIME_BATCH_LIMIT,
    now: input.now,
  });
  return input.repository.dispatchDueTasks({
    limit: input.limit,
    now: input.now,
  });
}
