import {
  WORKFLOW_BRANCH_NODE_ESTIMATED_HEIGHT,
  WORKFLOW_BRANCH_NODE_WIDTH,
  WORKFLOW_NODE_ESTIMATED_HEIGHT,
  WORKFLOW_NODE_WIDTH,
} from "./constants";
import { getNodeSourceHandleTop } from "./node-handle-definitions";
import type { WorkflowNode } from "./types";

export function getWorkflowNodeWidth(node: WorkflowNode) {
  return node.data.kind === "branch" ? WORKFLOW_BRANCH_NODE_WIDTH : WORKFLOW_NODE_WIDTH;
}

export function getWorkflowNodeEstimatedHeight(node: WorkflowNode) {
  return node.data.kind === "branch"
    ? WORKFLOW_BRANCH_NODE_ESTIMATED_HEIGHT
    : WORKFLOW_NODE_ESTIMATED_HEIGHT;
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
