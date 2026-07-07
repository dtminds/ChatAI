import { useMemo } from "react";
import type {
  InsertableWorkflowNodeKind,
  WorkflowEdgeHighlightState,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRenderEdge,
  WorkflowRenderNode,
  QuickInsertTarget,
} from "./types";
import { getInsertableNodeKindsBetween } from "./node-catalog";

type WorkflowRenderElementHandlers = {
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onInsertNodeAfter: (
    nodeId: string,
    kind: InsertableWorkflowNodeKind,
    sourceHandle?: string,
  ) => void;
  onInsertNodeBetween: (
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableWorkflowNodeKind,
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
  selectedNodeIdSet: Set<string>;
};

export type CreateWorkflowRenderElementsOptions = WorkflowRenderElementHandlers
  & WorkflowRenderElementState
  & {
    edges: WorkflowEdge[];
    nodes: WorkflowNode[];
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
    options.selectedNodeIdSet,
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
  selectedNodeIdSet,
}: CreateWorkflowRenderElementsOptions): {
  edges: WorkflowRenderEdge[];
  nodes: WorkflowRenderNode[];
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
      const isSelected = selectedNodeIdSet.has(node.id);
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
): WorkflowEdgeHighlightState | undefined {
  if (!highlightedEdgeIds) {
    return undefined;
  }

  return highlightedEdgeIds.has(edgeId) ? "connected" : "dimmed";
}
