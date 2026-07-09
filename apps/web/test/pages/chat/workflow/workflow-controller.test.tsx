import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialDraft,
} from "@/pages/chat/workflow/graph";
import { useWorkflowController } from "@/pages/chat/workflow/use-workflow-controller";
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

describe("useWorkflowController", () => {
  function createDraft(): WorkflowDraft {
    return createInitialDraft();
  }

  it("undoes a node move back to the drag start draft", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );
    const originalPosition = result.current.nodes.find((node) => node.id === "wait-2d")?.position;
    const originalTriggerNode = result.current.nodes.find((node) => node.id === "trigger");

    let dragResult: ReturnType<typeof result.current.updateNodeDrag>;

    act(() => {
      result.current.beginNodeDrag();
      dragResult = result.current.updateNodeDrag("wait-2d", { x: 420, y: 120 });
    });
    rerender({ draft: initialDraft });

    expect(dragResult?.transient).toBe(true);
    expect(result.current.nodes.find((node) => node.id === "trigger")).toBe(originalTriggerNode);
    expect(result.current.nodes.find((node) => node.id === "wait-2d")?.position).toEqual({
      x: 420,
      y: 120,
    });
    expect(result.current.canUndo).toBe(false);

    act(() => {
      result.current.finishNodeDrag("wait-2d", { x: 420, y: 120 });
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

  it("ignores React Flow position changes outside the explicit drag lifecycle", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );
    const originalWaitPosition = result.current.nodes.find((node) => node.id === "wait-2d")?.position;

    act(() => {
      result.current.onNodesChange([
        {
          dragging: true,
          id: "wait-2d",
          position: { x: 400, y: 80 },
          type: "position",
        },
      ]);
    });
    rerender({ draft: initialDraft });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.nodes.find((node) => node.id === "wait-2d")?.position).toEqual(originalWaitPosition);
  });

  it("keeps React Flow edge selection out of the workflow draft", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );
    const originalEdges = result.current.edges;

    act(() => {
      result.current.onEdgesChange([
        {
          id: "edge-action-message-goal",
          selected: true,
          type: "select",
        },
      ]);
    });
    rerender({ draft: initialDraft });

    expect(result.current.edges).toBe(originalEdges);
    expect(result.current.edges.find((edge) => edge.id === "edge-action-message-goal")?.selected).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("keeps the current viewport when undoing graph edits", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );
    const currentViewport = { x: 180, y: 260, zoom: 0.72 };

    act(() => {
      result.current.beginNodeDrag();
      result.current.finishNodeDrag("wait-2d", { x: 420, y: 120 });
    });
    rerender({ draft: initialDraft });

    act(() => {
      result.current.updateViewport(currentViewport);
    });
    rerender({ draft: initialDraft });

    expect(result.current.currentDraft.viewport).toEqual(initialDraft.viewport);
    expect(result.current.currentViewport).toEqual(currentViewport);

    act(() => {
      result.current.undo();
    });
    rerender({ draft: initialDraft });

    expect(result.current.currentDraft.viewport).toEqual(initialDraft.viewport);
    expect(result.current.currentViewport).toEqual(currentViewport);
    expect(result.current.nodes.find((node) => node.id === "wait-2d")?.position)
      .not.toEqual({ x: 420, y: 120 });
  });

  it("updates viewport as a transient canvas state", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );
    const currentViewport = { x: 180, y: 260, zoom: 0.72 };

    let viewportResult: ReturnType<typeof result.current.updateViewport>;

    act(() => {
      viewportResult = result.current.updateViewport(currentViewport);
    });
    rerender({ draft: initialDraft });

    expect(viewportResult?.transient).toBe(true);
    expect(viewportResult?.draft.viewport).toEqual(currentViewport);
    expect(result.current.currentDraft.viewport).toEqual(initialDraft.viewport);
    expect(result.current.currentViewport).toEqual(currentViewport);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("undoes a pending config edit with one action before the debounce commits", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );
    const originalTitle = result.current.nodes.find((node) => node.id === "action-message")?.data.title;

    act(() => {
      result.current.updateNodeData("action-message", {
        title: "更新后的动作标题",
      });
    });
    rerender({ draft: initialDraft });

    expect(result.current.nodes.find((node) => node.id === "action-message")?.data.title)
      .toBe("更新后的动作标题");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.nextUndoLabel).toBe("修改节点配置");

    act(() => {
      result.current.undo();
    });
    rerender({ draft: initialDraft });

    expect(result.current.nodes.find((node) => node.id === "action-message")?.data.title).toBe(originalTitle);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.nextRedoLabel).toBe("修改节点配置");

    act(() => {
      result.current.redo();
    });
    rerender({ draft: initialDraft });

    expect(result.current.nodes.find((node) => node.id === "action-message")?.data.title)
      .toBe("更新后的动作标题");
    expect(result.current.canUndo).toBe(true);
  });

  it("clears redo immediately when a new config edit branches from an undone state", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );

    act(() => {
      result.current.beginNodeDrag();
      result.current.finishNodeDrag("wait-2d", { x: 420, y: 120 });
    });
    rerender({ draft: initialDraft });

    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    rerender({ draft: initialDraft });

    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.updateNodeData("action-message", {
        title: "撤销后新分支标题",
      });
    });
    rerender({ draft: initialDraft });

    expect(result.current.canRedo).toBe(false);
    expect(result.current.nodes.find((node) => node.id === "action-message")?.data.title)
      .toBe("撤销后新分支标题");

    act(() => {
      result.current.undo();
    });
    rerender({ draft: initialDraft });

    expect(result.current.nodes.find((node) => node.id === "action-message")?.data.title)
      .not.toBe("撤销后新分支标题");
    expect(result.current.nextRedoLabel).toBe("修改节点配置");
  });

  it("does not create config history for no-op node data updates", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );
    const actionNode = result.current.nodes.find((node) => node.id === "action-message")!;

    let updateResult: ReturnType<typeof result.current.updateNodeData>;

    act(() => {
      updateResult = result.current.updateNodeData("action-message", {
        title: actionNode.data.title,
      });
    });
    rerender({ draft: initialDraft });

    expect(updateResult).toBeUndefined();
    expect(result.current.canUndo).toBe(false);
  });

  it("keeps branch path edge cleanup undoable with node config history", () => {
    const initialDraft = createDraft();
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );

    expect(result.current.edges.some((edge) =>
      edge.source === "branch-intent" && edge.sourceHandle === "branch-high",
    )).toBe(true);

    act(() => {
      result.current.updateNodeData("branch-intent", {
        branchPaths: [
          { id: "branch-normal", label: "普通客户", operator: "IF", title: "CASE 1" },
          { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 2" },
        ],
      });
    });
    rerender({ draft: initialDraft });

    expect(result.current.edges.some((edge) =>
      edge.source === "branch-intent" && edge.sourceHandle === "branch-high",
    )).toBe(false);

    act(() => {
      result.current.undo();
    });
    rerender({ draft: initialDraft });

    expect(result.current.edges.some((edge) =>
      edge.source === "branch-intent" && edge.sourceHandle === "branch-high",
    )).toBe(true);
  });

  it("undoes and redoes structural graph commands as single history entries", () => {
    const initialDraft = createDraft();
    let currentDraftProp = initialDraft;
    const { rerender, result } = renderHook(
      ({ draft }) => useWorkflowController(draft),
      { initialProps: { draft: initialDraft } },
    );

    const resetController = () => {
      currentDraftProp = createDraft();
      rerender({ draft: currentDraftProp });
    };
    const undo = () => {
      act(() => {
        result.current.undo();
      });
      rerender({ draft: currentDraftProp });
    };
    const redo = () => {
      act(() => {
        result.current.redo();
      });
      rerender({ draft: currentDraftProp });
    };

    let addedNodeId = "";
    act(() => {
      addedNodeId = result.current.addNode("ai")?.nodeId ?? "";
    });
    rerender({ draft: currentDraftProp });
    expect(result.current.nextUndoLabel).toBe("添加节点");
    expect(result.current.nodes.some((node) => node.id === addedNodeId)).toBe(true);
    undo();
    expect(result.current.nodes.some((node) => node.id === addedNodeId)).toBe(false);
    expect(result.current.canRedo).toBe(true);
    redo();
    expect(result.current.nodes.some((node) => node.id === addedNodeId)).toBe(true);

    resetController();
    let insertedAfterNodeId = "";
    act(() => {
      insertedAfterNodeId = result.current.insertNodeAfter("branch-intent", "wait", "branch-high")?.nodeId ?? "";
    });
    rerender({ draft: currentDraftProp });
    expect(result.current.nextUndoLabel).toBe("插入节点");
    expect(result.current.edges.some((edge) => edge.id === "edge-branch-intent-branch-high-action-message"))
      .toBe(false);
    expect(result.current.edges.some((edge) =>
      edge.source === "branch-intent" && edge.sourceHandle === "branch-high" && edge.target === insertedAfterNodeId,
    )).toBe(true);
    undo();
    expect(result.current.nodes.some((node) => node.id === insertedAfterNodeId)).toBe(false);
    expect(result.current.edges.some((edge) => edge.id === "edge-branch-intent-branch-high-action-message"))
      .toBe(true);
    redo();
    expect(result.current.nodes.some((node) => node.id === insertedAfterNodeId)).toBe(true);
    expect(result.current.edges.some((edge) => edge.id === "edge-branch-intent-branch-high-action-message"))
      .toBe(false);

    resetController();
    let insertedBetweenNodeId = "";
    act(() => {
      insertedBetweenNodeId = result.current.insertNodeBetween(
        "edge-wait-2d-branch-intent",
        "wait-2d",
        "branch-intent",
        "ai",
      )?.nodeId ?? "";
    });
    rerender({ draft: currentDraftProp });
    expect(result.current.nextUndoLabel).toBe("插入节点");
    expect(result.current.edges.some((edge) => edge.id === "edge-wait-2d-branch-intent")).toBe(false);
    expect(result.current.edges.some((edge) => edge.source === "wait-2d" && edge.target === insertedBetweenNodeId))
      .toBe(true);
    undo();
    expect(result.current.nodes.some((node) => node.id === insertedBetweenNodeId)).toBe(false);
    expect(result.current.edges.some((edge) => edge.id === "edge-wait-2d-branch-intent")).toBe(true);
    redo();
    expect(result.current.nodes.some((node) => node.id === insertedBetweenNodeId)).toBe(true);

    resetController();
    let connectTargetNodeId = "";
    act(() => {
      connectTargetNodeId = result.current.addNode("action")?.nodeId ?? "";
    });
    rerender({ draft: currentDraftProp });
    undo();
    redo();

    act(() => {
      result.current.connectNodes({
        source: "branch-intent",
        sourceHandle: "branch-normal",
        target: connectTargetNodeId,
        targetHandle: null,
      });
    });
    rerender({ draft: currentDraftProp });
    expect(result.current.nextUndoLabel).toBe("连接节点");
    expect(result.current.edges.some((edge) => edge.id === `edge-branch-intent-branch-normal-${connectTargetNodeId}`))
      .toBe(true);
    undo();
    expect(result.current.edges.some((edge) => edge.id === `edge-branch-intent-branch-normal-${connectTargetNodeId}`))
      .toBe(false);
    redo();
    expect(result.current.edges.some((edge) => edge.id === `edge-branch-intent-branch-normal-${connectTargetNodeId}`))
      .toBe(true);

    resetController();
    act(() => {
      result.current.onEdgesChange([{ id: "edge-action-message-goal", type: "remove" }]);
    });
    rerender({ draft: currentDraftProp });
    expect(result.current.nextUndoLabel).toBe("删除连线");
    expect(result.current.edges.some((edge) => edge.id === "edge-action-message-goal")).toBe(false);
    undo();
    expect(result.current.edges.some((edge) => edge.id === "edge-action-message-goal")).toBe(true);
    redo();
    expect(result.current.edges.some((edge) => edge.id === "edge-action-message-goal")).toBe(false);

    resetController();
    act(() => {
      result.current.deleteNode("action-message");
    });
    rerender({ draft: currentDraftProp });
    expect(result.current.nextUndoLabel).toBe("删除节点");
    expect(result.current.nodes.some((node) => node.id === "action-message")).toBe(false);
    expect(result.current.edges.some((edge) => edge.source === "action-message" || edge.target === "action-message"))
      .toBe(false);
    undo();
    expect(result.current.nodes.some((node) => node.id === "action-message")).toBe(true);
    expect(result.current.edges.some((edge) => edge.id === "edge-action-message-goal")).toBe(true);
    redo();
    expect(result.current.nodes.some((node) => node.id === "action-message")).toBe(false);

    resetController();
    const initialPositions = new Map(result.current.nodes.map((node) => [node.id, node.position]));
    act(() => {
      result.current.arrangeNodes();
    });
    rerender({ draft: currentDraftProp });
    const arrangedPositions = new Map(result.current.nodes.map((node) => [node.id, node.position]));
    expect(result.current.nextUndoLabel).toBe("整理画布");
    expect(result.current.nodes.some((node) => {
      const initialPosition = initialPositions.get(node.id);
      return initialPosition && (
        initialPosition.x !== node.position.x
        || initialPosition.y !== node.position.y
      );
    })).toBe(true);
    undo();
    result.current.nodes.forEach((node) => {
      expect(node.position).toEqual(initialPositions.get(node.id));
    });
    redo();
    result.current.nodes.forEach((node) => {
      expect(node.position).toEqual(arrangedPositions.get(node.id));
    });
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
