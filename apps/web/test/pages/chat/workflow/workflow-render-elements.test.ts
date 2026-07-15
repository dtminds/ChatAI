import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createEdge,
  createInitialNodes,
} from "@/pages/chat/workflow/graph";
import {
  createWorkflowRenderElements,
  useWorkflowRenderElements,
} from "@/pages/chat/workflow/use-workflow-render-elements";

describe("createWorkflowRenderElements", () => {
  it("projects canvas interaction state into node and edge render data", () => {
    const handlers = {
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onInsertNodeAfter: vi.fn(),
      onInsertNodeBetween: vi.fn(),
      onRenameNode: vi.fn(),
      onSelectNode: vi.fn(),
      onToggleEdgeInsertMenu: vi.fn(),
      onToggleNodeInsertMenu: vi.fn(),
      onToggleNodeSelection: vi.fn(),
    };
    const edges = [
      createEdge("start", "wait-2d"),
      createEdge("wait-2d", "end"),
      createEdge("branch-intent", "end", "低意向", {
        sourceHandle: "branch-low",
      }),
    ];

    const rendered = createWorkflowRenderElements({
      ...handlers,
      activeEdgeInsertMenuId: "edge-wait-2d-end",
      edges,
      nodes: createInitialNodes(),
      quickInsertTarget: {
        nodeId: "branch-intent",
        sourceHandle: "branch-low",
      },
      selectedEdgeId: "edge-wait-2d-end",
      selectedNodeIdSet: new Set(["branch-intent"]),
    });

    const selectedNode = rendered.nodes.find((node) => node.id === "branch-intent");
    expect(selectedNode?.selected).toBe(true);
    expect(selectedNode?.zIndex).toBe(20);
    expect(selectedNode?.data.selected).toBe(true);
    expect(selectedNode?.data.insertMenuOpen).toBe(true);
    expect(selectedNode?.data.insertMenuSourceHandle).toBe("branch-low");
    expect(selectedNode?.data.onDuplicate).toBe(handlers.onDuplicateNode);
    expect(selectedNode?.data.onRename).toBe(handlers.onRenameNode);
    selectedNode?.data.onSelect?.("branch-intent");
    selectedNode?.data.onSelect?.("branch-intent", { additive: true });
    expect(handlers.onSelectNode).toHaveBeenCalledWith("branch-intent");
    expect(handlers.onToggleNodeSelection).toHaveBeenCalledWith("branch-intent");

    const regularNode = rendered.nodes.find((node) => node.id === "start");
    expect(regularNode?.selected).toBe(false);
    expect(regularNode?.zIndex).toBeUndefined();
    expect(regularNode?.data.insertMenuOpen).toBe(false);
    expect(regularNode?.data.insertMenuSourceHandle).toBeUndefined();

    expect(rendered.edges[1].selected).toBe(true);
    expect(rendered.edges[1].data?.insertMenuOpen).toBe(true);
    expect(rendered.edges[1].data?.insertableNodeKinds).toEqual([
      "wait",
      "branch",
      "ai-intent",
      "llm",
      "ai-collect",
      "order-query",
      "tag-query",
      "tag",
      "customer-update",
      "message",
      "message-query",
      "handoff",
      "agent",
      "coupon",
    ]);
    expect(rendered.edges[1].data?.onInsertBetween).toBe(handlers.onInsertNodeBetween);
  });

  it("preserves unchanged node render objects while a single node position changes", () => {
    const handlers = {
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onInsertNodeAfter: vi.fn(),
      onInsertNodeBetween: vi.fn(),
      onRenameNode: vi.fn(),
      onSelectNode: vi.fn(),
      onToggleEdgeInsertMenu: vi.fn(),
      onToggleNodeInsertMenu: vi.fn(),
      onToggleNodeSelection: vi.fn(),
    };
    const edges = [
      createEdge("start", "wait-2d"),
      createEdge("wait-2d", "end"),
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
    const firstStartNode = result.current.nodes.find((node) => node.id === "start");
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

    expect(result.current.nodes.find((node) => node.id === "start")).toBe(firstStartNode);
    expect(result.current.nodes.find((node) => node.id === "wait-2d")).not.toBe(firstWaitNode);
    expect(result.current.nodes.find((node) => node.id === "wait-2d")?.position).toEqual({ x: 520, y: 80 });
  });

  it("projects hovered edge ids into edge highlight state", () => {
    const handlers = {
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onInsertNodeAfter: vi.fn(),
      onInsertNodeBetween: vi.fn(),
      onRenameNode: vi.fn(),
      onSelectNode: vi.fn(),
      onToggleEdgeInsertMenu: vi.fn(),
      onToggleNodeInsertMenu: vi.fn(),
      onToggleNodeSelection: vi.fn(),
    };
    const edges = [
      createEdge("start", "wait-2d"),
      createEdge("wait-2d", "end"),
    ];

    const rendered = createWorkflowRenderElements({
      ...handlers,
      activeEdgeInsertMenuId: null,
      edges,
      hoveredEdgeIds: new Set(["edge-start-wait-2d"]),
      nodes: createInitialNodes(),
      quickInsertTarget: null,
      selectedEdgeId: null,
      selectedNodeIdSet: new Set(),
    });

    expect(rendered.edges.find((edge) => edge.id === "edge-start-wait-2d")?.data?.highlightState)
      .toBe("connected");
    expect(rendered.edges.find((edge) => edge.id === "edge-wait-2d-end")?.data?.highlightState)
      .toBe("dimmed");
  });
});
