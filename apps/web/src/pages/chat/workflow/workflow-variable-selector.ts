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

  return variable.sourceNodeTitle
    ? `${variable.sourceNodeTitle}.${variable.label}`
    : variable.label;
}

export function getWorkflowVariableDisplaySourceLabel(variable: WorkflowVariableDefinition) {
  if (variable.sourceNodeTitle) return variable.sourceNodeTitle;
  if (variable.scope === "input") return "输入参数";
  if (variable.scope === "subject" || variable.scope === "trigger") return "全局变量";
  return undefined;
}
