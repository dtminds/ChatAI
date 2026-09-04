import type {
  MessageNodeData,
  WorkflowVariableSelector,
} from "../../types";

export function normalizeWorkflowMessageContentMode(
  value: unknown,
): MessageNodeData["contentMode"] {
  return value === "node-output" ? "node-output" : "custom";
}

export function normalizeWorkflowMessageOutputSelector(
  value: unknown,
): WorkflowVariableSelector | undefined {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value[0] !== "node"
    || value.some((part) => typeof part !== "string" || !part.trim())
  ) {
    return undefined;
  }

  return [...value];
}
