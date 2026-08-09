import type {
  WorkflowOutputValueType,
  WorkflowVariableDefinition,
} from "./types";

export const workflowContextVariables: WorkflowVariableDefinition[] = [
  createContextVariable("system", "employeeId", "员工ID", "string"),
  createContextVariable("customer", "id", "客户ID", "string"),
  createContextVariable("customer", "name", "客户昵称", "string"),
  createContextVariable("trigger", "occurredAt", "触发时间", "datetime"),
];

function createContextVariable(
  scope: "customer" | "system" | "trigger",
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
