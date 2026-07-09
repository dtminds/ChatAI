import { act, render } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialNodes,
} from "@/pages/chat/workflow/graph";
import { WorkflowCanvas } from "@/pages/chat/workflow/canvas/workflow-canvas";

const reactFlowProps = vi.hoisted(() => ({
  latest: undefined as Record<string, unknown> | undefined,
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
    useReactFlow: () => ({
      fitView: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      zoomTo: vi.fn(),
    }),
    useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  };
});

function renderWorkflowCanvas(overrides: Partial<ComponentProps<typeof WorkflowCanvas>> = {}) {
  const props: ComponentProps<typeof WorkflowCanvas> = {
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
    onOpenVariables: vi.fn(),
    onPaletteOpenChange: vi.fn(),
    onPaneClick: vi.fn(),
    onRedo: vi.fn(),
    onSearchChange: vi.fn(),
    onSelectEdge: vi.fn(),
    onSelectNode: vi.fn(),
    onUndo: vi.fn(),
    onViewportChangeEnd: vi.fn(),
    paletteOpen: false,
    searchValue: "",
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };

  return render(<WorkflowCanvas {...props} />);
}

describe("WorkflowCanvas", () => {
  it("uses left-button pane dragging and wheel zooming", () => {
    renderWorkflowCanvas();

    expect(reactFlowProps.latest?.panOnDrag).toBe(true);
    expect(reactFlowProps.latest?.panOnScroll).toBe(false);
    expect(reactFlowProps.latest?.zoomOnScroll).toBe(true);
    expect(reactFlowProps.latest?.selectionOnDrag).toBe(false);
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
          id: "action-message",
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
});
