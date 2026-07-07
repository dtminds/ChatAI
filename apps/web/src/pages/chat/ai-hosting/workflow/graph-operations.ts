import type { Connection } from "@xyflow/react";
import { isWorkflowConnectionAllowed } from "./connection-policy";
import { WORKFLOW_LAYOUT_X_GAP } from "./constants";
import {
  arrangeWorkflowNodes,
  createEdge,
  createNodeFromKind,
  duplicateWorkflowNode,
  findLastActionNodeId,
  getAfterNodesInSameBranch,
  getBranchHandleLabel,
  getBranchInsertY,
  getNodeIdSet,
  shiftNodesRight,
} from "./graph";
import type {
  WorkflowHistoryEvent,
  WorkflowHistoryEventMeta,
} from "./history";
import { canDeleteNodeKind, canDuplicateNodeKind, canInsertNodeKind } from "./node-definitions";
import type {
  InsertableMarketingNodeKind,
  MarketingNodeData,
  MarketingNodeKind,
  WorkflowDraft,
} from "./types";

export type WorkflowActionResult = {
  edgeId?: string;
  nodeId?: string;
};

export type WorkflowGraphOperation = {
  draft: WorkflowDraft;
  event: WorkflowHistoryEvent;
  meta?: WorkflowHistoryEventMeta;
  result?: WorkflowActionResult;
};

export function addNodeOperation(
  draft: WorkflowDraft,
  kind: MarketingNodeKind,
  nodeId: string,
): WorkflowGraphOperation | undefined {
  if (!canInsertNodeKind(kind)) {
    return undefined;
  }

  return insertNodeAfterOperation(
    draft,
    findLastActionNodeId(draft.nodes, draft.edges),
    kind,
    nodeId,
  );
}

export function insertNodeAfterOperation(
  draft: WorkflowDraft,
  previousNodeId: string,
  kind: InsertableMarketingNodeKind,
  nodeId: string,
  sourceHandle?: string,
): WorkflowGraphOperation {
  const { edges, nodes } = draft;
  const previousNode = nodes.find((node) => node.id === previousNodeId);
  const replacedEdge = edges.find((edge) =>
    edge.source === previousNodeId
    && (sourceHandle ? edge.sourceHandle === sourceHandle : !edge.sourceHandle),
  );
  const nextNodeId = replacedEdge?.target ?? "goal";
  const nextNode = nodes.find((node) => node.id === nextNodeId);
  const nodesToShift = replacedEdge
    ? getAfterNodesInSameBranch(nodes, edges, nextNodeId)
    : [];
  const shiftedNodeIds = getNodeIdSet(nodesToShift);
  const node = {
    ...createNodeFromKind(kind, nodeId, nodes.length),
    position: {
      x: nextNode?.position.x ?? (previousNode?.position.x ?? 0) + WORKFLOW_LAYOUT_X_GAP,
      y:
        nextNode?.position.y
        ?? (previousNode?.data.kind === "branch"
          ? getBranchInsertY(previousNode.position.y, sourceHandle)
          : previousNode?.position.y ?? 0),
    },
  };

  return {
    draft: {
      edges: [
        ...edges.filter((edge) => edge.id !== replacedEdge?.id),
        createEdge(previousNodeId, nodeId, replacedEdge?.data?.label ?? getBranchHandleLabel(sourceHandle), {
          sourceHandle: replacedEdge?.sourceHandle ?? sourceHandle,
        }),
        createEdge(nodeId, nextNodeId, undefined, {
          targetHandle: replacedEdge?.targetHandle,
        }),
      ],
      nodes: [...shiftNodesRight(nodes, shiftedNodeIds), node],
    },
    event: replacedEdge ? "node:insert" : "node:add",
    meta: {
      nodeId,
      nodeTitle: node.data.title,
    },
    result: {
      edgeId: replacedEdge?.id,
      nodeId,
    },
  };
}

export function insertNodeBetweenOperation(
  draft: WorkflowDraft,
  edgeId: string,
  sourceNodeId: string,
  targetNodeId: string,
  kind: InsertableMarketingNodeKind,
  nodeId: string,
): WorkflowGraphOperation {
  const { edges, nodes } = draft;
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  const targetNode = nodes.find((node) => node.id === targetNodeId);
  const replacedEdge = edges.find((edge) => edge.id === edgeId);
  const nodesToShift = getAfterNodesInSameBranch(nodes, edges, targetNodeId);
  const shiftedNodeIds = getNodeIdSet(nodesToShift);
  const node = {
    ...createNodeFromKind(kind, nodeId, nodes.length),
    position: {
      x: targetNode?.position.x ?? (sourceNode?.position.x ?? 0) + WORKFLOW_LAYOUT_X_GAP,
      y: targetNode?.position.y ?? sourceNode?.position.y ?? 0,
    },
  };

  return {
    draft: {
      edges: [
        ...edges.filter((edge) => edge.id !== edgeId),
        createEdge(sourceNodeId, nodeId, replacedEdge?.data?.label, {
          sourceHandle: replacedEdge?.sourceHandle,
          targetHandle: replacedEdge?.targetHandle,
        }),
        createEdge(nodeId, targetNodeId),
      ],
      nodes: [...shiftNodesRight(nodes, shiftedNodeIds), node],
    },
    event: "node:insert",
    meta: {
      edgeId,
      nodeId,
      nodeTitle: node.data.title,
    },
    result: {
      edgeId,
      nodeId,
    },
  };
}

export function connectNodesOperation(
  draft: WorkflowDraft,
  connection: Connection,
): WorkflowGraphOperation | undefined {
  const { source, sourceHandle, target, targetHandle } = connection;

  if (!isWorkflowConnectionAllowed(draft, connection)) {
    return undefined;
  }

  const edge = createEdge(source, target, undefined, { sourceHandle, targetHandle });

  return {
    draft: {
      ...draft,
      edges: [...draft.edges, edge],
    },
    event: "edge:connect",
    meta: {
      nodeId: source,
    },
    result: {
      edgeId: edge.id,
      nodeId: source,
    },
  };
}

export function deleteNodeOperation(
  draft: WorkflowDraft,
  nodeId: string,
): WorkflowGraphOperation | undefined {
  const node = draft.nodes.find((currentNode) => currentNode.id === nodeId);

  if (!node || !canDeleteNodeKind(node.data.kind)) {
    return undefined;
  }

  return {
    draft: {
      edges: draft.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      nodes: draft.nodes.filter((currentNode) => currentNode.id !== nodeId),
    },
    event: "node:delete",
    meta: {
      nodeId,
      nodeTitle: node.data.title,
    },
    result: { nodeId },
  };
}

export function duplicateNodeOperation(
  draft: WorkflowDraft,
  nodeId: string,
  duplicatedNodeId: string,
): WorkflowGraphOperation | undefined {
  const node = draft.nodes.find((currentNode) => currentNode.id === nodeId);

  if (!node || !canDuplicateNodeKind(node.data.kind)) {
    return undefined;
  }

  const reservedTitles = new Set(draft.nodes.map((currentNode) => currentNode.data.title));
  const duplicatedNode = duplicateWorkflowNode(node, duplicatedNodeId, reservedTitles);

  return {
    draft: {
      ...draft,
      nodes: [...draft.nodes, duplicatedNode],
    },
    event: "node:duplicate",
    meta: {
      nodeId: duplicatedNodeId,
      nodeTitle: duplicatedNode.data.title,
    },
    result: { nodeId: duplicatedNodeId },
  };
}

export function deleteEdgeOperation(
  draft: WorkflowDraft,
  edgeId: string,
): WorkflowGraphOperation | undefined {
  const edge = draft.edges.find((currentEdge) => currentEdge.id === edgeId);

  if (!edge) {
    return undefined;
  }

  return {
    draft: {
      ...draft,
      edges: draft.edges.filter((currentEdge) => currentEdge.id !== edgeId),
    },
    event: "edge:delete",
    meta: {
      edgeId,
      nodeId: edge.source,
    },
    result: {
      edgeId,
      nodeId: edge.source,
    },
  };
}

export function arrangeNodesOperation(draft: WorkflowDraft): WorkflowGraphOperation {
  return {
    draft: {
      ...draft,
      nodes: arrangeWorkflowNodes(draft.nodes, draft.edges),
    },
    event: "layout:organize",
  };
}

export function updateNodeDataOperation(
  draft: WorkflowDraft,
  nodeId: string,
  patch: Partial<MarketingNodeData>,
) {
  const node = draft.nodes.find((currentNode) => currentNode.id === nodeId);

  if (!node) {
    return undefined;
  }

  return {
    draft: {
      ...draft,
      nodes: draft.nodes.map((currentNode) =>
        currentNode.id === nodeId
          ? {
              ...currentNode,
              data: {
                ...currentNode.data,
                ...patch,
              },
            }
          : currentNode,
      ),
    },
    meta: {
      nodeId,
      nodeTitle: node.data.title,
    },
    result: { nodeId },
  };
}
