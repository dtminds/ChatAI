import type {
  WorkflowEdge,
  WorkflowNode,
} from "./types";

export type WorkflowSelection = {
  selectedEdgeId: string | null;
  selectedNodeIds: string[];
};

export type WorkflowSelectionDeleteTarget =
  | {
    edgeId: string;
    type: "edge";
  }
  | {
    nodeIds: string[];
    type: "nodes";
  }
  | {
    type: "none";
  };

function uniqueExistingNodeIds(nodeIds: string[], existingNodeIds: Set<string>) {
  return Array.from(new Set(nodeIds)).filter((nodeId) => existingNodeIds.has(nodeId));
}

function getFallbackNodeId(nodes: WorkflowNode[], defaultNodeId: string) {
  if (defaultNodeId && nodes.some((node) => node.id === defaultNodeId)) {
    return defaultNodeId;
  }

  return nodes[0]?.id ?? null;
}

export function normalizeWorkflowSelection({
  defaultNodeId,
  edges,
  nodes,
  selection,
}: {
  defaultNodeId: string;
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
  selection: WorkflowSelection;
}): WorkflowSelection {
  const existingEdgeIds = new Set(edges.map((edge) => edge.id));

  if (selection.selectedEdgeId && existingEdgeIds.has(selection.selectedEdgeId)) {
    return {
      selectedEdgeId: selection.selectedEdgeId,
      selectedNodeIds: [],
    };
  }

  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const selectedNodeIds = uniqueExistingNodeIds(selection.selectedNodeIds, existingNodeIds);

  if (selectedNodeIds.length > 0 || selection.selectedNodeIds.length === 0) {
    return {
      selectedEdgeId: null,
      selectedNodeIds,
    };
  }

  const fallbackNodeId = getFallbackNodeId(nodes, defaultNodeId);

  return {
    selectedEdgeId: null,
    selectedNodeIds: fallbackNodeId ? [fallbackNodeId] : [],
  };
}

export function selectWorkflowEdge(edgeId: string): WorkflowSelection {
  return {
    selectedEdgeId: edgeId,
    selectedNodeIds: [],
  };
}

export function selectWorkflowNodes(nodeIds: string[]): WorkflowSelection {
  return {
    selectedEdgeId: null,
    selectedNodeIds: Array.from(new Set(nodeIds)),
  };
}

export function toggleWorkflowNodeSelection(
  selection: WorkflowSelection,
  nodeId: string,
): WorkflowSelection {
  const isSelected = selection.selectedNodeIds.includes(nodeId);
  const selectedNodeIds = isSelected
    ? selection.selectedNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId)
    : [...selection.selectedNodeIds, nodeId];

  return selectWorkflowNodes(selectedNodeIds);
}

export function resolveWorkflowSelectionDeleteTarget(
  selection: WorkflowSelection,
): WorkflowSelectionDeleteTarget {
  if (selection.selectedEdgeId) {
    return {
      edgeId: selection.selectedEdgeId,
      type: "edge",
    };
  }

  if (selection.selectedNodeIds.length > 0) {
    return {
      nodeIds: selection.selectedNodeIds,
      type: "nodes",
    };
  }

  return { type: "none" };
}
