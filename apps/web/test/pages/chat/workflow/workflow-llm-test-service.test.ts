// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowLlmTestAttempt } from "@chatai/contracts";
import { http } from "@/lib/request";
import {
  cancelWorkflowLlmTestAttempt,
  createWorkflowLlmTestAttempt,
  getWorkflowLlmTestAttempt,
} from "@/pages/chat/workflow/nodes/llm/test-service";

vi.mock("@/lib/request", () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const attempt: WorkflowLlmTestAttempt = {
  attemptId: "7",
  completedAt: null,
  createdAt: "2026-08-13T05:00:00.000Z",
  errorMessage: null,
  executionMode: "real",
  expiresAt: "2026-08-13T05:10:00.000Z",
  inputValues: { input: "hello" },
  nodeId: "llm-1",
  output: null,
  status: "running",
  workflowId: "42",
};

describe("workflow LLM test service", () => {
  beforeEach(() => {
    vi.mocked(http.get).mockReset();
    vi.mocked(http.post).mockReset();
  });

  it("creates and reads the selected node Attempt through the workflow API", async () => {
    vi.mocked(http.post).mockResolvedValue({ data: attempt, success: true });
    vi.mocked(http.get).mockResolvedValue({ data: attempt, success: true });

    await expect(createWorkflowLlmTestAttempt("42", "llm-1", {
      expectedDraftVersion: 3,
      inputValues: { input: "hello" },
    })).resolves.toEqual(attempt);
    await expect(getWorkflowLlmTestAttempt("42", "llm-1", "7")).resolves.toEqual(attempt);
    await expect(cancelWorkflowLlmTestAttempt("42", "llm-1", "7")).resolves.toEqual(attempt);

    expect(http.post).toHaveBeenCalledWith(
      "/server/workflows/42/nodes/llm-1/llm-test-attempts",
      { expectedDraftVersion: 3, inputValues: { input: "hello" } },
    );
    expect(http.get).toHaveBeenCalledWith(
      "/server/workflows/42/nodes/llm-1/llm-test-attempts/7",
    );
    expect(http.post).toHaveBeenCalledWith(
      "/server/workflows/42/nodes/llm-1/llm-test-attempts/7/cancel",
    );
  });
});
