import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createEdge,
  createInitialNodes,
} from "@/pages/chat/ai-hosting/workflow/graph";
import {
  createWorkflowRenderElements,
  useWorkflowRenderElements,
} from "@/pages/chat/ai-hosting/workflow/use-workflow-render-elements";

describe("createWorkflowRenderElements", () => {
  it("projects canvas interaction state into node and edge render data", () => {
    const handlers = {
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onInsertNodeAfter: vi.fn(),
      onInsertNodeBetween: vi.fn(),
      onSelectNode: vi.fn(),
      onToggleEdgeInsertMenu: vi.fn(),
      onToggleNodeInsertMenu: vi.fn(),
      onToggleNodeSelection: vi.fn(),
    };
    const edges = [
      createEdge("trigger", "wait-2d"),
      createEdge("wait-2d", "goal"),
      createEdge("branch-intent", "goal", "低意向", {
        sourceHandle: "branch-low",
      }),
    ];

    const rendered = createWorkflowRenderElements({
      ...handlers,
      activeEdgeInsertMenuId: "edge-wait-2d-goal",
      edges,
      nodes: createInitialNodes(),
      quickInsertTarget: {
        nodeId: "branch-intent",
        sourceHandle: "branch-low",
      },
      selectedEdgeId: "edge-wait-2d-goal",
      selectedNodeIdSet: new Set(["branch-intent"]),
    });

    const selectedNode = rendered.nodes.find((node) => node.id === "branch-intent");
    expect(selectedNode?.selected).toBe(true);
    expect(selectedNode?.zIndex).toBe(20);
    expect(selectedNode?.data.selected).toBe(true);
    expect(selectedNode?.data.insertMenuOpen).toBe(true);
    expect(selectedNode?.data.insertMenuSourceHandle).toBe("branch-low");
    expect(selectedNode?.data.onDuplicate).toBe(handlers.onDuplicateNode);
    selectedNode?.data.onSelect?.("branch-intent");
    selectedNode?.data.onSelect?.("branch-intent", { additive: true });
    expect(handlers.onSelectNode).toHaveBeenCalledWith("branch-intent");
    expect(handlers.onToggleNodeSelection).toHaveBeenCalledWith("branch-intent");

    const regularNode = rendered.nodes.find((node) => node.id === "trigger");
    expect(regularNode?.selected).toBe(false);
    expect(regularNode?.zIndex).toBeUndefined();
    expect(regularNode?.data.insertMenuOpen).toBe(false);
    expect(regularNode?.data.insertMenuSourceHandle).toBeUndefined();

    expect(rendered.edges[1].selected).toBe(true);
    expect(rendered.edges[1].data?.insertMenuOpen).toBe(true);
    expect(rendered.edges[1].data?.insertableNodeKinds).toEqual(["wait", "branch", "action", "ai"]);
    expect(rendered.edges[1].data?.onInsertBetween).toBe(handlers.onInsertNodeBetween);
  });

  it("preserves unchanged node render objects while a single node position changes", () => {
    const handlers = {
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onInsertNodeAfter: vi.fn(),
      onInsertNodeBetween: vi.fn(),
      onSelectNode: vi.fn(),
      onToggleEdgeInsertMenu: vi.fn(),
      onToggleNodeInsertMenu: vi.fn(),
      onToggleNodeSelection: vi.fn(),
    };
    const edges = [
      createEdge("trigger", "wait-2d"),
      createEdge("wait-2d", "goal"),
    ];
    const nodes = createInitialNodes();
    const selectedNodeIdSet = new Set(["wait-2d"]);

    const { rerender, result } = renderHook(
      ({ currentNodes }) =>
        useWorkflowRenderElements({
          ...handlers,
          activeEdgeInsertMenuId: null,
          edges,
          nodes: currentNodes,
          quickInsertTarget: null,
          selectedEdgeId: null,
          selectedNodeIdSet,
        }),
      {
        initialProps: {
          currentNodes: nodes,
        },
      },
    );
    const firstTriggerNode = result.current.nodes.find((node) => node.id === "trigger");
    const firstWaitNode = result.current.nodes.find((node) => node.id === "wait-2d");
    const movedNodes = nodes.map((node) =>
      node.id === "wait-2d"
        ? {
            ...node,
            position: { x: 520, y: 80 },
          }
        : node,
    );

    rerender({ currentNodes: movedNodes });

    expect(result.current.nodes.find((node) => node.id === "trigger")).toBe(firstTriggerNode);
    expect(result.current.nodes.find((node) => node.id === "wait-2d")).not.toBe(firstWaitNode);
    expect(result.current.nodes.find((node) => node.id === "wait-2d")?.position).toEqual({ x: 520, y: 80 });
  });

  it("projects hovered edge ids into edge highlight state", () => {
    const handlers = {
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onInsertNodeAfter: vi.fn(),
      onInsertNodeBetween: vi.fn(),
      onSelectNode: vi.fn(),
      onToggleEdgeInsertMenu: vi.fn(),
      onToggleNodeInsertMenu: vi.fn(),
      onToggleNodeSelection: vi.fn(),
    };
    const edges = [
      createEdge("trigger", "wait-2d"),
      createEdge("wait-2d", "goal"),
    ];

    const rendered = createWorkflowRenderElements({
      ...handlers,
      activeEdgeInsertMenuId: null,
      edges,
      hoveredEdgeIds: new Set(["edge-trigger-wait-2d"]),
      nodes: createInitialNodes(),
      quickInsertTarget: null,
      selectedEdgeId: null,
      selectedNodeIdSet: new Set(),
    });

    expect(rendered.edges.find((edge) => edge.id === "edge-trigger-wait-2d")?.data?.highlightState)
      .toBe("connected");
    expect(rendered.edges.find((edge) => edge.id === "edge-wait-2d-goal")?.data?.highlightState)
      .toBe("dimmed");
  });
});
