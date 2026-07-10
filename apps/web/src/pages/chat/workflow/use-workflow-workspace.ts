import { useCallback, useMemo, useReducer, useState } from "react";
import type {
  Connection,
  EdgeChange,
  IsValidConnection,
  NodeChange,
  OnNodeDrag,
  Viewport,
} from "@xyflow/react";
import { useWorkflowPublishChecks } from "./checks/publish-checks";
import { useWorkflowShortcuts } from "./shortcuts";
import type {
  InsertableWorkflowNodeKind,
  InspectorTab,
  WorkflowNodeConfigPatch,
  WorkflowRenderEdge,
  WorkflowRenderNode,
  WorkflowDraft,
} from "./types";
import { useWorkflowController } from "./use-workflow-controller";
import { hasNodeSettings } from "./node-definitions";
import { useWorkflowRenderElements } from "./use-workflow-render-elements";
import { useWorkflowSelectionState } from "./use-workflow-selection-state";
import { useWorkflowTransientState } from "./use-workflow-transient-state";
import { getNodeVariables } from "./workflow-variables";
import {
  cloneWorkflowDraftSnapshot,
  useWorkflowDocument,
} from "./workflow-draft-service";
import type { WorkflowDraftRepository } from "./workflow-draft-service";
import { useWorkflowStableCallback } from "./workflow-hooks";
import { deriveWorkflowMode } from "./workflow-mode";
import {
  createDefaultWorkflowViewState,
  reduceWorkflowViewState,
} from "./workflow-view-state";

type WorkflowWorkspaceEditResult = {
  draft: WorkflowDraft;
  edgeId?: string;
  nodeId?: string;
  nodeIds?: string[];
  transient?: boolean;
};

type WorkflowWorkspaceEditOptions = {
  clearEdgeSelection?: boolean;
  clearNodeSelection?: boolean;
  clearSelectedRemovedEdge?: boolean;
  closeChecks?: boolean;
  closeOverlays?: boolean;
  selectNode?: boolean;
  workflowEdited?: boolean;
};

export function useWorkflowWorkspace(
  workflowId: string | undefined,
  repository?: WorkflowDraftRepository,
) {
  const {
    document,
    lastSavedAt,
    markDirty,
    publishDraft,
    publishState,
    restoreState,
    restoreVersion,
    saveState,
  } = useWorkflowDocument(workflowId, repository);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("settings");
  const [viewState, dispatchViewState] = useReducer(
    reduceWorkflowViewState,
    undefined,
    createDefaultWorkflowViewState,
  );
  const [publishAttempted, setPublishAttempted] = useState(false);
  const previewVersion = document.versionHistory.find((version) => version.id === viewState.previewVersionId);
  const previewDraft = useMemo(
    () => previewVersion
      ? cloneWorkflowDraftSnapshot(previewVersion.draft)
      : document.draft,
    [document.draft, previewVersion],
  );
  const isPreviewingVersion = Boolean(previewVersion);
  const workflowMode = deriveWorkflowMode({
    isPreviewingVersion,
    publishState,
    restoreState,
  });
  const { permissions } = workflowMode;
  const controllerResetKey = previewVersion
    ? `version:${previewVersion.id}`
    : `edit:${document.id}`;
  const controller = useWorkflowController(previewDraft, controllerResetKey);
  const transient = useWorkflowTransientState();
  const selection = useWorkflowSelectionState({
    defaultNodeId: "",
    edges: controller.edges,
    nodes: controller.nodes,
  });
  const publishChecks = useWorkflowPublishChecks(controller.nodes, controller.edges);

  const {
    activeEdgeInsertMenuId,
    closeCanvasMenus,
    closeCanvasOverlays,
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
    selectionDeleteTarget,
    selectedNode,
    selectedNodeId,
    selectedNodeIdSet,
    selectNode,
    setSelectedNodeId,
    toggleNodeSelection,
  } = selection;

  const selectWorkflowNode = useWorkflowStableCallback((nodeId: string, options?: { additive?: boolean }) => {
    if (options?.additive) {
      toggleNodeSelection(nodeId);
      dispatchViewState({ type: "close-checks" });
      closeCanvasOverlays();
      return;
    }

    selectNode(nodeId);
    const node = controller.nodes.find((candidate) => candidate.id === nodeId);
    dispatchViewState({
      inspectorOpen: Boolean(node && hasNodeSettings(node.data.kind) && !isPreviewingVersion),
      type: "select-node",
    });
    closeCanvasOverlays();
  });

  const selectWorkflowEdge = useWorkflowStableCallback((edgeId: string) => {
    selectEdge(edgeId);
    dispatchViewState({ type: "close-checks" });
    closeCanvasOverlays();
  });

  const commitWorkflowEditResult = useWorkflowStableCallback((
    result: WorkflowWorkspaceEditResult | undefined,
    options: WorkflowWorkspaceEditOptions = {},
  ) => {
    if (!result) {
      return false;
    }

    if (!result.transient) {
      markDirty(result.draft);
    }

    if (options.selectNode && result.nodeId) {
      setSelectedNodeId(result.nodeId);
    }

    if (options.clearNodeSelection) {
      clearNodeSelection();
    }

    if (
      options.clearEdgeSelection
      || (options.clearSelectedRemovedEdge && result.edgeId && selectedEdgeId === result.edgeId)
    ) {
      clearEdgeSelection();
    }

    if (options.workflowEdited) {
      dispatchViewState({
        openInspector: Boolean(options.selectNode && result.nodeId),
        type: "workflow-edited",
      });
    }

    if (options.closeChecks) {
      dispatchViewState({ type: "close-checks" });
    }

    if (options.closeOverlays !== false) {
      closeCanvasOverlays();
    }

    return true;
  });

  const updateSelectedNode = useCallback((patch: WorkflowNodeConfigPatch) => {
    if (!permissions.canEditNodeSettings) {
      return;
    }

    if (!selectedNodeId) {
      return;
    }

    const result = controller.updateNodeData(selectedNodeId, patch);
    commitWorkflowEditResult(result, {
      closeOverlays: false,
    });
  }, [commitWorkflowEditResult, controller, permissions.canEditNodeSettings, selectedNodeId]);

  const undoWorkflowChange = useWorkflowStableCallback(() => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.undo();
    if (!commitWorkflowEditResult(result)) {
      closeCanvasOverlays();
    }
  });

  const redoWorkflowChange = useWorkflowStableCallback(() => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.redo();
    if (!commitWorkflowEditResult(result)) {
      closeCanvasOverlays();
    }
  });

  const handleWorkflowEditResult = useWorkflowStableCallback((result?: { draft: WorkflowDraft; nodeId?: string }) => {
    if (!permissions.canEditGraph) {
      return;
    }

    commitWorkflowEditResult(result, {
      selectNode: true,
      workflowEdited: true,
    });
  });

  const addNode = useWorkflowStableCallback((kind: InsertableWorkflowNodeKind) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.addNode(kind);
    handleWorkflowEditResult(result);
  });

  const handleInsertNodeAfter = useWorkflowStableCallback((
    previousNodeId: string,
    kind: InsertableWorkflowNodeKind,
    sourceHandle?: string,
  ) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.insertNodeAfter(previousNodeId, kind, sourceHandle);
    handleWorkflowEditResult(result);
  });

  const handleInsertNodeBetween = useWorkflowStableCallback((
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableWorkflowNodeKind,
  ) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.insertNodeBetween(edgeId, sourceNodeId, targetNodeId, kind);
    handleWorkflowEditResult(result);
  });

  const connectNodes = useWorkflowStableCallback((connection: Connection) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.connectNodes(connection);
    commitWorkflowEditResult(result, {
      closeChecks: true,
    });
  });

  const handleDeleteNode = useWorkflowStableCallback((nodeId: string) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.deleteNode(nodeId);
    commitWorkflowEditResult(result, {
      closeChecks: true,
    });
  });

  const handleDeleteNodes = useWorkflowStableCallback((nodeIds: string[]) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.deleteNodes(nodeIds);
    commitWorkflowEditResult(result, {
      clearNodeSelection: true,
      closeChecks: true,
    });
  });

  const handleDuplicateNode = useWorkflowStableCallback((nodeId: string) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.duplicateNode(nodeId);
    handleWorkflowEditResult(result);
  });

  const handleRenameNode = useWorkflowStableCallback((nodeId: string, title: string) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.renameNode(nodeId, title);
    commitWorkflowEditResult(result, {
      closeOverlays: false,
    });
  });

  const handleDeleteEdge = useWorkflowStableCallback((edgeId: string) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.deleteEdge(edgeId);
    commitWorkflowEditResult(result, {
      clearEdgeSelection: true,
      closeChecks: true,
    });
  });

  const deleteSelectedNode = useWorkflowStableCallback(() => {
    if (selectionDeleteTarget.type === "edge") {
      handleDeleteEdge(selectionDeleteTarget.edgeId);
      return;
    }

    if (selectionDeleteTarget.type !== "nodes") {
      return;
    }

    handleDeleteNodes(selectionDeleteTarget.nodeIds);
  });

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
    onRenameNode: handleRenameNode,
    onSelectNode: selectWorkflowNode,
    onToggleNodeSelection: toggleNodeSelection,
    onToggleEdgeInsertMenu: toggleEdgeInsertMenu,
    onToggleNodeInsertMenu: toggleNodeInsertMenu,
    quickInsertTarget,
    readOnly: permissions.nodesReadOnly,
    selectedEdgeId,
    selectedNodeIdSet,
  });

  useWorkflowShortcuts({
    canDeleteSelection: permissions.canEditGraph,
    canRedo: permissions.canUseHistory && controller.canRedo,
    canUndo: permissions.canUseHistory && controller.canUndo,
    onDeleteSelection: permissions.canEditGraph ? deleteSelectedNode : () => undefined,
    onRedo: redoWorkflowChange,
    onUndo: undoWorkflowChange,
  });

  const clearCanvasSelection = useWorkflowStableCallback(() => {
    clearEdgeSelection();
    closeCanvasMenus();
  });

  const openVariablesPanel = useWorkflowStableCallback(() => {
    dispatchViewState({ type: "open-variables" });
    setInspectorTab("variables");
    clearEdgeSelection();
    closeCanvasOverlays();
  });

  const handlePaletteOpenChange = useWorkflowStableCallback((open: boolean) => {
    if (!permissions.canOpenInsertPalette) {
      return;
    }

    setPaletteOpen(open);
    clearCanvasSelection();
  });

  const handlePaneClick = useWorkflowStableCallback(() => {
    clearEdgeSelection();
    clearNodeSelection();
    closeCanvasOverlays();
    dispatchViewState({ type: "close-checks" });
    dispatchViewState({ type: "close-inspector" });
  });

  const handlePublishCheck = useWorkflowStableCallback(() => {
    if (!permissions.canPublish) {
      return;
    }

    setPublishAttempted(true);
    dispatchViewState({ type: "open-checks" });
    closeCanvasOverlays();
  });

  const publishCurrentDraft = useWorkflowStableCallback(async () => {
    if (!permissions.canPublish) {
      return;
    }

    setPublishAttempted(true);

    if (!publishChecks.publishReady) {
      dispatchViewState({ type: "open-checks" });
      closeCanvasOverlays();
      return;
    }

    dispatchViewState({ type: "close-checks" });
    closeCanvasOverlays();
    await publishDraft(controller.currentDraft);
  });

  const handleNodesChange = useWorkflowStableCallback((changes: NodeChange<WorkflowRenderNode>[]) => {
    if (!permissions.canEditGraph) {
      return;
    }

    controller.onNodesChange(changes);
    controller.flushPendingConfigHistory();
  });

  const handleNodeDragStart: OnNodeDrag<WorkflowRenderNode> = useWorkflowStableCallback((event) => {
    if (!permissions.canEditGraph) {
      return;
    }

    controller.beginNodeDrag();
  });

  const handleNodeDrag: OnNodeDrag<WorkflowRenderNode> = useWorkflowStableCallback((event, node) => {
    if (!permissions.canEditGraph) {
      return;
    }

    controller.updateNodeDrag(node.id, node.position);
  });

  const handleNodeDragStop: OnNodeDrag<WorkflowRenderNode> = useWorkflowStableCallback((event, node, draggedNodes) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.finishNodeDrag(node.id, node.position, draggedNodes);
    commitWorkflowEditResult(result, {
      closeOverlays: false,
    });
  });

  const handleViewportChangeEnd = useWorkflowStableCallback((viewport: Viewport) => {
    controller.updateViewport(viewport);
  });

  const handleEdgesChange = useWorkflowStableCallback((changes: EdgeChange<WorkflowRenderEdge>[]) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.onEdgesChange(changes);
    commitWorkflowEditResult(result, {
      clearSelectedRemovedEdge: true,
      closeChecks: true,
    });
  });

  const arrangeNodes = useWorkflowStableCallback(() => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.arrangeNodes();
    commitWorkflowEditResult(result, {
      closeOverlays: false,
    });
  });

  const isValidCanvasConnection: IsValidConnection<WorkflowRenderEdge> = useWorkflowStableCallback((connection) =>
    permissions.canEditGraph
    && controller.isValidConnection({
      source: connection.source,
      sourceHandle: connection.sourceHandle ?? null,
      target: connection.target,
      targetHandle: connection.targetHandle ?? null,
    }));

  const closeVersionHistory = useWorkflowStableCallback(() => {
    dispatchViewState({ type: "close-version-history" });
    clearEdgeSelection();
    clearNodeSelection();
    closeCanvasOverlays();
  });

  const openVersionHistory = useWorkflowStableCallback(() => {
    dispatchViewState({ type: "open-version-history" });
    closeCanvasOverlays();
  });

  const selectVersionPreview = useWorkflowStableCallback((versionId: string) => {
    dispatchViewState({
      type: "select-version-preview",
      versionId,
    });
    clearEdgeSelection();
    clearNodeSelection();
    closeCanvasOverlays();
  });

  const exitVersionPreview = useWorkflowStableCallback(() => {
    dispatchViewState({ type: "exit-version-preview" });
    clearEdgeSelection();
    clearNodeSelection();
    closeCanvasOverlays();
  });

  const restorePreviewVersion = useWorkflowStableCallback(async (versionId: string) => {
    const result = await restoreVersion(versionId);

    if (!result) {
      return;
    }

    dispatchViewState({ type: "version-restored" });
    clearEdgeSelection();
    clearNodeSelection();
    closeCanvasOverlays();
  });

  const checksClose = useCallback(() => dispatchViewState({ type: "close-checks" }), []);
  const inspectorNodeVariables = useMemo(
    () => selectedNode
      ? getNodeVariables(selectedNode, controller.nodes, controller.edges)
      : undefined,
    [controller.edges, controller.nodes, selectedNode],
  );

  return {
    canvas: {
      canRedo: permissions.canUseHistory && controller.canRedo,
      canUndo: permissions.canUseHistory && controller.canUndo,
      edges: renderedEdges,
      isReadOnly: permissions.canvasReadOnly,
      nodes: renderedNodes,
      nextRedoLabel: controller.nextRedoLabel,
      nextUndoLabel: controller.nextUndoLabel,
      onAddNode: addNode,
      onArrange: arrangeNodes,
      onConnect: connectNodes,
      onEdgesChange: handleEdgesChange,
      onIsValidConnection: isValidCanvasConnection,
      onNodeDrag: handleNodeDrag,
      onNodeDragStart: handleNodeDragStart,
      onNodeDragStop: handleNodeDragStop,
      onNodeHoverEnd: handleNodeHoverEnd,
      onNodeHoverStart: handleNodeHoverStart,
      onNodesChange: handleNodesChange,
      onOpenVariables: openVariablesPanel,
      onPaletteOpenChange: handlePaletteOpenChange,
      onPaneClick: handlePaneClick,
      onViewportChangeEnd: handleViewportChangeEnd,
      onRedo: redoWorkflowChange,
      onSearchChange: setPaletteQuery,
      onSelectEdge: selectWorkflowEdge,
      onSelectNode: selectWorkflowNode,
      onUndo: undoWorkflowChange,
      paletteOpen,
      searchValue: paletteQuery,
      viewport: controller.currentViewport,
    },
    checks: {
      ...publishChecks,
      isOpen: viewState.activePanel === "checks",
      onClose: checksClose,
      onNavigateToNode: selectWorkflowNode,
      publishAttempted,
    },
    document,
    mode: workflowMode.mode,
    permissions,
    readOnlyReason: workflowMode.readOnlyReason,
    inspector: {
      activeTab: inspectorTab,
      edges: controller.edges,
      isOpen: viewState.inspectorOpen,
      node: selectedNode,
      onClose: () => dispatchViewState({ type: "close-inspector" }),
      onNodeChange: updateSelectedNode,
      onTabChange: setInspectorTab,
      variables: selectedNode
        ? inspectorNodeVariables
        : undefined,
    },
    topBar: {
      lastSavedAt,
      onOpenVersionHistory: openVersionHistory,
      onPublishCheck: handlePublishCheck,
      onPublish: publishCurrentDraft,
      publishedAt: document.publishedAt,
      publishState,
      publishReady: publishChecks.publishReady,
      readyChecks: publishChecks.readyChecks,
      saveState,
      totalChecks: publishChecks.totalSummaryChecks,
    },
    versionHistory: {
      currentPreviewVersionId: previewVersion?.id,
      isOpen: viewState.activePanel === "version-history",
      isPreviewing: isPreviewingVersion,
      onClose: closeVersionHistory,
      onExitPreview: exitVersionPreview,
      onRestoreVersion: restorePreviewVersion,
      onSelectVersion: selectVersionPreview,
      previewVersion,
      restoreState,
      versions: document.versionHistory,
    },
  };
}
