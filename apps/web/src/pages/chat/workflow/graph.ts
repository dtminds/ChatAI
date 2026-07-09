import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_LAYOUT_X_GAP,
  WORKFLOW_NODE_TYPE,
} from "./constants";
import {
  getNodeSourceHandleIndex,
  getNodeSourceHandleLabel,
  getNodeSourceHandleLaneOffset,
} from "./node-handle-definitions";
import { createDefaultNodeData } from "./node-definition-core";
import type {
  InsertableWorkflowNodeKind,
  WorkflowEdge,
  WorkflowDraft,
  WorkflowNode,
} from "./types";
export { arrangeWorkflowNodes } from "./workflow-layout";

export const DEFAULT_WORKFLOW_VIEWPORT = { x: 36, y: 420, zoom: 0.82 };

export function createInitialDraft(): WorkflowDraft {
  return {
    edges: createInitialEdges(),
    nodes: createInitialNodes(),
    viewport: DEFAULT_WORKFLOW_VIEWPORT,
  };
}

export function createInitialNodes(): WorkflowNode[] {
  return [
    {
      data: {
        ...createDefaultNodeData("trigger"),
        audience: "近 30 天新入会且未首购客户",
        metric: "预计进入 124.8万人",
        status: "running",
        summary: "客户入会后立即进入新人转化旅程",
        title: "新人入会触发",
      },
      id: "trigger",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    },
    {
      data: {
        ...createDefaultNodeData("wait"),
        delayDays: 2,
        metric: "2 天后唤醒",
        status: "ready",
        summary: "等待 2 天后继续触达",
        title: "观察期",
      },
      id: "wait-2d",
      position: { x: 310, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    },
    {
      data: {
        ...createDefaultNodeData("branch"),
        branchRule: "最近 7 天浏览活动页 >= 2 次，或咨询过商品功效",
        metric: "2 条分支",
        status: "ready",
        summary: "按活动兴趣和咨询意图拆分路径",
        title: "意向判断",
      },
      id: "branch-intent",
      position: { x: 620, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    },
    {
      data: {
        ...createDefaultNodeData("action"),
        actionType: "message",
        label: "发送消息",
        metric: "欢迎语 + 活动卡片",
        status: "ready",
        summary: "发送欢迎语和活动权益卡片",
        title: "发送欢迎消息",
      },
      id: "action-message",
      position: { x: 930, y: -94 },
      type: WORKFLOW_NODE_TYPE,
    },
    {
      data: {
        ...createDefaultNodeData("goal"),
        conversion: 18.4,
        metric: "目标 18.4%",
        status: "ready",
        summary: "完成首单或领取新人券后退出",
        title: "首单转化",
      },
      id: "goal",
      position: { x: 1240, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    },
  ];
}

export function createInitialEdges(): WorkflowEdge[] {
  return [
    createEdge("trigger", "wait-2d"),
    createEdge("wait-2d", "branch-intent"),
    createEdge("branch-intent", "action-message", "高意向", {
      sourceHandle: "branch-high",
    }),
    createEdge("action-message", "goal"),
  ];
}

export function createNodeFromKind(
  kind: InsertableWorkflowNodeKind,
  id: string,
  index: number,
): WorkflowNode {
  const commonPosition = {
    x: 300 + index * 310,
    y: index % 2 === 0 ? -94 : 94,
  };

  return {
    data: createDefaultNodeData(kind),
    id,
    position: commonPosition,
    type: WORKFLOW_NODE_TYPE,
  };
}

export function duplicateWorkflowNode(
  node: WorkflowNode,
  nodeId: string,
  reservedTitles: Set<string>,
): WorkflowNode {
  return {
    ...node,
    data: {
      ...node.data,
      title: getUniqueDuplicatedNodeTitle(node.data.title, reservedTitles),
    },
    id: nodeId,
    position: {
      x: node.position.x + 48,
      y: node.position.y + 48,
    },
    selected: false,
    zIndex: undefined,
  };
}

export function getNewNodeTitleFromOld(title: string) {
  const match = /^(.+?)\s*\((\d+)\)\s*$/.exec(title);

  if (!match) {
    return `${title} (1)`;
  }

  return `${match[1]} (${Number.parseInt(match[2], 10) + 1})`;
}

export function getUniqueDuplicatedNodeTitle(title: string, reservedTitles: Set<string>) {
  let titleCandidate = getNewNodeTitleFromOld(title);

  while (reservedTitles.has(titleCandidate)) {
    titleCandidate = getNewNodeTitleFromOld(titleCandidate);
  }

  reservedTitles.add(titleCandidate);
  return titleCandidate;
}

export function createEdge(
  source: string,
  target: string,
  label?: string,
  handles: {
    sourceHandle?: string | null;
    targetHandle?: string | null;
  } = {},
): WorkflowEdge {
  const sourceHandle = handles.sourceHandle ?? undefined;
  const targetHandle = handles.targetHandle ?? undefined;
  const edgeIdParts = ["edge", source, sourceHandle, target, targetHandle].filter(Boolean);

  return {
    data: label ? { label } : undefined,
    id: edgeIdParts.join("-"),
    source,
    sourceHandle,
    target,
    targetHandle,
    type: WORKFLOW_EDGE_TYPE,
  };
}

export function getBranchHandleIndex(sourceHandle?: string | null) {
  return getNodeSourceHandleIndex(undefined, sourceHandle);
}

export function getSourceHandleLabel(
  sourceHandle?: string | null,
  sourceNode?: WorkflowNode,
) {
  return getNodeSourceHandleLabel(sourceNode?.data, sourceHandle);
}

export function getSourceHandleInsertY(
  nodeY: number,
  sourceHandle?: string,
  sourceNode?: WorkflowNode,
) {
  return nodeY + getNodeSourceHandleLaneOffset(sourceNode, sourceHandle) * 96;
}

export function getAfterNodesInSameBranch(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  nodeId: string,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const result: WorkflowNode[] = [];
  const visitedNodeIds = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();

    if (!currentNodeId || visitedNodeIds.has(currentNodeId)) {
      continue;
    }

    visitedNodeIds.add(currentNodeId);
    const currentNode = nodeById.get(currentNodeId);

    if (currentNode) {
      result.push(currentNode);
    }

    edges.forEach((edge) => {
      if (edge.source === currentNodeId && !visitedNodeIds.has(edge.target)) {
        queue.push(edge.target);
      }
    });
  }

  return result;
}

export function getNodeIdSet(nodes: WorkflowNode[]) {
  return new Set(nodes.map((node) => node.id));
}

export function shiftNodesRight(
  nodes: WorkflowNode[],
  shiftedNodeIds: Set<string>,
) {
  if (shiftedNodeIds.size === 0) {
    return nodes;
  }

  return nodes.map((node) =>
    shiftedNodeIds.has(node.id)
      ? {
          ...node,
          position: {
            ...node.position,
            x: node.position.x + WORKFLOW_LAYOUT_X_GAP,
          },
        }
      : node,
  );
}
