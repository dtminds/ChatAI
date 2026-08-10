import type {
  WorkflowOutputValueType,
  WorkflowVariableDefinition,
} from "./types";

export const workflowContextVariables: WorkflowVariableDefinition[] = [
  createContextVariable("subject", "id", "主体ID", "string"),
  createContextVariable("trigger", "eventType", "事件类型", "string"),
  createContextVariable("trigger", "occurredAt", "触发时间", "datetime"),
];

function createContextVariable(
  scope: "subject" | "trigger",
  key: string,
  label: string,
  type: "datetime" | "string",
): WorkflowVariableDefinition {
  const valueType: WorkflowOutputValueType = { kind: type };
  return {
    key,
    label,
    scope,
    selector: [scope, key],
    type,
    valueType,
  };
}
