import { useState } from "react";
import type { Connection } from "@xyflow/react";
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
import { WorkflowTopBar } from "./workflow/canvas/workflow-topbar";
import { useWorkflowPublishChecks } from "./workflow/checks/publish-checks";
import { NodeConfigPanel } from "./workflow/panels";
import { useWorkflowRun } from "./workflow/run/use-workflow-run";
import { useWorkflowShortcuts } from "./workflow/shortcuts";
import type {
  InsertableMarketingNodeKind,
  InspectorTab,
  MarketingNodeData,
  MarketingNodeKind,
} from "./workflow/types";
import { useWorkflowController } from "./workflow/use-workflow-controller";
import { useWorkflowRenderElements } from "./workflow/use-workflow-render-elements";
import { useWorkflowSelectionState } from "./workflow/use-workflow-selection-state";
import { useWorkflowTransientState } from "./workflow/use-workflow-transient-state";
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
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("settings");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isChecksOpen, setIsChecksOpen] = useState(false);
  const {
    addNode: addWorkflowNode,
    arrangeNodes,
    canRedo,
    canUndo,
    connectNodes: connectWorkflowNodes,
    deleteEdge,
    deleteNode,
    duplicateNode,
    edges,
    insertNodeAfter,
    insertNodeBetween,
    nodes,
    onEdgesChange,
    onNodesChange,
    redo,
    undo,
    updateNodeData,
  } = useWorkflowController();
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
  } = useWorkflowTransientState();
  const { getNodeRun, runNode } = useWorkflowRun();
  const [publishAttempted, setPublishAttempted] = useState(false);
  const {
    clearEdgeSelection,
    handleNodeHoverEnd,
    handleNodeHoverStart,
    hoveredEdgeIds,
    selectEdge,
    selectedEdgeId,
    selectedNode,
    selectedNodeId,
    selectNode,
    setSelectedEdgeId,
    setSelectedNodeId,
  } = useWorkflowSelectionState({
    defaultNodeId: "action-message",
    edges,
    nodes,
  });
  const {
    checks,
    publishReady,
    readyChecks,
    totalChecks,
  } = useWorkflowPublishChecks(nodes, edges);

  const {
    edges: renderedEdges,
    nodes: renderedNodes,
  } = useWorkflowRenderElements({
    activeEdgeInsertMenuId,
    edges,
    hoveredEdgeIds,
    nodes,
    onDeleteEdge: handleDeleteEdge,
    onDeleteNode: handleDeleteNode,
    onDuplicateNode: handleDuplicateNode,
    onInsertNodeAfter: handleInsertNodeAfter,
    onInsertNodeBetween: handleInsertNodeBetween,
    onSelectNode: selectWorkflowNode,
    onToggleEdgeInsertMenu: toggleEdgeInsertMenu,
    onToggleNodeInsertMenu: toggleNodeInsertMenu,
    quickInsertTarget,
    selectedEdgeId,
    selectedNodeId,
  });

  useWorkflowShortcuts({
    canRedo,
    canUndo,
    onDeleteSelection: deleteSelectedNode,
    onDuplicateSelection: duplicateSelectedNode,
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
    updateNodeData(selectedNodeId, patch);
  }

  function undoWorkflowChange() {
    undo();
    closeCanvasMenus();
  }

  function redoWorkflowChange() {
    redo();
    closeCanvasMenus();
  }

  function addNode(kind: MarketingNodeKind) {
    const result = addWorkflowNode(kind);
    handleWorkflowEditResult(result);
  }

  function handleInsertNodeAfter(
    previousNodeId: string,
    kind: InsertableMarketingNodeKind,
    sourceHandle?: string,
  ) {
    const result = insertNodeAfter(previousNodeId, kind, sourceHandle);
    handleWorkflowEditResult(result);
  }

  function handleInsertNodeBetween(
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ) {
    const result = insertNodeBetween(edgeId, sourceNodeId, targetNodeId, kind);
    handleWorkflowEditResult(result);
  }

  function connectNodes(connection: Connection) {
    const result = connectWorkflowNodes(connection);

    if (result) {
      closeCanvasMenus();
      setIsChecksOpen(false);
    }
  }

  function handleDeleteNode(nodeId: string) {
    const result = deleteNode(nodeId);

    if (!result) {
      return;
    }

    closeCanvasMenus();
    setIsChecksOpen(false);
  }

  function handleDuplicateNode(nodeId: string) {
    const result = duplicateNode(nodeId);
    handleWorkflowEditResult(result);
  }

  function handleDeleteEdge(edgeId: string) {
    const result = deleteEdge(edgeId);

    if (!result) {
      return;
    }

    setSelectedEdgeId(null);
    closeCanvasMenus();
    setIsChecksOpen(false);
  }

  function deleteSelectedNode() {
    if (selectedEdgeId) {
      handleDeleteEdge(selectedEdgeId);
      return;
    }

    handleDeleteNode(selectedNodeId);
  }

  function duplicateSelectedNode() {
    if (selectedEdgeId) {
      return;
    }

    handleDuplicateNode(selectedNodeId);
  }

  function handleWorkflowEditResult(result?: { nodeId?: string }) {
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

  function runSelectedNode() {
    if (!selectedNode) {
      return;
    }

    runNode(selectedNode);
    setIsInspectorOpen(true);
    setInspectorTab("run");
  }

  function handlePublishCheck() {
    setPublishAttempted(true);
    setIsChecksOpen(true);
    closeCanvasMenus();
  }

  return (
    <>
      <WorkflowTopBar
        onPublishCheck={handlePublishCheck}
        publishReady={publishReady}
        readyChecks={readyChecks}
        totalChecks={totalChecks}
        workflowName={workflowName}
      />

      <div
        className="workflow-editor-body relative min-h-0 flex-1 bg-[var(--workflow-canvas-bg)]"
        data-inspector-open={isInspectorOpen ? "true" : undefined}
      >
        <section className="relative h-full min-h-0 overflow-hidden bg-[var(--workflow-canvas-bg)] max-lg:min-h-[580px]">
          <WorkflowCanvas
            canRedo={canRedo}
            canUndo={canUndo}
            edges={renderedEdges}
            nodes={renderedNodes}
            onAddNode={addNode}
            onArrange={arrangeNodes}
            onConnect={connectNodes}
            onEdgesChange={onEdgesChange}
            onNodesChange={onNodesChange}
            onOpenVariables={() => {
              setIsInspectorOpen(true);
              setInspectorTab("variables");
              setIsChecksOpen(false);
              clearCanvasSelection();
            }}
            onPaletteOpenChange={(open) => {
              setPaletteOpen(open);
              clearCanvasSelection();
            }}
            onPaneClick={() => {
              clearCanvasSelection();
              setIsChecksOpen(false);
            }}
            onRedo={redoWorkflowChange}
            onNodeHoverEnd={handleNodeHoverEnd}
            onNodeHoverStart={handleNodeHoverStart}
            onSelectEdge={selectWorkflowEdge}
            onSelectNode={selectWorkflowNode}
            onSearchChange={setPaletteQuery}
            onUndo={undoWorkflowChange}
            paletteOpen={paletteOpen}
            searchValue={paletteQuery}
          />
          {isChecksOpen ? (
            <WorkflowChecks
              checks={checks}
              onClose={() => setIsChecksOpen(false)}
              publishAttempted={publishAttempted}
              publishReady={publishReady}
            />
          ) : null}
        </section>

        {isInspectorOpen ? (
          <NodeConfigPanel
            activeTab={inspectorTab}
            lastRun={getNodeRun(selectedNode?.id)}
            node={selectedNode}
            onClose={() => setIsInspectorOpen(false)}
            onNodeChange={updateSelectedNode}
            onRunNode={runSelectedNode}
            onTabChange={setInspectorTab}
          />
        ) : null}
      </div>
    </>
  );
}
