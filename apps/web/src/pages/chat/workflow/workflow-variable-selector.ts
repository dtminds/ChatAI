import type {
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "./types";

export function getWorkflowVariableSelectorKey(selector: WorkflowVariableSelector) {
  return selector.join(".");
}

export function getWorkflowVariableDisplayLabel(variable: WorkflowVariableDefinition) {
  if (variable.scope === "input") {
    return variable.label;
  }

  return variable.scope === "node" && variable.sourceNodeTitle
    ? `${variable.sourceNodeTitle}.${variable.label}`
    : variable.label;
}
