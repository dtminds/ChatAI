import { useEffect, useMemo, useState } from "react";
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
import {
  buildPublishChecks,
} from "./workflow/graph";
import { NodeConfigPanel } from "./workflow/panels";
import { useWorkflowShortcuts } from "./workflow/shortcuts";
import type {
  InsertableMarketingNodeKind,
  InspectorTab,
  MarketingEdgeHighlightState,
  MarketingNodeData,
  MarketingNodeKind,
  MarketingWorkflowNode,
  MarketingWorkflowRenderEdge,
  MarketingWorkflowRenderNode,
  NodeRunRecord,
  QuickInsertTarget,
} from "./workflow/types";
import { useWorkflowController } from "./workflow/use-workflow-controller";
import "@xyflow/react/dist/style.css";
import "./agent-workflow-page.css";

const workflowListItems = [
  {
    conversion: "18.4%",
    entered: "124.8万",
    id: "newcomer-conversion",
    name: "新人转化旅程",
    nodes: 8,
    owner: "运营主管",
    status: "Draft",
    trigger: "近 30 天新入会且未首购客户",
    updatedAt: "今天 18:20",
  },
  {
    conversion: "23.1%",
    entered: "86.3万",
    id: "vip-reactivation",
    name: "会员复购唤醒",
    nodes: 12,
    owner: "增长运营",
    status: "Published",
    trigger: "90 天未复购会员",
    updatedAt: "昨天 21:04",
  },
  {
    conversion: "9.7%",
    entered: "42.6万",
    id: "live-follow-up",
    name: "直播后跟进",
    nodes: 6,
    owner: "直播运营",
    status: "Paused",
    trigger: "直播间互动但未下单客户",
    updatedAt: "7月4日 16:12",
  },
] as const;

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
  const workflowName =
    workflowListItems.find((workflow) => workflow.id === workflowId)?.name ??
    "新人转化旅程";

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
  const [selectedNodeId, setSelectedNodeId] = useState("action-message");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isChecksOpen, setIsChecksOpen] = useState(false);
  const [activeEdgeInsertMenuId, setActiveEdgeInsertMenuId] = useState<string | null>(null);
  const [quickInsertTarget, setQuickInsertTarget] = useState<QuickInsertTarget | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const {
    addNode: addWorkflowNode,
    arrangeNodes,
    canRedo,
    canUndo,
    connectNodes: connectWorkflowNodes,
    deleteEdge,
    deleteNode,
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
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [runRecords, setRunRecords] = useState<Record<string, NodeRunRecord>>({});
  const [publishAttempted, setPublishAttempted] = useState(false);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const checks = useMemo(() => buildPublishChecks(nodes, edges), [nodes, edges]);
  const readyChecks = checks.filter((check) => check.status === "ready").length;
  const publishReady = readyChecks === checks.length;

  useEffect(() => {
    if (!nodes.length || nodes.some((node) => node.id === selectedNodeId)) {
      return;
    }

    setSelectedNodeId(nodes[0].id);
  }, [nodes, selectedNodeId]);
  const hoveredEdgeIds = useMemo(() => {
    if (!hoveredNodeId) {
      return null;
    }

    return new Set(
      edges
        .filter((edge) => edge.source === hoveredNodeId || edge.target === hoveredNodeId)
        .map((edge) => edge.id),
    );
  }, [edges, hoveredNodeId]);

  const decoratedEdges = useMemo<MarketingWorkflowRenderEdge[]>(
    () =>
      edges.map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdgeId,
        data: {
          ...edge.data,
          highlightState: getEdgeHighlightState(edge.id, hoveredEdgeIds),
          insertMenuOpen: edge.id === activeEdgeInsertMenuId,
          onDelete: handleDeleteEdge,
          onInsertBetween: handleInsertNodeBetween,
          onToggleInsertMenu: (edgeId: string) => {
            setQuickInsertTarget(null);
            setActiveEdgeInsertMenuId((currentEdgeId) => (currentEdgeId === edgeId ? null : edgeId));
          },
        },
      })),
    [activeEdgeInsertMenuId, edges, hoveredEdgeIds, selectedEdgeId],
  );

  const decoratedNodes = useMemo<MarketingWorkflowRenderNode[]>(
    () =>
      nodes.map((node) => {
        const isSelected = node.id === selectedNodeId;

        return {
          ...node,
          selected: isSelected,
          zIndex: isSelected ? 20 : undefined,
          data: {
            ...node.data,
            insertMenuOpen: node.id === quickInsertTarget?.nodeId,
            insertMenuSourceHandle: node.id === quickInsertTarget?.nodeId
              ? quickInsertTarget.sourceHandle
              : undefined,
            onDelete: handleDeleteNode,
            onInsertAfter: handleInsertNodeAfter,
            onSelect: selectWorkflowNode,
            onToggleInsertMenu: (nodeId: string, sourceHandle?: string) => {
              setActiveEdgeInsertMenuId(null);
              setQuickInsertTarget((currentTarget) =>
                currentTarget?.nodeId === nodeId && currentTarget.sourceHandle === sourceHandle
                  ? null
                  : { nodeId, sourceHandle },
              );
            },
            selected: isSelected,
          },
        };
      }),
    [nodes, quickInsertTarget, selectedNodeId],
  );

  useWorkflowShortcuts({
    canRedo,
    canUndo,
    onDeleteSelection: deleteSelectedNode,
    onRedo: redoWorkflowChange,
    onUndo: undoWorkflowChange,
  });

  function selectWorkflowNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setIsInspectorOpen(true);
    setIsChecksOpen(false);
    closeCanvasMenus();
  }

  function selectWorkflowEdge(edgeId: string) {
    setSelectedEdgeId(edgeId);
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

  function closeCanvasMenus() {
    setActiveEdgeInsertMenuId(null);
    setQuickInsertTarget(null);
  }

  function clearCanvasSelection() {
    setSelectedEdgeId(null);
    closeCanvasMenus();
  }

  function runSelectedNode() {
    if (!selectedNode) {
      return;
    }

    setRunRecords((currentRecords) => ({
      ...currentRecords,
      [selectedNode.id]: createNodeRunRecord(selectedNode),
    }));
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
        totalChecks={checks.length}
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
            edges={decoratedEdges}
            nodes={decoratedNodes}
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
            onNodeHoverEnd={() => setHoveredNodeId(null)}
            onNodeHoverStart={(nodeId) => {
              setHoveredNodeId((currentNodeId) => (currentNodeId === nodeId ? currentNodeId : nodeId));
            }}
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
            lastRun={selectedNode ? runRecords[selectedNode.id] : undefined}
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

function getEdgeHighlightState(
  edgeId: string,
  highlightedEdgeIds: Set<string> | null,
): MarketingEdgeHighlightState | undefined {
  if (!highlightedEdgeIds) {
    return undefined;
  }

  return highlightedEdgeIds.has(edgeId) ? "connected" : "dimmed";
}

function createNodeRunRecord(node: MarketingWorkflowNode): NodeRunRecord {
  const input = JSON.stringify(
    {
      audience: node.data.audience ?? "当前节点继承上游客户",
      event: node.data.kind,
      nodeId: node.id,
      summary: node.data.summary,
    },
    null,
    2,
  );
  const output = JSON.stringify(
    {
      metric: node.data.metric,
      next: node.data.kind === "goal" ? "journey_exit" : "continue",
      title: node.data.title,
    },
    null,
    2,
  );

  return {
    durationMs: 84 + node.id.length * 7,
    finishedAt: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date()),
    input,
    logs: [
      "读取上游客户上下文",
      "校验节点配置",
      node.data.kind === "ai" ? "匹配 Agent 与知识库策略" : "生成下一步执行结果",
    ],
    output,
    status: "succeeded",
  };
}
