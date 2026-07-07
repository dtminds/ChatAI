import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
} from "./types";

export function useWorkflowSelectionState({
  defaultNodeId,
  edges,
  nodes,
}: {
  defaultNodeId: string;
  edges: MarketingWorkflowEdge[];
  nodes: MarketingWorkflowNode[];
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState(defaultNodeId);

  useEffect(() => {
    if (!nodes.length || nodes.some((node) => node.id === selectedNodeId)) {
      return;
    }

    setSelectedNodeId(nodes[0].id);
  }, [nodes, selectedNodeId]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? nodes[0],
    [nodes, selectedNodeId],
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

  const handleNodeHoverEnd = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleNodeHoverStart = useCallback((nodeId: string) => {
    setHoveredNodeId((currentNodeId) => (currentNodeId === nodeId ? currentNodeId : nodeId));
  }, []);

  const selectEdge = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
  }, []);

  const selectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  }, []);

  return {
    clearEdgeSelection,
    handleNodeHoverEnd,
    handleNodeHoverStart,
    hoveredEdgeIds,
    selectEdge,
    selectedEdgeId,
    selectedNode,
    selectedNodeId,
    selectNode,
    setSelectedEdgeId,
    setSelectedNodeId,
  };
}
