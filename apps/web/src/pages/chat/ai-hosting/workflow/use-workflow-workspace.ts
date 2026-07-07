import { useRef, useState } from "react";
import type { Connection, IsValidConnection, NodeChange } from "@xyflow/react";
import { useWorkflowPublishChecks } from "./checks/publish-checks";
import { useWorkflowRun } from "./run/use-workflow-run";
import { useWorkflowShortcuts } from "./shortcuts";
import type {
  InsertableMarketingNodeKind,
  InspectorTab,
  MarketingNodeData,
  MarketingNodeKind,
  MarketingWorkflowRenderEdge,
  MarketingWorkflowRenderNode,
  WorkflowDraft,
} from "./types";
import { useWorkflowController } from "./use-workflow-controller";
import { useWorkflowRenderElements } from "./use-workflow-render-elements";
import { useWorkflowSelectionState } from "./use-workflow-selection-state";
import { useWorkflowTransientState } from "./use-workflow-transient-state";
import { getNodeVariables } from "./workflow-variables";
import { useWorkflowDocument } from "./workflow-draft-service";
import {
  canReadWorkflowClipboard,
  readWorkflowClipboard,
  writeWorkflowClipboard,
} from "./workflow-clipboard";
import type { WorkflowClipboardData } from "./workflow-clipboard";

export function useWorkflowWorkspace(workflowId: string | undefined) {
  const {
    document,
    lastSavedAt,
    markDirty,
    saveState,
  } = useWorkflowDocument(workflowId);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("settings");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isChecksOpen, setIsChecksOpen] = useState(false);
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [clipboardData, setClipboardData] = useState<WorkflowClipboardData | null>(null);
  const pasteClipboardDataRef = useRef<(nextClipboardData: WorkflowClipboardData | null) => boolean>(() => false);
  const controller = useWorkflowController(document.draft);
  const transient = useWorkflowTransientState();
  const runner = useWorkflowRun(document.id);
  const selection = useWorkflowSelectionState({
    defaultNodeId: "action-message",
    edges: controller.edges,
    nodes: controller.nodes,
  });
  const publishChecks = useWorkflowPublishChecks(controller.nodes, controller.edges);

  const {
    activeEdgeInsertMenuId,
    closeCanvasMenus,
    paletteOpen,
    paletteQuery,
    quickInsertTarget,
    setPaletteOpen,
    setPaletteQuery,
    toggleEdgeInsertMenu,
    toggleNodeInsertMenu,
  } = transient;
  const {
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
    selectNode,
    selectNodes,
    setSelectedEdgeId,
    setSelectedNodeId,
  } = selection;

  const {
    edges: renderedEdges,
    nodes: renderedNodes,
  } = useWorkflowRenderElements({
    activeEdgeInsertMenuId,
    edges: controller.edges,
    hoveredEdgeIds,
    nodes: controller.nodes,
    onDeleteNode: handleDeleteNode,
    onDuplicateNode: handleDuplicateNode,
    onInsertNodeAfter: handleInsertNodeAfter,
    onInsertNodeBetween: handleInsertNodeBetween,
    onSelectNode: selectWorkflowNode,
    onToggleEdgeInsertMenu: toggleEdgeInsertMenu,
    onToggleNodeInsertMenu: toggleNodeInsertMenu,
    quickInsertTarget,
    selectedEdgeId,
    selectedNodeIdSet,
  });

  useWorkflowShortcuts({
    canRedo: controller.canRedo,
    canUndo: controller.canUndo,
    onCopySelection: copySelectedNode,
    onDeleteSelection: deleteSelectedNode,
    onDuplicateSelection: duplicateSelectedNode,
    onPasteClipboard: pasteClipboard,
    onRedo: redoWorkflowChange,
    onUndo: undoWorkflowChange,
  });

  function selectWorkflowNode(nodeId: string) {
    selectNode(nodeId);
    setIsInspectorOpen(true);
    setIsChecksOpen(false);
    closeCanvasMenus();
  }

  function selectWorkflowEdge(edgeId: string) {
    selectEdge(edgeId);
    setIsChecksOpen(false);
    closeCanvasMenus();
  }

  function updateSelectedNode(patch: Partial<MarketingNodeData>) {
    if (!selectedNodeId) {
      return;
    }

    const result = controller.updateNodeData(selectedNodeId, patch);
    if (result) {
      markDirty(result.draft);
    }
  }

  function undoWorkflowChange() {
    const result = controller.undo();
    if (result) {
      markDirty(result.draft);
    }
    closeCanvasMenus();
  }

  function redoWorkflowChange() {
    const result = controller.redo();
    if (result) {
      markDirty(result.draft);
    }
    closeCanvasMenus();
  }

  function addNode(kind: MarketingNodeKind) {
    const result = controller.addNode(kind);
    handleWorkflowEditResult(result);
  }

  function handleInsertNodeAfter(
    previousNodeId: string,
    kind: InsertableMarketingNodeKind,
    sourceHandle?: string,
  ) {
    const result = controller.insertNodeAfter(previousNodeId, kind, sourceHandle);
    handleWorkflowEditResult(result);
  }

  function handleInsertNodeBetween(
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ) {
    const result = controller.insertNodeBetween(edgeId, sourceNodeId, targetNodeId, kind);
    handleWorkflowEditResult(result);
  }

  function connectNodes(connection: Connection) {
    const result = controller.connectNodes(connection);

    if (result) {
      markDirty(result.draft);
      closeCanvasMenus();
      setIsChecksOpen(false);
    }
  }

  function handleDeleteNode(nodeId: string) {
    const result = controller.deleteNode(nodeId);

    if (!result) {
      return;
    }

    closeCanvasMenus();
    runner.deleteNodeRun(nodeId);
    markDirty(result.draft);
    setIsChecksOpen(false);
  }

  function handleDeleteNodes(nodeIds: string[]) {
    const result = controller.deleteNodes(nodeIds);

    if (!result) {
      return;
    }

    closeCanvasMenus();
    result.nodeIds?.forEach((nodeId) => runner.deleteNodeRun(nodeId));
    clearNodeSelection();
    markDirty(result.draft);
    setIsChecksOpen(false);
  }

  function handleDuplicateNode(nodeId: string) {
    const result = controller.duplicateNode(nodeId);
    handleWorkflowEditResult(result);
  }

  function handleDeleteEdge(edgeId: string) {
    const result = controller.deleteEdge(edgeId);

    if (!result) {
      return;
    }

    setSelectedEdgeId(null);
    markDirty(result.draft);
    closeCanvasMenus();
    setIsChecksOpen(false);
  }

  function deleteSelectedNode() {
    if (selectedEdgeId) {
      handleDeleteEdge(selectedEdgeId);
      return;
    }

    if (!selectedNodeIds.length) {
      return;
    }

    handleDeleteNodes(selectedNodeIds);
  }

  function duplicateSelectedNode() {
    if (selectedEdgeId || selectedNodeIds.length !== 1 || !selectedNodeId) {
      return;
    }

    handleDuplicateNode(selectedNodeId);
  }

  function copySelectedNode() {
    if (selectedEdgeId || !selectedNodeIds.length) {
      return false;
    }

    const nextClipboardData = controller.copyNodes(selectedNodeIds);

    if (!nextClipboardData) {
      return false;
    }

    setClipboardData(nextClipboardData);
    void writeWorkflowClipboard(nextClipboardData);
    closeCanvasMenus();
    return true;
  }

  function pasteClipboard() {
    if (canReadWorkflowClipboard()) {
      void pasteReadableClipboard(clipboardData);
      return true;
    }

    return pasteClipboardData(clipboardData);
  }

  async function pasteReadableClipboard(fallbackClipboardData: WorkflowClipboardData | null) {
    pasteClipboardDataRef.current(await readWorkflowClipboard() ?? fallbackClipboardData);
  }

  function pasteClipboardData(nextClipboardData: WorkflowClipboardData | null) {
    if (!nextClipboardData) {
      return false;
    }

    const result = controller.pasteClipboardData(nextClipboardData);

    if (!result) {
      return false;
    }

    handleWorkflowEditResult(result);
    return true;
  }

  pasteClipboardDataRef.current = pasteClipboardData;

  function handleWorkflowEditResult(result?: { draft: WorkflowDraft; nodeId?: string }) {
    if (!result) {
      return;
    }

    markDirty(result.draft);

    if (result?.nodeId) {
      setSelectedNodeId(result.nodeId);
      setSelectedEdgeId(null);
      setIsInspectorOpen(true);
    }

    closeCanvasMenus();
    setPaletteOpen(false);
    setIsChecksOpen(false);
  }

  function clearCanvasSelection() {
    clearEdgeSelection();
    closeCanvasMenus();
  }

  function handleSelectionChange(selectionChange: {
    edges: MarketingWorkflowRenderEdge[];
    nodes: MarketingWorkflowRenderNode[];
  }) {
    if (!selectionChange.nodes.length) {
      return;
    }

    selectNodes(selectionChange.nodes.map((node) => node.id));
    setIsChecksOpen(false);
    closeCanvasMenus();
  }

  function openVariablesPanel() {
    setIsInspectorOpen(true);
    setInspectorTab("variables");
    setIsChecksOpen(false);
    clearCanvasSelection();
  }

  function handlePaletteOpenChange(open: boolean) {
    setPaletteOpen(open);
    clearCanvasSelection();
  }

  function handlePaneClick() {
    clearCanvasSelection();
    setIsChecksOpen(false);
  }

  function runSelectedNode() {
    if (!selectedNode) {
      return;
    }

    runner.runNode(selectedNode);
    setIsInspectorOpen(true);
    setInspectorTab("run");
  }

  function handlePublishCheck() {
    setPublishAttempted(true);
    setIsChecksOpen(true);
    closeCanvasMenus();
  }

  function handleNodesChange(changes: NodeChange<MarketingWorkflowRenderNode>[]) {
    const result = controller.onNodesChange(changes);
    controller.markDraftDirty();
    if (result) {
      markDirty(result.draft);
    }
  }

  function arrangeNodes() {
    const result = controller.arrangeNodes();
    if (result) {
      markDirty(result.draft);
    }
  }

  const isValidCanvasConnection: IsValidConnection<MarketingWorkflowRenderEdge> = (connection) =>
    controller.isValidConnection({
      source: connection.source,
      sourceHandle: connection.sourceHandle ?? null,
      target: connection.target,
      targetHandle: connection.targetHandle ?? null,
    });

  return {
    canvas: {
      canRedo: controller.canRedo,
      canUndo: controller.canUndo,
      edges: renderedEdges,
      nodes: renderedNodes,
      nextRedoLabel: controller.nextRedoLabel,
      nextUndoLabel: controller.nextUndoLabel,
      onAddNode: addNode,
      onArrange: arrangeNodes,
      onConnect: connectNodes,
      onEdgesChange: controller.onEdgesChange,
      onIsValidConnection: isValidCanvasConnection,
      onNodeHoverEnd: handleNodeHoverEnd,
      onNodeHoverStart: handleNodeHoverStart,
      onNodesChange: handleNodesChange,
      onOpenVariables: openVariablesPanel,
      onPaletteOpenChange: handlePaletteOpenChange,
      onPaneClick: handlePaneClick,
      onRedo: redoWorkflowChange,
      onSearchChange: setPaletteQuery,
      onSelectEdge: selectWorkflowEdge,
      onSelectNode: selectWorkflowNode,
      onSelectionChange: handleSelectionChange,
      onUndo: undoWorkflowChange,
      paletteOpen,
      searchValue: paletteQuery,
    },
    checks: {
      ...publishChecks,
      isOpen: isChecksOpen,
      onClose: () => setIsChecksOpen(false),
      onNavigateToNode: selectWorkflowNode,
      publishAttempted,
    },
    document,
    inspector: {
      activeTab: inspectorTab,
      isOpen: isInspectorOpen,
      lastRun: runner.getNodeRun(selectedNode?.id),
      node: selectedNode,
      onClose: () => setIsInspectorOpen(false),
      onNodeChange: updateSelectedNode,
      onRunNode: runSelectedNode,
      onTabChange: setInspectorTab,
      variables: selectedNode
        ? getNodeVariables(selectedNode, controller.nodes, controller.edges)
        : undefined,
    },
    topBar: {
      lastSavedAt,
      onPublishCheck: handlePublishCheck,
      publishReady: publishChecks.publishReady,
      readyChecks: publishChecks.readyChecks,
      saveState,
      totalChecks: publishChecks.totalChecks,
    },
  };
}
