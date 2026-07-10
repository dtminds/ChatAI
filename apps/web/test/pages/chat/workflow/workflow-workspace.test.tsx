import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflowWorkspace } from "@/pages/chat/workflow/use-workflow-workspace";
import {
  createEdge,
  createNodeFromKind,
} from "@/pages/chat/workflow/graph";
import {
  createInMemoryWorkflowDraftRepository,
  getWorkflowDocument,
  importWorkflowDraft,
  publishWorkflowDraft,
  resetWorkflowDocumentsForTest,
} from "@/pages/chat/workflow/workflow-draft-service";
import type {
  WorkflowDraftRepository,
  WorkflowDraftPublishOptions,
} from "@/pages/chat/workflow/workflow-draft-service";
import type { WorkflowDraft } from "@/pages/chat/workflow/types";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");

  return {
    ...actual,
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
      result.current.canvas.onPaletteOpenChange(true);
    });
    expect(result.current.checks.isOpen).toBe(true);
    expect(result.current.canvas.paletteOpen).toBe(true);

    act(() => {
      result.current.canvas.onSelectNode("wait-2d");
    });

    expect(result.current.checks.isOpen).toBe(false);
    expect(result.current.canvas.paletteOpen).toBe(false);
    expect(result.current.inspector.isOpen).toBe(true);
    expect(result.current.inspector.node?.id).toBe("wait-2d");
  });

  it("clears selected nodes when clicking the empty canvas pane", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectNode("wait-2d");
    });
    expect(result.current.inspector.isOpen).toBe(true);
    expect(result.current.inspector.node?.id).toBe("wait-2d");

    act(() => {
      result.current.canvas.onPaneClick();
    });

    expect(result.current.inspector.isOpen).toBe(false);
    expect(result.current.inspector.node).toBeUndefined();
    expect(result.current.canvas.nodes.some((node) => node.data.selected)).toBe(false);
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
      result.current.canvas.onSelectNode("message-welcome");
      result.current.canvas.onSelectEdge("edge-message-welcome-end");
    });
    expect(result.current.inspector.node).toBeUndefined();
    expect(result.current.canvas.edges.some((edge) => edge.id === "edge-message-welcome-end")).toBe(true);
    expect(result.current.canvas.nodes.some((node) => node.id === "message-welcome")).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    });

    expect(result.current.canvas.edges.some((edge) => edge.id === "edge-message-welcome-end")).toBe(false);
    expect(result.current.canvas.nodes.some((node) => node.id === "message-welcome")).toBe(true);
  });

  it("persists edge removals from React Flow changes and supports undo", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

      act(() => {
        result.current.canvas.onEdgesChange([{ id: "edge-message-welcome-end", type: "remove" }]);
      });

      expect(result.current.canvas.edges.some((edge) => edge.id === "edge-message-welcome-end")).toBe(false);
      expect(result.current.canvas.canUndo).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").draft.edges.some((edge) => edge.id === "edge-message-welcome-end"))
        .toBe(false);
      expect(result.current.canvas.canUndo).toBe(true);

      act(() => {
        result.current.canvas.onUndo();
      });

      expect(result.current.canvas.edges.some((edge) => edge.id === "edge-message-welcome-end")).toBe(true);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("does not mark dirty drafts as saved when opening publish checks", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectNode("message-welcome");
    });

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

  it("keeps node dragging transient and unsaved until the drag finishes", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const event = { stopPropagation: vi.fn() } as unknown as Parameters<typeof result.current.canvas.onNodeDrag>[0];
    const initialNode = result.current.canvas.nodes.find((node) => node.id === "wait-2d")!;
    const draggingNode = {
      ...initialNode,
      position: { x: 520, y: 80 },
    };
    const finalNode = {
      ...initialNode,
      position: { x: 540, y: 120 },
    };

    expect(result.current.topBar.saveState).toBe("saved");

    act(() => {
      result.current.canvas.onNodeDragStart(event, initialNode, [initialNode]);
      result.current.canvas.onNodeDrag(event, draggingNode, [draggingNode]);
    });

    expect(result.current.canvas.nodes.find((node) => node.id === "wait-2d")?.position)
      .toEqual(draggingNode.position);
    expect(result.current.canvas.canUndo).toBe(false);
    expect(result.current.topBar.saveState).toBe("saved");

    act(() => {
      result.current.canvas.onNodeDragStop(event, finalNode, [finalNode]);
    });

    expect(result.current.canvas.nodes.find((node) => node.id === "wait-2d")?.position)
      .toEqual(finalNode.position);
    expect(result.current.canvas.canUndo).toBe(true);
    expect(result.current.topBar.saveState).toBe("saving");
  });

  it("persists every selected node position when a multi-node drag finishes", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const event = { stopPropagation: vi.fn() } as unknown as Parameters<typeof result.current.canvas.onNodeDragStop>[0];
    const waitNode = result.current.canvas.nodes.find((node) => node.id === "wait-2d")!;
    const branchNode = result.current.canvas.nodes.find((node) => node.id === "branch-intent")!;
    const messageNode = result.current.canvas.nodes.find((node) => node.id === "message-welcome")!;
    const nextWaitNode = { ...waitNode, position: { x: waitNode.position.x + 120, y: waitNode.position.y + 48 } };
    const nextBranchNode = { ...branchNode, position: { x: branchNode.position.x + 120, y: branchNode.position.y + 48 } };
    const nextMessageNode = { ...messageNode, position: { x: messageNode.position.x + 120, y: messageNode.position.y + 48 } };

    act(() => {
      result.current.canvas.onSelectNode("wait-2d");
      result.current.canvas.onSelectNode("branch-intent", { additive: true });
      result.current.canvas.onSelectNode("message-welcome", { additive: true });
      result.current.canvas.onNodeDragStart(event, messageNode, [waitNode, branchNode, messageNode]);
      result.current.canvas.onNodeDragStop(event, nextMessageNode, [nextWaitNode, nextBranchNode, nextMessageNode]);
    });

    expect(result.current.canvas.nodes.find((node) => node.id === "wait-2d")?.position)
      .toEqual(nextWaitNode.position);
    expect(result.current.canvas.nodes.find((node) => node.id === "branch-intent")?.position)
      .toEqual(nextBranchNode.position);
    expect(result.current.canvas.nodes.find((node) => node.id === "message-welcome")?.position)
      .toEqual(nextMessageNode.position);

    act(() => {
      result.current.canvas.onUndo();
    });

    expect(result.current.canvas.nodes.find((node) => node.id === "wait-2d")?.position)
      .toEqual(waitNode.position);
    expect(result.current.canvas.nodes.find((node) => node.id === "branch-intent")?.position)
      .toEqual(branchNode.position);
    expect(result.current.canvas.nodes.find((node) => node.id === "message-welcome")?.position)
      .toEqual(messageNode.position);
  });

  it("adds palette nodes without auto-connecting them to the current graph", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const initialEdges = result.current.canvas.edges.map((edge) => edge.id);

    act(() => {
      result.current.canvas.onAddNode("handoff");
    });

    const handoffNode = result.current.canvas.nodes.find((node) =>
      node.id !== "message-welcome" && node.data.kind === "handoff",
    );

    expect(handoffNode?.id).toMatch(/^handoff-/);
    expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(initialEdges);
    expect(result.current.canvas.edges.some((edge) =>
      edge.source === handoffNode?.id || edge.target === handoffNode?.id,
    )).toBe(false);
    expect(result.current.inspector.node?.id).toBe(handoffNode?.id);
  });

  it("persists manual connections through the workspace boundary and supports undo", async () => {
    vi.useFakeTimers();

    try {
      importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithoutEdge("edge-message-welcome-end"));
      const initialRevision = getWorkflowDocument("newcomer-conversion").revision;
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

      expect(result.current.canvas.edges.some((edge) => edge.source === "message-welcome" && edge.target === "end"))
        .toBe(false);

      act(() => {
        result.current.canvas.onConnect({
          source: "message-welcome",
          sourceHandle: null,
          target: "end",
          targetHandle: null,
        });
      });

      expect(result.current.canvas.edges.some((edge) => edge.source === "message-welcome" && edge.target === "end"))
        .toBe(true);
      expect(result.current.canvas.canUndo).toBe(true);
      expect(result.current.topBar.saveState).toBe("saving");

      act(() => {
        result.current.canvas.onUndo();
      });

      expect(result.current.canvas.edges.some((edge) => edge.source === "message-welcome" && edge.target === "end"))
        .toBe(false);
      expect(result.current.canvas.canRedo).toBe(true);
      expect(result.current.topBar.saveState).toBe("saved");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").revision).toBe(initialRevision);
      expect(getWorkflowDocument("newcomer-conversion").draft.edges.some((edge) =>
        edge.source === "message-welcome" && edge.target === "end",
      )).toBe(false);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("keeps automatic layout undoable without confusing saved draft state", async () => {
    vi.useFakeTimers();

    try {
      importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithDisorderedPositions());
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
      const originalPositions = getCanvasPositions(result.current.canvas.nodes);

      act(() => {
        result.current.canvas.onArrange();
      });

      const arrangedPositions = getCanvasPositions(result.current.canvas.nodes);
      expect(arrangedPositions).not.toEqual(originalPositions);
      expect(result.current.canvas.canUndo).toBe(true);
      expect(result.current.topBar.saveState).toBe("saving");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getCanvasPositions(getWorkflowDocument("newcomer-conversion").draft.nodes))
        .toEqual(arrangedPositions);
      expect(result.current.topBar.saveState).toBe("saved");

      act(() => {
        result.current.canvas.onUndo();
      });

      expect(getCanvasPositions(result.current.canvas.nodes)).toEqual(originalPositions);
      expect(result.current.canvas.canRedo).toBe(true);
      expect(result.current.topBar.saveState).toBe("saving");

      act(() => {
        result.current.canvas.onRedo();
      });

      expect(getCanvasPositions(result.current.canvas.nodes)).toEqual(arrangedPositions);
      expect(result.current.topBar.saveState).toBe("saved");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("keeps viewport changes out of the draft save boundary", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const initialDraftViewport = result.current.document.draft.viewport;
    const initialRevision = getWorkflowDocument("newcomer-conversion").revision;

    expect(result.current.topBar.saveState).toBe("saved");

    act(() => {
      result.current.canvas.onViewportChangeEnd({ x: 180, y: 260, zoom: 0.72 });
    });

    expect(result.current.canvas.viewport).toEqual({ x: 180, y: 260, zoom: 0.72 });
    expect(result.current.document.draft.viewport).toEqual(initialDraftViewport);
    expect(result.current.canvas.canUndo).toBe(false);
    expect(result.current.topBar.saveState).toBe("saved");
    expect(getWorkflowDocument("newcomer-conversion").revision).toBe(initialRevision);
    expect(getWorkflowDocument("newcomer-conversion").draft.viewport).toEqual(initialDraftViewport);
  });

  it("keeps view and transient canvas interactions out of the draft history boundary", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const assertCleanCanvasState = () => {
      expect(result.current.canvas.canUndo).toBe(false);
      expect(result.current.canvas.canRedo).toBe(false);
      expect(result.current.topBar.saveState).toBe("saved");
    };

    assertCleanCanvasState();

    act(() => {
      result.current.canvas.onSelectNode("wait-2d");
      result.current.canvas.onSelectNode("branch-intent", { additive: true });
      result.current.canvas.onSelectEdge("edge-message-welcome-end");
    });
    expect(result.current.inspector.node).toBeUndefined();
    assertCleanCanvasState();

    act(() => {
      result.current.canvas.onNodeHoverStart("message-welcome");
    });
    expect(result.current.canvas.edges.find((edge) => edge.id === "edge-message-welcome-end")?.data?.highlightState)
      .toBe("connected");
    assertCleanCanvasState();

    act(() => {
      result.current.canvas.onNodeHoverEnd();
    });
    expect(result.current.canvas.edges.find((edge) => edge.id === "edge-message-welcome-end")?.data?.highlightState)
      .toBeUndefined();
    assertCleanCanvasState();

    act(() => {
      result.current.canvas.onPaletteOpenChange(true);
      result.current.canvas.onSearchChange("handoff");
    });
    expect(result.current.canvas.paletteOpen).toBe(true);
    expect(result.current.canvas.searchValue).toBe("handoff");
    assertCleanCanvasState();

    act(() => {
      result.current.canvas.nodes.find((node) => node.id === "message-welcome")?.data.onToggleInsertMenu?.("message-welcome");
    });
    expect(result.current.canvas.nodes.find((node) => node.id === "message-welcome")?.data.insertMenuOpen)
      .toBe(true);
    assertCleanCanvasState();

    act(() => {
      result.current.canvas.edges.find((edge) => edge.id === "edge-message-welcome-end")?.data?.onToggleInsertMenu?.(
        "edge-message-welcome-end",
      );
    });
    expect(result.current.canvas.edges.find((edge) => edge.id === "edge-message-welcome-end")?.data?.insertMenuOpen)
      .toBe(true);
    assertCleanCanvasState();

    act(() => {
      result.current.canvas.onPaneClick();
    });
    expect(result.current.canvas.edges.find((edge) => edge.id === "edge-message-welcome-end")?.data?.insertMenuOpen)
      .toBe(false);
    assertCleanCanvasState();

    act(() => {
      result.current.topBar.onPublishCheck();
    });
    expect(result.current.checks.isOpen).toBe(true);
    assertCleanCanvasState();

    act(() => {
      result.current.canvas.onOpenVariables();
    });
    expect(result.current.inspector.isOpen).toBe(true);
    expect(result.current.inspector.activeTab).toBe("variables");
    expect(result.current.checks.isOpen).toBe(false);
    assertCleanCanvasState();
  });

  it("cancels pending saves when undo returns to the last saved draft", async () => {
    vi.useFakeTimers();

    try {
      const initialRevision = getWorkflowDocument("newcomer-conversion").revision;
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
      const initialNodeIds = result.current.canvas.nodes.map((node) => node.id);

      act(() => {
        result.current.canvas.onAddNode("handoff");
      });

      expect(result.current.topBar.saveState).toBe("saving");
      expect(result.current.canvas.canUndo).toBe(true);

      act(() => {
        result.current.canvas.onUndo();
      });

      expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(initialNodeIds);
      expect(result.current.topBar.saveState).toBe("saved");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").revision).toBe(initialRevision);
      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.map((node) => node.id))
        .toEqual(initialNodeIds);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("opens checks instead of publishing when warnings remain", async () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    await act(async () => {
      await result.current.topBar.onPublish();
    });

    expect(result.current.checks.isOpen).toBe(true);
    expect(result.current.checks.publishAttempted).toBe(true);
    expect(getWorkflowDocument("newcomer-conversion").status).toBe("Draft");
  });

  it("publishes a valid current draft through the workspace boundary", async () => {
    vi.useFakeTimers();

    try {
      importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithConnectedHandoffNode());
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

      act(() => {
        result.current.canvas.onSelectNode("start");
      });

      act(() => {
        result.current.inspector.onNodeChange({ audience: "更新后的发布人群" });
      });
      expect(result.current.topBar.publishReady).toBe(true);

      await act(async () => {
        const publishPromise = result.current.topBar.onPublish();
        await vi.advanceTimersByTimeAsync(500);
        await publishPromise;
      });

      expect(result.current.topBar.publishState).toBe("published");
      expect(result.current.document.status).toBe("Published");
      expect(result.current.document.publishedAt).toBe("刚刚");
      expect(getWorkflowDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe("更新后的发布人群");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("keeps publish state consistent when undo returns to the published draft", async () => {
    vi.useFakeTimers();

    try {
      importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithConnectedHandoffNode());
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
      const publishedAudience = result.current.canvas.nodes.find((node) => node.id === "start")?.data.audience;

      await act(async () => {
        await result.current.topBar.onPublish();
      });

      expect(result.current.topBar.publishState).toBe("published");

      act(() => {
        result.current.canvas.onSelectNode("start");
      });

      act(() => {
        result.current.inspector.onNodeChange({ audience: "发布后的草稿修改" });
      });

      expect(result.current.topBar.publishState).toBe("idle");
      expect(result.current.canvas.canUndo).toBe(true);

      act(() => {
        result.current.canvas.onUndo();
      });

      expect(result.current.topBar.publishState).toBe("published");
      expect(result.current.canvas.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe(publishedAudience);
      expect(result.current.canvas.canRedo).toBe(true);

      act(() => {
        result.current.canvas.onRedo();
      });

      expect(result.current.topBar.publishState).toBe("idle");
      expect(result.current.canvas.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe("发布后的草稿修改");
      expect(getWorkflowDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe(publishedAudience);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("keeps publish state published across non-draft canvas interactions", async () => {
    importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithConnectedHandoffNode());
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    await act(async () => {
      await result.current.topBar.onPublish();
    });
    expect(result.current.topBar.publishState).toBe("published");
    expect(result.current.topBar.saveState).toBe("saved");

    act(() => {
      result.current.canvas.onViewportChangeEnd({ x: 180, y: 260, zoom: 0.72 });
      result.current.canvas.onSelectNode("wait-2d");
      result.current.canvas.onNodeHoverStart("message-welcome");
      result.current.canvas.onPaletteOpenChange(true);
      result.current.canvas.nodes.find((node) => node.id === "message-welcome")?.data.onToggleInsertMenu?.("message-welcome");
      result.current.topBar.onPublishCheck();
      result.current.canvas.onOpenVariables();
      result.current.canvas.onPaneClick();
    });

    expect(result.current.topBar.publishState).toBe("published");
    expect(result.current.topBar.saveState).toBe("saved");
    expect(result.current.canvas.canUndo).toBe(false);
  });

  it("keeps publish state consistent when undo and redo cross a structural graph edit", async () => {
    vi.useFakeTimers();

    try {
      importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithConnectedHandoffNode());
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

      await act(async () => {
        await result.current.topBar.onPublish();
      });
      expect(result.current.topBar.publishState).toBe("published");

      act(() => {
        result.current.canvas.onAddNode("handoff");
      });
      const addedNodeId = result.current.inspector.node?.id ?? "";

      expect(addedNodeId).toMatch(/^handoff-/);
      expect(result.current.topBar.publishState).toBe("idle");
      expect(result.current.topBar.saveState).toBe("saving");
      expect(result.current.canvas.canUndo).toBe(true);

      act(() => {
        result.current.canvas.onUndo();
      });

      expect(result.current.canvas.nodes.some((node) => node.id === addedNodeId)).toBe(false);
      expect(result.current.topBar.publishState).toBe("published");
      expect(result.current.topBar.saveState).toBe("saved");
      expect(result.current.canvas.canRedo).toBe(true);

      act(() => {
        result.current.canvas.onRedo();
      });

      expect(result.current.canvas.nodes.some((node) => node.id === addedNodeId)).toBe(true);
      expect(result.current.topBar.publishState).toBe("idle");
      expect(result.current.topBar.saveState).toBe("saving");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").publishedDraft?.nodes.some((node) => node.id === addedNodeId))
        .toBe(false);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("previews a version history snapshot as read-only and exits back to the draft", () => {
    const publishedDocument = publishWorkflowDraft("newcomer-conversion", createWorkflowDraftWithTriggerAudience("历史版本人群"));
    importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithTriggerAudience("当前草稿人群"));
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const versionId = publishedDocument.currentVersion?.id ?? "";

    act(() => {
      result.current.topBar.onOpenVersionHistory();
    });
    expect(result.current.versionHistory.isOpen).toBe(true);
    expect(result.current.versionHistory.versions.map((version) => version.id)).toContain(versionId);

    act(() => {
      result.current.versionHistory.onSelectVersion(versionId);
    });

    expect(result.current.versionHistory.isPreviewing).toBe(true);
    expect(result.current.mode).toBe("version-preview");
    expect(result.current.canvas.isReadOnly).toBe(true);
    expect(result.current.inspector.isOpen).toBe(false);
    expect(result.current.canvas.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("历史版本人群");

    act(() => {
      result.current.canvas.onAddNode("handoff");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    });

    expect(result.current.canvas.nodes).toHaveLength(publishedDocument.publishedDraft?.nodes.length ?? 0);
    expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("当前草稿人群");

    act(() => {
      result.current.versionHistory.onExitPreview();
    });

    expect(result.current.versionHistory.isPreviewing).toBe(false);
    expect(result.current.mode).toBe("editing");
    expect(result.current.canvas.isReadOnly).toBe(false);
    expect(result.current.canvas.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("当前草稿人群");
    expect(result.current.inspector.isOpen).toBe(true);
  });

  it("allows viewport navigation while previewing a read-only version", () => {
    const publishedDocument = publishWorkflowDraft("newcomer-conversion", createWorkflowDraftWithTriggerAudience("历史版本人群"));
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const initialDraftViewport = result.current.document.draft.viewport;
    const versionId = publishedDocument.currentVersion?.id ?? "";

    act(() => {
      result.current.versionHistory.onSelectVersion(versionId);
    });

    expect(result.current.canvas.isReadOnly).toBe(true);
    expect(result.current.mode).toBe("version-preview");

    act(() => {
      result.current.canvas.onViewportChangeEnd({ x: 260, y: 180, zoom: 0.68 });
    });

    expect(result.current.canvas.viewport).toEqual({ x: 260, y: 180, zoom: 0.68 });
    expect(result.current.document.draft.viewport).toEqual(initialDraftViewport);
    expect(result.current.canvas.canUndo).toBe(false);
    expect(result.current.topBar.saveState).toBe("saved");
    expect(getWorkflowDocument("newcomer-conversion").draft.viewport).toEqual(initialDraftViewport);
  });

  it("allows viewport navigation while publishing without saving a draft change", async () => {
    const repository = createDeferredPublishRepository();
    repository.importDraft("newcomer-conversion", createWorkflowDraftWithConnectedHandoffNodeFromRepository(repository));
    const initialRevision = repository.getDocument("newcomer-conversion").revision;
    const initialDraftViewport = repository.getDocument("newcomer-conversion").draft.viewport;
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion", repository));

    let publishPromise: Promise<void> | undefined;
    await act(async () => {
      publishPromise = result.current.topBar.onPublish();
    });

    expect(result.current.mode).toBe("publishing");
    expect(result.current.canvas.isReadOnly).toBe(true);

    act(() => {
      result.current.canvas.onViewportChangeEnd({ x: 320, y: 220, zoom: 0.74 });
    });

    expect(result.current.canvas.viewport).toEqual({ x: 320, y: 220, zoom: 0.74 });
    expect(result.current.document.draft.viewport).toEqual(initialDraftViewport);
    expect(result.current.canvas.canUndo).toBe(false);
    expect(result.current.topBar.saveState).toBe("saved");

    await act(async () => {
      repository.resolvePublish(0);
      await publishPromise;
    });

    expect(repository.getDocument("newcomer-conversion").revision).toBe(initialRevision);
    expect(repository.getDocument("newcomer-conversion").draft.viewport).toEqual(initialDraftViewport);
    expect(result.current.topBar.publishState).toBe("published");
  });

  it("keeps saved graph edits after entering and exiting version preview", async () => {
    vi.useFakeTimers();

    try {
      const publishedDocument = publishWorkflowDraft(
        "newcomer-conversion",
        createWorkflowDraftWithTriggerAudience("历史版本人群"),
      );
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
      const versionId = publishedDocument.currentVersion?.id ?? "";

      act(() => {
        result.current.canvas.onAddNode("handoff");
      });
      const addedNodeId = result.current.inspector.node?.id ?? "";

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.some((node) => node.id === addedNodeId))
        .toBe(true);

      act(() => {
        result.current.versionHistory.onSelectVersion(versionId);
      });
      expect(result.current.versionHistory.isPreviewing).toBe(true);
      expect(result.current.canvas.nodes.some((node) => node.id === addedNodeId)).toBe(false);

      act(() => {
        result.current.versionHistory.onExitPreview();
      });

      expect(result.current.versionHistory.isPreviewing).toBe(false);
      expect(result.current.canvas.nodes.some((node) => node.id === addedNodeId)).toBe(true);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("restores the selected version history snapshot into the editable draft", async () => {
    const firstPublishedDocument = publishWorkflowDraft("newcomer-conversion", createWorkflowDraftWithTriggerAudience("第一版恢复人群"));
    publishWorkflowDraft("newcomer-conversion", createWorkflowDraftWithTriggerAudience("第二版仍是发布快照"));
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const versionId = firstPublishedDocument.currentVersion?.id ?? "";

    act(() => {
      result.current.versionHistory.onSelectVersion(versionId);
    });

    await act(async () => {
      await result.current.versionHistory.onRestoreVersion(versionId);
    });

    expect(result.current.versionHistory.isOpen).toBe(false);
    expect(result.current.versionHistory.isPreviewing).toBe(false);
    expect(result.current.canvas.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("第一版恢复人群");
    expect(result.current.document.status).toBe("Draft");
    expect(getWorkflowDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("第二版仍是发布快照");
  });

  it("persists node config drafts through the workspace save boundary", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

      act(() => {
        result.current.canvas.onSelectNode("message-welcome");
      });

      act(() => {
        result.current.inspector.onNodeChange({ title: "保存后的动作节点" });
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "message-welcome")?.data.title)
        .toBe("保存后的动作节点");
      expect(result.current.topBar.saveState).toBe("saved");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("persists start and handoff base settings through the workspace save boundary", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

      act(() => {
        result.current.canvas.onSelectNode("start");
      });

      act(() => {
        result.current.inspector.onNodeChange({ repeatEntryEnabled: false });
      });

      act(() => {
        result.current.canvas.onAddNode("handoff");
      });
      const handoffNodeId = result.current.inspector.node?.id ?? "";

      act(() => {
        result.current.inspector.onNodeChange({ title: "会员运营接管" });
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.repeatEntryEnabled)
        .toBe(false);
      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === handoffNodeId)?.data.title)
        .toBe("会员运营接管");
      expect(result.current.topBar.saveState).toBe("saved");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("opens variables through canvas controls and clears canvas menus", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectNode("message-welcome");
    });

    act(() => {
      result.current.canvas.onPaletteOpenChange(true);
    });
    expect(result.current.canvas.paletteOpen).toBe(true);

    act(() => {
      result.current.canvas.onOpenVariables();
    });

    expect(result.current.inspector.activeTab).toBe("variables");
    expect(result.current.inspector.isOpen).toBe(true);
    expect(result.current.canvas.paletteOpen).toBe(false);
    expect(result.current.inspector.variables?.inputs.map((variable) => variable.name)).toContain(
      "start.start.result",
    );
  });
});

function createWorkflowDraftWithTriggerAudience(audience: string) {
  const draft = getWorkflowDocument("newcomer-conversion").draft;

  return {
    ...draft,
    nodes: draft.nodes.map((node) =>
      node.id === "start"
        ? {
            ...node,
            data: {
              ...node.data,
              audience,
            },
          }
        : node,
    ),
  };
}

function createWorkflowDraftWithoutEdge(edgeId: string) {
  const draft = getWorkflowDocument("newcomer-conversion").draft;

  return {
    ...draft,
    edges: draft.edges.filter((edge) => edge.id !== edgeId),
  };
}

function createWorkflowDraftWithDisorderedPositions() {
  const draft = getWorkflowDocument("newcomer-conversion").draft;

  return {
    ...draft,
    nodes: draft.nodes.map((node) => {
      if (node.id === "wait-2d") {
        return {
          ...node,
          position: { x: 960, y: 360 },
        };
      }

      if (node.id === "branch-intent") {
        return {
          ...node,
          position: { x: 120, y: -180 },
        };
      }

      return node;
    }),
  };
}

function getCanvasPositions(nodes: Array<{ id: string; position: { x: number; y: number } }>) {
  return Object.fromEntries(nodes.map((node) => [node.id, node.position]));
}

function createWorkflowDraftWithConnectedBranchOutlets() {
  const draft = getWorkflowDocument("newcomer-conversion").draft;

  return connectBranchOutlets(draft);
}

function createWorkflowDraftWithConnectedHandoffNode() {
  return connectHandoffSupportNode(createWorkflowDraftWithConnectedBranchOutlets());
}

function createWorkflowDraftWithConnectedHandoffNodeFromRepository(
  repository: WorkflowDraftRepository,
) {
  return connectHandoffSupportNode(connectBranchOutlets(repository.getDocument("newcomer-conversion").draft));
}

function connectBranchOutlets(draft: WorkflowDraft) {
  return {
    ...draft,
    edges: [
      ...draft.edges,
      createEdge("branch-intent", "message-normal", "普通客户", {
        sourceHandle: "branch-normal",
      }),
      createEdge("branch-intent", "message-default", "默认路径", {
        sourceHandle: "branch-default",
      }),
      createEdge("message-normal", "end"),
      createEdge("message-default", "end"),
    ],
    nodes: [
      ...draft.nodes,
      {
        ...createNodeFromKind("message", "message-normal", 10),
        position: { x: 930, y: 94 },
      },
      {
        ...createNodeFromKind("message", "message-default", 11),
        position: { x: 930, y: 282 },
      },
    ],
  };
}

function connectHandoffSupportNode(draft: WorkflowDraft) {

  return {
    ...draft,
    edges: [
      ...draft.edges.filter((edge) => edge.id !== "edge-message-welcome-end"),
      createEdge("message-welcome", "handoff-support"),
      createEdge("handoff-support", "end"),
    ],
    nodes: [
      ...draft.nodes,
      {
        ...createNodeFromKind("handoff", "handoff-support", 12),
        position: { x: 1240, y: -94 },
      },
    ],
  };
}

function createDeferredPublishRepository() {
  const baseRepository = createInMemoryWorkflowDraftRepository();
  type PublishResult = ReturnType<typeof baseRepository.publishDraft>;
  const pendingPublishes: Array<{
    draft: WorkflowDraft;
    options?: WorkflowDraftPublishOptions;
    reject: (error: Error) => void;
    resolve: (document: PublishResult) => void;
    workflowId: string | undefined;
  }> = [];

  return {
    ...baseRepository,
    pendingPublishes,
    publishDraft: (workflowId, draft, options) => new Promise((resolve, reject) => {
      pendingPublishes.push({
        draft,
        options,
        reject,
        resolve,
        workflowId,
      });
    }),
    resolvePublish: (index: number) => {
      const pendingPublish = pendingPublishes[index];

      if (!pendingPublish) {
        return;
      }

      pendingPublish.resolve(baseRepository.publishDraft(
        pendingPublish.workflowId,
        pendingPublish.draft,
        pendingPublish.options,
      ));
    },
  } satisfies WorkflowDraftRepository & {
    pendingPublishes: typeof pendingPublishes;
    resolvePublish: (index: number) => void;
  };
}
