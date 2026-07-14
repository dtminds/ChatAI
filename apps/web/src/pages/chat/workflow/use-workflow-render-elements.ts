import { useMemo, useRef } from "react";
import type {
  InsertableWorkflowNodeKind,
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
  onRenameNode: (nodeId: string, title: string) => void;
  onSelectNode: (nodeId: string) => void;
  onToggleEdgeInsertMenu: (edgeId: string, open?: boolean) => void;
  onToggleNodeInsertMenu: (nodeId: string, sourceHandle?: string) => void;
  onToggleNodeSelection: (nodeId: string) => void;
};

type WorkflowRenderElementState = {
  activeEdgeInsertMenuId: string | null;
  hoveredEdgeIds?: Set<string> | null;
  quickInsertTarget: QuickInsertTarget | null;
  selectedEdgeId: string | null;
  selectedNodeIdSet: Set<string>;
};

export type CreateWorkflowRenderElementsOptions = WorkflowRenderElementHandlers
  & WorkflowRenderElementState
  & {
    edges: WorkflowEdge[];
    readOnly?: boolean;
    nodes: WorkflowNode[];
  };

type WorkflowRenderNodeCacheEntry = {
  insertMenuOpen: boolean;
  insertMenuSourceHandle?: string;
  onDeleteNode: WorkflowRenderElementHandlers["onDeleteNode"];
  onDuplicateNode: WorkflowRenderElementHandlers["onDuplicateNode"];
  onInsertNodeAfter: WorkflowRenderElementHandlers["onInsertNodeAfter"];
  onRenameNode: WorkflowRenderElementHandlers["onRenameNode"];
  onSelectNode: WorkflowRenderElementHandlers["onSelectNode"];
  onToggleNodeInsertMenu: WorkflowRenderElementHandlers["onToggleNodeInsertMenu"];
  onToggleNodeSelection: WorkflowRenderElementHandlers["onToggleNodeSelection"];
  readOnly: boolean;
  renderedNode: WorkflowRenderNode;
  selected: boolean;
  sourceNode: WorkflowNode;
};

export function useWorkflowRenderElements(options: CreateWorkflowRenderElementsOptions) {
  const nodeRenderCacheRef = useRef(new Map<string, WorkflowRenderNodeCacheEntry>());
  const edges = useMemo(() => createWorkflowRenderEdges(options), [
    options.activeEdgeInsertMenuId,
    options.edges,
    options.hoveredEdgeIds,
    options.nodes,
    options.onInsertNodeBetween,
    options.onToggleEdgeInsertMenu,
    options.readOnly,
    options.selectedEdgeId,
  ]);
  const nodes = useMemo(() => createWorkflowRenderNodes(options, nodeRenderCacheRef.current), [
    options.nodes,
    options.onDeleteNode,
    options.onDuplicateNode,
    options.onInsertNodeAfter,
    options.onRenameNode,
    options.onSelectNode,
    options.onToggleNodeInsertMenu,
    options.onToggleNodeSelection,
    options.quickInsertTarget,
    options.readOnly,
    options.selectedNodeIdSet,
  ]);

  return useMemo(() => ({
    edges,
    nodes,
  }), [edges, nodes]);
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
  onRenameNode,
  onSelectNode,
  onToggleEdgeInsertMenu,
  onToggleNodeInsertMenu,
  onToggleNodeSelection,
  quickInsertTarget,
  readOnly = false,
  selectedEdgeId,
  selectedNodeIdSet,
}: CreateWorkflowRenderElementsOptions): {
  edges: WorkflowRenderEdge[];
  nodes: WorkflowRenderNode[];
} {
  return {
    edges: createWorkflowRenderEdges({
      activeEdgeInsertMenuId,
      edges,
      hoveredEdgeIds,
      nodes,
      onDeleteNode,
      onDuplicateNode,
      onInsertNodeAfter,
      onInsertNodeBetween,
      onRenameNode,
      onSelectNode,
      onToggleEdgeInsertMenu,
      onToggleNodeInsertMenu,
      onToggleNodeSelection,
      quickInsertTarget,
      readOnly,
      selectedEdgeId,
      selectedNodeIdSet,
    }),
    nodes: createWorkflowRenderNodes({
      activeEdgeInsertMenuId,
      edges,
      nodes,
      onDeleteNode,
      onDuplicateNode,
      onInsertNodeAfter,
      onInsertNodeBetween,
      onRenameNode,
      onSelectNode,
      onToggleEdgeInsertMenu,
      onToggleNodeInsertMenu,
      onToggleNodeSelection,
      quickInsertTarget,
      readOnly,
      selectedEdgeId,
      selectedNodeIdSet,
    }),
  };
}

function createWorkflowRenderEdges({
  activeEdgeInsertMenuId,
  edges,
  hoveredEdgeIds = null,
  nodes,
  onInsertNodeBetween,
  onToggleEdgeInsertMenu,
  readOnly = false,
  selectedEdgeId,
}: CreateWorkflowRenderElementsOptions): WorkflowRenderEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return edges.map((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const highlightState = hoveredEdgeIds
      ? hoveredEdgeIds.has(edge.id)
        ? "connected"
        : "dimmed"
      : undefined;

    return {
      ...edge,
      selected: edge.id === selectedEdgeId,
      data: {
        ...edge.data,
        highlightState,
        insertableNodeKinds: !readOnly && sourceNode && targetNode
          ? getInsertableNodeKindsBetween(sourceNode.data.kind, targetNode.data.kind)
          : [],
        insertMenuOpen: !readOnly && edge.id === activeEdgeInsertMenuId,
        onInsertBetween: readOnly ? undefined : onInsertNodeBetween,
        onToggleInsertMenu: readOnly ? undefined : onToggleEdgeInsertMenu,
      },
    };
  });
}

function createWorkflowRenderNodes({
  nodes,
  onDeleteNode,
  onDuplicateNode,
  onInsertNodeAfter,
  onRenameNode,
  onSelectNode,
  onToggleNodeInsertMenu,
  onToggleNodeSelection,
  quickInsertTarget,
  readOnly = false,
  selectedNodeIdSet,
}: CreateWorkflowRenderElementsOptions, cache?: Map<string, WorkflowRenderNodeCacheEntry>): WorkflowRenderNode[] {
  const renderedNodeIds = new Set<string>();
  const renderedNodes = nodes.map((node) => {
    const isSelected = selectedNodeIdSet.has(node.id);
    const insertMenuOpen = !readOnly && node.id === quickInsertTarget?.nodeId;
    const insertMenuSourceHandle = insertMenuOpen
      ? quickInsertTarget.sourceHandle
      : undefined;
    renderedNodeIds.add(node.id);

    const cachedNode = cache?.get(node.id);
    if (
      cachedNode
      && cachedNode.sourceNode === node
      && cachedNode.selected === isSelected
      && cachedNode.insertMenuOpen === insertMenuOpen
      && cachedNode.insertMenuSourceHandle === insertMenuSourceHandle
      && cachedNode.readOnly === readOnly
      && cachedNode.onDeleteNode === onDeleteNode
      && cachedNode.onDuplicateNode === onDuplicateNode
      && cachedNode.onInsertNodeAfter === onInsertNodeAfter
      && cachedNode.onRenameNode === onRenameNode
      && cachedNode.onSelectNode === onSelectNode
      && cachedNode.onToggleNodeInsertMenu === onToggleNodeInsertMenu
      && cachedNode.onToggleNodeSelection === onToggleNodeSelection
    ) {
      return cachedNode.renderedNode;
    }

    const renderedNode: WorkflowRenderNode = {
      ...node,
      selected: isSelected,
      zIndex: isSelected ? 20 : undefined,
      data: {
        ...node.data,
        insertMenuOpen,
        insertMenuSourceHandle,
        onDelete: readOnly ? undefined : onDeleteNode,
        onDuplicate: readOnly ? undefined : onDuplicateNode,
        onInsertAfter: readOnly ? undefined : onInsertNodeAfter,
        onRename: readOnly ? undefined : onRenameNode,
        onSelect: (selectedNodeId, options) => {
          if (!readOnly && options?.additive) {
            onToggleNodeSelection(selectedNodeId);
            return;
          }

          onSelectNode(selectedNodeId);
        },
        onToggleInsertMenu: readOnly ? undefined : onToggleNodeInsertMenu,
        selected: isSelected,
      },
    };

    cache?.set(node.id, {
      insertMenuOpen,
      insertMenuSourceHandle,
      onDeleteNode,
      onDuplicateNode,
      onInsertNodeAfter,
      onRenameNode,
      onSelectNode,
      onToggleNodeInsertMenu,
      onToggleNodeSelection,
      readOnly,
      renderedNode,
      selected: isSelected,
      sourceNode: node,
    });

    return renderedNode;
  });

  cache?.forEach((_, nodeId) => {
    if (!renderedNodeIds.has(nodeId)) {
      cache.delete(nodeId);
    }
  });

  return renderedNodes;
}
