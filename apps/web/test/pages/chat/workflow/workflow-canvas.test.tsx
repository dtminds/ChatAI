import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { getWorkflowCapabilityProfile } from "@chatai/contracts";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInitialNodes,
} from "@/pages/chat/workflow/graph";
import { getWorkflowPreviewViewport, WorkflowCanvas } from "@/pages/chat/workflow/canvas/workflow-canvas";
import {
  canInsertNodeKind,
  insertableNodeKinds,
} from "@/pages/chat/workflow/node-definitions";
import { useAppearanceStore } from "@/store/appearance-store";

const reactFlowProps = vi.hoisted(() => ({
  latest: undefined as Record<string, unknown> | undefined,
  fitView: vi.fn(),
  getNodesBounds: vi.fn(),
  screenToFlowPosition: vi.fn(({ x, y }: { x: number; y: number }) => ({ x: x - 10, y: y - 20 })),
  setViewport: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomTo: vi.fn(),
}));

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");

  return {
    ...actual,
    Background: () => <div data-testid="workflow-background" />,
    MiniMap: () => <div data-testid="workflow-minimap" />,
    ReactFlow: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
      reactFlowProps.latest = props;
      return <div data-testid="workflow-react-flow">{children}</div>;
    },
    useNodesInitialized: () => false,
    useReactFlow: () => ({
      fitView: reactFlowProps.fitView,
      getNodesBounds: reactFlowProps.getNodesBounds,
      screenToFlowPosition: reactFlowProps.screenToFlowPosition,
      setViewport: reactFlowProps.setViewport,
      zoomIn: reactFlowProps.zoomIn,
      zoomOut: reactFlowProps.zoomOut,
      zoomTo: reactFlowProps.zoomTo,
    }),
    useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  };
});

function renderWorkflowCanvas(overrides: Partial<ComponentProps<typeof WorkflowCanvas>> = {}) {
  const props: ComponentProps<typeof WorkflowCanvas> = {
    allowedInsertableNodeKinds: insertableNodeKinds,
    canRedo: false,
    canUndo: false,
    edges: [],
    nodes: [],
    onAddNode: vi.fn(),
    onArrange: vi.fn(),
    onConnect: vi.fn(),
    onEdgesChange: vi.fn(),
    onIsValidConnection: vi.fn(() => true),
    onNodeDrag: vi.fn(),
    onNodeDragStart: vi.fn(),
    onNodeDragStop: vi.fn(),
    onNodeHoverEnd: vi.fn(),
    onNodeHoverStart: vi.fn(),
    onNodesChange: vi.fn(),
    onPaletteOpenChange: vi.fn(),
    onPaneClick: vi.fn(),
    onRedo: vi.fn(),
    onSelectEdge: vi.fn(),
    onSelectNode: vi.fn(),
    onUndo: vi.fn(),
    onViewportChangeEnd: vi.fn(),
    paletteOpen: false,
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };

  return render(<WorkflowCanvas {...props} />);
}

describe("WorkflowCanvas", () => {
  beforeEach(() => {
    reactFlowProps.fitView.mockClear();
    reactFlowProps.zoomIn.mockClear();
    reactFlowProps.zoomOut.mockClear();
    reactFlowProps.zoomTo.mockClear();
  });

  it("keeps React Flow color mode synchronized with appearance preferences", () => {
    renderWorkflowCanvas();
    expect(reactFlowProps.latest?.colorMode).toBe("light");

    act(() => {
      useAppearanceStore.setState({
        isSystemDarkMode: true,
        themePreference: "system",
      });
    });
    expect(reactFlowProps.latest?.colorMode).toBe("dark");

    act(() => {
      useAppearanceStore.setState({
        isSystemDarkMode: true,
        themePreference: "light",
      });
    });
    expect(reactFlowProps.latest?.colorMode).toBe("light");

    act(() => {
      useAppearanceStore.setState({
        isSystemDarkMode: false,
        themePreference: "system",
      });
    });
  });

  it("uses left-button pane dragging and wheel zooming", () => {
    renderWorkflowCanvas();

    expect(reactFlowProps.latest?.panOnDrag).toBe(true);
    expect(reactFlowProps.latest?.panOnScroll).toBe(false);
    expect(reactFlowProps.latest?.nodeClickDistance).toBe(4);
    expect(reactFlowProps.latest?.nodeDragThreshold).toBe(4);
    expect(reactFlowProps.latest?.paneClickDistance).toBe(8);
    expect(reactFlowProps.latest?.zoomOnScroll).toBe(true);
    expect(reactFlowProps.latest?.selectionOnDrag).toBe(false);
    expect(reactFlowProps.latest?.deleteKeyCode).toBeNull();
    expect(reactFlowProps.latest?.multiSelectionKeyCode).toBeNull();
  });

  it("groups canvas actions in a single bottom toolbar", () => {
    renderWorkflowCanvas();
    const toolbar = screen.getByLabelText("画布工具");

    expect(within(toolbar).getByRole("button", { name: "缩小" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "放大" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "撤销" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "重做" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "自动整理画布" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "显示小地图" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "打开节点库" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "打开变量面板" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择模式" })).not.toBeInTheDocument();
  });

  it("keeps zoom, fit, and minimap controls interactive", async () => {
    renderWorkflowCanvas();
    const toolbar = screen.getByLabelText("画布工具");

    fireEvent.click(within(toolbar).getByRole("button", { name: "缩小" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "放大" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "当前缩放 100%，打开缩放菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "200%" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "当前缩放 100%，打开缩放菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "25%" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "当前缩放 100%，打开缩放菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "适配画布" }));

    expect(screen.queryByTestId("workflow-minimap")).not.toBeInTheDocument();
    fireEvent.click(within(toolbar).getByRole("button", { name: "显示小地图" }));
    expect(screen.getByTestId("workflow-minimap")).toBeInTheDocument();
    fireEvent.click(within(toolbar).getByRole("button", { name: "显示小地图" }));
    expect(screen.queryByTestId("workflow-minimap")).not.toBeInTheDocument();

    expect(reactFlowProps.zoomOut).toHaveBeenCalledTimes(1);
    expect(reactFlowProps.zoomIn).toHaveBeenCalledTimes(1);
    expect(reactFlowProps.zoomTo).toHaveBeenNthCalledWith(1, 2);
    expect(reactFlowProps.zoomTo).toHaveBeenNthCalledWith(2, 0.25);
    expect(reactFlowProps.fitView).toHaveBeenCalledTimes(1);
  });

  it("uses the shared interactive zoom range while preview initialization remains custom", () => {
    renderWorkflowCanvas({ fitViewOnInit: true, preview: true });

    expect(reactFlowProps.latest?.fitView).toBe(false);
    expect(reactFlowProps.latest?.minZoom).toBe(0.25);
    expect(reactFlowProps.latest?.maxZoom).toBe(2);
  });

  it("clamps preview zoom and anchors the start node to the left edge", () => {
    const viewport = getWorkflowPreviewViewport({
      bounds: { height: 400, width: 2_000, x: 100, y: 80 },
      height: 800,
      startX: 100,
      width: 1_000,
    });

    expect(viewport.zoom).toBe(0.7);
    expect(viewport.x).toBe(-22);

    const smallGraphViewport = getWorkflowPreviewViewport({
      bounds: { height: 120, width: 240, x: 20, y: 40 },
      height: 800,
      startX: 20,
      width: 1_000,
    });

    expect(smallGraphViewport.zoom).toBe(1);
    expect(smallGraphViewport.x).toBe(28);
  });

  it("keeps viewport navigation enabled while graph editing is read-only", () => {
    renderWorkflowCanvas({ isReadOnly: true });

    expect(reactFlowProps.latest?.nodesConnectable).toBe(false);
    expect(reactFlowProps.latest?.nodesDraggable).toBe(false);
    expect(reactFlowProps.latest?.panOnDrag).toBe(true);
    expect(reactFlowProps.latest?.zoomOnScroll).toBe(true);
    expect(screen.queryByRole("button", { name: "自动整理画布" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开节点库" })).not.toBeInTheDocument();
  });

  it("allows node movement without enabling graph editing tools", () => {
    renderWorkflowCanvas({ canMoveNodes: true, isReadOnly: true });

    expect(reactFlowProps.latest?.nodesConnectable).toBe(false);
    expect(reactFlowProps.latest?.nodesDraggable).toBe(true);
    expect(screen.queryByRole("button", { name: "自动整理画布" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开节点库" })).not.toBeInTheDocument();
  });

  it("keeps React Flow node position and selection changes local to the canvas", () => {
    const onNodesChange = vi.fn();
    renderWorkflowCanvas({
      nodes: createInitialNodes(),
      onNodesChange,
    });

    const handleNodesChange = reactFlowProps.latest?.onNodesChange as NonNullable<
      ComponentProps<typeof WorkflowCanvas>["onNodesChange"]
    >;

    act(() => {
      handleNodesChange([
        {
          dragging: true,
          id: "wait-2d",
          position: { x: 420, y: 120 },
          type: "position",
        },
        {
          id: "message-welcome",
          selected: true,
          type: "select",
        },
      ]);
    });

    expect(onNodesChange).not.toHaveBeenCalled();

    act(() => {
      handleNodesChange([
        {
          id: "wait-2d",
          type: "remove",
        },
      ]);
    });

    expect(onNodesChange).toHaveBeenCalledTimes(1);
    expect(onNodesChange).toHaveBeenCalledWith([{
      id: "wait-2d",
      type: "remove",
    }]);
  });

  it("keeps the bottom palette open and anchors added nodes beside the clicked item", () => {
    const onAddNode = vi.fn();
    const onPaletteOpenChange = vi.fn();
    renderWorkflowCanvas({
      onAddNode,
      onPaletteOpenChange,
      paletteOpen: true,
    });
    const picker = screen.getByRole("region", { name: "节点库" });
    vi.spyOn(picker, "getBoundingClientRect").mockReturnValue({
      bottom: 500,
      height: 400,
      left: 40,
      right: 400,
      top: 100,
      width: 360,
      x: 40,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole("button", { name: "添加 等待节点" }), {
      clientY: 240,
      detail: 1,
    });

    expect(reactFlowProps.screenToFlowPosition).toHaveBeenCalledWith({ x: 424, y: 240 });
    expect(onAddNode).toHaveBeenCalledWith("wait", { x: 414, y: 220 });
    expect(onPaletteOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "节点库" })).toBeInTheDocument();
  });

  it("only exposes node kinds allowed by the Workflow capability profile", () => {
    const allowedInsertableNodeKinds = getWorkflowCapabilityProfile("wecom_sop")
      .allowedNodeKinds
      .filter(canInsertNodeKind);

    renderWorkflowCanvas({
      allowedInsertableNodeKinds,
      paletteOpen: true,
    });

    expect(screen.getByRole("button", { name: "添加 等待节点" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加 消息发送节点" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加 转人工节点" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加 转 Agent节点" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加 等待事件节点" })).not.toBeInTheDocument();
  });

  it("hides non-runtime-ready nodes from the palette in production", () => {
    vi.stubEnv("PROD", true);
    try {
      renderWorkflowCanvas({ paletteOpen: true });

      expect(screen.getByRole("button", { name: "添加 等待节点" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "添加 转 Agent节点" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "添加 写入智能表格节点" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "添加 发券节点" })).toBeInTheDocument();
    }
    finally {
      vi.unstubAllEnvs();
    }
  });

  it("shows all insertable nodes without a search control", () => {
    renderWorkflowCanvas({ paletteOpen: true });
    const palette = screen.getByRole("region", { name: "节点库" });

    expect(within(palette).getByRole("button", { name: "添加 转人工节点" })).toBeInTheDocument();
    expect(within(palette).getByRole("button", { name: "添加 发券节点" })).toBeInTheDocument();
    expect(within(palette).getByRole("button", { name: "添加 写入智能表格节点" })).toBeInTheDocument();
    expect(within(palette).queryByRole("textbox")).not.toBeInTheDocument();
  });
});
