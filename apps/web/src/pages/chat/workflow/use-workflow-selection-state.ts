import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "./types";
import {
  normalizeWorkflowSelection,
  resolveWorkflowSelectionDeleteTarget,
  selectWorkflowEdge,
  selectWorkflowNodes,
  toggleWorkflowNodeSelection,
} from "./workflow-selection";
import type { WorkflowSelection } from "./workflow-selection";

export function useWorkflowSelectionState({
  defaultNodeId,
  edges,
  nodes,
}: {
  defaultNodeId: string;
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selection, setSelection] = useState<WorkflowSelection>(() => ({
    selectedEdgeId: null,
    selectedNodeIds: defaultNodeId ? [defaultNodeId] : [],
  }));

  useEffect(() => {
    setSelection((currentSelection) => {
      const nextSelection = normalizeWorkflowSelection({
        defaultNodeId,
        edges,
        nodes,
        selection: currentSelection,
      });

      if (
        nextSelection.selectedEdgeId === currentSelection.selectedEdgeId
        && nextSelection.selectedNodeIds.length === currentSelection.selectedNodeIds.length
        && nextSelection.selectedNodeIds.every((nodeId, index) => nodeId === currentSelection.selectedNodeIds[index])
      ) {
        return currentSelection;
      }

      return nextSelection;
    });
  }, [defaultNodeId, edges, nodes]);

  const { selectedEdgeId, selectedNodeIds } = selection;
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId],
  );

  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectedNodeIds.includes(node.id)),
    [nodes, selectedNodeIds],
  );

  const selectedNodeIdSet = useMemo(
    () => new Set(selectedNodeIds),
    [selectedNodeIds],
  );

  const hoveredEdgeIds = useMemo(() => {
    if (!hoveredNodeId) {
      return null;
    }

    return new Set(
      edges
        .filter((edge) => edge.source === hoveredNodeId || edge.target === hoveredNodeId)
        .map((edge) => edge.id),
    );
  }, [edges, hoveredNodeId]);

  const clearEdgeSelection = useCallback(() => {
    setSelection((currentSelection) => ({
      ...currentSelection,
      selectedEdgeId: null,
    }));
  }, []);

  const clearNodeSelection = useCallback(() => {
    setSelection((currentSelection) => ({
      ...currentSelection,
      selectedNodeIds: [],
    }));
  }, []);

  const handleNodeHoverEnd = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleNodeHoverStart = useCallback((nodeId: string) => {
    setHoveredNodeId((currentNodeId) => (currentNodeId === nodeId ? currentNodeId : nodeId));
  }, []);

  const selectEdge = useCallback((edgeId: string) => {
    setSelection(selectWorkflowEdge(edgeId));
  }, []);

  const selectNode = useCallback((nodeId: string) => {
    setSelection(selectWorkflowNodes([nodeId]));
  }, []);

  const selectNodes = useCallback((nodeIds: string[]) => {
    setSelection(selectWorkflowNodes(nodeIds));
  }, []);

  const toggleNodeSelection = useCallback((nodeId: string) => {
    setSelection((currentSelection) => toggleWorkflowNodeSelection(currentSelection, nodeId));
  }, []);

  const setSelectedNodeId = useCallback((nodeId: string | null) => {
    setSelection(selectWorkflowNodes(nodeId ? [nodeId] : []));
  }, []);

  const deleteTarget = useMemo(
    () => resolveWorkflowSelectionDeleteTarget(selection),
    [selection],
  );

  return {
    clearEdgeSelection,
    clearNodeSelection,
    handleNodeHoverEnd,
    handleNodeHoverStart,
    hoveredEdgeIds,
    selectEdge,
    selectedEdgeId,
    selectedNode,
    selectedNodeId,
    selectedNodeIds,
    selectedNodeIdSet,
    selectedNodes,
    selectionDeleteTarget: deleteTarget,
    selectNode,
    selectNodes,
    setSelectedNodeId,
    toggleNodeSelection,
  };
}
