import { describe } from "vitest";
import { WORKFLOW_ACTIVE_RUN_STATUSES } from "@chatai/contracts";
import { InMemoryWorkflowRuntimeRepository } from "../src/index.js";
import { runWorkflowRuntimeRepositoryContract } from "./support/runtime-repository-contract.js";

describe("in-memory workflow runtime repository contract", () => {
  runWorkflowRuntimeRepositoryContract(() => {
    let runtimeStatus = "active" as const | "paused" | "stopped" | "inactive";
    const repository = new InMemoryWorkflowRuntimeRepository(async () => ({
      bizStatus: 1,
      runtimeStatus,
    }));
    return {
      repository,
      async setRunStatus(runId, status) {
        const run = repository.runs.find((candidate) => candidate.id === runId);
        if (!run) throw new Error(`Workflow run ${runId} not found`);
        run.status = status;
      },
      async setWorkflowRuntimeStatus(
        status,
        transitionedAt = new Date("2099-01-01T00:00:00.000Z"),
        options = {},
      ) {
        runtimeStatus = status;
        if (options.transitionInferenceJobs !== false) {
          await repository.transitionInferenceJobs({
            transitionedAt,
            transition: status === "paused" ? "pause" : status === "active" ? "resume" : "cancel",
            uid: 9,
            workflowIds: ["31"],
          });
          if (status === "active") {
            for (const task of repository.tasks) {
              if (task.uid === 9 && task.workflowId === "31" && task.status === "suspended") {
                task.status = "pending";
                task.taskVersion += 1;
              }
            }
          }
        }
      },
      async getActiveRunCount() {
        return repository.runs.filter(run =>
          run.uid === 9 && WORKFLOW_ACTIVE_RUN_STATUSES.includes(run.status),
        ).length;
      },
    };
  });
});
