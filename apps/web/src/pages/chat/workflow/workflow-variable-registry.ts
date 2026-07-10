import type { WorkflowVariableDefinition, WorkflowVariableValueType } from "./types";

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
  type: WorkflowVariableValueType,
): WorkflowVariableDefinition {
  return {
    key,
    label,
    scope,
    selector: [scope, key],
    type,
  };
}
