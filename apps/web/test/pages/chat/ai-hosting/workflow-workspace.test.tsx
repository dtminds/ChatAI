import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflowWorkspace } from "@/pages/chat/ai-hosting/workflow/use-workflow-workspace";
import {
  getWorkflowDocument,
  resetWorkflowDocumentsForTest,
} from "@/pages/chat/ai-hosting/workflow/workflow-draft-service";

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

describe("useWorkflowWorkspace", () => {
  beforeEach(() => {
    resetWorkflowDocumentsForTest();
  });

  it("selects nodes and opens the inspector while closing checks", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.topBar.onPublishCheck();
    });
    expect(result.current.checks.isOpen).toBe(true);

    act(() => {
      result.current.canvas.onSelectNode("wait-2d");
    });

    expect(result.current.checks.isOpen).toBe(false);
    expect(result.current.inspector.isOpen).toBe(true);
    expect(result.current.inspector.node?.id).toBe("wait-2d");
  });

  it("deletes only the selected edge from shortcut orchestration", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectNode("action-message");
      result.current.canvas.onSelectEdge("edge-action-message-goal");
    });
    expect(result.current.inspector.node).toBeUndefined();
    expect(result.current.canvas.edges.some((edge) => edge.id === "edge-action-message-goal")).toBe(true);
    expect(result.current.canvas.nodes.some((node) => node.id === "action-message")).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    });

    expect(result.current.canvas.edges.some((edge) => edge.id === "edge-action-message-goal")).toBe(false);
    expect(result.current.canvas.nodes.some((node) => node.id === "action-message")).toBe(true);
  });

  it("routes node run results into the run inspector tab", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectNode("action-message");
      result.current.inspector.onRunNode();
    });

    expect(result.current.inspector.activeTab).toBe("run");
    expect(result.current.inspector.lastRun?.status).toBe("succeeded");
  });

  it("clears deleted node run records from workspace state", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectNode("action-message");
      result.current.inspector.onRunNode();
    });
    expect(result.current.inspector.lastRun?.status).toBe("succeeded");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    });

    expect(result.current.canvas.nodes.some((node) => node.id === "action-message")).toBe(false);
    expect(result.current.inspector.lastRun).toBeUndefined();
  });

  it("does not mark dirty drafts as saved when opening publish checks", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.inspector.onNodeChange({ title: "更新后的动作节点" });
    });
    expect(result.current.topBar.saveState).toBe("saving");

    act(() => {
      result.current.topBar.onPublishCheck();
    });

    expect(result.current.checks.isOpen).toBe(true);
    expect(result.current.topBar.saveState).toBe("saving");
  });

  it("persists node config drafts through the workspace save boundary", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

      act(() => {
        result.current.inspector.onNodeChange({ title: "保存后的动作节点" });
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "action-message")?.data.title)
        .toBe("保存后的动作节点");
      expect(result.current.topBar.saveState).toBe("saved");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("opens variables through canvas controls and clears canvas menus", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onPaletteOpenChange(true);
    });
    expect(result.current.canvas.paletteOpen).toBe(true);

    act(() => {
      result.current.canvas.onOpenVariables();
    });

    expect(result.current.inspector.activeTab).toBe("variables");
    expect(result.current.inspector.isOpen).toBe(true);
  });
});
