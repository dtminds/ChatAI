import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflowWorkspace } from "@/pages/chat/ai-hosting/workflow/use-workflow-workspace";
import {
  createWorkflowClipboardData,
  stringifyWorkflowClipboardData,
} from "@/pages/chat/ai-hosting/workflow/workflow-clipboard";
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

function setNavigatorClipboard(clipboard: Partial<Clipboard> | undefined) {
  const previousClipboard = navigator.clipboard;

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });

  return () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: previousClipboard,
    });
  };
}

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

  it("navigates from publish check items to the affected node", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.topBar.onPublishCheck();
      result.current.checks.onNavigateToNode("branch-intent");
    });

    expect(result.current.checks.isOpen).toBe(false);
    expect(result.current.inspector.isOpen).toBe(true);
    expect(result.current.inspector.node?.id).toBe("branch-intent");
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

  it("copies and pastes the selected node through shortcuts with undo and redo support", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectNode("action-message");
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "c" }));
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "v" }));
    });

    const pastedNodeId = result.current.inspector.node?.id;
    expect(pastedNodeId).toMatch(/^action-/);
    expect(result.current.canvas.nodes.some((node) => node.id === pastedNodeId)).toBe(true);
    expect(result.current.canvas.canUndo).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "z" }));
    });

    expect(result.current.canvas.nodes.some((node) => node.id === pastedNodeId)).toBe(false);
    expect(result.current.canvas.canRedo).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "y" }));
    });

    expect(result.current.canvas.nodes.some((node) => node.id === pastedNodeId)).toBe(true);
  });

  it("copies and pastes selected nodes with their internal edges", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectionChange({
        edges: [],
        nodes: result.current.canvas.nodes.filter((node) =>
          node.id === "wait-2d" || node.id === "branch-intent",
        ),
      });
    });

    expect(result.current.inspector.node).toBeUndefined();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "c" }));
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "v" }));
    });

    const pastedWaitNode = result.current.canvas.nodes.find((node) =>
      node.id !== "wait-2d" && node.data.kind === "wait" && node.data.title === "观察期 (1)",
    );
    const pastedBranchNode = result.current.canvas.nodes.find((node) =>
      node.id !== "branch-intent" && node.data.kind === "branch" && node.data.title === "意向判断 (1)",
    );

    expect(pastedWaitNode?.id).toMatch(/^wait-/);
    expect(pastedBranchNode?.id).toMatch(/^branch-/);
    expect(result.current.canvas.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: pastedWaitNode?.id,
        target: pastedBranchNode?.id,
      }),
    ]));
  });

  it("deletes selected nodes as one undoable workflow change", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectionChange({
        edges: [],
        nodes: result.current.canvas.nodes.filter((node) =>
          node.id === "wait-2d" || node.id === "action-message",
        ),
      });
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    });

    expect(result.current.canvas.nodes.some((node) => node.id === "wait-2d")).toBe(false);
    expect(result.current.canvas.nodes.some((node) => node.id === "action-message")).toBe(false);
    expect(result.current.canvas.canUndo).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "z" }));
    });

    expect(result.current.canvas.nodes.some((node) => node.id === "wait-2d")).toBe(true);
    expect(result.current.canvas.nodes.some((node) => node.id === "action-message")).toBe(true);
  });

  it("pastes workflow data from the system clipboard before using local clipboard fallback", async () => {
    const systemClipboardData = createWorkflowClipboardData(
      getWorkflowDocument("newcomer-conversion").draft,
      ["wait-2d"],
    )!;
    const restoreClipboard = setNavigatorClipboard({
      readText: vi.fn().mockResolvedValue(stringifyWorkflowClipboardData(systemClipboardData)),
      writeText: vi.fn().mockResolvedValue(undefined),
    });
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    try {
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "v" }));
      });

      await waitFor(() => {
        expect(result.current.inspector.node?.id).toMatch(/^wait-/);
      });
      expect(result.current.inspector.node?.data.title).toBe("观察期 (1)");
    }
    finally {
      restoreClipboard();
    }
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
    expect(result.current.inspector.variables?.inputs.map((variable) => variable.name)).toContain(
      "trigger.trigger.result",
    );
  });
});
