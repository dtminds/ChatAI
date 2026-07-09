import type { Connection } from "@xyflow/react";
import { isWorkflowConnectionAllowed } from "./connection-policy";
import { WORKFLOW_LAYOUT_X_GAP } from "./constants";
import {
  arrangeWorkflowNodes,
  createEdge,
  createNodeFromKind,
  duplicateWorkflowNode,
  getAfterNodesInSameBranch,
  getSourceHandleInsertY,
  getSourceHandleLabel,
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
  getNodeDefinitionCore,
} from "./node-definition-core";
import {
  getNodeSourceHandleDefinitions,
  getWorkflowHandleKey,
  isWorkflowHandleIdEqual,
} from "./node-handle-definitions";
import type { WorkflowSourceHandleDefinition } from "./node-handle-definitions";
import {
  canonicalizeWorkflowDraft,
  isWorkflowGraphEqual,
} from "./workflow-draft-normalizer";
import {
  pasteWorkflowClipboardData,
} from "./workflow-clipboard";
import type {
  WorkflowClipboardData,
  WorkflowPasteOptions,
} from "./workflow-clipboard";
import type {
  InsertableWorkflowNodeKind,
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

export type WorkflowNodePositionUpdate = {
  nodeId: string;
  position: WorkflowNode["position"];
};

const FLOATING_NODE_SCREEN_X = 360;
const FLOATING_NODE_SCREEN_Y = 180;
const FLOATING_NODE_COLLISION_X = 260;
const FLOATING_NODE_COLLISION_Y = 120;
const FLOATING_NODE_OFFSET_Y = 140;

function finalizeWorkflowGraphOperation(
  operation: WorkflowGraphOperation,
): WorkflowGraphOperation {
  return {
    ...operation,
    draft: canonicalizeWorkflowDraft(operation.draft),
  };
}

export function addNodeOperation(
  draft: WorkflowDraft,
  kind: WorkflowNodeKind,
  nodeId: string,
): WorkflowGraphOperation | undefined {
  if (!canInsertNodeKind(kind) || hasNodeId(draft, nodeId)) {
    return undefined;
  }

  const node = {
    ...createNodeFromKind(kind, nodeId, draft.nodes.length),
    position: resolveFloatingNodePosition(draft),
  };

  return finalizeWorkflowGraphOperation({
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
  if (!canInsertNodeKind(kind) || hasNodeId(draft, nodeId)) {
    return undefined;
  }

  const { edges, nodes } = draft;
  const previousNode = nodes.find((node) => node.id === previousNodeId);
  if (!previousNode || !canInsertAfterNodeKind(previousNode.data.kind)) {
    return undefined;
  }

  const replacedEdge = edges.find((edge) =>
    edge.source === previousNodeId
    && isWorkflowHandleIdEqual(edge.sourceHandle, sourceHandle),
  );
  const nextNode = replacedEdge
    ? nodes.find((node) => node.id === replacedEdge.target)
    : undefined;
  if (replacedEdge && !nextNode) {
    return undefined;
  }

  const nodesToShift = replacedEdge
    ? getAfterNodesInSameBranch(nodes, edges, replacedEdge.target)
    : [];
  const shiftedNodeIds = getNodeIdSet(nodesToShift);
  const node = {
    ...createNodeFromKind(kind, nodeId, nodes.length),
    position: {
      x: nextNode?.position.x ?? (previousNode?.position.x ?? 0) + WORKFLOW_LAYOUT_X_GAP,
      y:
        nextNode?.position.y
        ?? getSourceHandleInsertY(previousNode.position.y, sourceHandle, previousNode),
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
    target: replacedEdge?.target ?? "",
    targetHandle: replacedEdge?.targetHandle ?? null,
  };

  if (!areWorkflowInsertConnectionsAllowed({
    ...draft,
    edges: baseEdges,
    nodes: [...nodes, node],
  }, incomingConnection, replacedEdge ? outgoingConnection : undefined)) {
    return undefined;
  }

  const nextEdges = [
    ...baseEdges,
    createEdge(previousNodeId, nodeId, replacedEdge?.data?.label ?? getSourceHandleLabel(sourceHandle, previousNode), {
      sourceHandle: replacedEdge?.sourceHandle ?? sourceHandle,
    }),
  ];

  if (replacedEdge) {
    nextEdges.push(createEdge(nodeId, replacedEdge.target, undefined, {
      targetHandle: replacedEdge.targetHandle,
    }));
  }

  return finalizeWorkflowGraphOperation({
    draft: {
      ...draft,
      edges: nextEdges,
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
  if (!canInsertNodeKind(kind) || hasNodeId(draft, nodeId)) {
    return undefined;
  }

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
  const { incomingConnection, outgoingConnection } = createInsertNodeBetweenConnections(replacedEdge, nodeId);

  if (!areWorkflowInsertConnectionsAllowed({
    ...draft,
    edges: baseEdges,
    nodes: [...nodes, node],
  }, incomingConnection, outgoingConnection)) {
    return undefined;
  }

  return finalizeWorkflowGraphOperation({
    draft: {
      ...draft,
      edges: [
        ...baseEdges,
        createEdge(sourceNodeId, nodeId, replacedEdge?.data?.label, {
          sourceHandle: replacedEdge?.sourceHandle,
        }),
        createEdge(nodeId, targetNodeId, undefined, {
          targetHandle: replacedEdge?.targetHandle,
        }),
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

export function createInsertNodeBetweenConnections(
  replacedEdge: Pick<WorkflowEdge, "source" | "sourceHandle" | "target" | "targetHandle">,
  nodeId: string,
) {
  return {
    incomingConnection: {
      source: replacedEdge.source,
      sourceHandle: replacedEdge.sourceHandle ?? null,
      target: nodeId,
      targetHandle: null,
    },
    outgoingConnection: {
      source: nodeId,
      sourceHandle: null,
      target: replacedEdge.target,
      targetHandle: replacedEdge.targetHandle ?? null,
    },
  };
}

function areWorkflowInsertConnectionsAllowed(
  draft: WorkflowDraft,
  incomingConnection: Connection,
  outgoingConnection?: Connection,
) {
  if (!isWorkflowConnectionAllowed(draft, incomingConnection)) {
    return false;
  }

  if (!outgoingConnection) {
    return true;
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

  return finalizeWorkflowGraphOperation({
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

  return finalizeWorkflowGraphOperation({
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
  const requestedNodeIdSet = new Set(nodeIds);
  const deletedNodes = draft.nodes.filter((node) => requestedNodeIdSet.has(node.id));

  if (
    !requestedNodeIdSet.size
    || deletedNodes.length !== requestedNodeIdSet.size
    || deletedNodes.some((node) => !canDeleteNodeKind(node.data.kind))
  ) {
    return undefined;
  }

  const deletableNodeIdSet = new Set(deletedNodes.map((node) => node.id));

  return finalizeWorkflowGraphOperation({
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

  if (!node || !canDuplicateNodeKind(node.data.kind) || hasNodeId(draft, duplicatedNodeId)) {
    return undefined;
  }

  const reservedTitles = new Set(draft.nodes.map((currentNode) => currentNode.data.title));
  const duplicatedNode = duplicateWorkflowNode(node, duplicatedNodeId, reservedTitles);

  return finalizeWorkflowGraphOperation({
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

export function pasteClipboardOperation(
  draft: WorkflowDraft,
  clipboardData: WorkflowClipboardData,
  options: WorkflowPasteOptions,
): WorkflowGraphOperation | undefined {
  const operation = pasteWorkflowClipboardData(draft, clipboardData, options);

  return operation ? finalizeWorkflowGraphOperation(operation) : undefined;
}

export function deleteEdgeOperation(
  draft: WorkflowDraft,
  edgeId: string,
): WorkflowGraphOperation | undefined {
  const edge = draft.edges.find((currentEdge) => currentEdge.id === edgeId);

  if (!edge) {
    return undefined;
  }

  return finalizeWorkflowGraphOperation({
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

export function deleteEdgesOperation(
  draft: WorkflowDraft,
  edgeIds: string[],
): WorkflowGraphOperation | undefined {
  const deletedEdgeIdSet = new Set(edgeIds);
  const deletedEdges = draft.edges.filter((edge) => deletedEdgeIdSet.has(edge.id));

  if (!deletedEdgeIdSet.size || deletedEdges.length !== deletedEdgeIdSet.size) {
    return undefined;
  }

  const firstDeletedEdge = deletedEdges[0];

  return finalizeWorkflowGraphOperation({
    draft: {
      ...draft,
      edges: draft.edges.filter((edge) => !deletedEdgeIdSet.has(edge.id)),
    },
    event: "edge:delete",
    meta: {
      edgeId: deletedEdges.length === 1 ? firstDeletedEdge.id : undefined,
      nodeId: firstDeletedEdge.source,
    },
    result: {
      edgeId: firstDeletedEdge.id,
      nodeId: firstDeletedEdge.source,
    },
  });
}

export function arrangeNodesOperation(draft: WorkflowDraft): WorkflowGraphOperation | undefined {
  const nextDraft = {
    ...draft,
    nodes: arrangeWorkflowNodes(draft.nodes, draft.edges),
  };

  if (isWorkflowGraphEqual(draft, nextDraft)) {
    return undefined;
  }

  return finalizeWorkflowGraphOperation({
    draft: nextDraft,
    event: "layout:organize",
  });
}

export function moveNodesInDraft(
  draft: WorkflowDraft,
  updates: WorkflowNodePositionUpdate[],
) {
  let changed = false;
  const positionByNodeId = new Map(
    updates.map((update) => [update.nodeId, update.position]),
  );
  const nodes = draft.nodes.map((node) => {
    const position = positionByNodeId.get(node.id);

    if (
      !position
      || (node.position.x === position.x && node.position.y === position.y)
    ) {
      return node;
    }

    changed = true;
    return {
      ...node,
      position: { ...position },
    };
  });

  return changed
    ? {
        ...draft,
        nodes,
      }
    : draft;
}

export function moveNodesOperation(
  draft: WorkflowDraft,
  updates: WorkflowNodePositionUpdate[],
  nodeId: string,
): WorkflowGraphOperation | undefined {
  if (!areWorkflowNodePositionUpdatesValid(draft, updates, nodeId)) {
    return undefined;
  }

  const nextDraft = moveNodesInDraft(draft, updates);

  if (isWorkflowGraphEqual(draft, nextDraft)) {
    return undefined;
  }

  const node = draft.nodes.find((currentNode) => currentNode.id === nodeId);

  return finalizeWorkflowGraphOperation({
    draft: nextDraft,
    event: "node:move",
    meta: {
      nodeId,
      nodeTitle: node?.data.title,
    },
    result: { nodeId },
  });
}

function areWorkflowNodePositionUpdatesValid(
  draft: WorkflowDraft,
  updates: WorkflowNodePositionUpdate[],
  primaryNodeId: string,
) {
  if (updates.length === 0) {
    return false;
  }

  const nodeIds = new Set(draft.nodes.map((node) => node.id));
  const updateNodeIds = new Set<string>();

  if (!nodeIds.has(primaryNodeId)) {
    return false;
  }

  return updates.every((update) => {
    if (
      updateNodeIds.has(update.nodeId)
      || !nodeIds.has(update.nodeId)
      || !Number.isFinite(update.position.x)
      || !Number.isFinite(update.position.y)
    ) {
      return false;
    }

    updateNodeIds.add(update.nodeId);
    return true;
  });
}

export function updateNodeDataOperation(
  draft: WorkflowDraft,
  nodeId: string,
  patch: WorkflowNodeConfigPatch,
): WorkflowGraphOperation | undefined {
  const node = draft.nodes.find((currentNode) => currentNode.id === nodeId);

  if (!node) {
    return undefined;
  }

  const nextData = createUpdatedNodeData(node.data, sanitizeNodeConfigPatch(patch));
  const nextDraft = {
    ...draft,
    edges: reconcileSourceHandleEdges(draft.edges, nodeId, nextData),
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

  return finalizeWorkflowGraphOperation({
    draft: nextDraft,
    event: "node:config-change",
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
  const nextData = {
    ...currentData,
    ...patch,
  };
  const definition = getNodeDefinitionCore(nextData.kind);

  return definition.sanitizeData?.(nextData) ?? nextData;
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

function reconcileSourceHandleEdges(
  edges: WorkflowEdge[],
  nodeId: string,
  nextData: WorkflowNodeData,
): WorkflowEdge[] {
  const nextSourceHandleByKey = new Map(
    getNodeSourceHandleDefinitions(nextData).map((handle) => [
      getWorkflowHandleKey(handle.id),
      handle,
    ]),
  );

  return edges.flatMap((edge) => {
    if (edge.source !== nodeId) {
      return [edge];
    }

    const sourceHandle = nextSourceHandleByKey.get(getWorkflowHandleKey(edge.sourceHandle));

    if (!sourceHandle) {
      return [];
    }

    return [syncSourceHandleEdgeLabel(edge, sourceHandle)];
  });
}

function syncSourceHandleEdgeLabel(
  edge: WorkflowEdge,
  handle: WorkflowSourceHandleDefinition,
): WorkflowEdge {
  const label = handle.label;

  if (label === undefined) {
    return edge;
  }

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

function hasNodeId(draft: WorkflowDraft, nodeId: string) {
  return draft.nodes.some((node) => node.id === nodeId);
}
