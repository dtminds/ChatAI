import type {
  WorkflowExecutionSpec,
  WorkflowStoredExecutionSpec,
} from "@chatai/contracts";

export function normalizeWorkflowExecutionSpec(
  spec: WorkflowStoredExecutionSpec,
): WorkflowExecutionSpec {
  return structuredClone(spec);
}
