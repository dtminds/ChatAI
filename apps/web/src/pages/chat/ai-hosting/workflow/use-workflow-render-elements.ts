import { useMemo } from "react";
import type {
  InsertableMarketingNodeKind,
  MarketingEdgeHighlightState,
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
  MarketingWorkflowRenderEdge,
  MarketingWorkflowRenderNode,
  QuickInsertTarget,
} from "./types";
import { getInsertableNodeKindsBetween } from "./node-catalog";

type WorkflowRenderElementHandlers = {
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onInsertNodeAfter: (
    nodeId: string,
    kind: InsertableMarketingNodeKind,
    sourceHandle?: string,
  ) => void;
  onInsertNodeBetween: (
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ) => void;
  onSelectNode: (nodeId: string) => void;
  onToggleEdgeInsertMenu: (edgeId: string) => void;
  onToggleNodeInsertMenu: (nodeId: string, sourceHandle?: string) => void;
};

type WorkflowRenderElementState = {
  activeEdgeInsertMenuId: string | null;
  hoveredEdgeIds: Set<string> | null;
  quickInsertTarget: QuickInsertTarget | null;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
};

export type CreateWorkflowRenderElementsOptions = WorkflowRenderElementHandlers
  & WorkflowRenderElementState
  & {
    edges: MarketingWorkflowEdge[];
    nodes: MarketingWorkflowNode[];
  };

export function useWorkflowRenderElements(options: CreateWorkflowRenderElementsOptions) {
  return useMemo(() => createWorkflowRenderElements(options), [
    options.activeEdgeInsertMenuId,
    options.edges,
    options.hoveredEdgeIds,
    options.nodes,
    options.onDeleteNode,
    options.onDuplicateNode,
    options.onInsertNodeAfter,
    options.onInsertNodeBetween,
    options.onSelectNode,
    options.onToggleEdgeInsertMenu,
    options.onToggleNodeInsertMenu,
    options.quickInsertTarget,
    options.selectedEdgeId,
    options.selectedNodeId,
  ]);
}

export function createWorkflowRenderElements({
  activeEdgeInsertMenuId,
  edges,
  hoveredEdgeIds,
  nodes,
  onDeleteNode,
  onDuplicateNode,
  onInsertNodeAfter,
  onInsertNodeBetween,
  onSelectNode,
  onToggleEdgeInsertMenu,
  onToggleNodeInsertMenu,
  quickInsertTarget,
  selectedEdgeId,
  selectedNodeId,
}: CreateWorkflowRenderElementsOptions): {
  edges: MarketingWorkflowRenderEdge[];
  nodes: MarketingWorkflowRenderNode[];
} {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return {
    edges: edges.map((edge) => {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);

      return {
        ...edge,
        selected: edge.id === selectedEdgeId,
        data: {
          ...edge.data,
          highlightState: getEdgeHighlightState(edge.id, hoveredEdgeIds),
          insertableNodeKinds: sourceNode && targetNode
            ? getInsertableNodeKindsBetween(sourceNode.data.kind, targetNode.data.kind)
            : [],
          insertMenuOpen: edge.id === activeEdgeInsertMenuId,
          onInsertBetween: onInsertNodeBetween,
          onToggleInsertMenu: onToggleEdgeInsertMenu,
        },
      };
    }),
    nodes: nodes.map((node) => {
      const isSelected = node.id === selectedNodeId;
      const insertMenuOpen = node.id === quickInsertTarget?.nodeId;

      return {
        ...node,
        selected: isSelected,
        zIndex: isSelected ? 20 : undefined,
        data: {
          ...node.data,
          insertMenuOpen,
          insertMenuSourceHandle: insertMenuOpen
            ? quickInsertTarget.sourceHandle
            : undefined,
          onDelete: onDeleteNode,
          onDuplicate: onDuplicateNode,
          onInsertAfter: onInsertNodeAfter,
          onSelect: onSelectNode,
          onToggleInsertMenu: onToggleNodeInsertMenu,
          selected: isSelected,
        },
      };
    }),
  };
}

function getEdgeHighlightState(
  edgeId: string,
  highlightedEdgeIds: Set<string> | null,
): MarketingEdgeHighlightState | undefined {
  if (!highlightedEdgeIds) {
    return undefined;
  }

  return highlightedEdgeIds.has(edgeId) ? "connected" : "dimmed";
}
