import {
  WORKFLOW_BRANCH_FIRST_HANDLE_TOP,
  WORKFLOW_BRANCH_HANDLE_ROW_GAP,
  WORKFLOW_BRANCH_NODE_ESTIMATED_HEIGHT,
  WORKFLOW_BRANCH_NODE_WIDTH,
  WORKFLOW_NODE_ESTIMATED_HEIGHT,
  WORKFLOW_NODE_HANDLE_TOP,
  WORKFLOW_NODE_WIDTH,
} from "./constants";
import { getBranchHandleIndex } from "./graph";
import type { MarketingWorkflowNode } from "./types";

export function getBranchHandleTop(sourceHandle?: string) {
  return WORKFLOW_BRANCH_FIRST_HANDLE_TOP
    + getBranchHandleIndex(sourceHandle) * WORKFLOW_BRANCH_HANDLE_ROW_GAP;
}

export function getWorkflowNodeWidth(node: MarketingWorkflowNode) {
  return node.data.kind === "branch" ? WORKFLOW_BRANCH_NODE_WIDTH : WORKFLOW_NODE_WIDTH;
}

export function getWorkflowNodeEstimatedHeight(node: MarketingWorkflowNode) {
  return node.data.kind === "branch"
    ? WORKFLOW_BRANCH_NODE_ESTIMATED_HEIGHT
    : WORKFLOW_NODE_ESTIMATED_HEIGHT;
}

export function getInsertMenuHandleTop(node: MarketingWorkflowNode, sourceHandle?: string) {
  if (node.data.kind !== "branch") {
    return WORKFLOW_NODE_HANDLE_TOP;
  }

  return getBranchHandleTop(sourceHandle);
}

export function getInsertMenuTop(node: MarketingWorkflowNode, sourceHandle?: string) {
  return node.position.y
    - getWorkflowNodeEstimatedHeight(node) / 2
    + getInsertMenuHandleTop(node, sourceHandle)
    - 8;
}
