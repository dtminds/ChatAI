import type {
  WorkflowEdgeData,
  WorkflowNodeData,
  WorkflowEdge,
  WorkflowNode,
  WorkflowDraft,
} from "./types";

export type WorkflowHistoryEvent =
  | "node:add"
  | "node:config-change"
  | "edge:connect"
  | "edge:delete"
  | "node:duplicate"
  | "node:insert"
  | "node:delete"
  | "node:move"
  | "node:paste"
  | "layout:organize";

export type WorkflowHistoryEventMeta = {
  edgeId?: string;
  nodeId?: string;
  nodeTitle?: string;
};

export type WorkflowHistoryEntry = {
  draft: WorkflowDraft;
  event: WorkflowHistoryEvent;
  meta?: WorkflowHistoryEventMeta;
};

export type WorkflowHistoryState = WorkflowHistoryEntry;

export type WorkflowHistoryReducerState = {
  currentDraft: WorkflowDraft;
  futureStates: WorkflowHistoryEntry[];
  pastStates: WorkflowHistoryEntry[];
};

export type WorkflowHistoryReducerAction =
  | {
    event: WorkflowHistoryEvent;
    meta?: WorkflowHistoryEventMeta;
    type: "commit";
    updateDraft: (draft: WorkflowDraft) => WorkflowDraft;
  }
  | {
    event: WorkflowHistoryEvent;
    meta?: WorkflowHistoryEventMeta;
    nextDraft: WorkflowDraft;
    previousDraft: WorkflowDraft;
    type: "commit-from-drafts";
  }
  | {
    type: "replace";
    updateDraft: (draft: WorkflowDraft) => WorkflowDraft;
  }
  | {
    draft: WorkflowDraft;
    type: "reset";
  }
  | {
    type: "undo";
  }
  | {
    type: "redo";
  };

export const WORKFLOW_HISTORY_LIMIT = 50;

export function createWorkflowHistoryInitialState(
  initialDraft: WorkflowDraft,
): WorkflowHistoryReducerState {
  return {
    currentDraft: sanitizeDraft(initialDraft),
    futureStates: [],
    pastStates: [],
  };
}

export function workflowHistoryReducer(
  state: WorkflowHistoryReducerState,
  action: WorkflowHistoryReducerAction,
): WorkflowHistoryReducerState {
  if (action.type === "commit") {
    const previousHistoryState = createHistoryState(state.currentDraft, action.event, action.meta);
    const nextDraft = sanitizeDraft(action.updateDraft(state.currentDraft));

    if (isWorkflowDraftEqual(state.currentDraft, nextDraft)) {
      return state;
    }

    return {
      currentDraft: nextDraft,
      futureStates: [],
      pastStates: [
        ...state.pastStates.slice(-(WORKFLOW_HISTORY_LIMIT - 1)),
        previousHistoryState,
      ],
    };
  }

  if (action.type === "commit-from-drafts") {
    const previousDraft = sanitizeDraft(action.previousDraft);
    const nextDraft = sanitizeDraft(action.nextDraft);

    if (isWorkflowDraftEqual(previousDraft, nextDraft)) {
      return state;
    }

    return {
      currentDraft: nextDraft,
      futureStates: [],
      pastStates: [
        ...state.pastStates.slice(-(WORKFLOW_HISTORY_LIMIT - 1)),
        createHistoryState(previousDraft, action.event, action.meta),
      ],
    };
  }

  if (action.type === "replace") {
    return {
      ...state,
      currentDraft: sanitizeDraft(action.updateDraft(state.currentDraft)),
    };
  }

  if (action.type === "reset") {
    return createWorkflowHistoryInitialState(action.draft);
  }

  if (action.type === "undo") {
    const previousState = state.pastStates.at(-1);

    if (!previousState) {
      return state;
    }

    return {
      currentDraft: {
        edges: previousState.draft.edges,
        nodes: previousState.draft.nodes,
      },
      futureStates: [
        createHistoryState(state.currentDraft, previousState.event, previousState.meta),
        ...state.futureStates.slice(0, WORKFLOW_HISTORY_LIMIT - 1),
      ],
      pastStates: state.pastStates.slice(0, -1),
    };
  }

  if (action.type === "redo") {
    const nextState = state.futureStates[0];

    if (!nextState) {
      return state;
    }

    return {
      currentDraft: {
        edges: nextState.draft.edges,
        nodes: nextState.draft.nodes,
      },
      futureStates: state.futureStates.slice(1),
      pastStates: [
        ...state.pastStates.slice(-(WORKFLOW_HISTORY_LIMIT - 1)),
        createHistoryState(state.currentDraft, nextState.event, nextState.meta),
      ],
    };
  }

  return state;
}

export function createHistoryState(
  draft: WorkflowDraft,
  event: WorkflowHistoryEvent,
  meta?: WorkflowHistoryEventMeta,
): WorkflowHistoryEntry {
  return {
    draft: sanitizeDraft(draft),
    event,
    meta,
  };
}

export function getWorkflowHistoryEventLabel(event: WorkflowHistoryEvent) {
  switch (event) {
    case "node:add":
      return "添加节点";
    case "node:config-change":
      return "修改节点配置";
    case "edge:connect":
      return "连接节点";
    case "edge:delete":
      return "删除连线";
    case "node:duplicate":
      return "复制节点";
    case "node:insert":
      return "插入节点";
    case "node:delete":
      return "删除节点";
    case "node:move":
      return "移动节点";
    case "layout:organize":
      return "整理画布";
    case "node:paste":
      return "粘贴节点";
    default:
      return "编辑画布";
  }
}

export function sanitizeDraft(draft: WorkflowDraft): WorkflowDraft {
  return {
    edges: draft.edges.map(sanitizeEdgeForHistory),
    nodes: draft.nodes.map(sanitizeNodeForHistory),
  };
}

export function isWorkflowDraftEqual(firstDraft: WorkflowDraft, secondDraft: WorkflowDraft) {
  if (firstDraft.nodes.length !== secondDraft.nodes.length || firstDraft.edges.length !== secondDraft.edges.length) {
    return false;
  }

  return JSON.stringify(firstDraft) === JSON.stringify(secondDraft);
}

function sanitizeNodeData(data: WorkflowNodeData): WorkflowNodeData {
  const {
    insertMenuOpen: _insertMenuOpen,
    insertMenuSourceHandle: _insertMenuSourceHandle,
    onDelete: _onDelete,
    onDuplicate: _onDuplicate,
    onInsertAfter: _onInsertAfter,
    onSelect: _onSelect,
    onToggleInsertMenu: _onToggleInsertMenu,
    selected: _selected,
    ...persistableData
  } = data;

  return persistableData;
}

function sanitizeNodeForHistory(node: WorkflowNode): WorkflowNode {
  return {
    ...node,
    selected: false,
    zIndex: undefined,
    data: sanitizeNodeData(node.data),
  };
}

function sanitizeEdgeData(data: WorkflowEdgeData | undefined): WorkflowEdgeData | undefined {
  if (!data) {
    return data;
  }

  const {
    highlightState: _highlightState,
    insertMenuOpen: _insertMenuOpen,
    onInsertBetween: _onInsertBetween,
    onToggleInsertMenu: _onToggleInsertMenu,
    ...persistableData
  } = data;

  return persistableData;
}

function sanitizeEdgeForHistory(edge: WorkflowEdge): WorkflowEdge {
  return {
    ...edge,
    selected: false,
    data: sanitizeEdgeData(edge.data),
  };
}
