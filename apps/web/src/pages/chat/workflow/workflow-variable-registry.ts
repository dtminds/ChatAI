import {
  getWorkflowGuaranteedVariableCatalog,
  type WorkflowType,
} from "@chatai/contracts";
import type {
  WorkflowNode,
  WorkflowOutputValueType,
  WorkflowVariableDefinition,
} from "./types";
import { isChatAiStartNodeData } from "./types";

export const workflowContextVariables: WorkflowVariableDefinition[] = [
  createContextVariable("subject", "id", "主体ID", "string"),
  createContextVariable("trigger", "eventType", "事件类型", "string"),
  createContextVariable("trigger", "occurredAt", "触发时间", "datetime"),
  createProjectionVariable("workUserId", "企微成员ID", "number"),
  createProjectionVariable("seatId", "托管账号ID", "number"),
  createProjectionVariable("externalUserId", "企微好友ID", "string"),
  createProjectionVariable("thirdExternalUserId", "托管账号好友ID", "string"),
  createProjectionVariable("tagId", "标签ID", "number"),
  createProjectionVariable("messageId", "消息ID", "number"),
];

export function getWorkflowContextVariables(nodes: WorkflowNode[]) {
  const startNode = nodes.find((node): node is WorkflowNode<"start"> => node.data.kind === "start");
  if (!startNode) return workflowContextVariables.slice(0, 3);
  const workflowType: Extract<WorkflowType, "chatai_sop" | "wecom_sop"> =
    isChatAiStartNodeData(startNode.data) ? "chatai_sop" : "wecom_sop";
  const available = new Set(getWorkflowGuaranteedVariableCatalog(
    workflowType,
    startNode.data.triggers.map(trigger => trigger.type),
  ));
  return workflowContextVariables
    .filter(variable => available.has(variable.selector.join(".")))
    .map(variable => variable.scope === "trigger"
      ? {
          ...variable,
          sourceNodeId: startNode.id,
          sourceNodeKind: startNode.data.kind,
          sourceNodeTitle: startNode.data.title,
        }
      : variable);
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
