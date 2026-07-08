import { getNodeDefinitionCore } from "./node-definition-core";
import { getNodeSourceHandleTop } from "./node-handle-definitions";
import type { WorkflowNode } from "./types";

export function getWorkflowNodeWidth(node: WorkflowNode) {
  return getNodeDefinitionCore(node.data.kind).layout.width;
}

export function getWorkflowNodeEstimatedHeight(node: WorkflowNode) {
  return getNodeDefinitionCore(node.data.kind).layout.estimatedHeight;
}

export function getInsertMenuHandleTop(node: WorkflowNode, sourceHandle?: string) {
  return getNodeSourceHandleTop(node, sourceHandle);
}

export function getInsertMenuTop(node: WorkflowNode, sourceHandle?: string) {
  return node.position.y
    - getWorkflowNodeEstimatedHeight(node) / 2
    + getInsertMenuHandleTop(node, sourceHandle)
    - 8;
}
