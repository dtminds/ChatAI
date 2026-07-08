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
import { useWorkflowRun } from "./run/use-workflow-run";
import { useWorkflowShortcuts } from "./shortcuts";
import type {
  InsertableWorkflowNodeKind,
  InspectorTab,
  WorkflowNodeData,
  WorkflowNodeKind,
  WorkflowRenderEdge,
  WorkflowRenderNode,
  WorkflowDraft,
} from "./types";
import { useWorkflowController } from "./use-workflow-controller";
import { useWorkflowRenderElements } from "./use-workflow-render-elements";
import { useWorkflowSelectionState } from "./use-workflow-selection-state";
import { useWorkflowTransientState } from "./use-workflow-transient-state";
import { getNodeVariables } from "./workflow-variables";
import {
  cloneWorkflowDraftSnapshot,
  useWorkflowDocument,
} from "./workflow-draft-service";
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
};

type WorkflowWorkspaceEditOptions = {
  clearEdgeSelection?: boolean;
  clearNodeSelection?: boolean;
  clearSelectedRemovedEdge?: boolean;
  closeChecks?: boolean;
  closeOverlays?: boolean;
  deleteNodeRuns?: boolean;
  selectNode?: boolean;
  workflowEdited?: boolean;
};

export function useWorkflowWorkspace(workflowId: string | undefined) {
  const {
    document,
    lastSavedAt,
    markDirty,
    publishDraft,
    publishState,
    restoreState,
    restoreVersion,
    saveState,
  } = useWorkflowDocument(workflowId);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("settings");
  const [viewState, dispatchViewState] = useReducer(
    reduceWorkflowViewState,
    undefined,
    createDefaultWorkflowViewState,
  );
  const [publishAttempted, setPublishAttempted] = useState(false);
  const previewVersion = document.versionHistory.find((version) => version.id === viewState.previewVersionId);
  const runner = useWorkflowRun(document.id);
  const historyRun = runner.historyRun;
  const previewDraft = useMemo(
    () => historyRun
      ? cloneWorkflowDraftSnapshot(historyRun.draft)
      : previewVersion
        ? cloneWorkflowDraftSnapshot(previewVersion.draft)
        : document.draft,
    [document.draft, historyRun, previewVersion],
  );
  const isPreviewingVersion = Boolean(previewVersion);
  const isViewingRunHistory = Boolean(historyRun);
  const workflowMode = deriveWorkflowMode({
    isPreviewingVersion,
    isViewingRunHistory,
    restoreState,
    workflowRunStatus: runner.activeRun?.status,
  });
  const { permissions } = workflowMode;
  const controller = useWorkflowController(previewDraft);
  const transient = useWorkflowTransientState();
  const selection = useWorkflowSelectionState({
    defaultNodeId: "action-message",
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
    dispatchViewState({
      inspectorOpen: !isPreviewingVersion,
      type: "select-node",
    });
    if (isViewingRunHistory) {
      setInspectorTab("run");
    }
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

    markDirty(result.draft);

    if (options.deleteNodeRuns) {
      (result.nodeIds ?? (result.nodeId ? [result.nodeId] : []))
        .forEach((nodeId) => runner.deleteNodeRun(nodeId));
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

  const updateSelectedNode = useCallback((patch: Partial<WorkflowNodeData>) => {
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

  const addNode = useWorkflowStableCallback((kind: WorkflowNodeKind) => {
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
      deleteNodeRuns: true,
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
      deleteNodeRuns: true,
    });
  });

  const handleDuplicateNode = useWorkflowStableCallback((nodeId: string) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.duplicateNode(nodeId);
    handleWorkflowEditResult(result);
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
    closeCanvasOverlays();
    dispatchViewState({ type: "close-checks" });
  });

  const runSelectedNode = useCallback(() => {
    if (!permissions.canRunNode) {
      return;
    }

    if (!selectedNode) {
      return;
    }

    runner.runNode(selectedNode);
    dispatchViewState({ type: "open-inspector" });
    setInspectorTab("run");
  }, [permissions.canRunNode, runner, selectedNode]);

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

  const runCurrentWorkflow = useWorkflowStableCallback(() => {
    if (!permissions.canRunWorkflow) {
      return;
    }

    if (!publishChecks.canRun) {
      setPublishAttempted(true);
      dispatchViewState({ type: "open-checks" });
      closeCanvasOverlays();
      return;
    }

    runner.runWorkflow(controller.currentDraft);
    dispatchViewState({ type: "open-run-history" });
    closeCanvasOverlays();
  });

  const handleNodesChange = useWorkflowStableCallback((changes: NodeChange<WorkflowRenderNode>[]) => {
    if (!permissions.canEditGraph) {
      return;
    }

    controller.onNodesChange(changes);
    controller.markDraftDirty();
  });

  const handleNodeDragStart: OnNodeDrag<WorkflowRenderNode> = useWorkflowStableCallback((event) => {
    if (!permissions.canEditGraph) {
      return;
    }

    controller.beginNodeDrag();
  });

  const handleNodeDrag: OnNodeDrag<WorkflowRenderNode> = useWorkflowStableCallback(() => {
    if (!permissions.canEditGraph) {
      return;
    }
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
    if (!permissions.canEditGraph) {
      return;
    }

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
    runner.exitRunHistory();
    dispatchViewState({
      type: "select-version-preview",
      versionId,
    });
    clearEdgeSelection();
    clearNodeSelection();
    closeCanvasOverlays();
  });

  const closeRunHistory = useWorkflowStableCallback(() => {
    runner.exitRunHistory();
    dispatchViewState({ type: "close-run-history" });
    clearEdgeSelection();
    clearNodeSelection();
    closeCanvasOverlays();
  });

  const openRunHistory = useWorkflowStableCallback(() => {
    dispatchViewState({ type: "open-run-history" });
    closeCanvasOverlays();
  });

  const selectRunHistory = useWorkflowStableCallback((runId: string) => {
    runner.viewRunHistory(runId);
    dispatchViewState({ type: "select-run-history" });
    setInspectorTab("run");
    clearEdgeSelection();
    clearNodeSelection();
    closeCanvasOverlays();
  });

  const exitRunHistory = useWorkflowStableCallback(() => {
    runner.exitRunHistory();
    dispatchViewState({ type: "exit-run-history" });
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
      viewport: controller.currentDraft.viewport,
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
    inspector: {
      activeTab: inspectorTab,
      edges: controller.edges,
      isOpen: viewState.inspectorOpen,
      lastRun: selectedNode?.id && historyRun
        ? historyRun.nodeRuns[selectedNode.id]
        : runner.getNodeRun(selectedNode?.id),
      node: selectedNode,
      onClose: () => dispatchViewState({ type: "close-inspector" }),
      onNodeChange: updateSelectedNode,
      onRunNode: runSelectedNode,
      onTabChange: setInspectorTab,
      variables: selectedNode
        ? inspectorNodeVariables
        : undefined,
    },
    topBar: {
      lastSavedAt,
      onOpenRunHistory: openRunHistory,
      onOpenVersionHistory: openVersionHistory,
      onPublishCheck: handlePublishCheck,
      onPublish: publishCurrentDraft,
      onRunWorkflow: runCurrentWorkflow,
      onStopWorkflowRun: runner.stopWorkflowRun,
      publishedAt: document.publishedAt,
      publishState,
      publishReady: publishChecks.publishReady,
      runningState: runner.activeRun?.status,
      readyChecks: publishChecks.readyChecks,
      saveState,
      totalChecks: publishChecks.totalSummaryChecks,
    },
    runHistory: {
      activeRun: runner.activeRun,
      currentHistoryRunId: runner.historyRun?.id,
      historyRun: runner.historyRun,
      isOpen: viewState.activePanel === "run-history",
      isViewing: isViewingRunHistory,
      onClose: closeRunHistory,
      onExitHistory: exitRunHistory,
      onSelectRun: selectRunHistory,
      runs: runner.runHistory,
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
