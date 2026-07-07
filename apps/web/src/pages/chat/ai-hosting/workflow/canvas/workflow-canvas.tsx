import { useMemo, useState } from "react";
import type {
  Connection,
  IsValidConnection,
  OnEdgesChange,
  OnNodesChange,
} from "@xyflow/react";
import {
  Background,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import {
  Add01Icon,
  ArrangeIcon,
  FlowConnectionIcon,
  Redo03Icon,
  Settings02Icon,
  SquareArrowExpand01Icon,
  Tick02Icon,
  Undo03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WORKFLOW_MAX_ZOOM,
  WORKFLOW_MIN_ZOOM,
  workflowZoomOptions,
} from "../constants";
import { getInsertMenuTop, getWorkflowNodeWidth } from "../layout";
import {
  getInsertableNodeKindsForSource,
  getPaletteItemsByKinds,
} from "../node-definitions";
import { MarketingNodeCard } from "../nodes";
import type {
  MarketingNodeData,
  MarketingNodeKind,
  MarketingWorkflowRenderEdge,
  MarketingWorkflowRenderNode,
} from "../types";
import { MarketingBezierEdge } from "./marketing-edge";
import { WorkflowPalette } from "./workflow-palette";

const nodeTypes = {
  marketing: MarketingNodeCard,
};

const edgeTypes = {
  marketing: MarketingBezierEdge,
};

export function WorkflowCanvas({
  canRedo,
  canUndo,
  edges,
  nodes,
  onAddNode,
  onArrange,
  onConnect,
  onEdgesChange,
  onIsValidConnection,
  onNodesChange,
  onOpenVariables,
  onPaletteOpenChange,
  onPaneClick,
  onRedo,
  onNodeHoverEnd,
  onNodeHoverStart,
  onSelectEdge,
  onSelectNode,
  onSelectionChange,
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
  onIsValidConnection: IsValidConnection<MarketingWorkflowRenderEdge>;
  onNodesChange: OnNodesChange<MarketingWorkflowRenderNode>;
  onOpenVariables: () => void;
  onPaletteOpenChange: (open: boolean) => void;
  onPaneClick: () => void;
  onRedo: () => void;
  onNodeHoverEnd: () => void;
  onNodeHoverStart: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectionChange: (selection: {
    edges: MarketingWorkflowRenderEdge[];
    nodes: MarketingWorkflowRenderNode[];
  }) => void;
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
        deleteKeyCode={null}
        edges={edges}
        edgeTypes={edgeTypes}
        maxZoom={WORKFLOW_MAX_ZOOM}
        minZoom={WORKFLOW_MIN_ZOOM}
        multiSelectionKeyCode={null}
        nodeOrigin={[0, 0.5]}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onNodeMouseEnter={(_, node) => onNodeHoverStart(node.id)}
        onNodeMouseLeave={onNodeHoverEnd}
        onNodesChange={onNodesChange}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        panOnDrag={[1]}
        panOnScroll
        isValidConnection={onIsValidConnection}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
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
        <div
          className="workflow-bottom-operator nodrag nopan"
          aria-label="画布操作"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="workflow-operator-group">
            <button
              aria-label="撤销"
              className="workflow-operator-button"
              disabled={!canUndo}
              onClick={(event) => {
                event.stopPropagation();
                onUndo();
              }}
              type="button"
            >
              <HugeiconsIcon icon={Undo03Icon} size={15} strokeWidth={1.8} />
            </button>
            <button
              aria-label="重做"
              className="workflow-operator-button"
              disabled={!canRedo}
              onClick={(event) => {
                event.stopPropagation();
                onRedo();
              }}
              type="button"
            >
              <HugeiconsIcon icon={Redo03Icon} size={15} strokeWidth={1.8} />
            </button>
          </div>
          <button
            className="workflow-operator-chip workflow-operator-chip-strong"
            onClick={(event) => {
              event.stopPropagation();
              onOpenVariables();
            }}
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
  const candidatePaletteItems = getPaletteItemsByKinds(
    getInsertableNodeKindsForSource(node.data.kind),
  );

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
      {candidatePaletteItems.map((item) => (
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
    <div
      aria-label="画布工具"
      className="workflow-left-dock nodrag nopan"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        aria-expanded={paletteOpen}
        aria-label={paletteOpen ? "关闭节点库" : "打开节点库"}
        className="workflow-left-dock-button"
        data-active={paletteOpen ? "true" : undefined}
        onClick={(event) => {
          event.stopPropagation();
          onPaletteOpenChange(!paletteOpen);
        }}
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
        onClick={(event) => {
          event.stopPropagation();
          onArrange();
        }}
        type="button"
      >
        <HugeiconsIcon icon={ArrangeIcon} size={16} strokeWidth={1.8} />
      </button>
      <span className="workflow-left-dock-divider" />
      <button
        aria-label="打开变量面板"
        className="workflow-left-dock-button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenVariables();
        }}
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
