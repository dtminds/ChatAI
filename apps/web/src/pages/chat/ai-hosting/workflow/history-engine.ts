import {
  isWorkflowGraphEqual,
  sanitizeDraft,
} from "./workflow-draft-normalizer";
import type { WorkflowDraft } from "./types";

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
  afterDraft: WorkflowDraft;
  beforeDraft: WorkflowDraft;
  event: WorkflowHistoryEvent;
  id: string;
  label: string;
  meta?: WorkflowHistoryEventMeta;
  sequence: number;
};

export type WorkflowHistoryState = WorkflowHistoryEntry;

export type WorkflowHistoryReducerState = {
  currentDraft: WorkflowDraft;
  futureStates: WorkflowHistoryEntry[];
  nextSequence: number;
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
    clearFuture?: boolean;
    type: "replace";
    updateDraft: (draft: WorkflowDraft) => WorkflowDraft;
  }
  | {
    type: "replace-transient";
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
    nextSequence: 1,
    pastStates: [],
  };
}

export function workflowHistoryReducer(
  state: WorkflowHistoryReducerState,
  action: WorkflowHistoryReducerAction,
): WorkflowHistoryReducerState {
  if (action.type === "commit") {
    const previousDraft = state.currentDraft;
    const nextDraft = sanitizeDraft(action.updateDraft(state.currentDraft));

    if (isWorkflowGraphEqual(state.currentDraft, nextDraft)) {
      return state;
    }

    return {
      currentDraft: nextDraft,
      futureStates: [],
      nextSequence: state.nextSequence + 1,
      pastStates: [
        ...state.pastStates.slice(-(WORKFLOW_HISTORY_LIMIT - 1)),
        createHistoryEntry(previousDraft, nextDraft, action.event, state.nextSequence, action.meta),
      ],
    };
  }

  if (action.type === "commit-from-drafts") {
    const previousDraft = sanitizeDraft(action.previousDraft);
    const nextDraft = sanitizeDraft(action.nextDraft);

    if (isWorkflowGraphEqual(previousDraft, nextDraft)) {
      return state;
    }

    return {
      currentDraft: nextDraft,
      futureStates: [],
      nextSequence: state.nextSequence + 1,
      pastStates: [
        ...state.pastStates.slice(-(WORKFLOW_HISTORY_LIMIT - 1)),
        createHistoryEntry(previousDraft, nextDraft, action.event, state.nextSequence, action.meta),
      ],
    };
  }

  if (action.type === "replace") {
    return {
      ...state,
      currentDraft: sanitizeDraft(action.updateDraft(state.currentDraft)),
      futureStates: action.clearFuture ? [] : state.futureStates,
    };
  }

  if (action.type === "replace-transient") {
    return {
      ...state,
      currentDraft: action.updateDraft(state.currentDraft),
    };
  }

  if (action.type === "reset") {
    return createWorkflowHistoryInitialState(action.draft);
  }

  if (action.type === "undo") {
    const previousEntry = state.pastStates.at(-1);

    if (!previousEntry) {
      return state;
    }

    return {
      currentDraft: preserveCurrentViewport(previousEntry.beforeDraft, state.currentDraft),
      futureStates: [
        previousEntry,
        ...state.futureStates.slice(0, WORKFLOW_HISTORY_LIMIT - 1),
      ],
      nextSequence: state.nextSequence,
      pastStates: state.pastStates.slice(0, -1),
    };
  }

  if (action.type === "redo") {
    const nextEntry = state.futureStates[0];

    if (!nextEntry) {
      return state;
    }

    return {
      currentDraft: preserveCurrentViewport(nextEntry.afterDraft, state.currentDraft),
      futureStates: state.futureStates.slice(1),
      nextSequence: state.nextSequence,
      pastStates: [
        ...state.pastStates.slice(-(WORKFLOW_HISTORY_LIMIT - 1)),
        nextEntry,
      ],
    };
  }

  return state;
}

function preserveCurrentViewport(
  historyDraft: WorkflowDraft,
  currentDraft: WorkflowDraft,
): WorkflowDraft {
  return {
    ...historyDraft,
    viewport: currentDraft.viewport,
  };
}

export function createHistoryEntry(
  beforeDraft: WorkflowDraft,
  afterDraft: WorkflowDraft,
  event: WorkflowHistoryEvent,
  sequence: number,
  meta?: WorkflowHistoryEventMeta,
): WorkflowHistoryEntry {
  return {
    afterDraft: sanitizeDraft(afterDraft),
    beforeDraft: sanitizeDraft(beforeDraft),
    event,
    id: `history-${sequence.toString(36)}`,
    label: getWorkflowHistoryEventLabel(event),
    meta,
    sequence,
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
