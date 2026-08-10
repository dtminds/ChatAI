import { describe } from "vitest";
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
      async setWorkflowRuntimeStatus(status) {
        runtimeStatus = status;
      },
    };
  });
});
