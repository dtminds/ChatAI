import { useCallback, useMemo, useState } from "react";
import type {
  Connection,
  Edge,
  EdgeChange,
  EdgeProps,
  Node,
  NodeChange,
  NodeProps,
  OnEdgesChange,
  OnNodesChange,
} from "@xyflow/react";
import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import {
  Add01Icon,
  AiChat02Icon,
  AlertCircleIcon,
  ArrowLeft02Icon,
  ArrangeIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Coupon01Icon,
  FlowConnectionIcon,
  GitBranchIcon,
  Message01Icon,
  MoreHorizontalIcon,
  PlayIcon,
  Redo03Icon,
  Rocket01Icon,
  Search01Icon,
  Settings02Icon,
  TagsIcon,
  Target01Icon,
  Undo03Icon,
  UserSwitchIcon,
  WorkflowSquare01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AiHostingLayout } from "./ai-hosting-layout";
import "@xyflow/react/dist/style.css";
import "./agent-workflow-page.css";

type WorkflowView = "canvas" | "preview" | "checks";
type InspectorTab = "settings" | "run" | "variables";
type MarketingNodeKind = "trigger" | "wait" | "branch" | "action" | "ai" | "goal";
type MarketingNodeStatus = "ready" | "running" | "warning";
type InsertableMarketingNodeKind = Exclude<MarketingNodeKind, "trigger" | "goal">;

type MarketingNodeData = Record<string, unknown> & {
  actionType?: "message" | "coupon" | "tag" | "handoff" | "ai";
  agentName?: string;
  audience?: string;
  branchRule?: string;
  conversion?: number;
  delayDays?: number;
  kind: MarketingNodeKind;
  label: string;
  metric: string;
  insertMenuOpen?: boolean;
  onInsertAfter?: (nodeId: string, kind: InsertableMarketingNodeKind) => void;
  onToggleInsertMenu?: (nodeId: string) => void;
  onSelect?: (nodeId: string) => void;
  selected?: boolean;
  status: MarketingNodeStatus;
  summary: string;
  title: string;
};

type MarketingWorkflowNode = Node<MarketingNodeData, "marketing">;
type MarketingEdgeData = Record<string, unknown> & {
  label?: string;
  onInsertBetween?: (
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ) => void;
};
type MarketingWorkflowEdge = Edge<MarketingEdgeData, "marketing">;
type WorkflowSnapshot = {
  edges: MarketingWorkflowEdge[];
  label: string;
  nodes: MarketingWorkflowNode[];
  selectedNodeId: string;
};
type NodeRunRecord = {
  durationMs: number;
  finishedAt: string;
  input: string;
  logs: string[];
  output: string;
  status: "succeeded" | "waiting";
};

const WORKFLOW_MIN_ZOOM = 0.25;
const WORKFLOW_MAX_ZOOM = 2;
const WORKFLOW_NODE_WIDTH = 240;
const WORKFLOW_NODE_ESTIMATED_HEIGHT = 176;
const WORKFLOW_NODE_HANDLE_TOP = 16;
const workflowZoomOptions = [
  { label: "200%", value: 2 },
  { label: "100%", value: 1 },
  { label: "75%", value: 0.75 },
  { label: "50%", value: 0.5 },
  { label: "25%", value: 0.25 },
] as const;

const nodeVisuals: Record<
  MarketingNodeKind,
  {
    accentClassName: string;
    icon: typeof Rocket01Icon;
    label: string;
  }
> = {
  action: {
    accentClassName: "bg-sky-500/12 text-sky-700 ring-sky-500/20",
    icon: Message01Icon,
    label: "动作",
  },
  ai: {
    accentClassName: "bg-violet-500/12 text-violet-700 ring-violet-500/20",
    icon: AiChat02Icon,
    label: "AI",
  },
  branch: {
    accentClassName: "bg-amber-500/12 text-amber-700 ring-amber-500/20",
    icon: GitBranchIcon,
    label: "条件",
  },
  goal: {
    accentClassName: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20",
    icon: Target01Icon,
    label: "目标",
  },
  trigger: {
    accentClassName: "bg-rose-500/12 text-rose-700 ring-rose-500/20",
    icon: Rocket01Icon,
    label: "触发",
  },
  wait: {
    accentClassName: "bg-indigo-500/12 text-indigo-700 ring-indigo-500/20",
    icon: Clock01Icon,
    label: "等待",
  },
};

const nodeTypes = {
  marketing: MarketingNodeCard,
};

const edgeTypes = {
  marketing: MarketingBezierEdge,
};

const agentOptions = [
  {
    description: "商品咨询、活动解释、搭配推荐",
    knowledge: "护肤知识库、活动政策",
    name: "护肤小助理",
  },
  {
    description: "订单异常、退换货、投诉安抚",
    knowledge: "售后知识库、服务规则",
    name: "售后小助理",
  },
  {
    description: "高意向客户识别、优惠引导",
    knowledge: "直播活动、会员权益",
    name: "转化小助理",
  },
] as const;

const paletteItems = [
  {
    description: "按天、小时或固定窗口延迟触达",
    icon: Clock01Icon,
    id: "wait",
    label: "等待",
  },
  {
    description: "按标签、行为、会话意图分支",
    icon: GitBranchIcon,
    id: "branch",
    label: "条件分支",
  },
  {
    description: "发送私域消息、优惠券或打标签",
    icon: Coupon01Icon,
    id: "action",
    label: "营销动作",
  },
  {
    description: "启用指定 Agent，接管后续会话",
    icon: AiChat02Icon,
    id: "ai",
    label: "AI 接待",
  },
] as const satisfies Array<{
  description: string;
  icon: typeof Rocket01Icon;
  id: InsertableMarketingNodeKind;
  label: string;
}>;

const journeyPeople = [
  {
    current: "等待 2 天后触达",
    name: "林女士",
    progress: 62,
    steps: ["入会触发", "延迟等待", "高意向分支"],
  },
  {
    current: "AI 接待中",
    name: "陈先生",
    progress: 84,
    steps: ["入会触发", "欢迎消息", "护肤小助理", "领取新人券"],
  },
  {
    current: "目标达成",
    name: "周女士",
    progress: 100,
    steps: ["入会触发", "条件分支", "优惠券", "首单转化"],
  },
] as const;

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
            <Link to="/chat/ai-hosting/workflows/new">
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
                    <Link to={`/chat/ai-hosting/workflows/${workflow.id}`}>编辑</Link>
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

function AgentWorkflowEditorBackLink() {
  return (
    <Button asChild className="h-8 gap-1.5 rounded-lg px-2.5 text-xs" variant="ghost">
      <Link to="/chat/ai-hosting/workflows">
        <HugeiconsIcon icon={ArrowLeft02Icon} size={15} strokeWidth={1.8} />
        返回列表
      </Link>
    </Button>
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
        "agent-workflow-page flex h-full min-h-[720px] flex-col bg-[var(--workflow-canvas-bg)]",
        fullscreen && "fixed inset-0 z-50 min-h-svh",
      )}
    >
      <WorkflowWorkspaceContent fullscreen={fullscreen} workflowName={workflowName} />
    </div>
  );
}

function WorkflowWorkspaceContent({
  fullscreen,
  workflowName,
}: {
  fullscreen: boolean;
  workflowName: string;
}) {
  const [activeView, setActiveView] = useState<WorkflowView>("canvas");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("settings");
  const [selectedNodeId, setSelectedNodeId] = useState("action-message");
  const [quickInsertNodeId, setQuickInsertNodeId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [nodes, setNodes] = useState<MarketingWorkflowNode[]>(() => createInitialNodes());
  const [edges, setEdges] = useState<MarketingWorkflowEdge[]>(() => createInitialEdges());
  const [history, setHistory] = useState<WorkflowSnapshot[]>([]);
  const [future, setFuture] = useState<WorkflowSnapshot[]>([]);
  const [runRecords, setRunRecords] = useState<Record<string, NodeRunRecord>>({});
  const [publishAttempted, setPublishAttempted] = useState(false);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const checks = useMemo(() => buildPublishChecks(nodes, edges), [nodes, edges]);
  const readyChecks = checks.filter((check) => check.status === "ready").length;
  const publishReady = readyChecks === checks.length;

  const decoratedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          onInsertBetween: insertNodeBetween,
        },
      })),
    [edges, nodes],
  );

  const decoratedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          insertMenuOpen: node.id === quickInsertNodeId,
          onInsertAfter: insertNodeAfter,
          onSelect: selectWorkflowNode,
          onToggleInsertMenu: (nodeId: string) => {
            setQuickInsertNodeId((currentNodeId) => (currentNodeId === nodeId ? null : nodeId));
          },
          selected: node.id === selectedNodeId,
        },
      })),
    [edges, nodes, quickInsertNodeId, selectedNodeId],
  );

  function selectWorkflowNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setQuickInsertNodeId(null);
  }

  const onNodesChange: OnNodesChange<MarketingWorkflowNode> = useCallback(
    (changes: NodeChange<MarketingWorkflowNode>[]) => {
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
    },
    [],
  );

  const onEdgesChange: OnEdgesChange<MarketingWorkflowEdge> = useCallback(
    (changes: EdgeChange<MarketingWorkflowEdge>[]) => {
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
    },
    [],
  );

  function updateSelectedNode(patch: Partial<MarketingNodeData>) {
    recordHistory("修改节点配置");
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
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
    );
  }

  function recordHistory(label: string) {
    setHistory((currentHistory) => [
      ...currentHistory.slice(-11),
      {
        edges,
        label,
        nodes,
        selectedNodeId,
      },
    ]);
    setFuture([]);
  }

  function undoWorkflowChange() {
    const previousSnapshot = history.at(-1);

    if (!previousSnapshot) {
      return;
    }

    setFuture((currentFuture) => [
      {
        edges,
        label: "当前状态",
        nodes,
        selectedNodeId,
      },
      ...currentFuture.slice(0, 11),
    ]);
    setNodes(previousSnapshot.nodes);
    setEdges(previousSnapshot.edges);
    setSelectedNodeId(previousSnapshot.selectedNodeId);
    setQuickInsertNodeId(null);
    setHistory((currentHistory) => currentHistory.slice(0, -1));
  }

  function redoWorkflowChange() {
    const nextSnapshot = future[0];

    if (!nextSnapshot) {
      return;
    }

    setHistory((currentHistory) => [
      ...currentHistory.slice(-11),
      {
        edges,
        label: "撤销前状态",
        nodes,
        selectedNodeId,
      },
    ]);
    setNodes(nextSnapshot.nodes);
    setEdges(nextSnapshot.edges);
    setSelectedNodeId(nextSnapshot.selectedNodeId);
    setQuickInsertNodeId(null);
    setFuture((currentFuture) => currentFuture.slice(1));
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
  ) {
    recordHistory("添加节点");
    const nodeId = `${kind}-${Date.now()}`;
    const previousNode = nodes.find((node) => node.id === previousNodeId);
    const replacedEdge = edges.find((edge) => edge.source === previousNodeId);
    const nextNodeId = replacedEdge?.target ?? "goal";
    const node = {
      ...createNodeFromKind(kind, nodeId, nodes.length),
      position: {
        x: (previousNode?.position.x ?? 0) + 320,
        y:
          previousNode?.data.kind === "branch"
            ? (previousNode?.position.y ?? 0) + 96
            : previousNode?.position.y ?? 0,
      },
    };

    setNodes((currentNodes) => [...currentNodes, node]);
    setEdges((currentEdges) => [
      ...currentEdges.filter(
        (edge) => edge.id !== replacedEdge?.id,
      ),
      createEdge(previousNodeId, nodeId),
      createEdge(nodeId, nextNodeId, replacedEdge?.data?.label),
    ]);
    setSelectedNodeId(nodeId);
    setQuickInsertNodeId(null);
    setPaletteOpen(false);
    setActiveView("canvas");
  }

  function insertNodeBetween(
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ) {
    recordHistory("插入节点");
    const nodeId = `${kind}-${Date.now()}`;
    const sourceNode = nodes.find((node) => node.id === sourceNodeId);
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    const replacedEdge = edges.find((edge) => edge.id === edgeId);
    const node = {
      ...createNodeFromKind(kind, nodeId, nodes.length),
      position: {
        x:
          sourceNode && targetNode
            ? (sourceNode.position.x + targetNode.position.x) / 2
            : (sourceNode?.position.x ?? 0) + 320,
        y:
          sourceNode && targetNode
            ? (sourceNode.position.y + targetNode.position.y) / 2 + 92
            : sourceNode?.position.y ?? 0,
      },
    };

    setNodes((currentNodes) => [...currentNodes, node]);
    setEdges((currentEdges) => [
      ...currentEdges.filter((edge) => edge.id !== edgeId),
      createEdge(sourceNodeId, nodeId, replacedEdge?.data?.label),
      createEdge(nodeId, targetNodeId),
    ]);
    setSelectedNodeId(nodeId);
    setQuickInsertNodeId(null);
    setPaletteOpen(false);
    setActiveView("canvas");
  }

  function connectNodes(connection: Connection) {
    const { source, target } = connection;

    if (!source || !target || source === target) {
      return;
    }

    if (edges.some((edge) => edge.source === source && edge.target === target)) {
      return;
    }

    recordHistory("连接节点");
    setEdges((currentEdges) => [...currentEdges, createEdge(source, target)]);
    setQuickInsertNodeId(null);
    setActiveView("canvas");
  }

  function arrangeNodes() {
    recordHistory("自动整理");
    setNodes((currentNodes) =>
      currentNodes.map((node, index) => ({
        ...node,
        position: {
          x: index * 310,
          y: node.data.kind === "action" ? -92 : node.data.kind === "ai" ? 96 : 0,
        },
      })),
    );
  }

  function runSelectedNode() {
    if (!selectedNode) {
      return;
    }

    setRunRecords((currentRecords) => ({
      ...currentRecords,
      [selectedNode.id]: createNodeRunRecord(selectedNode),
    }));
    setInspectorTab("run");
  }

  function handlePublishCheck() {
    setPublishAttempted(true);
    setActiveView("checks");
  }

  return (
    <>
      <WorkflowTopBar
        activeView={activeView}
        fullscreen={fullscreen}
        onArrange={arrangeNodes}
        onPublishCheck={handlePublishCheck}
        onViewChange={setActiveView}
        publishReady={publishReady}
        readyChecks={readyChecks}
        totalChecks={checks.length}
        workflowName={workflowName}
      />

      <div className="workflow-editor-body relative min-h-0 flex-1 border-t border-[var(--workflow-border)] bg-[var(--workflow-canvas-bg)]">
        <section className="relative h-full min-h-0 overflow-hidden bg-[var(--workflow-canvas-bg)] max-lg:min-h-[580px]">
          {activeView === "canvas" ? (
            <WorkflowCanvas
              canRedo={future.length > 0}
              canUndo={history.length > 0}
              edges={decoratedEdges}
              nodes={decoratedNodes}
              onAddNode={addNode}
              onArrange={arrangeNodes}
              onConnect={connectNodes}
              onEdgesChange={onEdgesChange}
              onNodesChange={onNodesChange}
              onOpenVariables={() => setInspectorTab("variables")}
              onPaletteOpenChange={setPaletteOpen}
              onPaneClick={() => setQuickInsertNodeId(null)}
              onRedo={redoWorkflowChange}
              onSelectNode={selectWorkflowNode}
              onSearchChange={setPaletteQuery}
              onUndo={undoWorkflowChange}
              paletteOpen={paletteOpen}
              searchValue={paletteQuery}
            />
          ) : null}
          {activeView === "preview" ? <WorkflowPreview /> : null}
          {activeView === "checks" ? (
            <WorkflowChecks
              checks={checks}
              publishAttempted={publishAttempted}
              publishReady={publishReady}
            />
          ) : null}
        </section>

        <NodeConfigPanel
          activeTab={inspectorTab}
          lastRun={selectedNode ? runRecords[selectedNode.id] : undefined}
          node={selectedNode}
          onNodeChange={updateSelectedNode}
          onRunNode={runSelectedNode}
          onTabChange={setInspectorTab}
        />
      </div>
    </>
  );
}

function WorkflowTopBar({
  activeView,
  fullscreen,
  onArrange,
  onPublishCheck,
  onViewChange,
  publishReady,
  readyChecks,
  totalChecks,
  workflowName,
}: {
  activeView: WorkflowView;
  fullscreen: boolean;
  onArrange: () => void;
  onPublishCheck: () => void;
  onViewChange: (view: WorkflowView) => void;
  publishReady: boolean;
  readyChecks: number;
  totalChecks: number;
  workflowName: string;
}) {
  return (
    <header className="flex min-h-[56px] items-center justify-between gap-4 bg-background/95 px-4 max-lg:flex-wrap max-lg:items-start max-lg:gap-2 max-lg:px-3 max-lg:py-2">
      <div className="flex min-w-0 items-center gap-3 max-lg:w-full">
        {fullscreen ? <AgentWorkflowEditorBackLink /> : null}
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-[var(--workflow-border)] bg-[var(--workflow-soft)] text-primary shadow-xs">
          <HugeiconsIcon icon={WorkflowSquare01Icon} size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold">Workflow</h1>
            <Badge className="h-5 rounded-md px-1.5 text-[11px]" variant="secondary">
              Draft
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground max-lg:hidden">{workflowName} · 自动保存于前端 DEMO</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 max-lg:w-full max-lg:overflow-x-auto max-lg:pb-1">
        <SegmentedControl
          aria-label="选择 Workflow 工作区"
          className="shrink-0"
          onValueChange={(value) => {
            if (value) {
              onViewChange(value as WorkflowView);
            }
          }}
          type="single"
          value={activeView}
        >
          <SegmentedControlItem className="h-7 min-w-12 shrink-0 whitespace-nowrap px-3 text-xs" value="canvas">
            编排
          </SegmentedControlItem>
          <SegmentedControlItem className="h-7 min-w-12 shrink-0 whitespace-nowrap px-3 text-xs" value="preview">
            预览
          </SegmentedControlItem>
          <SegmentedControlItem className="h-7 min-w-12 shrink-0 whitespace-nowrap px-3 text-xs" value="checks">
            检查
          </SegmentedControlItem>
        </SegmentedControl>

        <Button
          className="h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs"
          onClick={onArrange}
          type="button"
          variant="outline"
        >
          <HugeiconsIcon icon={ArrangeIcon} size={16} strokeWidth={1.8} />
          <span>自动整理</span>
        </Button>

        <Button
          className="h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs"
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
            <span className="max-lg:hidden">发布</span>检查 {readyChecks}/{totalChecks}
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
  onSelectNode,
  onSearchChange,
  onUndo,
  paletteOpen,
  searchValue,
}: {
  canRedo: boolean;
  canUndo: boolean;
  edges: MarketingWorkflowEdge[];
  nodes: MarketingWorkflowNode[];
  onAddNode: (kind: MarketingNodeKind) => void;
  onArrange: () => void;
  onConnect: (connection: Connection) => void;
  onEdgesChange: OnEdgesChange<MarketingWorkflowEdge>;
  onNodesChange: OnNodesChange<MarketingWorkflowNode>;
  onOpenVariables: () => void;
  onPaletteOpenChange: (open: boolean) => void;
  onPaneClick: () => void;
  onRedo: () => void;
  onSelectNode: (nodeId: string) => void;
  onSearchChange: (value: string) => void;
  onUndo: () => void;
  paletteOpen: boolean;
  searchValue: string;
}) {
  const initialViewport = useMemo(() => getInitialWorkflowViewport(), []);
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow<
    MarketingWorkflowNode,
    MarketingWorkflowEdge
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
                maskColor="rgba(248, 250, 252, 0.72)"
                nodeColor={(node) => {
                  const data = node.data as MarketingNodeData;
                  if (data.kind === "trigger") {
                    return "#fb7185";
                  }
                  if (data.kind === "ai") {
                    return "#8b5cf6";
                  }
                  if (data.kind === "goal") {
                    return "#10b981";
                  }
                  return "#64748b";
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

function WorkflowCandidateMenuOverlay({ node }: { node: MarketingWorkflowNode }) {
  const menuLeft = node.position.x + WORKFLOW_NODE_WIDTH + 24;
  const menuTop =
    node.position.y - WORKFLOW_NODE_ESTIMATED_HEIGHT / 2 + WORKFLOW_NODE_HANDLE_TOP - 8;

  return (
    <ViewportPortal>
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
              node.data.onInsertAfter?.(node.id, item.id);
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
    </ViewportPortal>
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
              key={option.label}
              onSelect={() => zoomTo(option.value)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={fitView}>
            适配画布
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={showMiniMap}
            onCheckedChange={onToggleMiniMap}
          >
            显示小地图
          </DropdownMenuCheckboxItem>
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

function MarketingBezierEdge({
  data,
  id,
  selected,
  source,
  sourceX,
  sourceY,
  target,
  targetX,
  targetY,
}: EdgeProps<MarketingWorkflowEdge>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    curvature: 0.16,
    sourcePosition: Position.Right,
    sourceX: sourceX - 8,
    sourceY,
    targetPosition: Position.Left,
    targetX: targetX + 8,
    targetY,
  });
  const isActionVisible = selected || isHovered || menuOpen;
  const stroke = selected ? "var(--workflow-blue)" : "var(--workflow-edge)";

  return (
    <>
      <BaseEdge
        id={id}
        interactionWidth={24}
        path={edgePath}
        style={{
          opacity: selected ? 1 : 0.72,
          stroke,
          strokeWidth: 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={cn("workflow-edge-action nodrag nopan", isActionVisible && "workflow-edge-action-visible")}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {data?.label ? <span className="workflow-edge-label">{data.label}</span> : null}
          <button
            aria-expanded={menuOpen}
            aria-label={data?.label ? `在${data.label}连线上添加节点` : "在连线上添加节点"}
            className="workflow-edge-add"
            onClick={() => setMenuOpen((isOpen) => !isOpen)}
            type="button"
          >
            <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.8} />
          </button>
          {menuOpen ? (
            <div aria-label="从连线添加节点" className="workflow-edge-menu" role="menu">
              {paletteItems.map((item) => (
                <button
                  className="workflow-edge-menu-item"
                  key={item.id}
                  onClick={() => {
                    data?.onInsertBetween?.(id, source, target, item.id);
                    setMenuOpen(false);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <span className="flex size-6 items-center justify-center rounded-md bg-[var(--workflow-soft)] text-muted-foreground">
                    <HugeiconsIcon icon={item.icon} size={14} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">{item.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function getInitialWorkflowViewport() {
  if (typeof window !== "undefined" && window.innerWidth < 1024) {
    return { x: 28, y: 260, zoom: 0.82 };
  }

  return { x: 36, y: 420, zoom: 0.82 };
}

function MarketingNodeCard({ data, id }: NodeProps<MarketingWorkflowNode>) {
  const visual = nodeVisuals[data.kind];
  const isSelected = Boolean(data.selected);
  const isWarning = data.status === "warning";
  const isRunning = data.status === "running";
  const [actionMenuOpen, setActionMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        "workflow-node-shell",
        isSelected && "workflow-node-shell-selected",
      )}
    >
      <div
        className={cn(
          "workflow-node-card group",
          isWarning && "workflow-node-card-warning",
        )}
      >
        {data.kind !== "trigger" ? (
          <Handle
            className="workflow-node-handle workflow-node-handle-target"
            position={Position.Left}
            type="target"
          />
        ) : null}
        <div
          className={cn(
            "workflow-node-actionbar nodrag nopan",
            (isSelected || actionMenuOpen) && "workflow-node-actionbar-visible",
          )}
        >
          <button
            aria-expanded={actionMenuOpen}
            aria-label={`更多操作：${data.title}`}
            className="workflow-node-actionbar-button"
            onClick={(event) => {
              event.stopPropagation();
              setActionMenuOpen((isOpen) => !isOpen);
            }}
            type="button"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} size={14} strokeWidth={1.8} />
          </button>
          {actionMenuOpen ? (
            <div aria-label="节点操作" className="workflow-node-action-menu" role="menu">
              <button
                className="workflow-node-action-menu-item"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onSelect?.(id);
                  setActionMenuOpen(false);
                }}
                role="menuitem"
                type="button"
              >
                打开配置
              </button>
              {data.kind !== "goal" ? (
                <button
                  className="workflow-node-action-menu-item"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onToggleInsertMenu?.(id);
                    setActionMenuOpen(false);
                  }}
                  role="menuitem"
                  type="button"
                >
                  添加后续节点
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          aria-label={`${data.title} ${data.summary}`}
          className="workflow-node-select"
          onClick={() => data.onSelect?.(id)}
          type="button"
        >
          <span className="flex items-center rounded-t-2xl px-3 pb-2 pt-3">
            <span
              className={cn(
                "mr-2 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1",
                visual.accentClassName,
              )}
            >
              <HugeiconsIcon icon={visual.icon} size={15} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-foreground">{data.title}</span>
                <span className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                  <HugeiconsIcon icon={Settings02Icon} size={13} strokeWidth={1.8} />
                </span>
              </span>
            </span>
          </span>

          <span className="workflow-node-section">
            <span className="workflow-node-section-title">{visual.label}</span>
            <span className="workflow-node-param">
              <span>状态</span>
              <span
                className={cn(
                  "workflow-node-param-value",
                  isRunning && "text-emerald-700",
                  isWarning && "text-amber-700",
                )}
              >
                {isRunning ? "Running" : isWarning ? "Missing config" : "Ready"}
              </span>
            </span>
            <span className="workflow-node-param">
              <span>配置</span>
              <span className="workflow-node-param-value">{data.summary}</span>
            </span>
            <span className="workflow-node-param">
              <span>输出</span>
              <span className="workflow-node-param-value">{data.metric}</span>
            </span>
          </span>
        </button>
        {data.kind !== "goal" ? (
          <Handle
            className="workflow-node-handle workflow-node-handle-source"
            position={Position.Right}
            type="source"
          >
            <div className="workflow-node-handle-tip">
              <div className="workflow-node-handle-tip-body">
                <div className="whitespace-nowrap">
                  <span className="workflow-node-handle-tip-title">点击</span>
                  添加节点
                </div>
                <div className="whitespace-nowrap">
                  <span className="workflow-node-handle-tip-title">拖拽</span>
                  连接节点
                </div>
              </div>
            </div>
            <button
              aria-label={`在${data.title}后添加节点`}
              className={cn(
                "workflow-node-insert nodrag nopan",
                data.insertMenuOpen && "workflow-node-insert-visible",
              )}
              onClick={(event) => {
                event.stopPropagation();
                data.onToggleInsertMenu?.(id);
              }}
              type="button"
            >
              <HugeiconsIcon icon={Add01Icon} size={10} strokeWidth={2.4} />
            </button>
          </Handle>
        ) : null}
      </div>
    </div>
  );
}

function NodeConfigPanel({
  activeTab,
  lastRun,
  node,
  onNodeChange,
  onRunNode,
  onTabChange,
}: {
  activeTab: InspectorTab;
  lastRun?: NodeRunRecord;
  node?: MarketingWorkflowNode;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
  onRunNode: () => void;
  onTabChange: (tab: InspectorTab) => void;
}) {
  if (!node) {
    return (
      <aside aria-label="节点配置" className="bg-background p-5" role="complementary">
        <p className="text-sm text-muted-foreground">请选择一个节点</p>
      </aside>
    );
  }

  const visual = nodeVisuals[node.data.kind];

  return (
    <aside
      aria-label="节点配置"
      className="workflow-config-panel absolute bottom-1 right-1 top-2 z-20 flex w-[26.25rem] min-h-0 flex-col rounded-l-2xl border border-[var(--workflow-border)] bg-[var(--workflow-panel-bg)] shadow-xl max-xl:w-[23.5rem] max-lg:relative max-lg:inset-auto max-lg:w-full max-lg:rounded-none max-lg:border-x-0"
      role="complementary"
    >
      <div className="border-b border-[var(--workflow-border)] p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
              visual.accentClassName,
            )}
          >
            <HugeiconsIcon icon={visual.icon} size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{node.data.title}</h2>
              <Badge className="h-5 rounded-md px-1.5 text-[11px]" variant="secondary">
                {visual.label}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{node.data.summary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label="运行当前节点"
              className="size-8 rounded-lg p-0"
              onClick={onRunNode}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
            </Button>
            <Button aria-label="更多节点操作" className="size-8 rounded-lg p-0" type="button" variant="ghost">
              <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.8} />
            </Button>
          </div>
        </div>
        <div className="mt-4 flex h-8 rounded-lg bg-[var(--workflow-soft)] p-0.5 text-xs">
          <button
            aria-pressed={activeTab === "settings"}
            className={cn(
              "flex-1 rounded-md text-muted-foreground transition-colors",
              activeTab === "settings" && "bg-background font-medium text-foreground shadow-xs",
            )}
            onClick={() => onTabChange("settings")}
            type="button"
          >
            设置
          </button>
          <button
            aria-pressed={activeTab === "run"}
            className={cn(
              "flex-1 rounded-md text-muted-foreground transition-colors",
              activeTab === "run" && "bg-background font-medium text-foreground shadow-xs",
            )}
            onClick={() => onTabChange("run")}
            type="button"
          >
            上次运行
          </button>
          <button
            aria-pressed={activeTab === "variables"}
            className={cn(
              "flex-1 rounded-md text-muted-foreground transition-colors",
              activeTab === "variables" && "bg-background font-medium text-foreground shadow-xs",
            )}
            onClick={() => onTabChange("variables")}
            type="button"
          >
            变量
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {activeTab === "settings" ? (
          <NodeSettingsForm node={node} onNodeChange={onNodeChange} />
        ) : null}
        {activeTab === "run" ? (
          <LastRunPanel lastRun={lastRun} node={node} onRunNode={onRunNode} />
        ) : null}
        {activeTab === "variables" ? <NodeVariablesPanel node={node} /> : null}
      </div>
    </aside>
  );
}

function NodeSettingsForm({
  node,
  onNodeChange,
}: {
  node: MarketingWorkflowNode;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
}) {
  return (
    <>
      <FieldGroup title="基础信息">
        <div className="space-y-2">
          <Label htmlFor="workflow-node-title">节点名称</Label>
          <Input
            id="workflow-node-title"
            onChange={(event) =>
              onNodeChange({
                title: event.target.value,
              })
            }
            value={node.data.title}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workflow-node-summary">节点说明</Label>
          <Textarea
            className="min-h-20 resize-none"
            id="workflow-node-summary"
            onChange={(event) =>
              onNodeChange({
                summary: event.target.value,
              })
            }
            value={node.data.summary}
          />
        </div>
      </FieldGroup>

      {node.data.kind === "trigger" ? (
        <TriggerConfig node={node} onNodeChange={onNodeChange} />
      ) : null}
      {node.data.kind === "wait" ? (
        <WaitConfig node={node} onNodeChange={onNodeChange} />
      ) : null}
      {node.data.kind === "branch" ? (
        <BranchConfig node={node} onNodeChange={onNodeChange} />
      ) : null}
      {node.data.kind === "action" ? (
        <ActionConfig node={node} onNodeChange={onNodeChange} />
      ) : null}
      {node.data.kind === "ai" ? (
        <AiReceptionConfig node={node} onNodeChange={onNodeChange} />
      ) : null}
      {node.data.kind === "goal" ? (
        <GoalConfig node={node} onNodeChange={onNodeChange} />
      ) : null}
    </>
  );
}

function LastRunPanel({
  lastRun,
  node,
  onRunNode,
}: {
  lastRun?: NodeRunRecord;
  node: MarketingWorkflowNode;
  onRunNode: () => void;
}) {
  if (!lastRun) {
    return (
      <section className="workflow-field-group rounded-xl border border-[var(--workflow-border)] bg-[var(--workflow-panel-section)] p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--workflow-soft)] text-muted-foreground">
            <HugeiconsIcon icon={PlayIcon} size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">尚未运行</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              运行当前节点后，这里会显示输入、输出、耗时和执行日志
            </p>
          </div>
        </div>
        <Button className="mt-4 h-8 w-full gap-1.5 text-xs" onClick={onRunNode} type="button">
          <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
          运行 {node.data.title}
        </Button>
      </section>
    );
  }

  return (
    <>
      <section className="workflow-field-group rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={17} strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">运行成功</h3>
              <p className="text-xs text-emerald-700">{lastRun.finishedAt}</p>
            </div>
          </div>
          <Badge className="rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            {lastRun.durationMs}ms
          </Badge>
        </div>
      </section>

      <FieldGroup title="输入">
        <RuntimeBlock>{lastRun.input}</RuntimeBlock>
      </FieldGroup>

      <FieldGroup title="输出">
        <RuntimeBlock>{lastRun.output}</RuntimeBlock>
      </FieldGroup>

      <FieldGroup title="日志">
        <div className="space-y-2">
          {lastRun.logs.map((log) => (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" key={log}>
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>{log}</span>
            </div>
          ))}
        </div>
      </FieldGroup>
    </>
  );
}

function RuntimeBlock({ children }: { children: string }) {
  return (
    <pre className="max-h-36 overflow-auto rounded-lg bg-background p-3 text-xs leading-5 text-foreground shadow-xs">
      {children}
    </pre>
  );
}

function NodeVariablesPanel({ node }: { node: MarketingWorkflowNode }) {
  const variables = getNodeVariables(node);

  return (
    <>
      <FieldGroup title="输入变量">
        <VariableList variables={variables.inputs} />
      </FieldGroup>
      <FieldGroup title="输出变量">
        <VariableList variables={variables.outputs} />
      </FieldGroup>
    </>
  );
}

function VariableList({
  variables,
}: {
  variables: Array<{ name: string; type: string; value: string }>;
}) {
  return (
    <div className="space-y-2">
      {variables.map((variable) => (
        <div
          className="rounded-lg border border-[var(--workflow-border)] bg-background px-3 py-2 shadow-xs"
          key={variable.name}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-xs font-medium text-foreground">{variable.name}</span>
            <span className="shrink-0 rounded-md bg-[var(--workflow-soft)] px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {variable.type}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{variable.value}</p>
        </div>
      ))}
    </div>
  );
}

function FieldGroup({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="workflow-field-group space-y-3 rounded-xl border border-[var(--workflow-border)] bg-[var(--workflow-panel-section)] p-3">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function TriggerConfig({
  node,
  onNodeChange,
}: {
  node: MarketingWorkflowNode;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
}) {
  return (
    <FieldGroup title="进入规则">
      <div className="space-y-2">
        <Label htmlFor="workflow-audience">触发人群</Label>
        <Input
          id="workflow-audience"
          onChange={(event) =>
            onNodeChange({
              audience: event.target.value,
              metric: event.target.value ? "预计进入 124.8万人" : "未配置人群",
              status: event.target.value ? "running" : "warning",
            })
          }
          value={node.data.audience ?? ""}
        />
      </div>
      <div className="flex items-center justify-between rounded-[10px] border bg-card p-3">
        <div>
          <div className="text-sm font-medium">允许重复进入</div>
          <p className="mt-1 text-xs text-muted-foreground">同一客户 7 天内最多进入一次</p>
        </div>
        <Switch aria-label="允许重复进入" defaultChecked />
      </div>
    </FieldGroup>
  );
}

function WaitConfig({
  node,
  onNodeChange,
}: {
  node: MarketingWorkflowNode;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
}) {
  const delayDays = node.data.delayDays ?? 2;

  return (
    <FieldGroup title="等待时间">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <Input
          aria-label="等待天数"
          min={0}
          onChange={(event) => {
            const nextDelay = Math.max(Number(event.target.value), 0);
            onNodeChange({
              delayDays: nextDelay,
              metric: `${nextDelay} 天后唤醒`,
              summary: `等待 ${nextDelay} 天后继续触达`,
            });
          }}
          type="number"
          value={delayDays}
        />
        <span className="text-sm text-muted-foreground">天</span>
      </div>
      <div className="rounded-[10px] border bg-card p-3 text-xs leading-5 text-muted-foreground">
        真实执行层会把等待写入持久化 job；本 DEMO 仅展示前端配置体验
      </div>
    </FieldGroup>
  );
}

function BranchConfig({
  node,
  onNodeChange,
}: {
  node: MarketingWorkflowNode;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
}) {
  return (
    <FieldGroup title="分支条件">
      <div className="space-y-2">
        <Label htmlFor="workflow-branch-rule">条件表达式</Label>
        <Textarea
          className="min-h-24 resize-none"
          id="workflow-branch-rule"
          onChange={(event) =>
            onNodeChange({
              branchRule: event.target.value,
              metric: event.target.value ? "2 条分支" : "未配置分支",
              status: event.target.value ? "ready" : "warning",
            })
          }
          value={node.data.branchRule ?? ""}
        />
      </div>
      <div className="grid gap-2">
        {["高意向客户", "普通客户", "默认路径"].map((branch) => (
          <div
            className="flex items-center justify-between rounded-[8px] border bg-card px-3 py-2 text-sm"
            key={branch}
          >
            <span>{branch}</span>
            <Badge className="rounded-[6px]" variant="outline">
              已连接
            </Badge>
          </div>
        ))}
      </div>
    </FieldGroup>
  );
}

function ActionConfig({
  node,
  onNodeChange,
}: {
  node: MarketingWorkflowNode;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
}) {
  const actionOptions = [
    {
      icon: Message01Icon,
      label: "发送消息",
      summary: "发送欢迎语和活动卡片",
      type: "message",
    },
    {
      icon: Coupon01Icon,
      label: "发优惠券",
      summary: "新人券 · 满 199 减 30",
      type: "coupon",
    },
    {
      icon: TagsIcon,
      label: "打标签",
      summary: "打上高意向会员标签",
      type: "tag",
    },
    {
      icon: UserSwitchIcon,
      label: "分配客服",
      summary: "转给会员运营组",
      type: "handoff",
    },
  ] as const;

  return (
    <FieldGroup title="动作类型">
      <div className="grid grid-cols-2 gap-2">
        {actionOptions.map((option) => {
          const isActive = node.data.actionType === option.type;

          return (
            <button
              className={cn(
                "flex min-h-[78px] flex-col items-start rounded-[10px] border bg-card p-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
                isActive && "border-primary bg-primary/5",
              )}
              key={option.type}
              onClick={() =>
                onNodeChange({
                  actionType: option.type,
                  label: option.label,
                  metric: option.summary,
                  status: "ready",
                  summary: option.summary,
                  title: option.label,
                })
              }
              type="button"
            >
              <HugeiconsIcon icon={option.icon} size={17} strokeWidth={1.8} />
              <span className="mt-2 text-sm font-medium">{option.label}</span>
              <span className="mt-1 text-xs leading-4 text-muted-foreground">{option.summary}</span>
            </button>
          );
        })}
      </div>
    </FieldGroup>
  );
}

function AiReceptionConfig({
  node,
  onNodeChange,
}: {
  node: MarketingWorkflowNode;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
}) {
  return (
    <FieldGroup title="AI 接待策略">
      <div className="space-y-2">
        {agentOptions.map((agent) => {
          const isActive = node.data.agentName === agent.name;

          return (
            <button
              aria-label={`选择${agent.name}`}
              className={cn(
                "w-full rounded-[10px] border bg-card p-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
                isActive && "border-primary bg-primary/5",
              )}
              key={agent.name}
              onClick={() =>
                onNodeChange({
                  actionType: "ai",
                  agentName: agent.name,
                  label: "AI 接待",
                  metric: agent.knowledge,
                  status: "ready",
                  summary: agent.name,
                })
              }
              type="button"
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-sm font-semibold">{agent.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {agent.description}
                  </span>
                </span>
                {isActive ? (
                  <HugeiconsIcon
                    className="text-primary"
                    icon={CheckmarkCircle02Icon}
                    size={18}
                    strokeWidth={1.8}
                  />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <Separator />
      <div className="space-y-2">
        <Label htmlFor="workflow-handoff-rule">转人工条件</Label>
        <Textarea
          className="min-h-20 resize-none"
          id="workflow-handoff-rule"
          placeholder="例如：客户投诉、要求人工、连续两轮未解决"
          defaultValue="客户要求人工、投诉升级、识别到价格异议"
        />
      </div>
    </FieldGroup>
  );
}

function GoalConfig({
  node,
  onNodeChange,
}: {
  node: MarketingWorkflowNode;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
}) {
  const conversion = node.data.conversion ?? 18.4;

  return (
    <FieldGroup title="目标设置">
      <div className="space-y-2">
        <Label htmlFor="workflow-conversion">目标转化率</Label>
        <Input
          id="workflow-conversion"
          onChange={(event) => {
            const nextConversion = Math.max(Number(event.target.value), 0);
            onNodeChange({
              conversion: nextConversion,
              metric: `目标 ${nextConversion}%`,
            });
          }}
          type="number"
          value={conversion}
        />
      </div>
      <Progress aria-label="目标达成进度" className="h-2" value={conversion * 4} />
    </FieldGroup>
  );
}

function WorkflowPreview() {
  return (
    <section className="absolute inset-0 overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-[12px] border bg-background p-5 shadow-xs">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">客户路径模拟</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                用样本客户预览节点推进、触达节奏和 AI 接待接管点
              </p>
            </div>
            <Badge className="rounded-[6px]" variant="secondary">
              前端模拟
            </Badge>
          </div>
        </div>

        <div className="grid gap-3">
          {journeyPeople.map((person) => (
            <article className="rounded-[12px] border bg-background p-5 shadow-xs" key={person.name}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{person.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{person.current}</p>
                </div>
                <div className="w-44">
                  <Progress aria-label={`${person.name} 路径进度`} className="h-2" value={person.progress} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {person.steps.map((step) => (
                  <span
                    className="inline-flex h-7 items-center rounded-full border bg-muted px-3 text-xs text-muted-foreground"
                    key={step}
                  >
                    {step}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowChecks({
  checks,
  publishAttempted,
  publishReady,
}: {
  checks: ReturnType<typeof buildPublishChecks>;
  publishAttempted: boolean;
  publishReady: boolean;
}) {
  return (
    <section className="absolute inset-0 overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div
          className={cn(
            "rounded-[12px] border bg-background p-5 shadow-xs",
            publishAttempted && (publishReady ? "border-emerald-200" : "border-amber-200"),
          )}
          role={publishAttempted ? "alert" : undefined}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-[10px]",
                publishReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
              )}
            >
              <HugeiconsIcon
                icon={publishReady ? CheckmarkCircle02Icon : AlertCircleIcon}
                size={20}
                strokeWidth={1.8}
              />
            </span>
            <div>
              <h2 className="text-lg font-semibold">
                {publishReady ? "可以发布" : "发布前需处理配置问题"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                检查触发、连线、节点配置、分支兜底和动作幂等配置
              </p>
            </div>
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

function getNodeVariables(node: MarketingWorkflowNode) {
  return {
    inputs: [
      {
        name: "customer.profile",
        type: "object",
        value: node.data.audience ?? "上游客户画像",
      },
      {
        name: "journey.currentNode",
        type: "string",
        value: node.data.title,
      },
    ],
    outputs: [
      {
        name: `${node.data.kind}.result`,
        type: "object",
        value: node.data.metric,
      },
      {
        name: "journey.next",
        type: "string",
        value: node.data.kind === "goal" ? "退出旅程" : "进入下一节点",
      },
    ],
  };
}

function createInitialNodes(): MarketingWorkflowNode[] {
  return [
    {
      data: {
        audience: "近 30 天新入会且未首购客户",
        kind: "trigger",
        label: "触发",
        metric: "预计进入 124.8万人",
        status: "running",
        summary: "客户入会后立即进入新人转化旅程",
        title: "新人入会触发",
      },
      id: "trigger",
      position: { x: 0, y: 0 },
      type: "marketing",
    },
    {
      data: {
        delayDays: 2,
        kind: "wait",
        label: "等待",
        metric: "2 天后唤醒",
        status: "ready",
        summary: "等待 2 天后继续触达",
        title: "观察期",
      },
      id: "wait-2d",
      position: { x: 310, y: 0 },
      type: "marketing",
    },
    {
      data: {
        branchRule: "最近 7 天浏览活动页 >= 2 次，或咨询过商品功效",
        kind: "branch",
        label: "条件",
        metric: "2 条分支",
        status: "ready",
        summary: "按活动兴趣和咨询意图拆分路径",
        title: "意向判断",
      },
      id: "branch-intent",
      position: { x: 620, y: 0 },
      type: "marketing",
    },
    {
      data: {
        actionType: "message",
        kind: "action",
        label: "发送消息",
        metric: "欢迎语 + 活动卡片",
        status: "ready",
        summary: "发送欢迎语和活动权益卡片",
        title: "发送欢迎消息",
      },
      id: "action-message",
      position: { x: 930, y: -94 },
      type: "marketing",
    },
    {
      data: {
        conversion: 18.4,
        kind: "goal",
        label: "目标",
        metric: "目标 18.4%",
        status: "ready",
        summary: "完成首单或领取新人券后退出",
        title: "首单转化",
      },
      id: "goal",
      position: { x: 1240, y: 0 },
      type: "marketing",
    },
  ];
}

function createInitialEdges(): MarketingWorkflowEdge[] {
  return [
    createEdge("trigger", "wait-2d"),
    createEdge("wait-2d", "branch-intent"),
    createEdge("branch-intent", "action-message", "高意向"),
    createEdge("action-message", "goal"),
  ];
}

function createNodeFromKind(
  kind: Exclude<MarketingNodeKind, "trigger" | "goal">,
  id: string,
  index: number,
): MarketingWorkflowNode {
  const commonPosition = {
    x: 300 + index * 310,
    y: index % 2 === 0 ? -94 : 94,
  };

  if (kind === "ai") {
    return {
      data: {
        actionType: "ai",
        agentName: "护肤小助理",
        kind: "ai",
        label: "AI 接待",
        metric: "护肤知识库、活动政策",
        status: "ready",
        summary: "护肤小助理",
        title: "AI 接待",
      },
      id,
      position: commonPosition,
      type: "marketing",
    };
  }

  if (kind === "wait") {
    return {
      data: {
        delayDays: 1,
        kind: "wait",
        label: "等待",
        metric: "1 天后唤醒",
        status: "ready",
        summary: "等待 1 天后继续触达",
        title: "等待",
      },
      id,
      position: commonPosition,
      type: "marketing",
    };
  }

  if (kind === "branch") {
    return {
      data: {
        branchRule: "",
        kind: "branch",
        label: "条件",
        metric: "未配置分支",
        status: "warning",
        summary: "按客户标签、行为或会话意图拆分路径",
        title: "条件分支",
      },
      id,
      position: commonPosition,
      type: "marketing",
    };
  }

  return {
    data: {
      actionType: "coupon",
      kind: "action",
      label: "营销动作",
      metric: "新人券 · 满 199 减 30",
      status: "ready",
      summary: "发放新人专属优惠券",
      title: "发优惠券",
    },
    id,
    position: commonPosition,
    type: "marketing",
  };
}

function createEdge(source: string, target: string, label?: string): MarketingWorkflowEdge {
  return {
    data: label ? { label } : undefined,
    id: `edge-${source}-${target}`,
    source,
    target,
    type: "marketing",
  };
}

function findLastActionNodeId(nodes: MarketingWorkflowNode[], edges: MarketingWorkflowEdge[]) {
  const edgeToGoal = edges.find((edge) => edge.target === "goal");

  if (edgeToGoal) {
    return edgeToGoal.source;
  }

  const nonGoalNodes = nodes.filter((node) => node.id !== "goal");
  return nonGoalNodes[nonGoalNodes.length - 1]?.id ?? "trigger";
}

function buildPublishChecks(nodes: MarketingWorkflowNode[], edges: MarketingWorkflowEdge[]) {
  const trigger = nodes.find((node) => node.data.kind === "trigger");
  const goal = nodes.find((node) => node.data.kind === "goal");
  const warningNodes = nodes.filter((node) => node.data.status === "warning");
  const hasDisconnectedNode = nodes.some(
    (node) =>
      node.data.kind !== "trigger" &&
      !edges.some((edge) => edge.target === node.id),
  );
  const hasAiAction = nodes.some((node) => node.data.kind === "ai" && node.data.agentName);

  return [
    {
      description: trigger?.data.audience
        ? `当前人群：${trigger.data.audience}`
        : "触发节点需要选择进入人群",
      id: "trigger",
      status: trigger?.data.audience ? "ready" : "warning",
      title: "触发人群",
    },
    {
      description: hasDisconnectedNode ? "存在未连接到主链路的节点" : "所有节点均接入主链路",
      id: "connectivity",
      status: hasDisconnectedNode ? "warning" : "ready",
      title: "链路连通性",
    },
    {
      description: warningNodes.length
        ? `${warningNodes.length} 个节点仍需补全配置`
        : "所有节点已完成关键配置",
      id: "config",
      status: warningNodes.length ? "warning" : "ready",
      title: "节点配置",
    },
    {
      description: hasAiAction
        ? "AI 接待动作已绑定 Agent 和知识库策略"
        : "当前流程没有启用 AI 接待动作",
      id: "ai",
      status: hasAiAction ? "ready" : "warning",
      title: "AI 接待策略",
    },
    {
      description: goal ? "已配置退出目标和转化指标" : "缺少目标节点",
      id: "goal",
      status: goal ? "ready" : "warning",
      title: "目标退出",
    },
  ] as const;
}
