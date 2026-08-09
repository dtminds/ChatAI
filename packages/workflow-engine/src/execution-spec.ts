import type {
  WorkflowExecutionSpec,
  WorkflowStoredExecutionSpec,
} from "@chatai/contracts";

export function normalizeWorkflowExecutionSpec(
  spec: WorkflowStoredExecutionSpec,
): WorkflowExecutionSpec {
  if (spec.schemaVersion === 2) {
    return structuredClone(spec);
  }

  return {
    ...structuredClone(spec),
    nodes: spec.nodes.map((node) => ({
      ...structuredClone(node),
      requiredCapabilities: [],
    })),
    requiredCapabilities: [],
    schemaVersion: 2,
  };
}
