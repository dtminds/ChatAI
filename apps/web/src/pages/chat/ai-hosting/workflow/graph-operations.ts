import type { Connection } from "@xyflow/react";
import { isWorkflowConnectionAllowed } from "./connection-policy";
import { WORKFLOW_LAYOUT_X_GAP } from "./constants";
import {
  arrangeWorkflowNodes,
  createEdge,
  createNodeFromKind,
  duplicateWorkflowNode,
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
import {
  canDeleteNodeKind,
  canDuplicateNodeKind,
  canInsertAfterNodeKind,
  canInsertNodeKind,
} from "./node-definitions";
import { normalizeWorkflowBranchPaths } from "./branch-paths";
import {
  canonicalizeWorkflowDraft,
  isWorkflowGraphEqual,
} from "./workflow-draft-normalizer";
import type {
  InsertableWorkflowNodeKind,
  WorkflowBranchPath,
  WorkflowEdge,
  WorkflowNodeConfigPatch,
  WorkflowNodeData,
  WorkflowNodeKind,
  WorkflowDraft,
  WorkflowNode,
} from "./types";

export type WorkflowActionResult = {
  edgeId?: string;
  nodeId?: string;
  nodeIds?: string[];
};

export type WorkflowGraphOperation = {
  draft: WorkflowDraft;
  event: WorkflowHistoryEvent;
  meta?: WorkflowHistoryEventMeta;
  result?: WorkflowActionResult;
};

export type WorkflowDraftChange = {
  draft: WorkflowDraft;
  meta: WorkflowHistoryEventMeta & {
    nodeId: string;
  };
  result?: WorkflowActionResult;
};

const FLOATING_NODE_SCREEN_X = 360;
const FLOATING_NODE_SCREEN_Y = 180;
const FLOATING_NODE_COLLISION_X = 260;
const FLOATING_NODE_COLLISION_Y = 120;
const FLOATING_NODE_OFFSET_Y = 140;

function createWorkflowGraphOperation(
  operation: WorkflowGraphOperation,
): WorkflowGraphOperation {
  return {
    ...operation,
    draft: canonicalizeWorkflowDraft(operation.draft),
  };
}

function createWorkflowDraftChange(
  change: WorkflowDraftChange,
): WorkflowDraftChange {
  return {
    ...change,
    draft: canonicalizeWorkflowDraft(change.draft),
  };
}

export function addNodeOperation(
  draft: WorkflowDraft,
  kind: WorkflowNodeKind,
  nodeId: string,
): WorkflowGraphOperation | undefined {
  if (!canInsertNodeKind(kind)) {
    return undefined;
  }

  const node = {
    ...createNodeFromKind(kind, nodeId, draft.nodes.length),
    position: resolveFloatingNodePosition(draft),
  };

  return createWorkflowGraphOperation({
    draft: {
      ...draft,
      nodes: [...draft.nodes, node],
    },
    event: "node:add",
    meta: {
      nodeId,
      nodeTitle: node.data.title,
    },
    result: {
      nodeId,
    },
  });
}

function resolveFloatingNodePosition(draft: WorkflowDraft) {
  const zoom = draft.viewport.zoom || 1;
  const position = {
    x: Math.round((FLOATING_NODE_SCREEN_X - draft.viewport.x) / zoom),
    y: Math.round((FLOATING_NODE_SCREEN_Y - draft.viewport.y) / zoom),
  };

  while (hasNearbyNode(draft.nodes, position)) {
    position.y += FLOATING_NODE_OFFSET_Y;
  }

  return position;
}

function hasNearbyNode(
  nodes: WorkflowNode[],
  position: WorkflowNode["position"],
) {
  return nodes.some((node) =>
    Math.abs(node.position.x - position.x) < FLOATING_NODE_COLLISION_X
    && Math.abs(node.position.y - position.y) < FLOATING_NODE_COLLISION_Y,
  );
}

export function insertNodeAfterOperation(
  draft: WorkflowDraft,
  previousNodeId: string,
  kind: InsertableWorkflowNodeKind,
  nodeId: string,
  sourceHandle?: string,
): WorkflowGraphOperation | undefined {
  const { edges, nodes } = draft;
  const previousNode = nodes.find((node) => node.id === previousNodeId);
  if (!previousNode || !canInsertAfterNodeKind(previousNode.data.kind)) {
    return undefined;
  }

  const replacedEdge = edges.find((edge) =>
    edge.source === previousNodeId
    && (sourceHandle ? edge.sourceHandle === sourceHandle : !edge.sourceHandle),
  );
  const nextNodeId = replacedEdge?.target ?? "goal";
  const nextNode = nodes.find((node) => node.id === nextNodeId);
  if (!nextNode) {
    return undefined;
  }

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
          ? getBranchInsertY(previousNode.position.y, sourceHandle, previousNode)
          : previousNode?.position.y ?? 0),
    },
  };
  const baseEdges = edges.filter((edge) => edge.id !== replacedEdge?.id);
  const incomingConnection = {
    source: previousNodeId,
    sourceHandle: replacedEdge?.sourceHandle ?? sourceHandle ?? null,
    target: nodeId,
    targetHandle: null,
  };
  const outgoingConnection = {
    source: nodeId,
    sourceHandle: null,
    target: nextNodeId,
    targetHandle: replacedEdge?.targetHandle ?? null,
  };

  if (!areWorkflowInsertConnectionsAllowed({
    ...draft,
    edges: baseEdges,
    nodes: [...nodes, node],
  }, incomingConnection, outgoingConnection)) {
    return undefined;
  }

  return createWorkflowGraphOperation({
    draft: {
      ...draft,
      edges: [
        ...baseEdges,
        createEdge(previousNodeId, nodeId, replacedEdge?.data?.label ?? getBranchHandleLabel(sourceHandle, previousNode), {
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
  });
}

export function insertNodeBetweenOperation(
  draft: WorkflowDraft,
  edgeId: string,
  sourceNodeId: string,
  targetNodeId: string,
  kind: InsertableWorkflowNodeKind,
  nodeId: string,
): WorkflowGraphOperation | undefined {
  const { edges, nodes } = draft;
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  const targetNode = nodes.find((node) => node.id === targetNodeId);
  const replacedEdge = edges.find((edge) => edge.id === edgeId);
  if (
    !sourceNode
    || !targetNode
    || !replacedEdge
    || replacedEdge.source !== sourceNodeId
    || replacedEdge.target !== targetNodeId
  ) {
    return undefined;
  }

  const nodesToShift = getAfterNodesInSameBranch(nodes, edges, targetNodeId);
  const shiftedNodeIds = getNodeIdSet(nodesToShift);
  const node = {
    ...createNodeFromKind(kind, nodeId, nodes.length),
    position: {
      x: targetNode?.position.x ?? (sourceNode?.position.x ?? 0) + WORKFLOW_LAYOUT_X_GAP,
      y: targetNode?.position.y ?? sourceNode?.position.y ?? 0,
    },
  };
  const baseEdges = edges.filter((edge) => edge.id !== edgeId);
  const incomingConnection = {
    source: sourceNodeId,
    sourceHandle: replacedEdge.sourceHandle ?? null,
    target: nodeId,
    targetHandle: replacedEdge.targetHandle ?? null,
  };
  const outgoingConnection = {
    source: nodeId,
    sourceHandle: null,
    target: targetNodeId,
    targetHandle: null,
  };

  if (!areWorkflowInsertConnectionsAllowed({
    ...draft,
    edges: baseEdges,
    nodes: [...nodes, node],
  }, incomingConnection, outgoingConnection)) {
    return undefined;
  }

  return createWorkflowGraphOperation({
    draft: {
      ...draft,
      edges: [
        ...baseEdges,
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
  });
}

function areWorkflowInsertConnectionsAllowed(
  draft: WorkflowDraft,
  incomingConnection: Connection,
  outgoingConnection: Connection,
) {
  if (!isWorkflowConnectionAllowed(draft, incomingConnection)) {
    return false;
  }

  const incomingEdge = createEdge(
    incomingConnection.source!,
    incomingConnection.target!,
    undefined,
    {
      sourceHandle: incomingConnection.sourceHandle,
      targetHandle: incomingConnection.targetHandle,
    },
  );

  return isWorkflowConnectionAllowed({
    ...draft,
    edges: [...draft.edges, incomingEdge],
  }, outgoingConnection);
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

  return createWorkflowGraphOperation({
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
  });
}

export function deleteNodeOperation(
  draft: WorkflowDraft,
  nodeId: string,
): WorkflowGraphOperation | undefined {
  const node = draft.nodes.find((currentNode) => currentNode.id === nodeId);

  if (!node || !canDeleteNodeKind(node.data.kind)) {
    return undefined;
  }

  return createWorkflowGraphOperation({
    draft: {
      ...draft,
      edges: draft.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      nodes: draft.nodes.filter((currentNode) => currentNode.id !== nodeId),
    },
    event: "node:delete",
    meta: {
      nodeId,
      nodeTitle: node.data.title,
    },
    result: { nodeId },
  });
}

export function deleteNodesOperation(
  draft: WorkflowDraft,
  nodeIds: string[],
): WorkflowGraphOperation | undefined {
  const deletedNodeIdSet = new Set(nodeIds);
  const deletedNodes = draft.nodes.filter((node) =>
    deletedNodeIdSet.has(node.id) && canDeleteNodeKind(node.data.kind),
  );

  if (!deletedNodes.length) {
    return undefined;
  }

  const deletableNodeIdSet = new Set(deletedNodes.map((node) => node.id));

  return createWorkflowGraphOperation({
    draft: {
      ...draft,
      edges: draft.edges.filter((edge) =>
        !deletableNodeIdSet.has(edge.source) && !deletableNodeIdSet.has(edge.target),
      ),
      nodes: draft.nodes.filter((node) => !deletableNodeIdSet.has(node.id)),
    },
    event: "node:delete",
    meta: {
      nodeId: deletedNodes[0].id,
      nodeTitle: deletedNodes.length === 1 ? deletedNodes[0].data.title : `${deletedNodes.length} 个节点`,
    },
    result: {
      nodeId: deletedNodes[0].id,
      nodeIds: deletedNodes.map((node) => node.id),
    },
  });
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

  return createWorkflowGraphOperation({
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
  });
}

export function deleteEdgeOperation(
  draft: WorkflowDraft,
  edgeId: string,
): WorkflowGraphOperation | undefined {
  const edge = draft.edges.find((currentEdge) => currentEdge.id === edgeId);

  if (!edge) {
    return undefined;
  }

  return createWorkflowGraphOperation({
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
  });
}

export function arrangeNodesOperation(draft: WorkflowDraft): WorkflowGraphOperation {
  return createWorkflowGraphOperation({
    draft: {
      ...draft,
      nodes: arrangeWorkflowNodes(draft.nodes, draft.edges),
    },
    event: "layout:organize",
  });
}

export function updateNodeDataOperation(
  draft: WorkflowDraft,
  nodeId: string,
  patch: WorkflowNodeConfigPatch,
) {
  const node = draft.nodes.find((currentNode) => currentNode.id === nodeId);

  if (!node) {
    return undefined;
  }

  const nextData = createUpdatedNodeData(node.data, sanitizeNodeConfigPatch(patch));
  const nextDraft = {
    ...draft,
    edges: reconcileBranchPathEdges(draft.edges, nodeId, node.data, nextData),
    nodes: draft.nodes.map((currentNode) =>
      currentNode.id === nodeId
        ? {
            ...currentNode,
            data: nextData,
          }
        : currentNode,
    ),
  };

  if (isWorkflowGraphEqual(draft, nextDraft)) {
    return undefined;
  }

  return createWorkflowDraftChange({
    draft: nextDraft,
    meta: {
      nodeId,
      nodeTitle: node.data.title,
    },
    result: { nodeId },
  });
}

function createUpdatedNodeData(
  currentData: WorkflowNodeData,
  patch: WorkflowNodeConfigPatch,
): WorkflowNodeData {
  if (currentData.kind !== "branch" || !Array.isArray(patch.branchPaths)) {
    return {
      ...currentData,
      ...patch,
    };
  }

  return {
    ...currentData,
    ...patch,
    branchPaths: normalizeWorkflowBranchPaths(patch.branchPaths),
  };
}

function sanitizeNodeConfigPatch(
  patch: WorkflowNodeConfigPatch,
): WorkflowNodeConfigPatch {
  const {
    kind: _ignoredKind,
    ...configPatch
  } = patch as WorkflowNodeConfigPatch & { kind?: WorkflowNodeKind };

  return configPatch;
}

function reconcileBranchPathEdges(
  edges: WorkflowEdge[],
  nodeId: string,
  currentData: WorkflowNodeData,
  nextData: WorkflowNodeData,
): WorkflowEdge[] {
  if (
    currentData.kind !== "branch"
    || nextData.kind !== "branch"
    || !Array.isArray(nextData.branchPaths)
  ) {
    return edges;
  }

  const nextBranchLabelById = new Map(
    nextData.branchPaths.map((path) => [path.id, path.label]),
  );

  return edges.flatMap((edge) => {
    if (edge.source !== nodeId) {
      return [edge];
    }

    if (!edge.sourceHandle || !nextBranchLabelById.has(edge.sourceHandle)) {
      return [];
    }

    return [syncBranchEdgeLabel(edge, nextBranchLabelById.get(edge.sourceHandle))];
  });
}

function syncBranchEdgeLabel(
  edge: WorkflowEdge,
  label: WorkflowBranchPath["label"] | undefined,
): WorkflowEdge {
  if (edge.data?.label === label) {
    return edge;
  }

  const {
    label: _previousLabel,
    ...restData
  } = edge.data ?? {};
  const data = label
    ? {
        ...restData,
        label,
      }
    : Object.keys(restData).length > 0
      ? restData
      : undefined;

  return {
    ...edge,
    data,
  };
}
