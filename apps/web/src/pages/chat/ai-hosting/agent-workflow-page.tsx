import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Connection,
  EdgeChange,
  NodeChange,
  OnEdgesChange,
  OnNodesChange,
} from "@xyflow/react";
import {
  Background,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import {
  Add01Icon,
  AlertCircleIcon,
  ArrangeIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  FlowConnectionIcon,
  PlayIcon,
  Redo03Icon,
  Search01Icon,
  Settings02Icon,
  SquareArrowExpand01Icon,
  Tick02Icon,
  Undo03Icon,
  WorkflowSquare01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AiHostingLayout } from "./ai-hosting-layout";
import {
  WORKFLOW_LAYOUT_X_GAP,
  WORKFLOW_MAX_ZOOM,
  WORKFLOW_MIN_ZOOM,
  workflowZoomOptions,
} from "./workflow/constants";
import { MarketingBezierEdge } from "./workflow/canvas/marketing-edge";
import { paletteItems } from "./workflow/node-definitions";
import {
  arrangeWorkflowNodes,
  buildPublishChecks,
  createEdge,
  createInitialEdges,
  createInitialNodes,
  createNodeFromKind,
  findLastActionNodeId,
  getAfterNodesInSameBranch,
  getBranchHandleLabel,
  getBranchInsertY,
  getNodeIdSet,
  shiftNodesRight,
} from "./workflow/graph";
import { useWorkflowHistory } from "./workflow/history";
import { getInsertMenuTop, getWorkflowNodeWidth } from "./workflow/layout";
import { MarketingNodeCard } from "./workflow/nodes";
import { NodeConfigPanel } from "./workflow/panels";
import type {
  InsertableMarketingNodeKind,
  InspectorTab,
  MarketingEdgeHighlightState,
  MarketingNodeData,
  MarketingNodeKind,
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
  MarketingWorkflowRenderEdge,
  MarketingWorkflowRenderNode,
  NodeRunRecord,
  QuickInsertTarget,
} from "./workflow/types";
import "@xyflow/react/dist/style.css";
import "./agent-workflow-page.css";

const nodeTypes = {
  marketing: MarketingNodeCard,
};

const edgeTypes = {
  marketing: MarketingBezierEdge,
};

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
      <WorkflowDemoWorkspace fullscreen workflowName={workflowName} />
    </ReactFlowProvider>
  );
}

function WorkflowDemoWorkspace({
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

function WorkflowWorkspaceContent({
  workflowName,
}: {
  workflowName: string;
}) {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("settings");
  const [selectedNodeId, setSelectedNodeId] = useState("action-message");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isChecksOpen, setIsChecksOpen] = useState(false);
  const [quickInsertTarget, setQuickInsertTarget] = useState<QuickInsertTarget | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const {
    canRedo,
    canUndo,
    commitDraft,
    currentDraft,
    redo,
    replaceDraft,
    undo,
  } = useWorkflowHistory(() => ({
    edges: createInitialEdges(),
    nodes: createInitialNodes(),
  }));
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [runRecords, setRunRecords] = useState<Record<string, NodeRunRecord>>({});
  const [publishAttempted, setPublishAttempted] = useState(false);
  const { edges, nodes } = currentDraft;
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
        data: {
          ...edge.data,
          highlightState: getEdgeHighlightState(edge.id, hoveredEdgeIds),
          onInsertBetween: insertNodeBetween,
        },
      })),
    [edges, hoveredEdgeIds, nodes],
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
            onInsertAfter: insertNodeAfter,
            onSelect: selectWorkflowNode,
            onToggleInsertMenu: (nodeId: string, sourceHandle?: string) => {
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
    [edges, nodes, quickInsertTarget, selectedNodeId],
  );

  function selectWorkflowNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setIsInspectorOpen(true);
    setIsChecksOpen(false);
    setQuickInsertTarget(null);
  }

  const onNodesChange: OnNodesChange<MarketingWorkflowRenderNode> = useCallback(
    (changes: NodeChange<MarketingWorkflowRenderNode>[]) => {
      replaceDraft((draft) => ({
        ...draft,
        nodes: applyNodeChanges(changes as NodeChange<MarketingWorkflowNode>[], draft.nodes),
      }));
    },
    [replaceDraft],
  );

  const onEdgesChange: OnEdgesChange<MarketingWorkflowRenderEdge> = useCallback(
    (changes: EdgeChange<MarketingWorkflowRenderEdge>[]) => {
      replaceDraft((draft) => ({
        ...draft,
        edges: applyEdgeChanges(changes as EdgeChange<MarketingWorkflowEdge>[], draft.edges),
      }));
    },
    [replaceDraft],
  );

  function updateSelectedNode(patch: Partial<MarketingNodeData>) {
    commitDraft(
      "node:config-change",
      (draft) => ({
        ...draft,
        nodes: draft.nodes.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            : node,
        ),
      }),
      {
        nodeId: selectedNodeId,
        nodeTitle: selectedNode?.data.title,
      },
    );
  }

  function undoWorkflowChange() {
    undo();
    setQuickInsertTarget(null);
  }

  function redoWorkflowChange() {
    redo();
    setQuickInsertTarget(null);
  }

  function addNode(kind: MarketingNodeKind) {
    if (kind === "trigger" || kind === "goal") {
      return;
    }

    insertNodeAfter(findLastActionNodeId(nodes, edges), kind);
    setPaletteOpen(false);
  }

  function insertNodeAfter(
    previousNodeId: string,
    kind: InsertableMarketingNodeKind,
    sourceHandle?: string,
  ) {
    const nodeId = `${kind}-${Date.now()}`;
    const previousNode = nodes.find((node) => node.id === previousNodeId);
    const replacedEdge = edges.find((edge) =>
      edge.source === previousNodeId
      && (sourceHandle ? edge.sourceHandle === sourceHandle : !edge.sourceHandle),
    );
    const nextNodeId = replacedEdge?.target ?? "goal";
    const nextNode = nodes.find((node) => node.id === nextNodeId);
    const nodesToShift = replacedEdge
      ? getAfterNodesInSameBranch(nodes, edges, nextNodeId)
      : [];
    const shiftedNodeIds = getNodeIdSet(nodesToShift);
    const node = {
      ...createNodeFromKind(kind, nodeId, nodes.length),
      position: {
        x: nextNode?.position.x ?? (previousNode?.position.x ?? 0) + WORKFLOW_LAYOUT_X_GAP,
        y:
          nextNode?.position.y
          ?? (previousNode?.data.kind === "branch"
            ? getBranchInsertY(previousNode.position.y, sourceHandle)
            : previousNode?.position.y ?? 0),
      },
    };

    commitDraft(
      replacedEdge ? "node:insert" : "node:add",
      (draft) => ({
        edges: [
          ...draft.edges.filter(
            (edge) => edge.id !== replacedEdge?.id,
          ),
          createEdge(previousNodeId, nodeId, replacedEdge?.data?.label ?? getBranchHandleLabel(sourceHandle), {
            sourceHandle: replacedEdge?.sourceHandle ?? sourceHandle,
          }),
          createEdge(nodeId, nextNodeId, undefined, {
            targetHandle: replacedEdge?.targetHandle,
          }),
        ],
        nodes: [...shiftNodesRight(draft.nodes, shiftedNodeIds), node],
      }),
      {
        nodeId,
        nodeTitle: node.data.title,
      },
    );
    setSelectedNodeId(nodeId);
    setIsInspectorOpen(true);
    setQuickInsertTarget(null);
    setPaletteOpen(false);
    setIsChecksOpen(false);
  }

  function insertNodeBetween(
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ) {
    const nodeId = `${kind}-${Date.now()}`;
    const sourceNode = nodes.find((node) => node.id === sourceNodeId);
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    const replacedEdge = edges.find((edge) => edge.id === edgeId);
    const nodesToShift = getAfterNodesInSameBranch(nodes, edges, targetNodeId);
    const shiftedNodeIds = getNodeIdSet(nodesToShift);
    const node = {
      ...createNodeFromKind(kind, nodeId, nodes.length),
      position: {
        x: targetNode?.position.x ?? (sourceNode?.position.x ?? 0) + WORKFLOW_LAYOUT_X_GAP,
        y: targetNode?.position.y ?? sourceNode?.position.y ?? 0,
      },
    };

    commitDraft(
      "node:insert",
      (draft) => ({
        edges: [
          ...draft.edges.filter((edge) => edge.id !== edgeId),
          createEdge(sourceNodeId, nodeId, replacedEdge?.data?.label, {
            sourceHandle: replacedEdge?.sourceHandle,
            targetHandle: replacedEdge?.targetHandle,
          }),
          createEdge(nodeId, targetNodeId),
        ],
        nodes: [...shiftNodesRight(draft.nodes, shiftedNodeIds), node],
      }),
      {
        edgeId,
        nodeId,
        nodeTitle: node.data.title,
      },
    );
    setSelectedNodeId(nodeId);
    setIsInspectorOpen(true);
    setQuickInsertTarget(null);
    setPaletteOpen(false);
    setIsChecksOpen(false);
  }

  function connectNodes(connection: Connection) {
    const { source, sourceHandle, target, targetHandle } = connection;

    if (!source || !target || source === target) {
      return;
    }

    if (
      edges.some((edge) =>
        edge.source === source
        && edge.sourceHandle === (sourceHandle ?? undefined)
        && edge.target === target
        && edge.targetHandle === (targetHandle ?? undefined),
      )
    ) {
      return;
    }

    commitDraft(
      "edge:connect",
      (draft) => ({
        ...draft,
        edges: [
          ...draft.edges,
          createEdge(source, target, undefined, { sourceHandle, targetHandle }),
        ],
      }),
      {
        nodeId: source,
      },
    );
    setQuickInsertTarget(null);
    setIsChecksOpen(false);
  }

  function arrangeNodes() {
    commitDraft("layout:organize", (draft) => ({
      ...draft,
      nodes: arrangeWorkflowNodes(draft.nodes, draft.edges),
    }));
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
            }}
            onPaletteOpenChange={setPaletteOpen}
            onPaneClick={() => {
              setQuickInsertTarget(null);
              setIsChecksOpen(false);
            }}
            onRedo={redoWorkflowChange}
            onNodeHoverEnd={() => setHoveredNodeId(null)}
            onNodeHoverStart={(nodeId) => {
              setHoveredNodeId((currentNodeId) => (currentNodeId === nodeId ? currentNodeId : nodeId));
            }}
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

function WorkflowTopBar({
  onPublishCheck,
  publishReady,
  readyChecks,
  totalChecks,
  workflowName,
}: {
  onPublishCheck: () => void;
  publishReady: boolean;
  readyChecks: number;
  totalChecks: number;
  workflowName: string;
}) {
  return (
    <header className="workflow-canvas-topbar">
      <div className="workflow-canvas-status">
        <span>自动保存</span>
        <span className="workflow-canvas-status-separator" />
        <span className="truncate">{workflowName}</span>
      </div>

      <div />

      <div className="workflow-canvas-actions" aria-label="Workflow 操作">
        <Button
          className="workflow-topbar-button workflow-topbar-publish"
          onClick={onPublishCheck}
          type="button"
          variant={publishReady ? "default" : "secondary"}
        >
          <HugeiconsIcon
            icon={publishReady ? CheckmarkCircle02Icon : AlertCircleIcon}
            size={16}
            strokeWidth={1.8}
          />
          <span>
            发布检查 {readyChecks}/{totalChecks}
          </span>
        </Button>
      </div>
    </header>
  );
}

function WorkflowPalette({
  onClose,
  onAddNode,
  onSearchChange,
  searchValue,
}: {
  onClose?: () => void;
  onAddNode: (kind: MarketingNodeKind) => void;
  onSearchChange: (value: string) => void;
  searchValue: string;
}) {
  const normalizedQuery = searchValue.trim().toLowerCase();
  const visiblePaletteItems = paletteItems.filter((item) => {
    if (!normalizedQuery) {
      return true;
    }

    return `${item.label} ${item.description}`.toLowerCase().includes(normalizedQuery);
  });

  return (
    <aside
      aria-label="节点库"
      className="workflow-sidebar workflow-floating-palette flex min-h-0 flex-col bg-background"
      role="region"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--workflow-border)] px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold">Blocks</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">选择节点加入当前流程</p>
        </div>
        {onClose ? (
          <button
            aria-label="关闭节点库"
            className="workflow-floating-palette-close"
            onClick={onClose}
            type="button"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
      <div className="border-b border-[var(--workflow-border)] px-3 py-3">
        <div className="relative">
          <HugeiconsIcon
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            icon={Search01Icon}
            size={15}
            strokeWidth={1.8}
          />
          <Input
            aria-label="搜索节点"
            className="h-8 rounded-lg border-[var(--workflow-border)] bg-[var(--workflow-soft)] pl-8 text-xs shadow-none"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索节点"
            value={searchValue}
          />
        </div>
      </div>

      <section className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold text-muted-foreground">节点</h3>
          <Badge className="h-5 rounded-md px-1.5 text-[11px]" variant="secondary">
            {visiblePaletteItems.length}
          </Badge>
        </div>

        <div className="mb-3 rounded-xl border border-[var(--workflow-border)] bg-[var(--workflow-soft)] p-2">
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="flex size-6 items-center justify-center rounded-lg bg-background text-primary shadow-xs">
              <HugeiconsIcon icon={FlowConnectionIcon} size={14} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">新人转化</div>
              <div className="truncate text-[11px] text-muted-foreground">124.8 万进入 · 18.4% 目标</div>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          {visiblePaletteItems.map((item) => (
            <button
              aria-label={`添加 ${item.label}节点`}
              className="group flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
              key={item.id}
              onClick={() => {
                onAddNode(item.id);
                onClose?.();
              }}
              type="button"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--workflow-soft)] text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                <HugeiconsIcon icon={item.icon} size={15} strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </button>
          ))}
          {visiblePaletteItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--workflow-border)] bg-card px-3 py-6 text-center text-xs text-muted-foreground">
              未找到匹配节点
            </div>
          ) : null}
        </div>
      </section>

      <section className="workflow-palette-preview border-t border-[var(--workflow-border)] p-2">
        <div className="rounded-xl border border-[var(--workflow-border)] bg-[var(--workflow-panel-section)] p-2 shadow-xs">
          <div className="flex items-center gap-2 px-0.5 text-xs font-medium">
            <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
            <span>Run preview</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
            <MetricPill label="进入" value="124.8万" />
            <MetricPill label="触达" value="83.6%" />
            <MetricPill label="转化" value="18.4%" />
          </div>
        </div>
      </section>
    </aside>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--workflow-soft)] px-1.5 py-1.5">
      <div className="font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 text-muted-foreground">{label}</div>
    </div>
  );
}

function WorkflowCanvas({
  canRedo,
  canUndo,
  edges,
  nodes,
  onAddNode,
  onArrange,
  onConnect,
  onEdgesChange,
  onNodesChange,
  onOpenVariables,
  onPaletteOpenChange,
  onPaneClick,
  onRedo,
  onNodeHoverEnd,
  onNodeHoverStart,
  onSelectNode,
  onSearchChange,
  onUndo,
  paletteOpen,
  searchValue,
}: {
  canRedo: boolean;
  canUndo: boolean;
  edges: MarketingWorkflowRenderEdge[];
  nodes: MarketingWorkflowRenderNode[];
  onAddNode: (kind: MarketingNodeKind) => void;
  onArrange: () => void;
  onConnect: (connection: Connection) => void;
  onEdgesChange: OnEdgesChange<MarketingWorkflowRenderEdge>;
  onNodesChange: OnNodesChange<MarketingWorkflowRenderNode>;
  onOpenVariables: () => void;
  onPaletteOpenChange: (open: boolean) => void;
  onPaneClick: () => void;
  onRedo: () => void;
  onNodeHoverEnd: () => void;
  onNodeHoverStart: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSearchChange: (value: string) => void;
  onUndo: () => void;
  paletteOpen: boolean;
  searchValue: string;
}) {
  const initialViewport = useMemo(() => getInitialWorkflowViewport(), []);
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow<
    MarketingWorkflowRenderNode,
    MarketingWorkflowRenderEdge
  >();
  const { zoom } = useViewport();
  const [showMiniMap, setShowMiniMap] = useState(true);
  const activeInsertNode = nodes.find((node) => node.data.insertMenuOpen);

  return (
    <section
      aria-label="营销 Workflow 画布"
      className="agent-workflow-canvas absolute inset-0"
      role="application"
    >
      <ReactFlow
        defaultViewport={initialViewport}
        edges={edges}
        edgeTypes={edgeTypes}
        maxZoom={WORKFLOW_MAX_ZOOM}
        minZoom={WORKFLOW_MIN_ZOOM}
        nodeOrigin={[0, 0.5]}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onNodeMouseEnter={(_, node) => onNodeHoverStart(node.id)}
        onNodeMouseLeave={onNodeHoverEnd}
        onNodesChange={onNodesChange}
        onPaneClick={onPaneClick}
        panOnScroll
        selectionOnDrag={false}
      >
        <Background color="var(--workflow-grid)" gap={20} size={1.2} />
        <WorkflowControlDock
          onPaletteOpenChange={onPaletteOpenChange}
          onArrange={onArrange}
          onOpenVariables={onOpenVariables}
          paletteOpen={paletteOpen}
        />
        {paletteOpen ? (
          <WorkflowPalette
            onAddNode={onAddNode}
            onClose={() => onPaletteOpenChange(false)}
            onSearchChange={onSearchChange}
            searchValue={searchValue}
          />
        ) : null}
        {activeInsertNode ? <WorkflowCandidateMenuOverlay node={activeInsertNode} /> : null}
        <div className="workflow-bottom-operator" aria-label="画布操作">
          <div className="workflow-operator-group">
            <button
              aria-label="撤销"
              className="workflow-operator-button"
              disabled={!canUndo}
              onClick={onUndo}
              type="button"
            >
              <HugeiconsIcon icon={Undo03Icon} size={15} strokeWidth={1.8} />
            </button>
            <button
              aria-label="重做"
              className="workflow-operator-button"
              disabled={!canRedo}
              onClick={onRedo}
              type="button"
            >
              <HugeiconsIcon icon={Redo03Icon} size={15} strokeWidth={1.8} />
            </button>
          </div>
          <button
            className="workflow-operator-chip workflow-operator-chip-strong"
            onClick={onOpenVariables}
            type="button"
          >
            Variables
          </button>
          <div className="workflow-operator-map-wrap">
            {showMiniMap ? (
              <MiniMap
                className="workflow-minimap"
                maskColor="var(--workflow-minimap-mask)"
                nodeColor={(node) => {
                  const data = node.data as MarketingNodeData;
                  if (data.kind === "trigger") {
                    return "var(--workflow-minimap-trigger)";
                  }
                  if (data.kind === "ai") {
                    return "var(--workflow-minimap-ai)";
                  }
                  if (data.kind === "goal") {
                    return "var(--workflow-minimap-goal)";
                  }
                  return "var(--workflow-minimap-node)";
                }}
                nodeStrokeWidth={3}
                pannable
                position="bottom-right"
                style={{
                  height: 73,
                  width: 103,
                }}
                zoomable
              />
            ) : null}
            <WorkflowZoomControls
              fitView={() => fitView({ duration: 160, padding: 0.2 })}
              onToggleMiniMap={() => setShowMiniMap((isVisible) => !isVisible)}
              showMiniMap={showMiniMap}
              zoom={zoom}
              zoomIn={zoomIn}
              zoomOut={zoomOut}
              zoomTo={zoomTo}
            />
          </div>
        </div>
      </ReactFlow>
    </section>
  );
}

function WorkflowCandidateMenuOverlay({ node }: { node: MarketingWorkflowRenderNode }) {
  const sourceHandle = node.data.insertMenuSourceHandle;
  const { x, y, zoom } = useViewport();
  const menuLeft = (node.position.x + getWorkflowNodeWidth(node) + 24) * zoom + x;
  const menuTop = getInsertMenuTop(node, sourceHandle) * zoom + y;

  return (
    <div
      aria-label="选择要添加的节点"
      className="workflow-candidate-menu nodrag nopan"
      role="menu"
      style={{
        left: menuLeft,
        top: menuTop,
      }}
    >
      {paletteItems.map((item) => (
        <button
          className="workflow-candidate-item"
          key={item.id}
          onClick={(event) => {
            event.stopPropagation();
            node.data.onInsertAfter?.(node.id, item.id, sourceHandle);
          }}
          role="menuitem"
          type="button"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-[var(--workflow-soft)] text-muted-foreground">
            <HugeiconsIcon icon={item.icon} size={14} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground">
              {item.label}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {item.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function WorkflowZoomControls({
  fitView,
  onToggleMiniMap,
  showMiniMap,
  zoom,
  zoomIn,
  zoomOut,
  zoomTo,
}: {
  fitView: () => void;
  onToggleMiniMap: () => void;
  showMiniMap: boolean;
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (zoom: number) => void;
}) {
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const canZoomOut = zoom > WORKFLOW_MIN_ZOOM;
  const canZoomIn = zoom < WORKFLOW_MAX_ZOOM;

  return (
    <div className="workflow-operator-group workflow-zoom-control" aria-label="缩放比例">
      <button
        aria-label="缩小"
        className="workflow-operator-button"
        disabled={!canZoomOut}
        onClick={() => {
          if (canZoomOut) {
            zoomOut();
          }
        }}
        type="button"
      >
        -
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`当前缩放 ${zoomLabel}，打开缩放菜单`}
            className="workflow-operator-button workflow-operator-zoom-label"
            type="button"
          >
            {zoomLabel}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-[132px]" side="top">
          {workflowZoomOptions.map((option) => (
            <DropdownMenuItem
              className="workflow-zoom-menu-item"
              key={option.label}
              onSelect={() => zoomTo(option.value)}
            >
              <span className="workflow-zoom-menu-icon" />
              {option.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem className="workflow-zoom-menu-item" onSelect={fitView}>
            <span className="workflow-zoom-menu-icon">
              <HugeiconsIcon icon={SquareArrowExpand01Icon} size={16} strokeWidth={1.8} />
            </span>
            适配画布
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="workflow-zoom-menu-item"
            onSelect={() => {
              onToggleMiniMap();
            }}
          >
            <span className="workflow-zoom-menu-icon">
              {showMiniMap ? <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={1.8} /> : null}
            </span>
            显示小地图
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        aria-label="放大"
        className="workflow-operator-button"
        disabled={!canZoomIn}
        onClick={() => {
          if (canZoomIn) {
            zoomIn();
          }
        }}
        type="button"
      >
        +
      </button>
    </div>
  );
}

function WorkflowControlDock({
  onArrange,
  onOpenVariables,
  onPaletteOpenChange,
  paletteOpen,
}: {
  onArrange: () => void;
  onOpenVariables: () => void;
  onPaletteOpenChange: (open: boolean) => void;
  paletteOpen: boolean;
}) {
  return (
    <div aria-label="画布工具" className="workflow-left-dock">
      <button
        aria-expanded={paletteOpen}
        aria-label={paletteOpen ? "关闭节点库" : "打开节点库"}
        className="workflow-left-dock-button"
        data-active={paletteOpen ? "true" : undefined}
        onClick={() => onPaletteOpenChange(!paletteOpen)}
        type="button"
      >
        <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
      </button>
      <button
        aria-label="选择模式"
        className="workflow-left-dock-button"
        data-active="true"
        type="button"
      >
        <HugeiconsIcon icon={FlowConnectionIcon} size={16} strokeWidth={1.8} />
      </button>
      <button
        aria-label="自动整理画布"
        className="workflow-left-dock-button"
        onClick={onArrange}
        type="button"
      >
        <HugeiconsIcon icon={ArrangeIcon} size={16} strokeWidth={1.8} />
      </button>
      <span className="workflow-left-dock-divider" />
      <button
        aria-label="打开变量面板"
        className="workflow-left-dock-button"
        onClick={onOpenVariables}
        type="button"
      >
        <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function getInitialWorkflowViewport() {
  if (typeof window !== "undefined" && window.innerWidth < 1024) {
    return { x: 28, y: 260, zoom: 0.82 };
  }

  return { x: 36, y: 420, zoom: 0.82 };
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

function WorkflowChecks({
  checks,
  onClose,
  publishAttempted,
  publishReady,
}: {
  checks: ReturnType<typeof buildPublishChecks>;
  onClose: () => void;
  publishAttempted: boolean;
  publishReady: boolean;
}) {
  return (
    <section aria-label="发布检查" className="workflow-checks-panel">
      <div className="space-y-4">
        <div
          className={cn(
            "rounded-[12px] border bg-background p-4 shadow-xs",
            publishAttempted && (publishReady ? "border-emerald-200" : "border-amber-200"),
          )}
          role={publishAttempted ? "alert" : undefined}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px]",
                publishReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
              )}
            >
              <HugeiconsIcon
                icon={publishReady ? CheckmarkCircle02Icon : AlertCircleIcon}
                size={20}
                strokeWidth={1.8}
              />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">
                {publishReady ? "可以发布" : "发布前需处理配置问题"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                检查触发、连线、节点配置、分支兜底和动作幂等配置
              </p>
            </div>
            <Button
              aria-label="关闭发布检查"
              className="size-8 shrink-0 rounded-lg"
              onClick={onClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          {checks.map((check) => {
            const isReady = check.status === "ready";

            return (
              <article className="rounded-[12px] border bg-background p-4 shadow-xs" key={check.id}>
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 items-center justify-center rounded-[8px]",
                      isReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                    )}
                  >
                    <HugeiconsIcon
                      icon={isReady ? CheckmarkCircle02Icon : AlertCircleIcon}
                      size={17}
                      strokeWidth={1.8}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">{check.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{check.description}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
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
