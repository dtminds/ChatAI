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
  createProjectionVariable("seatId", "席位ID", "number"),
  createProjectionVariable("externalUserId", "企微好友ID", "string"),
  createProjectionVariable("thirdExternalUserId", "ChatAI席位好友ID", "string"),
  createProjectionVariable("tagId", "标签ID", "number"),
  createProjectionVariable("messageId", "消息ID", "number"),
];

const SHARED_CONTEXT_VARIABLE_COUNT = 3;
const WECOM_PROJECTION_KEYS = new Set(["workUserId", "externalUserId", "tagId"]);

export function getWorkflowContextVariables(nodes: WorkflowNode[]) {
  const startNode = nodes.find((node): node is WorkflowNode<"start"> => node.data.kind === "start");
  if (!startNode) return workflowContextVariables.slice(0, SHARED_CONTEXT_VARIABLE_COUNT);
  if (isChatAiStartNodeData(startNode.data)) return workflowContextVariables;
  return workflowContextVariables.filter((variable, index) =>
    index < SHARED_CONTEXT_VARIABLE_COUNT || WECOM_PROJECTION_KEYS.has(variable.key),
  );
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
