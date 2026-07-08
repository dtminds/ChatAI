import { ReactFlowProvider } from "@xyflow/react";
import {
  Add01Icon,
  Search01Icon,
  WorkflowSquare01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AiHostingLayout } from "./ai-hosting-layout";
import { WorkflowCanvas } from "./workflow/canvas/workflow-canvas";
import { WorkflowChecks } from "./workflow/canvas/workflow-checks";
import { WorkflowRunHistoryPanel } from "./workflow/canvas/workflow-run-history";
import { WorkflowTopBar } from "./workflow/canvas/workflow-topbar";
import { WorkflowVersionHistoryPanel } from "./workflow/canvas/workflow-version-history";
import { NodeConfigPanel } from "./workflow/panels";
import { useWorkflowWorkspace } from "./workflow/use-workflow-workspace";
import {
  getWorkflowName,
  workflowListItems,
} from "./workflow/workflow-list-data";
import "@xyflow/react/dist/style.css";
import "./agent-workflow-page.css";

export function AgentWorkflowPage() {
  return <AgentWorkflowListPage />;
}

export function AgentWorkflowListPage() {
  return (
    <AiHostingLayout
      title="Workflow"
    >
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Workflow</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              管理营销旅程，点击新建或编辑进入全屏画布
            </p>
          </div>
          <Button asChild className="h-9 gap-1.5 rounded-lg px-3 text-sm">
            <Link rel="noopener noreferrer" target="_blank" to="/chat/ai-hosting/workflows/new">
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
              新建 Workflow
            </Link>
          </Button>
        </div>

        <div className="rounded-[12px] border bg-background shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="relative w-full max-w-sm">
              <HugeiconsIcon
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                icon={Search01Icon}
                size={15}
                strokeWidth={1.8}
              />
              <Input
                aria-label="搜索 Workflow"
                className="h-8 rounded-lg pl-8 text-sm"
                placeholder="搜索 Workflow"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{workflowListItems.length} 个流程</Badge>
              <span>自动保存草稿</span>
            </div>
          </div>

          <div className="divide-y">
            {workflowListItems.map((workflow) => (
              <article
                className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(0,1.5fr)_0.8fr_0.8fr_0.7fr_auto] lg:items-center"
                key={workflow.id}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <HugeiconsIcon icon={WorkflowSquare01Icon} size={16} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold">{workflow.name}</h2>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{workflow.trigger}</p>
                    </div>
                  </div>
                </div>
                <MetricPill label="进入" value={workflow.entered} />
                <MetricPill label="转化" value={workflow.conversion} />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge
                    className="rounded-md"
                    variant={workflow.status === "Published" ? "default" : "secondary"}
                  >
                    {workflow.status}
                  </Badge>
                  <span>{workflow.nodes} 节点</span>
                </div>
                <div className="flex items-center justify-between gap-3 lg:justify-end">
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{workflow.updatedAt}</div>
                    <div className="mt-0.5">{workflow.owner}</div>
                  </div>
                  <Button asChild className="h-8 rounded-lg px-2.5 text-xs" variant="outline">
                    <Link rel="noopener noreferrer" target="_blank" to={`/chat/ai-hosting/workflows/${workflow.id}`}>编辑</Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </AiHostingLayout>
  );
}

export function AgentWorkflowEditorPage() {
  const { workflowId } = useParams();
  const workflowName = getWorkflowName(workflowId);

  return (
    <ReactFlowProvider>
      <WorkflowWorkspace fullscreen workflowName={workflowName} />
    </ReactFlowProvider>
  );
}

function WorkflowWorkspace({
  fullscreen = false,
  workflowName = "新人转化旅程",
}: {
  fullscreen?: boolean;
  workflowName?: string;
}) {
  return (
    <div
      className={cn(
        "agent-workflow-page relative flex h-full min-h-[720px] flex-col bg-[var(--workflow-canvas-bg)]",
        fullscreen && "fixed inset-0 z-50 min-h-svh",
      )}
    >
      <WorkflowWorkspaceContent workflowName={workflowName} />
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--workflow-soft)] px-2 py-1.5 text-xs">
      <div className="font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 text-muted-foreground">{label}</div>
    </div>
  );
}

function WorkflowWorkspaceContent({
  workflowName,
}: {
  workflowName: string;
}) {
  const { workflowId } = useParams();
  const workspace = useWorkflowWorkspace(workflowId);
  const { canvas, checks, document, inspector, runHistory, topBar, versionHistory } = workspace;

  return (
    <>
      <WorkflowTopBar
        isPreviewingVersion={versionHistory.isPreviewing}
        isViewingRunHistory={runHistory.isViewing}
        lastSavedAt={topBar.lastSavedAt}
        onExitPreview={versionHistory.onExitPreview}
        onExitRunHistory={runHistory.onExitHistory}
        onOpenRunHistory={topBar.onOpenRunHistory}
        onOpenVersionHistory={topBar.onOpenVersionHistory}
        onPublish={topBar.onPublish}
        onPublishCheck={topBar.onPublishCheck}
        onRestoreVersion={versionHistory.currentPreviewVersionId
            ? () => versionHistory.onRestoreVersion(versionHistory.currentPreviewVersionId!)
            : undefined}
        onRunWorkflow={topBar.onRunWorkflow}
        onStopWorkflowRun={topBar.onStopWorkflowRun}
        previewRunLabel={runHistory.historyRun?.title}
        previewRunMeta={runHistory.historyRun
          ? `${runHistory.historyRun.finishedAt || runHistory.historyRun.createdAt} · ${runHistory.historyRun.status}`
          : undefined}
        previewVersionLabel={versionHistory.previewVersion?.name}
        previewVersionMeta={versionHistory.previewVersion
          ? `${versionHistory.previewVersion.publishedAt} · Revision ${versionHistory.previewVersion.revision}`
          : undefined}
        publishedAt={topBar.publishedAt}
        publishState={topBar.publishState}
        publishReady={topBar.publishReady}
        readyChecks={topBar.readyChecks}
        restoreState={versionHistory.restoreState}
        runningState={topBar.runningState}
        saveState={topBar.saveState}
        totalChecks={topBar.totalChecks}
        workflowName={document.name || workflowName}
      />

      <div
        className="workflow-editor-body relative min-h-0 flex-1 bg-[var(--workflow-canvas-bg)]"
        data-inspector-open={inspector.isOpen ? "true" : undefined}
        data-run-panel-open={runHistory.isOpen ? "true" : undefined}
        data-version-panel-open={versionHistory.isOpen ? "true" : undefined}
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
            onNodesChange={canvas.onNodesChange}
            onOpenVariables={canvas.onOpenVariables}
            onPaletteOpenChange={canvas.onPaletteOpenChange}
            onPaneClick={canvas.onPaneClick}
            onRedo={canvas.onRedo}
            onNodeDrag={canvas.onNodeDrag}
            onNodeDragStart={canvas.onNodeDragStart}
            onNodeDragStop={canvas.onNodeDragStop}
            onNodeHoverEnd={canvas.onNodeHoverEnd}
            onNodeHoverStart={canvas.onNodeHoverStart}
            onSelectEdge={canvas.onSelectEdge}
            onSelectNode={canvas.onSelectNode}
            onSearchChange={canvas.onSearchChange}
            onUndo={canvas.onUndo}
            onViewportChangeEnd={canvas.onViewportChangeEnd}
            paletteOpen={canvas.paletteOpen}
            searchValue={canvas.searchValue}
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
          {versionHistory.isOpen ? (
            <WorkflowVersionHistoryPanel
              currentPreviewVersionId={versionHistory.currentPreviewVersionId}
              onClose={versionHistory.onClose}
              onExitPreview={versionHistory.onExitPreview}
              onRestoreVersion={versionHistory.onRestoreVersion}
              onSelectVersion={versionHistory.onSelectVersion}
              restoreState={versionHistory.restoreState}
              versions={versionHistory.versions}
            />
          ) : null}
          {runHistory.isOpen ? (
            <WorkflowRunHistoryPanel
              currentRunId={runHistory.currentHistoryRunId}
              onClose={runHistory.onClose}
              onExitHistory={runHistory.onExitHistory}
              onSelectRun={runHistory.onSelectRun}
              runs={runHistory.runs}
            />
          ) : null}
        </section>

        {inspector.isOpen && !versionHistory.isPreviewing ? (
          <NodeConfigPanel
            activeTab={inspector.activeTab}
            edges={inspector.edges}
            lastRun={inspector.lastRun}
            node={inspector.node}
            onClose={inspector.onClose}
            onNodeChange={inspector.onNodeChange}
            onRunNode={inspector.onRunNode}
            onTabChange={inspector.onTabChange}
            readOnlyRunMode={runHistory.isViewing}
            variables={inspector.variables}
          />
        ) : null}
      </div>
    </>
  );
}
