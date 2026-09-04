import {
  createWorkflowCustomFieldVariableSelector,
  getWorkflowGuaranteedVariableCatalog,
  getWorkflowCustomFieldVariableValueType,
  type CustomFieldItem,
  type WorkflowType,
} from "@chatai/contracts";
import type {
  WorkflowNode,
  WorkflowOutputValueType,
  WorkflowVariableDefinition,
} from "./types";
import { isChatAiStartNodeData } from "./types";

export const workflowContextVariables: WorkflowVariableDefinition[] = [
  createContextVariable("subject", "id", "客户 ID", "string"),
  createContextVariable("trigger", "occurredAt", "触发时间", "datetime"),
  createProjectionVariable("externalUserId", "企微客户 ID", "number"),
  createProjectionVariable("workUserId", "企微成员 ID", "number"),
  createProjectionVariable("seatId", "托管账号 ID", "number"),
];

export function getWorkflowContextVariables(
  nodes: WorkflowNode[],
  customFields: readonly CustomFieldItem[] = [],
) {
  const startNode = nodes.find((node): node is WorkflowNode<"start"> => node.data.kind === "start");
  const customFieldVariables = customFields.flatMap(createCustomFieldVariable);
  if (!startNode) return [
    ...workflowContextVariables.slice(0, 3),
    ...customFieldVariables,
  ];
  const workflowType: Extract<WorkflowType, "chatai_sop" | "wecom_sop"> =
    isChatAiStartNodeData(startNode.data) ? "chatai_sop" : "wecom_sop";
  const available = new Set(getWorkflowGuaranteedVariableCatalog(
    workflowType,
    startNode.data.triggers.map(trigger => trigger.type),
  ));
  return [
    ...workflowContextVariables
      .filter(variable => available.has(variable.selector.join("."))),
    ...customFieldVariables,
  ];
}

function createCustomFieldVariable(
  field: CustomFieldItem,
): WorkflowVariableDefinition[] {
  const valueType = getWorkflowCustomFieldVariableValueType(field.type);
  if (!valueType) return [];
  return [{
    key: String(field.id),
    label: field.title,
    scope: "subject",
    selector: createWorkflowCustomFieldVariableSelector(field.id),
    type: valueType.kind,
    valueType,
  }];
}

function createContextVariable(
  scope: "subject" | "trigger",
  key: string,
  label: string,
  type: "datetime" | "number" | "string",
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

function createProjectionVariable(
  key: string,
  label: string,
  type: "number" | "string",
): WorkflowVariableDefinition {
  const valueType: WorkflowOutputValueType = { kind: type };
  return {
    key,
    label,
    scope: "trigger",
    selector: ["trigger", "projection", key],
    type,
    valueType,
  };
}
