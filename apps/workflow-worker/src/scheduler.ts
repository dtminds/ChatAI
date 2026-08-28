import type { WorkflowSchedulerRepository } from "@chatai/workflow-runtime";

export function scheduleWorkflowTasks(input: {
  limit: number;
  now: Date;
  repository: WorkflowSchedulerRepository;
}) {
  return input.repository.dispatchDueTasks({
    limit: input.limit,
    now: input.now,
  });
}
