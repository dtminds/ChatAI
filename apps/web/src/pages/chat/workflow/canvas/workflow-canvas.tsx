import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type {
  Connection,
  IsValidConnection,
  OnNodeDrag,
  OnEdgesChange,
  OnNodesChange,
  Viewport,
} from "@xyflow/react";
import {
  applyNodeChanges,
  Background,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import {
  Add01Icon,
  DashboardSquare02Icon,
  MinusSignIcon,
  Navigation04Icon,
  PlusSignIcon,
  Redo03Icon,
  SquareArrowExpand01Icon,
  Undo03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_MAX_ZOOM,
  WORKFLOW_MIN_ZOOM,
  WORKFLOW_NODE_TYPE,
  workflowZoomOptions,
} from "../constants";
import { getInsertMenuTop, getWorkflowNodeWidth } from "../layout";
import {
  getInsertableNodeKindsForSource,
} from "../node-definitions";
import { WorkflowNodeCard } from "../nodes";
import type {
  InsertableWorkflowNodeKind,
  WorkflowRenderEdge,
  WorkflowRenderNode,
} from "../types";
import { useWorkflowDismissableLayer } from "../workflow-hooks";
import { WorkflowBezierEdge } from "./workflow-edge";
import { WorkflowNodePicker } from "./workflow-palette";
import type { WorkflowNodePickerAddContext } from "./workflow-palette";

const nodeTypes = {
  [WORKFLOW_NODE_TYPE]: WorkflowNodeCard,
};

const edgeTypes = {
  [WORKFLOW_EDGE_TYPE]: WorkflowBezierEdge,
};

const workflowNodeOrigin: [number, number] = [0, 0.5];
const workflowPanOnDrag = true;
const workflowPaneClickDistance = 8;
const workflowPaletteNodeGap = 24;

export function WorkflowCanvas({
  canRedo,
  canUndo,
  edges,
  isReadOnly = false,
  showEditingTools = true,
  nodes,
  nextRedoLabel,
  nextUndoLabel,
  onAddNode,
  onArrange,
  onConnect,
  onEdgesChange,
  onIsValidConnection,
  onNodesChange,
  onPaletteOpenChange,
  onPaneClick,
  onRedo,
  onNodeDrag,
  onNodeDragStart,
  onNodeDragStop,
  onNodeHoverEnd,
  onNodeHoverStart,
  onSelectEdge,
  onSelectNode,
  onUndo,
  onViewportChangeEnd,
  paletteOpen,
  viewport,
}: {
  canRedo: boolean;
  canUndo: boolean;
  edges: WorkflowRenderEdge[];
  isReadOnly?: boolean;
  showEditingTools?: boolean;
  nodes: WorkflowRenderNode[];
  nextRedoLabel?: string;
  nextUndoLabel?: string;
  onAddNode: (kind: InsertableWorkflowNodeKind, position: { x: number; y: number }) => void;
  onArrange: () => void;
  onConnect: (connection: Connection) => void;
  onEdgesChange: OnEdgesChange<WorkflowRenderEdge>;
  onIsValidConnection: IsValidConnection<WorkflowRenderEdge>;
  onNodesChange: OnNodesChange<WorkflowRenderNode>;
  onPaletteOpenChange: (open: boolean) => void;
  onPaneClick: () => void;
  onRedo: () => void;
  onNodeDrag: OnNodeDrag<WorkflowRenderNode>;
  onNodeDragStart: OnNodeDrag<WorkflowRenderNode>;
  onNodeDragStop: OnNodeDrag<WorkflowRenderNode>;
  onNodeHoverEnd: () => void;
  onNodeHoverStart: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onSelectNode: (nodeId: string, options?: { additive?: boolean }) => void;
  onUndo: () => void;
  onViewportChangeEnd: (viewport: Viewport) => void;
  paletteOpen: boolean;
  viewport: Viewport;
}) {
  const initialViewport = useMemo(() => getInitialWorkflowViewport(viewport), [viewport]);
  const { fitView, screenToFlowPosition, zoomIn, zoomOut, zoomTo } = useReactFlow<
    WorkflowRenderNode,
    WorkflowRenderEdge
  >();
  const { zoom } = useViewport();
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [flowNodes, setFlowNodes] = useState(nodes);
  const canvasRef = useRef<HTMLElement | null>(null);
  const isNodeDraggingRef = useRef(false);
  const activeInsertNode = flowNodes.find((node) => node.data.insertMenuOpen);

  useEffect(() => {
    if (!isNodeDraggingRef.current) {
      setFlowNodes(nodes);
    }
  }, [nodes]);

  const handleNodesChange: OnNodesChange<WorkflowRenderNode> = useCallback((changes) => {
    setFlowNodes((currentNodes) => applyCanvasNodeChanges(changes, currentNodes));

    const durableChanges = changes.filter((change) =>
      change.type === "add" || change.type === "remove",
    );

    if (durableChanges.length > 0) {
      onNodesChange(durableChanges);
    }
  }, [onNodesChange]);

  const handleNodeDragStart: OnNodeDrag<WorkflowRenderNode> = useCallback((event, node, nodes) => {
    event.stopPropagation();
    isNodeDraggingRef.current = true;
    canvasRef.current?.classList.add("agent-workflow-canvas-dragging");
    onNodeHoverEnd();
    onNodeDragStart(event, node, nodes);
  }, [onNodeDragStart, onNodeHoverEnd]);

  const handleNodeDrag: OnNodeDrag<WorkflowRenderNode> = useCallback((event, node, draggedNodes) => {
    event.stopPropagation();
    setFlowNodes((currentNodes) =>
      mergeDraggedNodePositions(currentNodes, draggedNodes.length > 0 ? draggedNodes : [node]));
    onNodeDrag(event, node, draggedNodes);
  }, [onNodeDrag]);

  const handleNodeDragStop: OnNodeDrag<WorkflowRenderNode> = useCallback((event, node, nodes) => {
    event.stopPropagation();
    setFlowNodes((currentNodes) =>
      mergeDraggedNodePositions(currentNodes, nodes.length > 0 ? nodes : [node]));
    isNodeDraggingRef.current = false;
    canvasRef.current?.classList.remove("agent-workflow-canvas-dragging");
    onNodeDragStop(event, node, nodes);
  }, [onNodeDragStop]);

  const handleNodeMouseEnter = useCallback((nodeId: string) => {
    if (isNodeDraggingRef.current) {
      return;
    }

    onNodeHoverStart(nodeId);
  }, [onNodeHoverStart]);

  const handleNodeMouseLeave = useCallback(() => {
    if (isNodeDraggingRef.current) {
      return;
    }

    onNodeHoverEnd();
  }, [onNodeHoverEnd]);

  return (
    <section
      aria-label="营销 Workflow 画布"
      className="agent-workflow-canvas absolute inset-0"
      ref={canvasRef}
      role="application"
    >
      <ReactFlow
        connectionRadius={32}
        defaultViewport={initialViewport}
        deleteKeyCode={null}
        edges={edges}
        edgeTypes={edgeTypes}
        maxZoom={WORKFLOW_MAX_ZOOM}
        minZoom={WORKFLOW_MIN_ZOOM}
        multiSelectionKeyCode={null}
        nodeOrigin={workflowNodeOrigin}
        nodeTypes={nodeTypes}
        nodes={flowNodes}
        nodesConnectable={!isReadOnly}
        nodesDraggable={!isReadOnly}
        nodesFocusable={!isReadOnly}
        edgesFocusable={!isReadOnly}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
        onNodeClick={(event, node) => onSelectNode(node.id, {
          additive: event.metaKey || event.ctrlKey || event.shiftKey,
        })}
        onNodeDrag={handleNodeDrag}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeMouseEnter={(_, node) => handleNodeMouseEnter(node.id)}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodesChange={handleNodesChange}
        onPaneClick={onPaneClick}
        paneClickDistance={workflowPaneClickDistance}
        onMoveEnd={(_, nextViewport) => onViewportChangeEnd(nextViewport)}
        panOnDrag={workflowPanOnDrag}
        panOnScroll={false}
        isValidConnection={onIsValidConnection}
        selectionOnDrag={false}
        zoomOnScroll
      >
        <Background color="var(--workflow-grid)" gap={20} size={1.2} />
        {activeInsertNode ? <WorkflowCandidateMenuOverlay node={activeInsertNode} /> : null}
        <WorkflowBottomToolbar
          canRedo={canRedo}
          canUndo={canUndo}
          disabled={isReadOnly}
          fitView={() => fitView({ duration: 160, padding: 0.2 })}
          nextRedoLabel={nextRedoLabel}
          nextUndoLabel={nextUndoLabel}
          onAddNode={onAddNode}
          screenToFlowPosition={screenToFlowPosition}
          onArrange={onArrange}
          onPaletteOpenChange={onPaletteOpenChange}
          onRedo={onRedo}
          onToggleMiniMap={() => setShowMiniMap((isVisible) => !isVisible)}
          onUndo={onUndo}
          paletteOpen={paletteOpen}
          showMiniMap={showMiniMap}
          showEditingTools={showEditingTools}
          zoom={zoom}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          zoomTo={zoomTo}
        />
      </ReactFlow>
    </section>
  );
}

function WorkflowMiniMap() {
  return (
    <MiniMap
      bgColor="var(--background)"
      className="workflow-minimap"
      maskColor="oklch(from var(--secondary) l c h / 50%)"
      nodeColor="var(--primary)"
      nodeStrokeWidth={3}
      pannable
      position="bottom-right"
      style={{
        height: 73,
        width: 103,
      }}
      zoomable
    />
  );
}

function applyCanvasNodeChanges(
  changes: Parameters<OnNodesChange<WorkflowRenderNode>>[0],
  nodes: WorkflowRenderNode[],
) {
  return applyNodeChanges(changes, nodes);
}

function mergeDraggedNodePositions(
  nodes: WorkflowRenderNode[],
  draggedNodes: WorkflowRenderNode[],
) {
  if (draggedNodes.length === 0) {
    return nodes;
  }

  const draggedNodePositions = new Map(
    draggedNodes.map((node) => [node.id, node.position]),
  );
  let changed = false;
  const nextNodes = nodes.map((node) => {
    const nextPosition = draggedNodePositions.get(node.id);

    if (
      !nextPosition
      || (node.position.x === nextPosition.x && node.position.y === nextPosition.y)
    ) {
      return node;
    }

    changed = true;
    return {
      ...node,
      position: { ...nextPosition },
    };
  });

  return changed ? nextNodes : nodes;
}

function WorkflowCandidateMenuOverlay({ node }: { node: WorkflowRenderNode }) {
  const sourceHandle = node.data.insertMenuSourceHandle;
  const { x, y, zoom } = useViewport();
  const menuLeft = (node.position.x + getWorkflowNodeWidth(node) + 24) * zoom + x;
  const menuTop = getInsertMenuTop(node, sourceHandle) * zoom + y;
  const candidateKinds = getInsertableNodeKindsForSource(node.data.kind);

  return (
    <WorkflowNodePicker
      className="workflow-candidate-menu nodrag nopan absolute z-[45] w-[340px] min-h-[min(220px,calc(100vh-120px))] max-h-[min(360px,calc(100vh-120px))]"
      kinds={candidateKinds}
      onAddNode={(kind) => {
        node.data.onInsertAfter?.(node.id, kind, sourceHandle);
      }}
      role="menu"
      style={{
        left: menuLeft,
        top: menuTop,
      }}
    />
  );
}

function WorkflowBottomToolbar({
  canRedo,
  canUndo,
  disabled,
  fitView,
  nextRedoLabel,
  nextUndoLabel,
  onAddNode,
  onArrange,
  onPaletteOpenChange,
  onRedo,
  onToggleMiniMap,
  onUndo,
  paletteOpen,
  showMiniMap,
  showEditingTools,
  screenToFlowPosition,
  zoom,
  zoomIn,
  zoomOut,
  zoomTo,
}: {
  canRedo: boolean;
  canUndo: boolean;
  disabled: boolean;
  fitView: () => void;
  nextRedoLabel?: string;
  nextUndoLabel?: string;
  onAddNode: (kind: InsertableWorkflowNodeKind, position: { x: number; y: number }) => void;
  onArrange: () => void;
  onPaletteOpenChange: (open: boolean) => void;
  onRedo: () => void;
  onToggleMiniMap: () => void;
  onUndo: () => void;
  paletteOpen: boolean;
  showMiniMap: boolean;
  showEditingTools: boolean;
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (zoom: number) => void;
}) {
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const canZoomOut = zoom > WORKFLOW_MIN_ZOOM;
  const canZoomIn = zoom < WORKFLOW_MAX_ZOOM;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useWorkflowDismissableLayer<HTMLDivElement>({
    enabled: menuOpen,
    onDismiss: () => setMenuOpen(false),
  });
  const toolbarButtonClassName = "workflow-toolbar-button size-[30px] shrink-0 rounded-[7px] data-[active=true]:bg-slate-950/6";

  const handleMenuAction = (action: () => void) => {
    action();
    setMenuOpen(false);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        aria-label="画布工具"
        className="workflow-bottom-toolbar nodrag nopan absolute bottom-6 left-1/2 z-[12] flex h-11 max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-foreground/15 bg-background/95 py-[5px] pl-2.5 pr-[7px] text-foreground transition-[left] duration-200 ease-out motion-reduce:transition-none max-lg:bottom-16 max-lg:justify-start max-lg:overflow-x-auto max-lg:[scrollbar-width:none]"
        onClick={(event) => event.stopPropagation()}
        ref={menuRef}
      >
        {showMiniMap ? <WorkflowMiniMap /> : null}
        <div className="workflow-toolbar-zoom relative flex h-[30px] items-center gap-0.5" aria-label="缩放比例">
          <WorkflowToolbarTooltip label="缩小">
            <Button
              aria-label="缩小"
              className={cn(toolbarButtonClassName, "w-[26px]")}
              disabled={!canZoomOut}
              onClick={() => {
                if (canZoomOut) {
                  zoomOut();
                }
              }}
              type="button"
              variant="ghost"
              size="icon"
            >
              <HugeiconsIcon icon={MinusSignIcon} size={16} strokeWidth={1.8} />
            </Button>
          </WorkflowToolbarTooltip>
          <WorkflowToolbarTooltip label="视图比例">
            <Button
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={`当前缩放 ${zoomLabel}，打开缩放菜单`}
              className="workflow-toolbar-zoom-label h-[30px] min-w-12 rounded-[7px] text-[13px] font-semibold leading-none"
              onClick={() => setMenuOpen(!menuOpen)}
              type="button"
              variant="ghost"
            >
              {zoomLabel}
            </Button>
          </WorkflowToolbarTooltip>
          <WorkflowToolbarTooltip label="放大">
            <Button
              aria-label="放大"
              className={cn(toolbarButtonClassName, "w-[26px]")}
              disabled={!canZoomIn}
              onClick={() => {
                if (canZoomIn) {
                  zoomIn();
                }
              }}
              type="button"
              variant="ghost"
              size="icon"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={1.8} />
            </Button>
          </WorkflowToolbarTooltip>
          {menuOpen ? (
            <div
              aria-label="缩放菜单"
              className="workflow-zoom-menu absolute bottom-12 left-1/2 z-[48] min-w-[118px] -translate-x-1/2 overflow-hidden rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-[0_10px_28px_var(--shadow-soft)]"
              role="menu"
            >
              {workflowZoomOptions.map((option) => (
                <button
                  className="workflow-zoom-menu-item flex h-8 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-left text-[13px] text-inherit hover:bg-accent hover:text-accent-foreground"
                  key={option.label}
                  onClick={() => handleMenuAction(() => zoomTo(option.value))}
                  role="menuitem"
                  type="button"
                >
                  <span className="workflow-zoom-menu-icon flex size-4 shrink-0 items-center justify-center text-current" />
                  {option.label}
                </button>
              ))}
              <button
                className="workflow-zoom-menu-item flex h-8 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-left text-[13px] text-inherit hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleMenuAction(fitView)}
                role="menuitem"
                type="button"
              >
                <span className="workflow-zoom-menu-icon flex size-4 shrink-0 items-center justify-center text-current">
                  <HugeiconsIcon icon={SquareArrowExpand01Icon} size={15} strokeWidth={1.8} />
                </span>
                适配画布
              </button>
            </div>
          ) : null}
        </div>
        {showEditingTools ? <>
        <span className="workflow-toolbar-separator h-6 w-px shrink-0 bg-slate-950/10" />
        <WorkflowToolbarTooltip label="撤销">
          <Button
            aria-label={nextUndoLabel ? `撤销：${nextUndoLabel}` : "撤销"}
            className={toolbarButtonClassName}
            disabled={!canUndo}
            onClick={() => {
              onUndo();
            }}
            type="button"
            variant="ghost"
            size="icon"
          >
            <HugeiconsIcon icon={Undo03Icon} size={16} strokeWidth={1.8} />
          </Button>
        </WorkflowToolbarTooltip>
        <WorkflowToolbarTooltip label="重做">
          <Button
            aria-label={nextRedoLabel ? `重做：${nextRedoLabel}` : "重做"}
            className={toolbarButtonClassName}
            disabled={!canRedo}
            onClick={() => {
              onRedo();
            }}
            type="button"
            variant="ghost"
            size="icon"
          >
            <HugeiconsIcon icon={Redo03Icon} size={16} strokeWidth={1.8} />
          </Button>
        </WorkflowToolbarTooltip>
        <WorkflowToolbarTooltip label="自动整理">
          <Button
            aria-label="自动整理画布"
            className={toolbarButtonClassName}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                onArrange();
              }
            }}
            type="button"
            variant="ghost"
            size="icon"
          >
            <HugeiconsIcon icon={DashboardSquare02Icon} size={16} strokeWidth={1.8} />
          </Button>
        </WorkflowToolbarTooltip>
        </> : null}
        <div className="workflow-toolbar-minimap-wrap relative flex shrink-0">
          <WorkflowToolbarTooltip label="小地图">
            <Button
              aria-pressed={showMiniMap}
              aria-label="显示小地图"
              className={toolbarButtonClassName}
              data-active={showMiniMap ? "true" : undefined}
              onClick={onToggleMiniMap}
              type="button"
              variant="ghost"
              size="icon"
            >
              <HugeiconsIcon icon={Navigation04Icon} size={16} strokeWidth={1.8} />
            </Button>
          </WorkflowToolbarTooltip>
        </div>
        {showEditingTools ? <>
        <span className="workflow-toolbar-separator h-6 w-px shrink-0 bg-slate-950/10" />
        <div className="workflow-toolbar-palette-wrap relative flex shrink-0">
          {paletteOpen && !disabled ? (
            <WorkflowNodePicker
              className="workflow-floating-palette absolute bottom-10 right-0 w-[360px] min-h-[min(240px,calc(100vh-148px))] max-h-[min(420px,calc(100vh-148px))] max-lg:fixed max-lg:bottom-[120px] max-lg:left-3 max-lg:right-3 max-lg:w-auto max-lg:max-h-[min(420px,calc(100vh-168px))]"
              onAddNode={(kind, context) => {
                if (!context) return;
                onAddNode(
                  kind,
                  resolvePaletteNodePosition(context, screenToFlowPosition),
                );
              }}
            />
          ) : null}
          <Button
            aria-expanded={paletteOpen}
            aria-label={paletteOpen ? "关闭节点库" : "打开节点库"}
            className="workflow-toolbar-add-button h-[30px] shrink-0 rounded-[7px] px-2.5 text-[13px] leading-none shadow-none"
            data-active={paletteOpen ? "true" : undefined}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                onPaletteOpenChange(!paletteOpen);
              }
            }}
            type="button"
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
            <span>添加节点</span>
          </Button>
        </div>
        </> : null}
      </div>
    </TooltipProvider>
  );
}

function resolvePaletteNodePosition(
  context: WorkflowNodePickerAddContext,
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number },
) {
  return screenToFlowPosition({
    x: context.pickerRight + workflowPaletteNodeGap,
    y: context.clientY,
  });
}

function WorkflowToolbarTooltip({
  children,
  label,
}: {
  children: ReactElement;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function getInitialWorkflowViewport(viewport: Viewport) {
  if (viewport) {
    return viewport;
  }

  if (typeof window !== "undefined" && window.innerWidth < 1024) {
    return { x: 28, y: 260, zoom: 0.82 };
  }

  return { x: 36, y: 420, zoom: 0.82 };
}
