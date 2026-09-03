import { describe } from "vitest";
import { InMemoryWorkflowLlmTestAttemptRepository } from "../src/index.js";
import { runWorkflowLlmTestAttemptRepositoryContract } from "./support/llm-test-attempt-repository-contract.js";

describe("in-memory Workflow LLM test Attempt repository contract", () => {
  runWorkflowLlmTestAttemptRepositoryContract(
    () => new InMemoryWorkflowLlmTestAttemptRepository(),
  );
});
