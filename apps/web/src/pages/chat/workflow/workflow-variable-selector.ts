import type {
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "./types";

export function getWorkflowVariableSelectorKey(selector: WorkflowVariableSelector) {
  return selector.join(".");
}

export function getWorkflowVariableDisplayLabel(variable: WorkflowVariableDefinition) {
  const sourceLabel = getWorkflowVariableDisplaySourceLabel(variable);
  return sourceLabel
    ? `${sourceLabel}.${variable.label}`
    : variable.label;
}

export function getWorkflowVariableDisplaySourceLabel(variable: WorkflowVariableDefinition) {
  if (variable.sourceNodeTitle) return variable.sourceNodeTitle;
  if (variable.scope === "input") return "输入参数";
  if (variable.scope === "subject" || variable.scope === "trigger") return "全局变量";
  return undefined;
}
