import { useCallback, useReducer } from "react";
import {
  createWorkflowHistoryInitialState,
  workflowHistoryReducer,
} from "./history-engine";
import type {
  WorkflowHistoryEvent,
  WorkflowHistoryEventMeta,
} from "./history-engine";
import type { WorkflowDraft } from "./types";

export type {
  WorkflowHistoryEvent,
  WorkflowHistoryEventMeta,
  WorkflowHistoryEntry,
  WorkflowHistoryReducerAction,
  WorkflowHistoryReducerState,
} from "./history-engine";

export function useWorkflowHistory(initialDraft: () => WorkflowDraft) {
  const [{ currentDraft, futureStates, pastStates }, dispatch] = useReducer(
    workflowHistoryReducer,
    undefined,
    () => createWorkflowHistoryInitialState(initialDraft()),
  );

  const commitDraft = useCallback((
    event: WorkflowHistoryEvent,
    updateDraft: (draft: WorkflowDraft) => WorkflowDraft,
    meta?: WorkflowHistoryEventMeta,
  ) => {
    dispatch({ event, meta, type: "commit", updateDraft });
  }, []);

  const replaceDraft = useCallback((
    updateDraft: (draft: WorkflowDraft) => WorkflowDraft,
    options: { clearFuture?: boolean } = {},
  ) => {
    dispatch({ clearFuture: options.clearFuture, type: "replace", updateDraft });
  }, []);

  const replaceDraftTransient = useCallback((updateDraft: (draft: WorkflowDraft) => WorkflowDraft) => {
    dispatch({ type: "replace-transient", updateDraft });
  }, []);

  const resetDraft = useCallback((draft: WorkflowDraft) => {
    dispatch({ draft, type: "reset" });
  }, []);

  const commitFromDrafts = useCallback((
    event: WorkflowHistoryEvent,
    previousDraft: WorkflowDraft,
    nextDraft: WorkflowDraft,
    meta?: WorkflowHistoryEventMeta,
  ) => {
    dispatch({
      event,
      meta,
      nextDraft,
      previousDraft,
      type: "commit-from-drafts",
    });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "undo" });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "redo" });
  }, []);

  const nextRedoEntry = futureStates[0];
  const nextUndoEntry = pastStates.at(-1);

  return {
    canRedo: futureStates.length > 0,
    canUndo: pastStates.length > 0,
    commitFromDrafts,
    commitDraft,
    currentDraft,
    futureStates,
    nextRedoEntry,
    nextRedoLabel: nextRedoEntry?.label,
    nextUndoEntry,
    nextUndoLabel: nextUndoEntry?.label,
    pastStates,
    redo,
    replaceDraft,
    replaceDraftTransient,
    resetDraft,
    undo,
  };
}
