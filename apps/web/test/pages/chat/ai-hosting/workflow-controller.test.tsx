import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkflowController } from "@/pages/chat/ai-hosting/workflow/use-workflow-controller";

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
  it("undoes a node move back to the drag start draft", () => {
    const { rerender, result } = renderHook(() => useWorkflowController());
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
    rerender();

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
    rerender();

    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });

    expect(result.current.nodes.find((node) => node.id === "wait-2d")?.position).toEqual(originalPosition);
  });
});
