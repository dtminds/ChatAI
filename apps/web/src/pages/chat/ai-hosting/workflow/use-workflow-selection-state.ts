import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "./types";

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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIdsState] = useState<string[]>(defaultNodeId ? [defaultNodeId] : []);

  useEffect(() => {
    if (selectedEdgeId || selectedNodeIds.length === 0 || !nodes.length) {
      return;
    }

    const existingSelectedNodeIds = selectedNodeIds.filter((nodeId) =>
      nodes.some((node) => node.id === nodeId),
    );

    if (existingSelectedNodeIds.length === selectedNodeIds.length) {
      return;
    }

    setSelectedNodeIdsState(existingSelectedNodeIds.length > 0 ? existingSelectedNodeIds : [nodes[0].id]);
  }, [nodes, selectedEdgeId, selectedNodeIds]);

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
    setSelectedEdgeId(null);
  }, []);

  const clearNodeSelection = useCallback(() => {
    setSelectedNodeIdsState([]);
  }, []);

  const handleNodeHoverEnd = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleNodeHoverStart = useCallback((nodeId: string) => {
    setHoveredNodeId((currentNodeId) => (currentNodeId === nodeId ? currentNodeId : nodeId));
  }, []);

  const selectEdge = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeIdsState([]);
  }, []);

  const selectNode = useCallback((nodeId: string) => {
    setSelectedNodeIdsState([nodeId]);
    setSelectedEdgeId(null);
  }, []);

  const selectNodes = useCallback((nodeIds: string[]) => {
    const uniqueNodeIds = Array.from(new Set(nodeIds));

    setSelectedNodeIdsState(uniqueNodeIds);
    if (uniqueNodeIds.length > 0) {
      setSelectedEdgeId(null);
    }
  }, []);

  const setSelectedNodeId = useCallback((nodeId: string | null) => {
    setSelectedNodeIdsState(nodeId ? [nodeId] : []);
  }, []);

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
    selectNode,
    selectNodes,
    setSelectedEdgeId,
    setSelectedNodeId,
    setSelectedNodeIds: setSelectedNodeIdsState,
  };
}
