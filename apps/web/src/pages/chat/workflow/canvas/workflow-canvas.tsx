import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_MAX_ZOOM,
  WORKFLOW_MIN_ZOOM,
  WORKFLOW_NODE_TYPE,
  workflowZoomOptions,
} from "../constants";
import { getInsertMenuTop, getWorkflowNodeWidth } from "../layout";
import {
  getInsertableNodeKindsForSource,
  getPaletteItemsByKinds,
} from "../node-definitions";
import { WorkflowNodeCard } from "../nodes";
import type {
  InsertableWorkflowNodeKind,
  WorkflowNodeData,
  WorkflowRenderEdge,
  WorkflowRenderNode,
} from "../types";
import { useWorkflowDismissableLayer } from "../workflow-hooks";
import { WorkflowBezierEdge } from "./workflow-edge";
import { WorkflowPalette } from "./workflow-palette";

const nodeTypes = {
  [WORKFLOW_NODE_TYPE]: WorkflowNodeCard,
};

const edgeTypes = {
  [WORKFLOW_EDGE_TYPE]: WorkflowBezierEdge,
};

const workflowNodeOrigin: [number, number] = [0, 0.5];
const workflowPanOnDrag = true;

export function WorkflowCanvas({
  canRedo,
  canUndo,
  edges,
  isReadOnly = false,
  nodes,
  nextRedoLabel,
  nextUndoLabel,
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
  onNodeDrag,
  onNodeDragStart,
  onNodeDragStop,
  onNodeHoverEnd,
  onNodeHoverStart,
  onSelectEdge,
  onSelectNode,
  onSearchChange,
  onUndo,
  onViewportChangeEnd,
  paletteOpen,
  searchValue,
  viewport,
}: {
  canRedo: boolean;
  canUndo: boolean;
  edges: WorkflowRenderEdge[];
  isReadOnly?: boolean;
  nodes: WorkflowRenderNode[];
  nextRedoLabel?: string;
  nextUndoLabel?: string;
  onAddNode: (kind: InsertableWorkflowNodeKind) => void;
  onArrange: () => void;
  onConnect: (connection: Connection) => void;
  onEdgesChange: OnEdgesChange<WorkflowRenderEdge>;
  onIsValidConnection: IsValidConnection<WorkflowRenderEdge>;
  onNodesChange: OnNodesChange<WorkflowRenderNode>;
  onOpenVariables: () => void;
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
  onSearchChange: (value: string) => void;
  onUndo: () => void;
  onViewportChangeEnd: (viewport: Viewport) => void;
  paletteOpen: boolean;
  searchValue: string;
  viewport: Viewport;
}) {
  const initialViewport = useMemo(() => getInitialWorkflowViewport(viewport), [viewport]);
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow<
    WorkflowRenderNode,
    WorkflowRenderEdge
  >();
  const { zoom } = useViewport();
  const [showMiniMap, setShowMiniMap] = useState(true);
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
        onMoveEnd={(_, nextViewport) => onViewportChangeEnd(nextViewport)}
        panOnDrag={workflowPanOnDrag}
        panOnScroll={false}
        isValidConnection={onIsValidConnection}
        selectionOnDrag={false}
        zoomOnScroll
      >
        <Background color="var(--workflow-grid)" gap={20} size={1.2} />
        <WorkflowControlDock
          onPaletteOpenChange={onPaletteOpenChange}
          onArrange={onArrange}
          disabled={isReadOnly}
          onOpenVariables={onOpenVariables}
          paletteOpen={paletteOpen}
        />
        {paletteOpen && !isReadOnly ? (
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
              aria-label={nextUndoLabel ? `撤销：${nextUndoLabel}` : "撤销"}
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
              aria-label={nextRedoLabel ? `重做：${nextRedoLabel}` : "重做"}
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
            disabled={isReadOnly}
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
                  const data = node.data as WorkflowNodeData;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useWorkflowDismissableLayer<HTMLDivElement>({
    enabled: menuOpen,
    onDismiss: () => setMenuOpen(false),
  });

  const handleMenuAction = (action: () => void) => {
    action();
    setMenuOpen(false);
  };

  return (
    <div className="workflow-operator-group workflow-zoom-control" aria-label="缩放比例" ref={menuRef}>
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
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`当前缩放 ${zoomLabel}，打开缩放菜单`}
        className="workflow-operator-button workflow-operator-zoom-label"
        onClick={() => setMenuOpen(!menuOpen)}
        type="button"
      >
        {zoomLabel}
      </button>
      {menuOpen ? (
        <div aria-label="缩放菜单" className="workflow-zoom-menu" role="menu">
          {workflowZoomOptions.map((option) => (
            <button
              className="workflow-zoom-menu-item"
              key={option.label}
              onClick={() => handleMenuAction(() => zoomTo(option.value))}
              role="menuitem"
              type="button"
            >
              <span className="workflow-zoom-menu-icon" />
              {option.label}
            </button>
          ))}
          <button
            className="workflow-zoom-menu-item"
            onClick={() => handleMenuAction(fitView)}
            role="menuitem"
            type="button"
          >
            <span className="workflow-zoom-menu-icon">
              <HugeiconsIcon icon={SquareArrowExpand01Icon} size={16} strokeWidth={1.8} />
            </span>
            适配画布
          </button>
          <div className="workflow-zoom-menu-separator" />
          <button
            className="workflow-zoom-menu-item"
            onClick={() => handleMenuAction(onToggleMiniMap)}
            role="menuitem"
            type="button"
          >
            <span className="workflow-zoom-menu-icon">
              {showMiniMap ? <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={1.8} /> : null}
            </span>
            显示小地图
          </button>
        </div>
      ) : null}
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
  disabled = false,
  onArrange,
  onOpenVariables,
  onPaletteOpenChange,
  paletteOpen,
}: {
  disabled?: boolean;
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
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) {
            onPaletteOpenChange(!paletteOpen);
          }
        }}
        type="button"
      >
        <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
      </button>
      <button
        aria-label="选择模式"
        className="workflow-left-dock-button"
        data-active="true"
        disabled={disabled}
        type="button"
      >
        <HugeiconsIcon icon={FlowConnectionIcon} size={16} strokeWidth={1.8} />
      </button>
      <button
        aria-label="自动整理画布"
        className="workflow-left-dock-button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) {
            onArrange();
          }
        }}
        type="button"
      >
        <HugeiconsIcon icon={ArrangeIcon} size={16} strokeWidth={1.8} />
      </button>
      <span className="workflow-left-dock-divider" />
      <button
        aria-label="打开变量面板"
        className="workflow-left-dock-button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) {
            onOpenVariables();
          }
        }}
        type="button"
      >
        <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={1.8} />
      </button>
    </div>
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
