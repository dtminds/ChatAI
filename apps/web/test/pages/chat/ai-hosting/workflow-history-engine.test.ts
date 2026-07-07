import { describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_HISTORY_LIMIT,
  createWorkflowHistoryInitialState,
  getWorkflowHistoryEventLabel,
  workflowHistoryReducer,
} from "@/pages/chat/ai-hosting/workflow/history-engine";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/ai-hosting/workflow/constants";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowDraft,
} from "@/pages/chat/ai-hosting/workflow/types";

function createDraft(index = 0): WorkflowDraft {
  const node: WorkflowNode = {
    data: {
      insertMenuOpen: true,
      kind: "action",
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
    type: WORKFLOW_NODE_TYPE,
  };

  return {
    edges: [edge],
    nodes: [node],
  };
}

describe("workflowHistoryReducer", () => {
  it("sanitizes runtime node and edge state before storing history", () => {
    const state = createWorkflowHistoryInitialState(createDraft());

    expect(state.currentDraft.nodes[0].selected).toBe(false);
    expect(state.currentDraft.nodes[0].zIndex).toBeUndefined();
    expect(state.currentDraft.nodes[0].data.selected).toBeUndefined();
    expect(state.currentDraft.nodes[0].data.onDelete).toBeUndefined();
    expect(state.currentDraft.edges[0].selected).toBe(false);
    expect(state.currentDraft.edges[0].data?.highlightState).toBeUndefined();
    expect(state.currentDraft.edges[0].data?.onInsertBetween).toBeUndefined();
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
    expect(undoneState.futureStates[0].draft.nodes[0].position.x).toBe(10);
    expect(undoneState.futureStates[0].event).toBe("node:move");
    expect(undoneState.futureStates).toHaveLength(1);

    const redoneState = workflowHistoryReducer(undoneState, { type: "redo" });
    expect(redoneState.currentDraft.nodes[0].position.x).toBe(10);

    const branchedState = workflowHistoryReducer(undoneState, {
      event: "node:move",
      nextDraft: createDraft(20),
      previousDraft: undoneState.currentDraft,
      type: "commit-from-drafts",
    });
    expect(branchedState.currentDraft.nodes[0].position.x).toBe(20);
    expect(branchedState.futureStates).toHaveLength(0);
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
    expect(state.pastStates[0].draft.nodes[0].position.x).toBe(8);
  });

  it("maps history events to stable user-facing labels", () => {
    expect(getWorkflowHistoryEventLabel("node:move")).toBe("移动节点");
    expect(getWorkflowHistoryEventLabel("node:config-change")).toBe("修改节点配置");
    expect(getWorkflowHistoryEventLabel("edge:connect")).toBe("连接节点");
  });
});
