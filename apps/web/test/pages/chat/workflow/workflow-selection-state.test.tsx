import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createEdge,
  createInitialNodes,
} from "@/pages/chat/workflow/graph";
import { useWorkflowSelectionState } from "@/pages/chat/workflow/use-workflow-selection-state";

describe("useWorkflowSelectionState", () => {
  it("falls back when the selected node no longer exists", () => {
    const initialNodes = createInitialNodes();
    const { rerender, result } = renderHook(
      ({ nodes }) =>
        useWorkflowSelectionState({
          defaultNodeId: "message-welcome",
          edges: [],
          nodes,
        }),
      {
        initialProps: { nodes: initialNodes },
      },
    );

    expect(result.current.selectedNodeId).toBe("message-welcome");

    rerender({ nodes: initialNodes.filter((node) => node.id !== "message-welcome") });

    expect(result.current.selectedNodeId).toBe("start");
    expect(result.current.selectedNode?.id).toBe("start");
  });

  it("tracks selected edges and hovered connected edges", () => {
    const edges = [
      createEdge("start", "wait-2d"),
      createEdge("wait-2d", "end"),
      createEdge("branch-intent", "end"),
    ];
    const { result } = renderHook(() =>
      useWorkflowSelectionState({
        defaultNodeId: "message-welcome",
        edges,
        nodes: createInitialNodes(),
      }),
    );

    act(() => {
      result.current.selectEdge("edge-wait-2d-end");
      result.current.handleNodeHoverStart("wait-2d");
    });

    expect(result.current.selectedEdgeId).toBe("edge-wait-2d-end");
    expect(result.current.selectedNodeId).toBeNull();
    expect(result.current.selectedNode).toBeUndefined();
    expect(result.current.selectionDeleteTarget).toEqual({
      edgeId: "edge-wait-2d-end",
      type: "edge",
    });
    expect(Array.from(result.current.hoveredEdgeIds ?? [])).toEqual([
      "edge-start-wait-2d",
      "edge-wait-2d-end",
    ]);

    act(() => {
      result.current.selectNode("start");
    });

    expect(result.current.selectedNodeId).toBe("start");
    expect(result.current.selectedEdgeId).toBeNull();
    expect(result.current.selectionDeleteTarget).toEqual({
      nodeIds: ["start"],
      type: "nodes",
    });
  });

  it("clears stale edge selection when the edge no longer exists", () => {
    const initialEdges = [
      createEdge("start", "wait-2d"),
      createEdge("wait-2d", "end"),
    ];
    const { rerender, result } = renderHook(
      ({ edges }) =>
        useWorkflowSelectionState({
          defaultNodeId: "message-welcome",
          edges,
          nodes: createInitialNodes(),
        }),
      {
        initialProps: { edges: initialEdges },
      },
    );

    act(() => {
      result.current.selectEdge("edge-wait-2d-end");
    });

    expect(result.current.selectedEdgeId).toBe("edge-wait-2d-end");

    rerender({ edges: [createEdge("start", "wait-2d")] });

    expect(result.current.selectedEdgeId).toBeNull();
    expect(result.current.selectedNodeIds).toEqual([]);
    expect(result.current.selectionDeleteTarget).toEqual({ type: "none" });
  });

  it("tracks multiple selected nodes without exposing a single inspector node", () => {
    const { result } = renderHook(() =>
      useWorkflowSelectionState({
        defaultNodeId: "message-welcome",
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
        defaultNodeId: "message-welcome",
        edges: [],
        nodes: createInitialNodes(),
      }),
    );

    act(() => {
      result.current.toggleNodeSelection("wait-2d");
      result.current.toggleNodeSelection("message-welcome");
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
