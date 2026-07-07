import type { Connection } from "@xyflow/react";
import type {
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
  WorkflowDraft,
} from "./types";

export function isWorkflowConnectionAllowed(
  draft: WorkflowDraft,
  connection: Connection,
) {
  const { source, sourceHandle, target, targetHandle } = connection;

  if (!source || !target || source === target) {
    return false;
  }

  const sourceNode = draft.nodes.find((node) => node.id === source);
  const targetNode = draft.nodes.find((node) => node.id === target);

  if (!sourceNode || !targetNode) {
    return false;
  }

  if (!isNodeKindConnectionAllowed(sourceNode, targetNode)) {
    return false;
  }

  if (hasDuplicateConnection(draft.edges, {
    source,
    sourceHandle,
    target,
    targetHandle,
  })) {
    return false;
  }

  if (sourceHandle && hasSourceHandleConnection(draft.edges, source, sourceHandle)) {
    return false;
  }

  return !hasPathToNode(draft.edges, target, source);
}

function isNodeKindConnectionAllowed(
  sourceNode: MarketingWorkflowNode,
  targetNode: MarketingWorkflowNode,
) {
  if (sourceNode.data.kind === "goal") {
    return false;
  }

  if (targetNode.data.kind === "trigger") {
    return false;
  }

  return true;
}

function hasDuplicateConnection(
  edges: MarketingWorkflowEdge[],
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
  edges: MarketingWorkflowEdge[],
  source: string,
  sourceHandle: string,
) {
  return edges.some((edge) =>
    edge.source === source
    && edge.sourceHandle === sourceHandle,
  );
}

function hasPathToNode(
  edges: MarketingWorkflowEdge[],
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
