import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { getWorkflowCapabilityProfile } from "@chatai/contracts";
import { toast } from "sonner";
import type {
  Connection,
  EdgeChange,
  IsValidConnection,
  NodeChange,
  OnNodeDrag,
  Viewport,
} from "@xyflow/react";
import { useWorkflowPublishChecks } from "./checks/publish-checks";
import type { WorkflowValidationResources } from "./validation/workflow-validation-summary";
import { useWorkflowShortcuts } from "./shortcuts";
import type {
  InsertableWorkflowNodeKind,
  WorkflowCanvasFocusRequest,
  WorkflowNode,
  WorkflowNodeConfigPatch,
  WorkflowRenderEdge,
  WorkflowRenderNode,
  WorkflowDraft,
} from "./types";
import { useWorkflowController } from "./use-workflow-controller";
import { canInsertNodeKind, hasNodeSettings } from "./node-definitions";
import { useWorkflowRenderElements } from "./use-workflow-render-elements";
import { useWorkflowSelectionState } from "./use-workflow-selection-state";
import { useWorkflowTransientState } from "./use-workflow-transient-state";
import {
  cloneWorkflowDraftSnapshot,
  useWorkflowDocument,
} from "./workflow-draft-service";
import type { WorkflowDraftRepository } from "./workflow-draft-service";
import type { WorkflowDocument, WorkflowVersionHistoryItem } from "./workflow-draft-service";
import { useWorkflowStableCallback } from "./workflow-hooks";
import { deriveWorkflowMode } from "./workflow-mode";
import {
  getWorkflowLifecycleErrorMessage,
  getWorkflowReviewActionErrorMessage,
} from "./workflow-error-messages";
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
  closeOverlays?: boolean;
  selectNode?: boolean;
  workflowEdited?: boolean;
};

export function useWorkflowWorkspace(
  workflowId: string,
  repository?: WorkflowDraftRepository,
  initialDocument?: WorkflowDocument,
  validationResources?: WorkflowValidationResources,
) {
  const {
    document,
    enableDocument,
    hasUnpublishedChanges,
    getVersion,
    lastSavedAt,
    lifecycleActionState,
    listReviews,
    listVersions,
    markDirty,
    metadataUpdateState,
    pauseDocument,
    approveReview,
    publishReview,
    publishError,
    publishState,
    rejectReview,
    reviewActionState,
    retrySave,
    restoreState,
    restoreReview,
    restoreVersion,
    resumeDocument,
    saveError,
    saveState,
    submitReview,
    updateMetadata,
    withdrawReview,
  } = useWorkflowDocument(workflowId, repository, initialDocument);
  const [viewState, dispatchViewState] = useReducer(
    reduceWorkflowViewState,
    undefined,
    createDefaultWorkflowViewState,
  );
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [canvasFocusRequest, setCanvasFocusRequest] = useState<WorkflowCanvasFocusRequest>();
  const previewVersion = viewState.previewVersion;
  const previewDraft = useMemo(
    () => previewVersion
      ? cloneWorkflowDraftSnapshot(previewVersion.draft)
      : document.draft,
    [document.draft, previewVersion],
  );
  const isPreviewingVersion = Boolean(previewVersion);
  const workflowMode = deriveWorkflowMode({
    canEdit: document.permissions.canEdit,
    canPublish: document.permissions.canPublish,
    isPreviewingVersion,
    publishState,
    reviewStatus: document.currentReview?.status,
    restoreState,
    runtimeStatus: document.runtimeStatus,
  });
  const { permissions } = workflowMode;
  const capabilityProfile = getWorkflowCapabilityProfile(document.workflowType);
  const allowedInsertableNodeKinds = capabilityProfile.allowedNodeKinds.filter(canInsertNodeKind);
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
  const publishChecks = useWorkflowPublishChecks(controller.nodes, controller.edges, {
    allowedEntryEventTypes: capabilityProfile.allowedEntryEventTypes,
    allowedNodeKinds: capabilityProfile.allowedNodeKinds,
    resources: validationResources,
    runtimeSupportedNodeKinds: document.capabilitySummary.runtimeSupportedNodeKinds,
  });

  useEffect(() => {
    if (saveState === "saved") {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveState]);

  const {
    activeEdgeInsertMenuId,
    closeCanvasMenus,
    closeCanvasOverlays,
    paletteOpen,
    quickInsertTarget,
    setPaletteOpen,
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
      closeCanvasOverlays();
      return;
    }

    selectNode(nodeId);
    const node = controller.nodes.find((candidate) => candidate.id === nodeId);
    dispatchViewState({
      inspectorOpen: Boolean(node && hasNodeSettings(node.data.kind)),
      type: "select-node",
    });
    closeCanvasOverlays();
  });

  const selectWorkflowEdge = useWorkflowStableCallback((edgeId: string) => {
    selectEdge(edgeId);
    closeCanvasOverlays();
  });

  const navigateFromPublishCheck = useWorkflowStableCallback((nodeId: string) => {
    selectNode(nodeId);
    setCanvasFocusRequest((current) => ({
      nodeId,
      sequence: (current?.sequence ?? 0) + 1,
    }));
    const node = controller.nodes.find((candidate) => candidate.id === nodeId);
    dispatchViewState({
      inspectorOpen: Boolean(node && hasNodeSettings(node.data.kind)),
      type: "navigate-from-check",
    });
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
        openInspector: options.selectNode && result.nodeId ? true : undefined,
        type: "workflow-edited",
      });
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

  const addNode = useWorkflowStableCallback((
    kind: InsertableWorkflowNodeKind,
    position: WorkflowNode["position"],
  ) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.addNode(kind, position);
    commitWorkflowEditResult(result, {
      closeOverlays: false,
      workflowEdited: true,
    });
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
    commitWorkflowEditResult(result);
  });

  const handleDeleteNode = useWorkflowStableCallback((nodeId: string) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.deleteNode(nodeId);
    commitWorkflowEditResult(result);
  });

  const handleDeleteNodes = useWorkflowStableCallback((nodeIds: string[]) => {
    if (!permissions.canEditGraph) {
      return;
    }

    const result = controller.deleteNodes(nodeIds);
    commitWorkflowEditResult(result, {
      clearNodeSelection: true,
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
    allowedInsertableNodeKinds,
    customFields: validationResources?.customFields?.fields,
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

  const submitCurrentDraftForReview = useWorkflowStableCallback(async () => {
    if (!permissions.canPublish) {
      return;
    }

    setPublishAttempted(true);

    if (!publishChecks.publishReady) {
      dispatchViewState({ type: "open-checks" });
      closeCanvasOverlays();
      return;
    }

    closeCanvasOverlays();
    try {
      const result = await submitReview();
      if (result) toast.success("已提交审核");
    } catch (error) {
      toast.error(getWorkflowReviewActionErrorMessage(error));
    }
  });

  const publishApprovedReview = useWorkflowStableCallback(async () => {
    const reviewId = document.currentReview?.id;
    if (!reviewId) return;
    try {
      const result = await publishReview(reviewId);
      if (result) toast.success("发布成功");
    } catch (error) {
      toast.error(getWorkflowReviewActionErrorMessage(error));
    }
  });

  const enablePublishedDocument = useWorkflowStableCallback(async () => {
    try {
      const result = await enableDocument();
      if (result) {
        toast.success("已启用");
        return true;
      }
    } catch (error) {
      toast.error(getWorkflowLifecycleErrorMessage("enable", error));
      return false;
    }
    toast.error("操作失败，请稍后重试");
    return false;
  });

  const pausePublishedDocument = useWorkflowStableCallback(async () => {
    try {
      const result = await pauseDocument();
      if (result) {
        toast.success("已暂停");
        return true;
      }
    } catch (error) {
      toast.error(getWorkflowLifecycleErrorMessage("pause", error));
      return false;
    }
    toast.error("操作失败，请稍后重试");
    return false;
  });

  const resumePublishedDocument = useWorkflowStableCallback(async () => {
    try {
      const result = await resumeDocument();
      if (result) {
        toast.success("已启用");
        return true;
      }
    } catch (error) {
      toast.error(getWorkflowLifecycleErrorMessage("resume", error));
      return false;
    }
    toast.error("操作失败，请稍后重试");
    return false;
  });

  const handleApproveReview = useWorkflowStableCallback(async (comment?: string) => {
    const reviewId = document.currentReview?.id;
    if (!reviewId) return false;
    try {
      const result = await approveReview(reviewId, comment);
      if (result) toast.success("审核通过");
      return Boolean(result);
    } catch (error) {
      toast.error(getWorkflowReviewActionErrorMessage(error));
      return false;
    }
  });

  const handleRejectReview = useWorkflowStableCallback(async (reason: string) => {
    const reviewId = document.currentReview?.id;
    if (!reviewId) return false;
    try {
      const result = await rejectReview(reviewId, reason);
      if (result) toast.success("已驳回审核");
      return Boolean(result);
    } catch (error) {
      toast.error(getWorkflowReviewActionErrorMessage(error));
      return false;
    }
  });

  const handleWithdrawReview = useWorkflowStableCallback(async () => {
    const reviewId = document.currentReview?.id;
    if (!reviewId) return false;
    try {
      const result = await withdrawReview(reviewId);
      if (result) toast.success("已撤回审核");
      return Boolean(result);
    } catch (error) {
      toast.error(getWorkflowReviewActionErrorMessage(error));
      return false;
    }
  });

  const updateWorkflowMetadata = useWorkflowStableCallback(async (metadata: { description: string; name: string }) => {
    try {
      return await updateMetadata(metadata);
    }
    catch {
      toast.error("保存失败，请重试");
      return false;
    }
  });

  const handleNodesChange = useWorkflowStableCallback((changes: NodeChange<WorkflowRenderNode>[]) => {
    if (!permissions.canEditGraph) {
      return;
    }

    controller.onNodesChange(changes);
    controller.flushPendingConfigHistory();
  });

  const handleNodeDragStart: OnNodeDrag<WorkflowRenderNode> = useWorkflowStableCallback((event) => {
    if (!permissions.canMoveNodes) {
      return;
    }

    controller.beginNodeDrag();
  });

  const handleNodeDrag: OnNodeDrag<WorkflowRenderNode> = useWorkflowStableCallback((event, node) => {
    if (!permissions.canMoveNodes) {
      return;
    }

    controller.updateNodeDrag(node.id, node.position);
  });

  const handleNodeDragStop: OnNodeDrag<WorkflowRenderNode> = useWorkflowStableCallback((event, node, draggedNodes) => {
    if (!permissions.canMoveNodes) {
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
  });

  const openVersionHistory = useWorkflowStableCallback(() => {
    dispatchViewState({ type: "open-version-history" });
    closeCanvasOverlays();
  });

  const openReview = useWorkflowStableCallback(() => {
    dispatchViewState({ type: "open-review" });
    closeCanvasOverlays();
  });

  const closeReview = useWorkflowStableCallback(() => {
    dispatchViewState({ type: "close-review" });
  });

  const selectVersionPreview = useWorkflowStableCallback((version: WorkflowVersionHistoryItem) => {
    dispatchViewState({
      type: "select-version-preview",
      version,
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

  const restorePreviewVersion = useWorkflowStableCallback(async (version: WorkflowVersionHistoryItem) => {
    const result = await restoreVersion(version);

    if (!result) {
      return;
    }

    dispatchViewState({ type: "version-restored" });
    clearEdgeSelection();
    clearNodeSelection();
    closeCanvasOverlays();
  });

  const restoreHistoricalReview = useWorkflowStableCallback(async (reviewId: string) => {
    try {
      const result = await restoreReview(reviewId);
      if (!result) return false;
      dispatchViewState({ type: "close-review" });
      clearEdgeSelection();
      clearNodeSelection();
      closeCanvasOverlays();
      toast.success("已还原到指定版本");
      return true;
    } catch (error) {
      toast.error(getWorkflowReviewActionErrorMessage(error));
      return false;
    }
  });

  const checksClose = useCallback(() => dispatchViewState({ type: "close-checks" }), []);
  return {
    canvas: {
      allowedInsertableNodeKinds,
      canRedo: permissions.canUseHistory && controller.canRedo,
      canUndo: permissions.canUseHistory && controller.canUndo,
      canMoveNodes: permissions.canMoveNodes,
      edges: renderedEdges,
      focusRequest: canvasFocusRequest,
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
      onPaletteOpenChange: handlePaletteOpenChange,
      onPaneClick: handlePaneClick,
      onViewportChangeEnd: handleViewportChangeEnd,
      onRedo: redoWorkflowChange,
      onSelectEdge: selectWorkflowEdge,
      onSelectNode: selectWorkflowNode,
      onUndo: undoWorkflowChange,
      paletteOpen,
      viewport: controller.currentViewport,
    },
    checks: {
      ...publishChecks,
      checks: publishChecks.displayChecks,
      isOpen: viewState.checksOpen,
      onClose: checksClose,
      onNavigateToNode: navigateFromPublishCheck,
      publishAttempted,
    },
    document,
    mode: workflowMode.mode,
    permissions,
    readOnlyReason: workflowMode.readOnlyReason,
    inspector: {
      allowedEntryEventTypes: capabilityProfile.allowedEntryEventTypes,
      edges: controller.edges,
      isOpen: viewState.inspectorOpen,
      node: selectedNode,
      nodes: controller.nodes,
      onClose: () => dispatchViewState({ type: "close-inspector" }),
      onNodeChange: updateSelectedNode,
      onRenameNode: handleRenameNode,
      readOnly: !permissions.canEditNodeSettings,
      testContext: {
        draftVersion: document.draftVersion ?? document.revision,
        saveState,
        workflowId: document.id,
      },
    },
    topBar: {
      canEdit: permissions.canEditGraph,
      canPublish: document.permissions.canPublish,
      canRename: document.permissions.canEdit && !isPreviewingVersion,
      canRetrySave: Boolean(saveError),
      description: document.description,
      hasUnpublishedChanges,
      lastSavedAt,
      onOpenVersionHistory: openVersionHistory,
      onOpenReview: openReview,
      onPublishCheck: handlePublishCheck,
      onSubmitReview: submitCurrentDraftForReview,
      onPublish: publishApprovedReview,
      onApproveReview: handleApproveReview,
      onRejectReview: handleRejectReview,
      onWithdrawReview: handleWithdrawReview,
      onEnable: enablePublishedDocument,
      onPause: pausePublishedDocument,
      onResume: resumePublishedDocument,
      currentReview: document.currentReview,
      reviewActionState,
      lifecycleActionState,
      onUpdateMetadata: updateWorkflowMetadata,
      onRetrySave: retrySave,
      publishedAt: document.publishedAt,
      publishError,
      publishState,
      publishReady: publishChecks.publishReady,
      metadataUpdating: metadataUpdateState === "updating",
      runtimeStatus: document.runtimeStatus,
      saveState,
      publishedRevision: document.publishedRevision,
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
      loadReviews: listReviews,
      loadMoreVersions: listVersions,
      loadVersion: getVersion,
      nextCursor: document.versionHistoryNextCursor,
    },
    review: {
      current: document.currentReview,
      isOpen: viewState.activePanel === "review",
      onApprove: handleApproveReview,
      onClose: closeReview,
      onOpen: openReview,
      onReject: handleRejectReview,
      onRestore: restoreHistoricalReview,
      onWithdraw: handleWithdrawReview,
      pending: reviewActionState !== "idle",
    },
  };
}
