import { ReactFlowProvider } from "@xyflow/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useLocation, useNavigate, useParams } from "react-router-dom";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { WorkflowCanvas } from "./canvas/workflow-canvas";
import { WorkflowChecks } from "./canvas/workflow-checks";
import { WorkflowTopBar } from "./canvas/workflow-topbar";
import { WorkflowVersionHistoryPanel } from "./canvas/workflow-version-history";
import { NodeConfigPanel } from "./panels";
import { useWorkflowWorkspace } from "./use-workflow-workspace";
import { getWorkflowDraftRepository } from "./workflow-draft-service";
import type {
  WorkflowDocument,
  WorkflowDraftRepository,
} from "./workflow-draft-service";
import { useWorkflowDocumentResource } from "./workflow-resources";
import { WorkflowDataActions, WorkflowDataPage } from "./workflow-data-page";
import "@xyflow/react/dist/style.css";
import "./workflow-page.css";

export function WorkflowEditorPage({
  repository = getWorkflowDraftRepository(),
}: {
  repository?: WorkflowDraftRepository;
} = {}) {
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

  if (resource.status !== "ready" || !resource.document) {
    return (
      <WorkflowEditorResourceState
        onRetry={resource.status === "error" ? () => void resource.reload() : undefined}
        status={resource.status === "ready" ? "error" : resource.status}
      />
    );
  }

  return (
    <ReactFlowProvider>
      <WorkflowWorkspace
        document={resource.document}
        fullscreen
        key={resource.document.id}
        onReloadDocument={() => void resource.reload()}
        repository={repository}
      />
    </ReactFlowProvider>
  );
}

function WorkflowNewDocumentPage({ repository }: { repository: WorkflowDraftRepository }) {
  const navigate = useNavigate();
  const createRequestIdRef = useRef(createWorkflowCreateRequestId());
  const createStartedRef = useRef(false);
  const [createError, setCreateError] = useState(false);

  const createDocument = useCallback(() => {
    if (createStartedRef.current) {
      return;
    }

    createStartedRef.current = true;
    setCreateError(false);

    void Promise.resolve(repository.createDocument({
      clientRequestId: createRequestIdRef.current,
    })).then(
      (document) => navigate(`/chat/workflows/${document.id}`, { replace: true }),
      () => {
        createStartedRef.current = false;
        setCreateError(true);
      },
    );
  }, [navigate, repository]);

  useEffect(() => {
    createDocument();
  }, [createDocument]);

  return (
    <WorkflowEditorResourceState
      onRetry={createError ? createDocument : undefined}
      status={createError ? "error" : "loading"}
    />
  );
}

function WorkflowWorkspace({
  document,
  fullscreen = false,
  onReloadDocument,
  repository,
}: {
  document: WorkflowDocument;
  fullscreen?: boolean;
  onReloadDocument?: () => void;
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
        onReloadDocument={onReloadDocument}
        repository={repository}
      />
    </div>
  );
}

function WorkflowWorkspaceContent({
  document,
  onReloadDocument,
  repository,
}: {
  document: WorkflowDocument;
  onReloadDocument?: () => void;
  repository: WorkflowDraftRepository;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useWorkflowWorkspace(document.id, repository, document);
  const { canvas, checks, document: currentDocument, inspector, topBar, versionHistory } = workspace;
  const previousInspectorOpenRef = useRef(false);
  const animateInspectorOnMount = inspector.isOpen && !previousInspectorOpenRef.current;
  const mode = location.pathname.endsWith("/data") ? "data" : "design";
  const [dataRevision, setDataRevision] = useState(currentDocument.publishedRevision);
  const [followPublishedDataRevision, setFollowPublishedDataRevision] = useState(true);
  const [dataRefreshVersion, setDataRefreshVersion] = useState(0);
  const selectedDataVersion = currentDocument.versionHistory.find(item => item.revision === dataRevision)
    ?? currentDocument.currentVersion;
  useEffect(() => {
    previousInspectorOpenRef.current = inspector.isOpen;
  }, [inspector.isOpen]);
  useEffect(() => {
    if (currentDocument.publishedRevision === null) return;
    const selectedRevisionExists = currentDocument.versionHistory
      .some(item => item.revision === dataRevision);
    if (followPublishedDataRevision || !selectedRevisionExists) {
      setDataRevision(currentDocument.publishedRevision);
      if (!selectedRevisionExists) setFollowPublishedDataRevision(true);
    }
  }, [
    currentDocument.publishedRevision,
    currentDocument.versionHistory,
    dataRevision,
    followPublishedDataRevision,
  ]);

  return (
    <>
      <WorkflowTopBar
        canPublish={topBar.canPublish}
        canRename={topBar.canRename}
        canRetrySave={topBar.canRetrySave}
        description={topBar.description}
        hasUnpublishedChanges={topBar.hasUnpublishedChanges}
        isPreviewingVersion={versionHistory.isPreviewing}
        lastSavedAt={topBar.lastSavedAt}
        metadataUpdating={topBar.metadataUpdating}
        mode={mode}
        onBack={() => navigate("/chat/workflows")}
        onCloseVersionHistory={versionHistory.onClose}
        onExitPreview={versionHistory.onExitPreview}
        onOpenVersionHistory={topBar.onOpenVersionHistory}
        onPublish={topBar.onPublish}
        onPublishCheck={topBar.onPublishCheck}
        onReloadDocument={onReloadDocument}
        onModeChange={(nextMode) => navigate(nextMode === "data"
          ? `/chat/workflows/${document.id}/data`
          : `/chat/workflows/${document.id}`)}
        onUpdateMetadata={topBar.onUpdateMetadata}
        onRetrySave={topBar.onRetrySave}
        onRestoreVersion={currentDocument.permissions.canEdit && versionHistory.currentPreviewVersionId
          ? () => versionHistory.onRestoreVersion(versionHistory.currentPreviewVersionId!)
          : undefined}
        previewVersionLabel={versionHistory.previewVersion?.name}
        previewVersionMeta={versionHistory.previewVersion
          ? `${versionHistory.previewVersion.publishedAt} · Revision ${versionHistory.previewVersion.revision}`
          : undefined}
        publishedAt={topBar.publishedAt}
        publishErrorCode={topBar.publishError?.code}
        publishState={topBar.publishState}
        publishReady={topBar.publishReady}
        readyChecks={topBar.readyChecks}
        restoreState={versionHistory.restoreState}
        runtimeStatus={topBar.runtimeStatus}
        saveState={topBar.saveState}
        totalChecks={topBar.totalChecks}
        validatedForActivation={topBar.validatedForActivation}
        versionHistoryContent={(
          <WorkflowVersionHistoryPanel
            currentPreviewVersionId={versionHistory.currentPreviewVersionId}
            onClose={versionHistory.onClose}
            onExitPreview={versionHistory.onExitPreview}
            onRestoreVersion={versionHistory.onRestoreVersion}
            onSelectVersion={versionHistory.onSelectVersion}
            restoreState={versionHistory.restoreState}
            versions={versionHistory.versions}
          />
        )}
        versionHistoryOpen={versionHistory.isOpen}
        workflowName={currentDocument.name}
        dataActions={(
          <WorkflowDataActions
            label={selectedDataVersion
              ? `${dataRevision === currentDocument.publishedRevision ? "当前流程" : "历史流程"} · ${selectedDataVersion.publishedAt}`
              : "当前流程"}
            onRefresh={() => setDataRefreshVersion(value => value + 1)}
            onSelectRevision={(revision) => {
              setDataRevision(revision);
              setFollowPublishedDataRevision(revision === currentDocument.publishedRevision);
            }}
            versions={currentDocument.versionHistory.map(version => ({
              label: `${version.revision === currentDocument.publishedRevision ? "当前流程" : "历史流程"} · ${version.publishedAt}`,
              revision: version.revision,
            }))}
          />
        )}
      />

      {mode === "data" ? (
        <div className="workflow-editor-body relative min-h-0 flex-1 overflow-hidden">
          <WorkflowDataPage
            document={currentDocument}
            refreshVersion={dataRefreshVersion}
            revision={dataRevision ?? undefined}
          />
        </div>
      ) : (
        <div
          className="workflow-editor-body relative min-h-0 flex-1 overflow-hidden bg-[var(--workflow-canvas-bg)]"
          data-inspector-open={inspector.isOpen ? "true" : undefined}
        >
          <section className="relative h-full min-h-0 overflow-hidden bg-[var(--workflow-canvas-bg)] max-lg:min-h-[580px]">
            <WorkflowCanvas
                canRedo={canvas.canRedo}
                canUndo={canvas.canUndo}
                edges={canvas.edges}
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
                viewport={canvas.viewport}
            />
            {checks.isOpen ? (
              <WorkflowChecks
                  checks={checks.checks}
                  onClose={checks.onClose}
                  onNavigateToNode={checks.onNavigateToNode}
                  publishAttempted={checks.publishAttempted}
                  publishReady={checks.publishReady}
              />
            ) : null}
          </section>

          {inspector.isOpen && !versionHistory.isPreviewing ? (
            <NodeConfigPanel
                animateOnMount={animateInspectorOnMount}
                edges={inspector.edges}
                node={inspector.node}
                nodes={inspector.nodes}
                onClose={inspector.onClose}
                onNodeChange={inspector.onNodeChange}
                onRenameNode={inspector.onRenameNode}
            />
          ) : null}
        </div>
      )}
      <WorkflowLeaveGuard enabled={topBar.saveState !== "saved"} />
    </>
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
    && /^\/chat\/workflows\/[^/]+$/.test(currentWorkflowPath);
}

function WorkflowEditorResourceState({
  onRetry,
  status,
}: {
  onRetry?: () => void;
  status: "error" | "loading" | "not-found";
}) {
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
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={AlertCircleIcon} size={20} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>{status === "not-found" ? "Workflow 不存在" : "Workflow 加载失败"}</EmptyTitle>
          <EmptyDescription>{status === "not-found" ? "该 Workflow 可能已被删除" : "请重试"}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {onRetry ? <Button onClick={onRetry} type="button">重试</Button> : null}
          <Button asChild variant="outline">
            <Link to="/chat/workflows">返回列表</Link>
          </Button>
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
