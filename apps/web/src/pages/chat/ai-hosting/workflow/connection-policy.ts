import type { Connection } from "@xyflow/react";
import { getNodeDefinitionCore } from "./node-definition-core";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowDraft,
} from "./types";

export type WorkflowConnectionPolicyViolationCode =
  | "duplicate-connection"
  | "edge-cycle"
  | "invalid-handle"
  | "invalid-node-kind"
  | "missing-endpoint"
  | "missing-node"
  | "self-connection"
  | "source-handle-occupied"
  | "target-handle-occupied";

export function filterWorkflowEdgesByConnectionPolicy(
  draft: WorkflowDraft,
): WorkflowEdge[] {
  const acceptedEdges: WorkflowEdge[] = [];

  draft.edges.forEach((edge) => {
    if (!isWorkflowConnectionAllowed({
      ...draft,
      edges: acceptedEdges,
    }, {
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? null,
      target: edge.target,
      targetHandle: edge.targetHandle ?? null,
    })) {
      return;
    }

    acceptedEdges.push(edge);
  });

  return acceptedEdges;
}

export function isWorkflowConnectionAllowed(
  draft: WorkflowDraft,
  connection: Connection,
) {
  return !getWorkflowConnectionPolicyViolation(draft, connection);
}

export function getWorkflowConnectionPolicyViolation(
  draft: WorkflowDraft,
  connection: Connection,
  options: {
    checkCycle?: boolean;
    ignoreEdgeId?: string;
  } = {},
): WorkflowConnectionPolicyViolationCode | undefined {
  const checkCycle = options.checkCycle ?? true;
  const edges = options.ignoreEdgeId
    ? draft.edges.filter((edge) => edge.id !== options.ignoreEdgeId)
    : draft.edges;
  const { source, sourceHandle, target, targetHandle } = connection;

  if (!source || !target || source === target) {
    return source && target && source === target ? "self-connection" : "missing-endpoint";
  }

  const sourceNode = draft.nodes.find((node) => node.id === source);
  const targetNode = draft.nodes.find((node) => node.id === target);

  if (!sourceNode || !targetNode) {
    return "missing-node";
  }

  if (!isNodeKindConnectionAllowed(sourceNode, targetNode)) {
    return "invalid-node-kind";
  }

  if (!isNodeHandleConnectionAllowed(sourceNode, targetNode, sourceHandle, targetHandle)) {
    return "invalid-handle";
  }

  if (hasDuplicateConnection(edges, {
    source,
    sourceHandle,
    target,
    targetHandle,
  })) {
    return "duplicate-connection";
  }

  if (hasSourceHandleConnection(edges, source, sourceHandle)) {
    return "source-handle-occupied";
  }

  if (hasTargetHandleConnection(edges, target, targetHandle)) {
    return "target-handle-occupied";
  }

  if (checkCycle && hasPathToNode(edges, target, source)) {
    return "edge-cycle";
  }

  return undefined;
}

function isNodeKindConnectionAllowed(
  sourceNode: WorkflowNode,
  targetNode: WorkflowNode,
) {
  return getNodeDefinitionCore(sourceNode.data.kind).availableNextKinds.includes(targetNode.data.kind)
    && getNodeDefinitionCore(targetNode.data.kind).availablePrevKinds.includes(sourceNode.data.kind);
}

function isNodeHandleConnectionAllowed(
  sourceNode: WorkflowNode,
  targetNode: WorkflowNode,
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
) {
  const sourceDefinition = getNodeDefinitionCore(sourceNode.data.kind);
  const targetDefinition = getNodeDefinitionCore(targetNode.data.kind);
  const sourceHandleDefinitions = sourceDefinition.getSourceHandles(sourceNode.data);
  const targetHandleDefinitions = targetDefinition.getTargetHandles(targetNode.data);

  return sourceHandleDefinitions.some((handle) =>
    (handle.id ?? null) === (sourceHandle ?? null),
  )
    && targetHandleDefinitions.some((handle) =>
      (handle.id ?? null) === (targetHandle ?? null),
    );
}

function hasDuplicateConnection(
  edges: WorkflowEdge[],
  connection: Required<Pick<Connection, "source" | "target">> & Pick<Connection, "sourceHandle" | "targetHandle">,
) {
  return edges.some((edge) =>
    edge.source === connection.source
    && edge.sourceHandle === (connection.sourceHandle ?? undefined)
    && edge.target === connection.target
    && edge.targetHandle === (connection.targetHandle ?? undefined),
  );
}

function hasSourceHandleConnection(
  edges: WorkflowEdge[],
  source: string,
  sourceHandle: string | null | undefined,
) {
  const sourceHandleKey = getSourceHandleKey(sourceHandle);

  return edges.some((edge) =>
    edge.source === source
    && getSourceHandleKey(edge.sourceHandle) === sourceHandleKey,
  );
}

function getSourceHandleKey(sourceHandle: string | null | undefined) {
  return sourceHandle ?? "__default__";
}

function hasTargetHandleConnection(
  edges: WorkflowEdge[],
  target: string,
  targetHandle: string | null | undefined,
) {
  const targetHandleKey = getTargetHandleKey(targetHandle);

  return edges.some((edge) =>
    edge.target === target
    && getTargetHandleKey(edge.targetHandle) === targetHandleKey,
  );
}

function getTargetHandleKey(targetHandle: string | null | undefined) {
  return targetHandle ?? "__default__";
}

function hasPathToNode(
  edges: WorkflowEdge[],
  startNodeId: string,
  targetNodeId: string,
) {
  const outgoingEdges = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoingEdges.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoingEdges.set(edge.source, targets);
  }

  const visitedNodeIds = new Set<string>();
  const pendingNodeIds = [startNodeId];

  while (pendingNodeIds.length > 0) {
    const nodeId = pendingNodeIds.shift();
    if (!nodeId || visitedNodeIds.has(nodeId)) {
      continue;
    }

    if (nodeId === targetNodeId) {
      return true;
    }

    visitedNodeIds.add(nodeId);
    pendingNodeIds.push(...(outgoingEdges.get(nodeId) ?? []));
  }

  return false;
}
