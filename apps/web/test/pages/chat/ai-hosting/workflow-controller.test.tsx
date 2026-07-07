import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialEdges,
  createInitialNodes,
} from "@/pages/chat/ai-hosting/workflow/graph";
import { useWorkflowController } from "@/pages/chat/ai-hosting/workflow/use-workflow-controller";
import type { WorkflowDraft } from "@/pages/chat/ai-hosting/workflow/types";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");

  return {
    ...actual,
    applyEdgeChanges: (_changes: unknown, edges: unknown) => edges,
    applyNodeChanges: (
      changes: Array<{
        id: string;
        position?: { x: number; y: number };
        type: string;
      }>,
      nodes: Array<{
        id: string;
        position?: { x: number; y: number };
      }>,
    ) =>
      nodes.map((node) => {
        const positionChange = changes.find(
          (change) => change.type === "position" && change.id === node.id && change.position,
        );

        return positionChange
          ? {
              ...node,
              position: positionChange.position,
            }
          : node;
      }),
  };
});

describe("useWorkflowController", () => {
  function createDraft(): WorkflowDraft {
    return {
      edges: createInitialEdges(),
      nodes: createInitialNodes(),
    };
  }

  it("undoes a node move back to the drag start draft", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );
    const originalPosition = result.current.nodes.find((node) => node.id === "wait-2d")?.position;

    act(() => {
      result.current.onNodesChange([
        {
          dragging: true,
          id: "wait-2d",
          position: { x: 420, y: 120 },
          type: "position",
        },
      ]);
    });
    rerender({ draft: initialDraft });

    expect(result.current.nodes.find((node) => node.id === "wait-2d")?.position).toEqual({
      x: 420,
      y: 120,
    });
    expect(result.current.canUndo).toBe(false);

    act(() => {
      result.current.onNodesChange([
        {
          dragging: false,
          id: "wait-2d",
          position: { x: 420, y: 120 },
          type: "position",
        },
      ]);
    });
    rerender({ draft: initialDraft });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.nextUndoLabel).toBe("移动节点");

    act(() => {
      result.current.undo();
    });

    expect(result.current.nodes.find((node) => node.id === "wait-2d")?.position).toEqual(originalPosition);
    expect(result.current.nextRedoLabel).toBe("移动节点");
  });

  it("undoes a multi-node move as one history step", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );
    const originalWaitPosition = result.current.nodes.find((node) => node.id === "wait-2d")?.position;
    const originalBranchPosition = result.current.nodes.find((node) => node.id === "branch-intent")?.position;

    act(() => {
      result.current.onNodesChange([
        {
          dragging: true,
          id: "wait-2d",
          position: { x: 400, y: 80 },
          type: "position",
        },
        {
          dragging: true,
          id: "branch-intent",
          position: { x: 700, y: 80 },
          type: "position",
        },
      ]);
    });
    rerender({ draft: initialDraft });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.nodes.find((node) => node.id === "wait-2d")?.position).toEqual({ x: 400, y: 80 });
    expect(result.current.nodes.find((node) => node.id === "branch-intent")?.position).toEqual({ x: 700, y: 80 });

    act(() => {
      result.current.onNodesChange([
        {
          dragging: false,
          id: "wait-2d",
          position: { x: 430, y: 120 },
          type: "position",
        },
        {
          dragging: false,
          id: "branch-intent",
          position: { x: 730, y: 120 },
          type: "position",
        },
      ]);
    });
    rerender({ draft: initialDraft });

    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });

    expect(result.current.nodes.find((node) => node.id === "wait-2d")?.position).toEqual(originalWaitPosition);
    expect(result.current.nodes.find((node) => node.id === "branch-intent")?.position).toEqual(originalBranchPosition);
    expect(result.current.canUndo).toBe(false);
  });

  it("creates unique node ids for repeated node additions", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );

    act(() => {
      result.current.addNode("ai");
    });
    rerender({ draft: initialDraft });

    const firstNodeId = result.current.nodes.find((node) =>
      node.data.kind === "ai" && node.id !== "ai",
    )?.id;

    act(() => {
      result.current.addNode("ai");
    });
    rerender({ draft: initialDraft });

    const aiNodeIds = result.current.nodes
      .filter((node) => node.data.kind === "ai")
      .map((node) => node.id);

    expect(firstNodeId).toMatch(/^ai-/);
    expect(new Set(aiNodeIds).size).toBe(aiNodeIds.length);
    expect(aiNodeIds).toHaveLength(2);
  });

  it("resets workflow state when a different draft is loaded", () => {
    const nextDraft = createDraft();
    nextDraft.nodes = nextDraft.nodes.map((node) =>
      node.id === "trigger"
        ? {
            ...node,
            data: {
              ...node.data,
              title: "复购唤醒触发",
            },
          }
        : node,
    );
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: createDraft() } },
    );

    act(() => {
      result.current.addNode("ai");
    });
    expect(result.current.canUndo).toBe(true);

    rerender({ draft: nextDraft });

    expect(result.current.nodes.find((node) => node.id === "trigger")?.data.title).toBe("复购唤醒触发");
    expect(result.current.canUndo).toBe(false);
  });
});
