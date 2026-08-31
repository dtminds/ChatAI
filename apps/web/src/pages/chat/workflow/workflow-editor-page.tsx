import { ReactFlowProvider } from "@xyflow/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Link, useBlocker, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  getWorkflowCapabilityProfile,
  getWorkflowCustomFieldVariableIds,
  type WorkflowSurface,
  type WorkflowPublishReview,
} from "@chatai/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { WorkflowCanvas } from "./canvas/workflow-canvas";
import { WorkflowChecks } from "./canvas/workflow-checks";
import { WorkflowTopBar } from "./canvas/workflow-topbar";
import { WorkflowReviewPanel } from "./canvas/workflow-review-panel";
import { WorkflowReviewPendingBanner } from "./canvas/workflow-review-pending-banner";
import { WorkflowVersionHistoryPanel } from "./canvas/workflow-version-history";
import { NodeConfigPanel } from "./panels";
import { useWorkflowWorkspace } from "./use-workflow-workspace";
import { getWorkflowDraftRepository } from "./workflow-draft-service";
import type {
  WorkflowDocument,
  WorkflowDraftRepository,
} from "./workflow-draft-service";
import { useWorkflowDocumentResource } from "./workflow-resources";
import { useWorkflowFriendAddWayResource } from "./workflow-friend-add-way-resource";
import { useWorkflowManagedAccountResource } from "./workflow-managed-account-resource";
import {
  WorkflowCustomFieldResourceProvider,
  useWorkflowCustomFieldResource,
} from "./workflow-custom-field-resource";
import { WorkflowDataActions, WorkflowDataPage } from "./workflow-data-page";
import {
  WorkflowCreateDialog,
  type WorkflowCreateInput,
} from "./workflow-create-dialog";
import "@xyflow/react/dist/style.css";
import "./workflow-page.css";
import {
  getWorkflowDocumentPath,
  useWorkflowSurface,
  WorkflowSurfaceProvider,
} from "./workflow-surface";
import { getWorkflowOperationErrorMessage } from "./workflow-error-messages";

export function WorkflowEditorPage({
  repository,
  surface = "chatai",
}: {
  repository?: WorkflowDraftRepository;
  surface?: WorkflowSurface;
} = {}) {
  return (
    <WorkflowSurfaceProvider surface={surface}>
      <WorkflowEditorSurfacePage repository={repository} />
    </WorkflowSurfaceProvider>
  );
}

function WorkflowEditorSurfacePage({ repository: repositoryProp }: {
  repository?: WorkflowDraftRepository;
}) {
  const surface = useWorkflowSurface();
  const repository = repositoryProp ?? getWorkflowDraftRepository(surface.surface);
  const { workflowId } = useParams();

  if (!workflowId) {
    return <WorkflowNewDocumentPage repository={repository} />;
  }

  return <WorkflowDocumentPage repository={repository} workflowId={workflowId} />;
}

function WorkflowDocumentPage({
  repository,
  workflowId,
}: {
  repository: WorkflowDraftRepository;
  workflowId: string;
}) {
  const resource = useWorkflowDocumentResource(workflowId, repository);
  const surface = useWorkflowSurface();

  if (resource.status !== "ready" || !resource.document) {
    return (
      <WorkflowEditorResourceState
        onRetry={resource.status === "error" ? () => void resource.reload() : undefined}
        status={resource.status === "ready" ? "error" : resource.status}
      />
    );
  }

  if (!surface.createWorkflowTypes.includes(resource.document.workflowType)) {
    return <WorkflowEditorResourceState status="not-found" />;
  }

  return (
    <ReactFlowProvider>
      <WorkflowWorkspace
        document={resource.document}
        fullscreen
        key={resource.document.id}
        repository={repository}
      />
    </ReactFlowProvider>
  );
}

function WorkflowNewDocumentPage({ repository }: { repository: WorkflowDraftRepository }) {
  const navigate = useNavigate();
  const surface = useWorkflowSurface();
  const createRequestIdRef = useRef<string | null>(null);
  const [createPending, setCreatePending] = useState(false);

  const createDocument = async (input: WorkflowCreateInput) => {
    if (createPending) return false;
    setCreatePending(true);
    createRequestIdRef.current ??= createWorkflowCreateRequestId();
    try {
      const document = await Promise.resolve(repository.createDocument({
        clientRequestId: createRequestIdRef.current,
        ...input,
      }));
      navigate(getWorkflowDocumentPath(surface, document.id), { replace: true });
      return true;
    }
    catch (error) {
      toast.error(getWorkflowOperationErrorMessage(error));
      return false;
    }
    finally {
      setCreatePending(false);
    }
  };

  return (
    <main className="fixed inset-0 bg-background">
      <WorkflowCreateDialog
        onCreate={createDocument}
        onOpenChange={(open) => {
          if (!open && !createPending) navigate(surface.webBasePath, { replace: true });
        }}
        open
        pending={createPending}
        workflowType={surface.createWorkflowType}
      />
    </main>
  );
}

function WorkflowWorkspace({
  document,
  fullscreen = false,
  repository,
}: {
  document: WorkflowDocument;
  fullscreen?: boolean;
  repository: WorkflowDraftRepository;
}) {
  return (
    <div
      className={cn(
        "workflow-page relative flex h-full min-h-[720px] flex-col bg-[var(--workflow-canvas-bg)]",
        fullscreen && "fixed inset-0 z-50 min-h-svh",
      )}
    >
      <WorkflowWorkspaceContent
        document={document}
        repository={repository}
      />
    </div>
  );
}

function WorkflowWorkspaceContent({
  document,
  repository,
}: {
  document: WorkflowDocument;
  repository: WorkflowDraftRepository;
}) {
  const navigate = useNavigate();
  const surface = useWorkflowSurface();
  const location = useLocation();
  const mode = location.pathname.endsWith("/data") ? "data" : "design";
  const shouldLoadCustomFields = mode === "design"
    || getWorkflowCustomFieldVariableIds(document.publishedDraft).length > 0;
  const customFieldResource = useWorkflowCustomFieldResource(shouldLoadCustomFields);
  const shouldLoadFriendAddWays = mode === "design"
    && getWorkflowCapabilityProfile(document.workflowType)
    .allowedEntryEventTypes.includes("contact.friend_added");
  const friendAddWayResource = useWorkflowFriendAddWayResource(shouldLoadFriendAddWays);
  const workspace = useWorkflowWorkspace(document.id, repository, document, {
    customFields: {
      fields: customFieldResource.fields,
      status: customFieldResource.status,
    },
    friendAddWays: {
      groups: friendAddWayResource.groups,
      status: friendAddWayResource.status,
    },
  });
  const { canvas, checks, document: currentDocument, inspector, review, topBar, versionHistory } = workspace;
  const shouldLoadManagedAccounts = inspector.isOpen
    && inspector.node?.data.kind === "start"
    && "seatIds" in inspector.node.data;
  const managedAccountResource = useWorkflowManagedAccountResource(shouldLoadManagedAccounts);
  const previousInspectorOpenRef = useRef(false);
  const animateInspectorOnMount = inspector.isOpen && !previousInspectorOpenRef.current;
  const canRestoreVersion = currentDocument.permissions.canEdit
    && currentDocument.currentReview?.status !== "pending";
  const [dataRefreshVersion, setDataRefreshVersion] = useState(0);
  const [historyReview, setHistoryReview] = useState<WorkflowPublishReview | null>(null);
  const displayedReview = historyReview ?? (review.isOpen ? review.current : null);
  const displayedReviewVersion = displayedReview?.resultingRevision == null
    ? null
    : versionHistory.versions.find(version => version.revision === displayedReview.resultingRevision) ?? null;
  const closeDisplayedReview = () => {
    if (historyReview) setHistoryReview(null);
    else review.onClose();
  };
  const viewDisplayedReviewVersion = displayedReview?.resultingRevision == null
    ? undefined
    : async () => {
        try {
          const version = displayedReviewVersion
            ?? await versionHistory.loadVersion(displayedReview.resultingRevision!);
          closeDisplayedReview();
          versionHistory.onSelectVersion(version);
          if (mode === "data") navigate(getWorkflowDocumentPath(surface, document.id));
        } catch {
          toast.error("操作失败，请稍后重试");
        }
      }
  useEffect(() => {
    previousInspectorOpenRef.current = inspector.isOpen;
  }, [inspector.isOpen]);
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("panel") !== "review" || !review.current) return;
    review.onOpen();
    searchParams.delete("panel");
    navigate({
      pathname: location.pathname,
      search: searchParams.size ? `?${searchParams.toString()}` : "",
    }, { replace: true });
  }, [location.pathname, location.search, navigate, review.current, review.onOpen]);

  return (
    <WorkflowCustomFieldResourceProvider resource={customFieldResource}>
      <WorkflowTopBar
        canEdit={topBar.canEdit}
        canPublish={topBar.canPublish}
        canRename={topBar.canRename}
        canRetrySave={topBar.canRetrySave}
        description={topBar.description}
        hasUnpublishedChanges={topBar.hasUnpublishedChanges}
        isPreviewingVersion={versionHistory.isPreviewing}
        lastSavedAt={topBar.lastSavedAt}
        metadataUpdating={topBar.metadataUpdating}
        mode={mode}
        onBack={() => navigate(surface.webBasePath)}
        onCloseVersionHistory={versionHistory.onClose}
        onExitPreview={versionHistory.onExitPreview}
        onOpenVersionHistory={topBar.onOpenVersionHistory}
        onPublish={topBar.onPublish}
        onSubmitReview={topBar.onSubmitReview}
        onEnable={topBar.onEnable}
        onPause={topBar.onPause}
        onResume={topBar.onResume}
        onModeChange={(nextMode) => navigate(getWorkflowDocumentPath(
          surface,
          document.id,
          nextMode,
        ))}
        onUpdateMetadata={topBar.onUpdateMetadata}
        onRetrySave={topBar.onRetrySave}
        onRestoreVersion={canRestoreVersion && versionHistory.previewVersion
          ? () => versionHistory.onRestoreVersion(versionHistory.previewVersion!)
          : undefined}
        previewVersionLabel={versionHistory.previewVersion?.name}
        previewVersionMeta={versionHistory.previewVersion
          ? versionHistory.previewVersion.publishedAt
          : undefined}
        publishedAt={topBar.publishedAt}
        publishReady={topBar.publishReady}
        publishState={topBar.publishState}
        currentReview={topBar.currentReview}
        reviewActionState={topBar.reviewActionState}
        lifecycleActionState={topBar.lifecycleActionState}
        publishedRevision={topBar.publishedRevision}
        restoreState={versionHistory.restoreState}
        runtimeStatus={topBar.runtimeStatus}
        saveState={topBar.saveState}
        versionHistoryContent={(
          <WorkflowVersionHistoryPanel
            canRestore={canRestoreVersion}
            currentPreviewVersionId={versionHistory.currentPreviewVersionId}
            loadReviews={versionHistory.loadReviews}
            loadMoreVersions={versionHistory.loadMoreVersions}
            nextVersionCursor={versionHistory.nextCursor}
            onClose={versionHistory.onClose}
            onExitPreview={versionHistory.onExitPreview}
            onRestoreVersion={versionHistory.onRestoreVersion}
            onSelectReview={(selectedReview) => {
              setHistoryReview(selectedReview);
              versionHistory.onClose();
            }}
            onSelectVersion={versionHistory.onSelectVersion}
            restoreState={versionHistory.restoreState}
            versions={versionHistory.versions}
          />
        )}
        versionHistoryOpen={versionHistory.isOpen}
        workflowName={currentDocument.name}
        dataActions={(
          <WorkflowDataActions
            onRefresh={() => setDataRefreshVersion(value => value + 1)}
          />
        )}
      />
      {currentDocument.currentReview?.status === "rejected"
        && currentDocument.currentReview.reviewComment ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm">
            <p className="min-w-0 truncate">
              <span className="font-medium text-destructive">审核驳回：</span>
              <span>{currentDocument.currentReview.reviewComment}</span>
            </p>
            <Button
              onClick={() => {
                setHistoryReview(null);
                review.onOpen();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              查看详情
            </Button>
          </div>
        ) : null}

      {mode === "data" ? (
        <div className="workflow-editor-body relative min-h-0 flex-1 overflow-hidden">
          <WorkflowDataPage
            customFieldResource={customFieldResource}
            document={currentDocument}
            refreshVersion={dataRefreshVersion}
          />
          {displayedReview ? (
            <WorkflowReviewPanel
              onApprove={review.onApprove}
              onClose={closeDisplayedReview}
              onReject={review.onReject}
              onRestore={historyReview
                && historyReview.id !== currentDocument.currentReview?.id
                && historyReview.status !== "pending"
                && historyReview.resultingRevision === null
                && canRestoreVersion
                ? async () => {
                    const restored = await review.onRestore(historyReview.id);
                    if (restored) setHistoryReview(null);
                    return restored;
                  }
                : undefined}
              onViewPublishedVersion={viewDisplayedReviewVersion}
              onWithdraw={review.onWithdraw}
              pending={review.pending}
              review={displayedReview}
            />
          ) : null}
        </div>
      ) : (
        <div
          className="workflow-editor-body relative min-h-0 flex-1 overflow-hidden bg-[var(--workflow-canvas-bg)]"
          data-inspector-open={inspector.isOpen ? "true" : undefined}
        >
          <section className="relative h-full min-h-0 overflow-hidden bg-[var(--workflow-canvas-bg)] max-lg:min-h-[580px]">
            {currentDocument.currentReview?.status === "pending" ? (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-[14] flex justify-center px-3">
                <WorkflowReviewPendingBanner
                  onOpenReview={() => {
                    setHistoryReview(null);
                    topBar.onOpenReview();
                  }}
                />
              </div>
            ) : null}
            <WorkflowCanvas
                allowedInsertableNodeKinds={canvas.allowedInsertableNodeKinds}
                canRedo={canvas.canRedo}
                canUndo={canvas.canUndo}
                canMoveNodes={canvas.canMoveNodes}
                edges={canvas.edges}
                focusRequest={canvas.focusRequest}
                isReadOnly={canvas.isReadOnly}
                nodes={canvas.nodes}
                nextRedoLabel={canvas.nextRedoLabel}
                nextUndoLabel={canvas.nextUndoLabel}
                onAddNode={canvas.onAddNode}
                onArrange={canvas.onArrange}
                onConnect={canvas.onConnect}
                onEdgesChange={canvas.onEdgesChange}
                onIsValidConnection={canvas.onIsValidConnection}
                onNodeDrag={canvas.onNodeDrag}
                onNodeDragStart={canvas.onNodeDragStart}
                onNodeDragStop={canvas.onNodeDragStop}
                onNodeHoverEnd={canvas.onNodeHoverEnd}
                onNodeHoverStart={canvas.onNodeHoverStart}
                onNodesChange={canvas.onNodesChange}
                onPaletteOpenChange={canvas.onPaletteOpenChange}
                onPaneClick={canvas.onPaneClick}
                onRedo={canvas.onRedo}
                onSelectEdge={canvas.onSelectEdge}
                onSelectNode={canvas.onSelectNode}
                onUndo={canvas.onUndo}
                onViewportChangeEnd={canvas.onViewportChangeEnd}
                paletteOpen={canvas.paletteOpen}
                showEditingTools={!canvas.isReadOnly}
                viewport={canvas.viewport}
            />
            {checks.isOpen ? (
              <WorkflowChecks
                  checks={checks.checks}
                  onClose={checks.onClose}
                  onNavigateToNode={checks.onNavigateToNode}
                  publishAttempted={checks.publishAttempted}
              />
            ) : null}
          </section>

          {inspector.isOpen ? (
            <NodeConfigPanel
                allowedEntryEventTypes={inspector.allowedEntryEventTypes}
                animateOnMount={animateInspectorOnMount}
                edges={inspector.edges}
                node={inspector.node}
                nodes={inspector.nodes}
                onClose={inspector.onClose}
                onNodeChange={inspector.onNodeChange}
                onRenameNode={inspector.onRenameNode}
                readOnly={inspector.readOnly}
                resources={{
                  customFields: customFieldResource,
                  friendAddWays: {
                    groups: friendAddWayResource.groups,
                    reload: () => void friendAddWayResource.reload(),
                    status: friendAddWayResource.status,
                  },
                  managedAccounts: {
                    options: managedAccountResource.options,
                    reload: () => void managedAccountResource.reload(),
                    status: managedAccountResource.status,
                  },
                }}
                testContext={inspector.testContext}
                workflowId={currentDocument.id}
            />
          ) : null}
          {displayedReview ? (
            <WorkflowReviewPanel
              onApprove={review.onApprove}
              onClose={closeDisplayedReview}
              onReject={review.onReject}
              onRestore={historyReview
                && historyReview.id !== currentDocument.currentReview?.id
                && historyReview.status !== "pending"
                && historyReview.resultingRevision === null
                && canRestoreVersion
                ? async () => {
                    const restored = await review.onRestore(historyReview.id);
                    if (restored) setHistoryReview(null);
                    return restored;
                  }
                : undefined}
              onViewPublishedVersion={viewDisplayedReviewVersion}
              onWithdraw={review.onWithdraw}
              pending={review.pending}
              review={displayedReview}
            />
          ) : null}
        </div>
      )}
      <WorkflowLeaveGuard enabled={topBar.saveState !== "saved"} />
    </WorkflowCustomFieldResourceProvider>
  );
}

function WorkflowLeaveGuard({ enabled }: { enabled: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    enabled && !isWorkflowModeNavigation(currentLocation.pathname, nextLocation.pathname));
  const blocked = blocker.state === "blocked";

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && blocker.state === "blocked") {
          blocker.reset();
        }
      }}
      open={blocked}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>离开当前页面</AlertDialogTitle>
          <AlertDialogDescription>当前修改尚未保存</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.state === "blocked" && blocker.reset()}>
            继续编辑
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => blocker.state === "blocked" && blocker.proceed()}
            variant="destructive"
          >
            仍然离开
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function isWorkflowModeNavigation(currentPath: string, nextPath: string) {
  const normalize = (path: string) => path.endsWith("/data") ? path.slice(0, -5) : path;
  const currentWorkflowPath = normalize(currentPath);
  return currentWorkflowPath === normalize(nextPath)
    && /^\/(?:chat|embed)\/workflows\/[^/]+$/.test(currentWorkflowPath);
}

function WorkflowEditorResourceState({
  onRetry,
  status,
}: {
  onRetry?: () => void;
  status: "error" | "loading" | "not-found";
}) {
  const surface = useWorkflowSurface();
  if (status === "loading") {
    return (
      <main className="fixed inset-0 flex items-center justify-center gap-2 bg-background text-sm text-muted-foreground" role="status">
        <Spinner />
        <span>正在加载</span>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 flex items-center justify-center bg-background p-6">
      <Empty className="flex-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={AlertCircleIcon} size={20} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>{status === "not-found" ? "内容已不存在" : "加载失败"}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            {onRetry ? <Button onClick={onRetry} type="button">重试</Button> : null}
            <Button asChild variant="outline">
              <Link to={surface.webBasePath}>返回列表</Link>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </main>
  );
}

function createWorkflowCreateRequestId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `workflow-create-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
