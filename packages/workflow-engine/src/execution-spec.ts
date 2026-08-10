import type {
  WorkflowExecutionSpec,
  WorkflowStoredExecutionSpec,
} from "@chatai/contracts";
import {
  getWorkflowAggregateCapabilityRequirements,
  getWorkflowNodeCapabilityRequirements,
} from "./capability-requirements.js";

export function normalizeWorkflowExecutionSpec(
  spec: WorkflowStoredExecutionSpec,
): WorkflowExecutionSpec {
  if (spec.schemaVersion === 2) {
    return structuredClone(spec);
  }

  const nodes = spec.nodes.map((node) => {
    const normalizedNode = structuredClone(node);
    return {
      ...normalizedNode,
      requiredCapabilities: getWorkflowNodeCapabilityRequirements(
        normalizedNode.kind,
        normalizedNode.config,
      ),
    };
  });

  return {
    ...structuredClone(spec),
    nodes,
    requiredCapabilities: getWorkflowAggregateCapabilityRequirements(nodes),
    schemaVersion: 2,
  };
}
