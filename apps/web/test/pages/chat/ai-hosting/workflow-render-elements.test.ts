import { describe, expect, it, vi } from "vitest";
import {
  createEdge,
  createInitialNodes,
} from "@/pages/chat/ai-hosting/workflow/graph";
import { createWorkflowRenderElements } from "@/pages/chat/ai-hosting/workflow/use-workflow-render-elements";

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
      hoveredEdgeIds: new Set(["edge-trigger-wait-2d", "edge-wait-2d-goal"]),
      nodes: createInitialNodes(),
      quickInsertTarget: {
        nodeId: "branch-intent",
        sourceHandle: "branch-low",
      },
      selectedEdgeId: "edge-wait-2d-goal",
      selectedNodeId: "branch-intent",
    });

    const selectedNode = rendered.nodes.find((node) => node.id === "branch-intent");
    expect(selectedNode?.selected).toBe(true);
    expect(selectedNode?.zIndex).toBe(20);
    expect(selectedNode?.data.selected).toBe(true);
    expect(selectedNode?.data.insertMenuOpen).toBe(true);
    expect(selectedNode?.data.insertMenuSourceHandle).toBe("branch-low");
    expect(selectedNode?.data.onDuplicate).toBe(handlers.onDuplicateNode);

    const regularNode = rendered.nodes.find((node) => node.id === "trigger");
    expect(regularNode?.selected).toBe(false);
    expect(regularNode?.zIndex).toBeUndefined();
    expect(regularNode?.data.insertMenuOpen).toBe(false);
    expect(regularNode?.data.insertMenuSourceHandle).toBeUndefined();

    expect(rendered.edges[0].data?.highlightState).toBe("connected");
    expect(rendered.edges[1].selected).toBe(true);
    expect(rendered.edges[1].data?.insertMenuOpen).toBe(true);
    expect(rendered.edges[1].data?.onInsertBetween).toBe(handlers.onInsertNodeBetween);
    expect(rendered.edges[2].data?.highlightState).toBe("dimmed");
  });
});
