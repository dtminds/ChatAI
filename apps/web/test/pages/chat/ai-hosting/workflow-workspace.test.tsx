import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflowWorkspace } from "@/pages/chat/ai-hosting/workflow/use-workflow-workspace";
import {
  createEdge,
  createNodeFromKind,
} from "@/pages/chat/ai-hosting/workflow/graph";
import {
  getWorkflowDocument,
  importWorkflowDraft,
  publishWorkflowDraft,
  resetWorkflowDocumentsForTest,
} from "@/pages/chat/ai-hosting/workflow/workflow-draft-service";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");

  return {
    ...actual,
    applyEdgeChanges: (
      changes: Array<{
        id: string;
        type: string;
      }>,
      edges: Array<{
        id: string;
      }>,
    ) => {
      const removedEdgeIds = new Set(changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id));

      return edges.filter((edge) => !removedEdgeIds.has(edge.id));
    },
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

  it("persists edge removals from React Flow changes and supports undo", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

      act(() => {
        result.current.canvas.onEdgesChange([{ id: "edge-action-message-goal", type: "remove" }]);
      });

      expect(result.current.canvas.edges.some((edge) => edge.id === "edge-action-message-goal")).toBe(false);
      expect(result.current.canvas.canUndo).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").draft.edges.some((edge) => edge.id === "edge-action-message-goal"))
        .toBe(false);
      expect(result.current.canvas.canUndo).toBe(true);

      act(() => {
        result.current.canvas.onUndo();
      });

      expect(result.current.canvas.edges.some((edge) => edge.id === "edge-action-message-goal")).toBe(true);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("routes node run results into the run inspector tab", async () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectNode("action-message");
      result.current.inspector.onRunNode();
    });

    expect(result.current.inspector.activeTab).toBe("run");
    expect(result.current.inspector.lastRun?.status).toBe("running");

    await waitFor(() => {
      expect(result.current.inspector.lastRun?.status).toBe("succeeded");
    });
  });

  it("archives workflow test runs and previews run history as read-only", async () => {
    importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithConnectedBranchOutlets());
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.topBar.onRunWorkflow();
    });

    expect(result.current.mode).toBe("running");
    expect(result.current.runHistory.isOpen).toBe(true);
    expect(result.current.runHistory.activeRun?.status).toBe("running");
    expect(result.current.canvas.isReadOnly).toBe(true);

    await act(async () => {
      await Promise.resolve();
    });

    const runId = result.current.runHistory.runs[0]?.id ?? "";
    expect(runId).toBeTruthy();

    act(() => {
      result.current.runHistory.onSelectRun(runId);
    });

    expect(result.current.mode).toBe("run-history");
    expect(result.current.runHistory.isViewing).toBe(true);
    expect(result.current.canvas.isReadOnly).toBe(true);

    act(() => {
      result.current.canvas.onSelectNode("action-message");
    });

    expect(result.current.inspector.isOpen).toBe(true);
    expect(result.current.inspector.activeTab).toBe("run");
    expect(result.current.inspector.lastRun?.status).toBe("succeeded");

    act(() => {
      result.current.runHistory.onExitHistory();
    });

    expect(result.current.mode).toBe("editing");
    expect(result.current.runHistory.isViewing).toBe(false);
    expect(result.current.canvas.isReadOnly).toBe(false);
  });

  it("opens checks and blocks workflow runs when graph blockers remain", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onEdgesChange([{
        id: "edge-action-message-goal",
        type: "remove",
      }]);
    });

    act(() => {
      result.current.topBar.onRunWorkflow();
    });

    expect(result.current.checks.isOpen).toBe(true);
    expect(result.current.checks.publishAttempted).toBe(true);
    expect(result.current.runHistory.activeRun).toBeNull();
    expect(result.current.mode).toBe("editing");
  });

  it("locks workflow editing while a test run is active and unlocks after stop", () => {
    importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithConnectedBranchOutlets());
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const initialNodeCount = result.current.canvas.nodes.length;

    act(() => {
      result.current.topBar.onRunWorkflow();
    });

    expect(result.current.topBar.runningState).toBe("running");
    expect(result.current.mode).toBe("running");
    expect(result.current.canvas.isReadOnly).toBe(true);

    act(() => {
      result.current.canvas.onAddNode("ai");
      result.current.canvas.onNodesChange([{
        id: "action-message",
        position: { x: 999, y: 999 },
        type: "position",
      }]);
    });

    expect(result.current.canvas.nodes).toHaveLength(initialNodeCount);
    expect(result.current.canvas.nodes.find((node) => node.id === "action-message")?.position)
      .not.toEqual({ x: 999, y: 999 });

    act(() => {
      result.current.topBar.onStopWorkflowRun();
    });

    expect(result.current.topBar.runningState).toBe("stopped");
    expect(result.current.mode).toBe("editing");
    expect(result.current.canvas.isReadOnly).toBe(false);
    expect(result.current.runHistory.runs[0]?.status).toBe("stopped");
  });

  it("does not swallow graph shortcuts while a test run is active", () => {
    importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithConnectedBranchOutlets());
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectNode("action-message");
      result.current.topBar.onRunWorkflow();
    });

    const deleteEvent = new KeyboardEvent("keydown", {
      cancelable: true,
      key: "Backspace",
    });

    act(() => {
      window.dispatchEvent(deleteEvent);
    });

    expect(deleteEvent.defaultPrevented).toBe(false);
    expect(result.current.mode).toBe("running");
    expect(result.current.canvas.nodes.some((node) => node.id === "action-message")).toBe(true);
  });

  it("clears deleted node run records from workspace state", async () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    act(() => {
      result.current.canvas.onSelectNode("action-message");
      result.current.inspector.onRunNode();
    });
    await waitFor(() => {
      expect(result.current.inspector.lastRun?.status).toBe("succeeded");
    });

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

  it("keeps node dragging transient until the drag finishes", () => {
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
      .toEqual(initialNode.position);
    expect(result.current.topBar.saveState).toBe("saved");

    act(() => {
      result.current.canvas.onNodeDragStop(event, finalNode, [finalNode]);
    });

    expect(result.current.canvas.nodes.find((node) => node.id === "wait-2d")?.position)
      .toEqual(finalNode.position);
    expect(result.current.topBar.saveState).toBe("saving");
  });

  it("persists every selected node position when a multi-node drag finishes", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const event = { stopPropagation: vi.fn() } as unknown as Parameters<typeof result.current.canvas.onNodeDragStop>[0];
    const waitNode = result.current.canvas.nodes.find((node) => node.id === "wait-2d")!;
    const branchNode = result.current.canvas.nodes.find((node) => node.id === "branch-intent")!;
    const actionNode = result.current.canvas.nodes.find((node) => node.id === "action-message")!;
    const nextWaitNode = { ...waitNode, position: { x: waitNode.position.x + 120, y: waitNode.position.y + 48 } };
    const nextBranchNode = { ...branchNode, position: { x: branchNode.position.x + 120, y: branchNode.position.y + 48 } };
    const nextActionNode = { ...actionNode, position: { x: actionNode.position.x + 120, y: actionNode.position.y + 48 } };

    act(() => {
      result.current.canvas.onSelectNode("wait-2d");
      result.current.canvas.onSelectNode("branch-intent", { additive: true });
      result.current.canvas.onSelectNode("action-message", { additive: true });
      result.current.canvas.onNodeDragStart(event, actionNode, [waitNode, branchNode, actionNode]);
      result.current.canvas.onNodeDragStop(event, nextActionNode, [nextWaitNode, nextBranchNode, nextActionNode]);
    });

    expect(result.current.canvas.nodes.find((node) => node.id === "wait-2d")?.position)
      .toEqual(nextWaitNode.position);
    expect(result.current.canvas.nodes.find((node) => node.id === "branch-intent")?.position)
      .toEqual(nextBranchNode.position);
    expect(result.current.canvas.nodes.find((node) => node.id === "action-message")?.position)
      .toEqual(nextActionNode.position);

    act(() => {
      result.current.canvas.onUndo();
    });

    expect(result.current.canvas.nodes.find((node) => node.id === "wait-2d")?.position)
      .toEqual(waitNode.position);
    expect(result.current.canvas.nodes.find((node) => node.id === "branch-intent")?.position)
      .toEqual(branchNode.position);
    expect(result.current.canvas.nodes.find((node) => node.id === "action-message")?.position)
      .toEqual(actionNode.position);
  });

  it("adds palette nodes without auto-connecting them to the current graph", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const initialEdges = result.current.canvas.edges.map((edge) => edge.id);

    act(() => {
      result.current.canvas.onAddNode("ai");
    });

    const aiNode = result.current.canvas.nodes.find((node) =>
      node.id !== "action-message" && node.data.kind === "ai",
    );

    expect(aiNode?.id).toMatch(/^ai-/);
    expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(initialEdges);
    expect(result.current.canvas.edges.some((edge) =>
      edge.source === aiNode?.id || edge.target === aiNode?.id,
    )).toBe(false);
    expect(result.current.inspector.node?.id).toBe(aiNode?.id);
  });

  it("keeps viewport changes out of the draft save boundary", () => {
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

    expect(result.current.topBar.saveState).toBe("saved");

    act(() => {
      result.current.canvas.onViewportChangeEnd({ x: 180, y: 260, zoom: 0.72 });
    });

    expect(result.current.canvas.viewport).toEqual({ x: 180, y: 260, zoom: 0.72 });
    expect(result.current.canvas.canUndo).toBe(false);
    expect(result.current.topBar.saveState).toBe("saved");
  });

  it("cancels pending saves when undo returns to the last saved draft", async () => {
    vi.useFakeTimers();

    try {
      const initialRevision = getWorkflowDocument("newcomer-conversion").revision;
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
      const initialNodeIds = result.current.canvas.nodes.map((node) => node.id);

      act(() => {
        result.current.canvas.onAddNode("ai");
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
      importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithConnectedAiNode());
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

      act(() => {
        result.current.canvas.onSelectNode("trigger");
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
      expect(getWorkflowDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "trigger")?.data.audience)
        .toBe("更新后的发布人群");
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
    expect(result.current.canvas.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("历史版本人群");

    act(() => {
      result.current.canvas.onAddNode("ai");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    });

    expect(result.current.canvas.nodes).toHaveLength(publishedDocument.publishedDraft?.nodes.length ?? 0);
    expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("当前草稿人群");

    act(() => {
      result.current.versionHistory.onExitPreview();
    });

    expect(result.current.versionHistory.isPreviewing).toBe(false);
    expect(result.current.mode).toBe("editing");
    expect(result.current.canvas.isReadOnly).toBe(false);
    expect(result.current.canvas.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("当前草稿人群");
    expect(result.current.inspector.isOpen).toBe(true);
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
    expect(result.current.canvas.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("第一版恢复人群");
    expect(result.current.document.status).toBe("Draft");
    expect(getWorkflowDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("第二版仍是发布快照");
  });

  it("keeps version preview and run history preview mutually exclusive", async () => {
    importWorkflowDraft("newcomer-conversion", createWorkflowDraftWithConnectedBranchOutlets());
    const publishedDocument = publishWorkflowDraft("newcomer-conversion", createWorkflowDraftWithTriggerAudience("版本预览人群"));
    const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));
    const versionId = publishedDocument.currentVersion?.id ?? "";

    act(() => {
      result.current.topBar.onRunWorkflow();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const runId = result.current.runHistory.runs[0]?.id ?? "";
    expect(runId).toBeTruthy();

    act(() => {
      result.current.runHistory.onSelectRun(runId);
    });

    expect(result.current.mode).toBe("run-history");
    expect(result.current.runHistory.isViewing).toBe(true);

    act(() => {
      result.current.versionHistory.onSelectVersion(versionId);
    });

    expect(result.current.mode).toBe("version-preview");
    expect(result.current.runHistory.isViewing).toBe(false);
    expect(result.current.versionHistory.isPreviewing).toBe(true);
    expect(result.current.canvas.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("版本预览人群");

    act(() => {
      result.current.runHistory.onSelectRun(runId);
    });

    expect(result.current.mode).toBe("run-history");
    expect(result.current.versionHistory.isPreviewing).toBe(false);
    expect(result.current.runHistory.isViewing).toBe(true);

    act(() => {
      result.current.runHistory.onExitHistory();
    });

    expect(result.current.mode).toBe("editing");
    expect(result.current.versionHistory.isPreviewing).toBe(false);
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

  it("persists advanced panel controls through the workspace save boundary", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useWorkflowWorkspace("newcomer-conversion"));

      act(() => {
        result.current.canvas.onSelectNode("trigger");
      });

      act(() => {
        result.current.inspector.onNodeChange({ repeatEntryEnabled: false });
      });

      act(() => {
        result.current.canvas.onAddNode("ai");
      });
      const aiNodeId = result.current.inspector.node?.id ?? "";

      act(() => {
        result.current.inspector.onNodeChange({ handoffRule: "连续两轮未解决时转人工" });
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.repeatEntryEnabled)
        .toBe(false);
      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === aiNodeId)?.data.handoffRule)
        .toBe("连续两轮未解决时转人工");
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
    expect(result.current.canvas.paletteOpen).toBe(false);
    expect(result.current.inspector.variables?.inputs.map((variable) => variable.name)).toContain(
      "trigger.trigger.result",
    );
  });
});

function createWorkflowDraftWithTriggerAudience(audience: string) {
  const draft = getWorkflowDocument("newcomer-conversion").draft;

  return {
    ...draft,
    nodes: draft.nodes.map((node) =>
      node.id === "trigger"
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

function createWorkflowDraftWithConnectedBranchOutlets() {
  const draft = getWorkflowDocument("newcomer-conversion").draft;

  return {
    ...draft,
    edges: [
      ...draft.edges,
      createEdge("branch-intent", "action-normal", "普通客户", {
        sourceHandle: "branch-normal",
      }),
      createEdge("branch-intent", "action-default", "默认路径", {
        sourceHandle: "branch-default",
      }),
    ],
    nodes: [
      ...draft.nodes,
      {
        ...createNodeFromKind("action", "action-normal", 10),
        position: { x: 930, y: 94 },
      },
      {
        ...createNodeFromKind("action", "action-default", 11),
        position: { x: 930, y: 282 },
      },
    ],
  };
}

function createWorkflowDraftWithConnectedAiNode() {
  const draft = createWorkflowDraftWithConnectedBranchOutlets();

  return {
    ...draft,
    edges: [
      ...draft.edges.filter((edge) => edge.id !== "edge-action-message-goal"),
      createEdge("action-message", "ai-support"),
      createEdge("ai-support", "goal"),
    ],
    nodes: [
      ...draft.nodes,
      {
        ...createNodeFromKind("ai", "ai-support", 12),
        position: { x: 1240, y: -94 },
      },
    ],
  };
}
