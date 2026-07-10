import { describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_HISTORY_LIMIT,
  createWorkflowHistoryInitialState,
  getWorkflowHistoryEventLabel,
  workflowHistoryReducer,
} from "@/pages/chat/workflow/history-engine";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "@/pages/chat/workflow/constants";
import { DEFAULT_WORKFLOW_VIEWPORT } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowDraft,
} from "@/pages/chat/workflow/types";

function createDraft(
  index = 0,
  viewport: WorkflowDraft["viewport"] = DEFAULT_WORKFLOW_VIEWPORT,
): WorkflowDraft {
  const node: WorkflowNode = {
    data: {
      ...createDefaultNodeData("action"),
      insertMenuOpen: true,
      label: "营销动作",
      metric: "已发送",
      onDelete: vi.fn(),
      onDuplicate: vi.fn(),
      onInsertAfter: vi.fn(),
      onSelect: vi.fn(),
      onToggleInsertMenu: vi.fn(),
      selected: true,
      status: "ready",
      summary: "发送消息",
      title: `发送消息 ${index}`,
    },
    id: "action-message",
    position: { x: index, y: 0 },
    selected: true,
    type: WORKFLOW_NODE_TYPE,
    zIndex: 20,
  };
  const edge: WorkflowEdge = {
    data: {
      highlightState: "connected",
      insertMenuOpen: true,
      label: "高意向",
      onInsertBetween: vi.fn(),
      onToggleInsertMenu: vi.fn(),
    },
    id: "edge-1",
    selected: true,
    source: "action-message",
    target: "goal",
    type: WORKFLOW_EDGE_TYPE,
  };

  return {
    edges: [edge],
    nodes: [node],
    viewport,
  };
}

describe("workflowHistoryReducer", () => {
  it("initializes history with a normalized draft snapshot", () => {
    const state = createWorkflowHistoryInitialState(createDraft());

    expect(state.currentDraft.nodes[0].data.title).toBe("发送消息 0");
    expect(state.currentDraft.nodes[0].data.onDelete).toBeUndefined();
    expect(state.currentDraft.edges[0].data?.onInsertBetween).toBeUndefined();
    expect(state.nextSequence).toBe(1);
  });

  it("skips unchanged commits", () => {
    const state = createWorkflowHistoryInitialState(createDraft());
    const nextState = workflowHistoryReducer(state, {
      event: "layout:organize",
      type: "commit",
      updateDraft: (draft) => draft,
    });

    expect(nextState).toBe(state);
    expect(nextState.pastStates).toHaveLength(0);
  });

  it("does not create graph history entries for viewport-only changes", () => {
    const state = createWorkflowHistoryInitialState(createDraft(0, { x: 0, y: 0, zoom: 1 }));
    const nextState = workflowHistoryReducer(state, {
      event: "node:move",
      nextDraft: createDraft(0, { x: 180, y: 240, zoom: 0.8 }),
      previousDraft: state.currentDraft,
      type: "commit-from-drafts",
    });

    expect(nextState).toBe(state);
    expect(nextState.pastStates).toHaveLength(0);
  });

  it("supports undo, redo, and clears redo after a new commit", () => {
    const initialState = createWorkflowHistoryInitialState(createDraft(0));
    const movedState = workflowHistoryReducer(initialState, {
      event: "node:move",
      nextDraft: createDraft(10),
      previousDraft: initialState.currentDraft,
      type: "commit-from-drafts",
    });
    const undoneState = workflowHistoryReducer(movedState, { type: "undo" });

    expect(undoneState.currentDraft.nodes[0].position.x).toBe(0);
    expect(undoneState.futureStates[0].id).toBe("history-1");
    expect(undoneState.futureStates[0].label).toBe("移动节点");
    expect(undoneState.futureStates[0].sequence).toBe(1);
    expect(undoneState.futureStates[0].beforeDraft.nodes[0].position.x).toBe(0);
    expect(undoneState.futureStates[0].afterDraft.nodes[0].position.x).toBe(10);
    expect(undoneState.futureStates[0].event).toBe("node:move");
    expect(undoneState.futureStates).toHaveLength(1);

    const redoneState = workflowHistoryReducer(undoneState, { type: "redo" });
    expect(redoneState.currentDraft.nodes[0].position.x).toBe(10);
    expect(redoneState.pastStates[0].id).toBe("history-1");

    const branchedState = workflowHistoryReducer(undoneState, {
      event: "node:move",
      nextDraft: createDraft(20),
      previousDraft: undoneState.currentDraft,
      type: "commit-from-drafts",
    });
    expect(branchedState.currentDraft.nodes[0].position.x).toBe(20);
    expect(branchedState.futureStates).toHaveLength(0);
    expect(branchedState.pastStates[0].id).toBe("history-2");
    expect(branchedState.nextSequence).toBe(3);
  });

  it("records a pending config edit as redoable when undoing it atomically", () => {
    const initialState = createWorkflowHistoryInitialState(createDraft(0));
    const undoneState = workflowHistoryReducer(initialState, {
      event: "node:config-change",
      nextDraft: createDraft(10),
      previousDraft: initialState.currentDraft,
      type: "commit-from-drafts-and-undo",
    });

    expect(undoneState.currentDraft.nodes[0].position.x).toBe(0);
    expect(undoneState.pastStates).toHaveLength(0);
    expect(undoneState.futureStates).toHaveLength(1);
    expect(undoneState.futureStates[0].label).toBe("修改节点配置");

    const redoneState = workflowHistoryReducer(undoneState, { type: "redo" });
    expect(redoneState.currentDraft.nodes[0].position.x).toBe(10);
    expect(redoneState.pastStates).toHaveLength(1);
    expect(redoneState.futureStates).toHaveLength(0);
  });

  it("preserves the current viewport when applying undo and redo snapshots", () => {
    const viewportBeforeMove = { x: 0, y: 0, zoom: 1 };
    const viewportAtUndoTime = { x: 320, y: 240, zoom: 0.72 };
    const initialState = createWorkflowHistoryInitialState(createDraft(0, viewportBeforeMove));
    const movedState = workflowHistoryReducer(initialState, {
      event: "node:move",
      nextDraft: createDraft(10, viewportBeforeMove),
      previousDraft: initialState.currentDraft,
      type: "commit-from-drafts",
    });
    const pannedState = workflowHistoryReducer(movedState, {
      type: "replace",
      updateDraft: (draft) => ({
        ...draft,
        viewport: viewportAtUndoTime,
      }),
    });

    const undoneState = workflowHistoryReducer(pannedState, { type: "undo" });
    expect(undoneState.currentDraft.nodes[0].position.x).toBe(0);
    expect(undoneState.currentDraft.viewport).toEqual(viewportAtUndoTime);

    const redoneState = workflowHistoryReducer(undoneState, { type: "redo" });
    expect(redoneState.currentDraft.nodes[0].position.x).toBe(10);
    expect(redoneState.currentDraft.viewport).toEqual(viewportAtUndoTime);
  });

  it("can clear redo states for replacing edits while keeping viewport replaces redoable", () => {
    const initialState = createWorkflowHistoryInitialState(createDraft(0));
    const movedState = workflowHistoryReducer(initialState, {
      event: "node:move",
      nextDraft: createDraft(10),
      previousDraft: initialState.currentDraft,
      type: "commit-from-drafts",
    });
    const undoneState = workflowHistoryReducer(movedState, { type: "undo" });
    const pannedState = workflowHistoryReducer(undoneState, {
      type: "replace",
      updateDraft: (draft) => ({
        ...draft,
        viewport: { x: 100, y: 100, zoom: 0.8 },
      }),
    });

    expect(pannedState.futureStates).toHaveLength(1);

    const editedState = workflowHistoryReducer(pannedState, {
      clearFuture: true,
      type: "replace",
      updateDraft: () => createDraft(20),
    });

    expect(editedState.futureStates).toHaveLength(0);
    expect(editedState.currentDraft.nodes[0].position.x).toBe(20);
  });

  it("caps retained history states", () => {
    let state = createWorkflowHistoryInitialState(createDraft(0));

    for (let index = 1; index <= WORKFLOW_HISTORY_LIMIT + 8; index += 1) {
      state = workflowHistoryReducer(state, {
        event: "node:move",
        nextDraft: createDraft(index),
        previousDraft: state.currentDraft,
        type: "commit-from-drafts",
      });
    }

    expect(state.pastStates).toHaveLength(WORKFLOW_HISTORY_LIMIT);
    expect(state.pastStates[0].beforeDraft.nodes[0].position.x).toBe(8);
    expect(state.pastStates[0].afterDraft.nodes[0].position.x).toBe(9);
  });

  it("maps history events to stable user-facing labels", () => {
    expect(getWorkflowHistoryEventLabel("node:move")).toBe("移动节点");
    expect(getWorkflowHistoryEventLabel("node:config-change")).toBe("修改节点配置");
    expect(getWorkflowHistoryEventLabel("edge:connect")).toBe("连接节点");
  });
});
