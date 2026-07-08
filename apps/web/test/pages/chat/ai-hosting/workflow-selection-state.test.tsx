import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createEdge,
  createInitialNodes,
} from "@/pages/chat/ai-hosting/workflow/graph";
import { useWorkflowSelectionState } from "@/pages/chat/ai-hosting/workflow/use-workflow-selection-state";

describe("useWorkflowSelectionState", () => {
  it("falls back when the selected node no longer exists", () => {
    const initialNodes = createInitialNodes();
    const { rerender, result } = renderHook(
      ({ nodes }) =>
        useWorkflowSelectionState({
          defaultNodeId: "action-message",
          edges: [],
          nodes,
        }),
      {
        initialProps: { nodes: initialNodes },
      },
    );

    expect(result.current.selectedNodeId).toBe("action-message");

    rerender({ nodes: initialNodes.filter((node) => node.id !== "action-message") });

    expect(result.current.selectedNodeId).toBe("trigger");
    expect(result.current.selectedNode?.id).toBe("trigger");
  });

  it("tracks selected edges and hovered connected edges", () => {
    const edges = [
      createEdge("trigger", "wait-2d"),
      createEdge("wait-2d", "goal"),
      createEdge("branch-intent", "goal"),
    ];
    const { result } = renderHook(() =>
      useWorkflowSelectionState({
        defaultNodeId: "action-message",
        edges,
        nodes: createInitialNodes(),
      }),
    );

    act(() => {
      result.current.selectEdge("edge-wait-2d-goal");
      result.current.handleNodeHoverStart("wait-2d");
    });

    expect(result.current.selectedEdgeId).toBe("edge-wait-2d-goal");
    expect(result.current.selectedNodeId).toBeNull();
    expect(result.current.selectedNode).toBeUndefined();
    expect(result.current.selectionDeleteTarget).toEqual({
      edgeId: "edge-wait-2d-goal",
      type: "edge",
    });
    expect(Array.from(result.current.hoveredEdgeIds ?? [])).toEqual([
      "edge-trigger-wait-2d",
      "edge-wait-2d-goal",
    ]);

    act(() => {
      result.current.selectNode("trigger");
    });

    expect(result.current.selectedNodeId).toBe("trigger");
    expect(result.current.selectedEdgeId).toBeNull();
    expect(result.current.selectionDeleteTarget).toEqual({
      nodeIds: ["trigger"],
      type: "nodes",
    });
  });

  it("clears stale edge selection when the edge no longer exists", () => {
    const initialEdges = [
      createEdge("trigger", "wait-2d"),
      createEdge("wait-2d", "goal"),
    ];
    const { rerender, result } = renderHook(
      ({ edges }) =>
        useWorkflowSelectionState({
          defaultNodeId: "action-message",
          edges,
          nodes: createInitialNodes(),
        }),
      {
        initialProps: { edges: initialEdges },
      },
    );

    act(() => {
      result.current.selectEdge("edge-wait-2d-goal");
    });

    expect(result.current.selectedEdgeId).toBe("edge-wait-2d-goal");

    rerender({ edges: [createEdge("trigger", "wait-2d")] });

    expect(result.current.selectedEdgeId).toBeNull();
    expect(result.current.selectedNodeIds).toEqual([]);
    expect(result.current.selectionDeleteTarget).toEqual({ type: "none" });
  });

  it("tracks multiple selected nodes without exposing a single inspector node", () => {
    const { result } = renderHook(() =>
      useWorkflowSelectionState({
        defaultNodeId: "action-message",
        edges: [],
        nodes: createInitialNodes(),
      }),
    );

    act(() => {
      result.current.selectNodes(["wait-2d", "branch-intent"]);
    });

    expect(result.current.selectedNodeIds).toEqual(["wait-2d", "branch-intent"]);
    expect(result.current.selectedNodeId).toBeNull();
    expect(result.current.selectedNode).toBeUndefined();
    expect(result.current.selectedNodes.map((node) => node.id)).toEqual(["wait-2d", "branch-intent"]);
    expect(result.current.selectedNodeIdSet.has("wait-2d")).toBe(true);
  });

  it("toggles individual nodes for modifier-click multi selection", () => {
    const { result } = renderHook(() =>
      useWorkflowSelectionState({
        defaultNodeId: "action-message",
        edges: [],
        nodes: createInitialNodes(),
      }),
    );

    act(() => {
      result.current.toggleNodeSelection("wait-2d");
      result.current.toggleNodeSelection("action-message");
    });

    expect(result.current.selectedNodeIds).toEqual(["wait-2d"]);
    expect(result.current.selectedNodeId).toBe("wait-2d");

    act(() => {
      result.current.toggleNodeSelection("branch-intent");
    });

    expect(result.current.selectedNodeIds).toEqual(["wait-2d", "branch-intent"]);
    expect(result.current.selectedNodeId).toBeNull();
  });
});
