import { describe } from "vitest";
import { InMemoryWorkflowRuntimeRepository } from "../src/index.js";
import { runWorkflowRuntimeRepositoryContract } from "./support/runtime-repository-contract.js";

describe("in-memory workflow runtime repository contract", () => {
  runWorkflowRuntimeRepositoryContract(() => {
    const repository = new InMemoryWorkflowRuntimeRepository();
    return {
      repository,
      async setRunStatus(runId, status) {
        const run = repository.runs.find((candidate) => candidate.id === runId);
        if (!run) throw new Error(`Workflow run ${runId} not found`);
        run.status = status;
      },
    };
  });
});
