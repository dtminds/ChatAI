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
import {
  getAvailableIntentInputOutputsForNode,
  getAvailableMessageContentOutputsForNode,
  getAvailableTimeReferenceNodesForNode,
  getAvailableTimeReferenceOutputsForNode,
  getAvailableVariablesForNode,
} from "./workflow-variables";
import { validateWorkflowNodeConfig } from "./validation/workflow-validation";

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
  availableIntentInputKey: string;
  availableMessageContentOutputKey: string;
  availableTimeReferenceKey: string;
  availableVariableKey: string;
  effectiveStatus: WorkflowNode["data"]["status"];
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
    options.edges,
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
  edges,
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
    const availableVariables = getAvailableVariablesForNode(node.id, nodes, edges);
    const availableIntentInputs = node.data.kind === "ai-intent"
      ? getAvailableIntentInputOutputsForNode(node.id, nodes, edges)
      : undefined;
    const availableMessageContentOutputs = node.data.kind === "message"
      ? getAvailableMessageContentOutputsForNode(node.id, nodes, edges)
      : undefined;
    const availableTimeReferences = node.data.kind === "message-query"
      ? {
          nodes: getAvailableTimeReferenceNodesForNode(node.id, nodes, edges).map((sourceNode) => ({
            id: sourceNode.id,
            title: sourceNode.data.title,
          })),
          outputs: getAvailableTimeReferenceOutputsForNode(node.id, nodes, edges),
        }
      : undefined;
    const availableTimeReferenceKey = availableTimeReferences
      ? [
          ...availableTimeReferences.nodes.map((sourceNode) => `${sourceNode.id}:${sourceNode.title}`),
          ...availableTimeReferences.outputs.map((output) => [
            output.selector.join("."),
            output.sourceNodeTitle,
            output.label,
          ].join(":")),
        ].join("|")
      : "";
    const availableVariableKey = availableVariables.map((variable) => [
      variable.selector.join("."),
      variable.sourceNodeTitle,
      variable.label,
    ].join(":"))
      .join("|");
    const availableMessageContentOutputKey = availableMessageContentOutputs?.map((variable) => [
      variable.selector.join("."),
      variable.sourceNodeTitle,
      variable.label,
    ].join(":"))
      .join("|") ?? "";
    const availableIntentInputKey = availableIntentInputs?.map((variable) => [
      variable.selector.join("."),
      variable.sourceNodeTitle,
      variable.label,
    ].join(":"))
      .join("|") ?? "";
    const isSelected = selectedNodeIdSet.has(node.id);
    const derivesStatusFromGraph = node.data.kind === "branch"
      || node.data.kind === "ai-intent"
      || node.data.kind === "message-query"
      || node.data.kind === "llm";
    const effectiveStatus = derivesStatusFromGraph
      && validateWorkflowNodeConfig(node, nodes, edges).length > 0
      ? "warning" as const
      : node.data.status;
    const insertMenuOpen = !readOnly && node.id === quickInsertTarget?.nodeId;
    const insertMenuSourceHandle = insertMenuOpen
      ? quickInsertTarget.sourceHandle
      : undefined;
    renderedNodeIds.add(node.id);

    const cachedNode = cache?.get(node.id);
    if (
      cachedNode
      && cachedNode.availableIntentInputKey === availableIntentInputKey
      && cachedNode.availableMessageContentOutputKey === availableMessageContentOutputKey
      && cachedNode.availableTimeReferenceKey === availableTimeReferenceKey
      && cachedNode.availableVariableKey === availableVariableKey
      && cachedNode.effectiveStatus === effectiveStatus
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
        availableIntentInputs,
        availableMessageContentOutputs,
        availableTimeReferences,
        availableVariables,
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
        status: effectiveStatus,
      },
    };

    cache?.set(node.id, {
      availableIntentInputKey,
      availableMessageContentOutputKey,
      availableTimeReferenceKey,
      availableVariableKey,
      effectiveStatus,
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
