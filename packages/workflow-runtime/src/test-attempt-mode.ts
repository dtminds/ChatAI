export type WorkflowLlmTestMode = "disabled" | "mock";

export function parseWorkflowLlmTestMode(value: string | undefined): WorkflowLlmTestMode {
  const normalized = value?.trim() || "disabled";
  if (normalized === "disabled" || normalized === "mock") return normalized;
  throw new Error("WORKFLOW_LLM_TEST_MODE must be disabled or mock");
}

export function assertWorkflowLlmTestModeAllowed(
  mode: WorkflowLlmTestMode,
  nodeEnv: string | undefined,
) {
  if (nodeEnv === "production" && mode !== "disabled") {
    throw new Error("WORKFLOW_LLM_TEST_MODE must be disabled in production");
  }
}
