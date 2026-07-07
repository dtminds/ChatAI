import { useCallback, useState } from "react";
import type {
  MarketingEdgeData,
  MarketingNodeData,
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
  WorkflowDraft,
} from "./types";

export type WorkflowHistoryEvent =
  | "node:add"
  | "node:config-change"
  | "edge:connect"
  | "node:insert"
  | "layout:organize";

export type WorkflowHistoryEventMeta = {
  edgeId?: string;
  nodeId?: string;
  nodeTitle?: string;
};

export type WorkflowHistoryState = WorkflowDraft & {
  event: WorkflowHistoryEvent;
  meta?: WorkflowHistoryEventMeta;
};

const WORKFLOW_HISTORY_LIMIT = 50;

function sanitizeNodeData(data: MarketingNodeData): MarketingNodeData {
  const {
    insertMenuOpen: _insertMenuOpen,
    insertMenuSourceHandle: _insertMenuSourceHandle,
    onInsertAfter: _onInsertAfter,
    onSelect: _onSelect,
    onToggleInsertMenu: _onToggleInsertMenu,
    selected: _selected,
    ...persistableData
  } = data;

  return persistableData;
}

function sanitizeNodeForHistory(node: MarketingWorkflowNode): MarketingWorkflowNode {
  return {
    ...node,
    selected: false,
    zIndex: undefined,
    data: sanitizeNodeData(node.data),
  };
}

function sanitizeEdgeForHistory(edge: MarketingWorkflowEdge): MarketingWorkflowEdge {
  return {
    ...edge,
    selected: false,
    data: sanitizeEdgeData(edge.data),
  };
}

function sanitizeEdgeData(data: MarketingEdgeData | undefined): MarketingEdgeData | undefined {
  if (!data) {
    return data;
  }

  const { highlightState: _highlightState, onInsertBetween: _onInsertBetween, ...persistableData } = data;

  return persistableData;
}

function createHistoryState(
  draft: WorkflowDraft,
  event: WorkflowHistoryEvent,
  meta?: WorkflowHistoryEventMeta,
): WorkflowHistoryState {
  return {
    edges: draft.edges.map(sanitizeEdgeForHistory),
    event,
    meta,
    nodes: draft.nodes.map(sanitizeNodeForHistory),
  };
}

function sanitizeDraft(draft: WorkflowDraft): WorkflowDraft {
  return {
    edges: draft.edges.map(sanitizeEdgeForHistory),
    nodes: draft.nodes.map(sanitizeNodeForHistory),
  };
}

export function useWorkflowHistory(initialDraft: () => WorkflowDraft) {
  const [currentDraft, setCurrentDraft] = useState<WorkflowDraft>(() => sanitizeDraft(initialDraft()));
  const [pastStates, setPastStates] = useState<WorkflowHistoryState[]>([]);
  const [futureStates, setFutureStates] = useState<WorkflowHistoryState[]>([]);

  const commitDraft = useCallback((
    event: WorkflowHistoryEvent,
    updateDraft: (draft: WorkflowDraft) => WorkflowDraft,
    meta?: WorkflowHistoryEventMeta,
  ) => {
    setCurrentDraft((previousDraft) => {
      const previousHistoryState = createHistoryState(previousDraft, event, meta);
      const nextDraft = createHistoryState(updateDraft(previousDraft), event, meta);

      setPastStates((currentPastStates) => [
        ...currentPastStates.slice(-(WORKFLOW_HISTORY_LIMIT - 1)),
        previousHistoryState,
      ]);
      setFutureStates([]);

      return sanitizeDraft(nextDraft);
    });
  }, []);

  const replaceDraft = useCallback((updateDraft: (draft: WorkflowDraft) => WorkflowDraft) => {
    setCurrentDraft((previousDraft) => sanitizeDraft(updateDraft(previousDraft)));
  }, []);

  const undo = useCallback(() => {
    setPastStates((currentPastStates) => {
      const previousState = currentPastStates.at(-1);

      if (!previousState) {
        return currentPastStates;
      }

      setCurrentDraft((currentDraft) => {
        setFutureStates((currentFutureStates) => [
          createHistoryState(currentDraft, previousState.event, previousState.meta),
          ...currentFutureStates.slice(0, WORKFLOW_HISTORY_LIMIT - 1),
        ]);

        return {
          edges: previousState.edges,
          nodes: previousState.nodes,
        };
      });

      return currentPastStates.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFutureStates((currentFutureStates) => {
      const nextState = currentFutureStates[0];

      if (!nextState) {
        return currentFutureStates;
      }

      setCurrentDraft((currentDraft) => {
        setPastStates((currentPastStates) => [
          ...currentPastStates.slice(-(WORKFLOW_HISTORY_LIMIT - 1)),
          createHistoryState(currentDraft, nextState.event, nextState.meta),
        ]);

        return {
          edges: nextState.edges,
          nodes: nextState.nodes,
        };
      });

      return currentFutureStates.slice(1);
    });
  }, []);

  return {
    canRedo: futureStates.length > 0,
    canUndo: pastStates.length > 0,
    commitDraft,
    currentDraft,
    futureStates,
    pastStates,
    redo,
    replaceDraft,
    undo,
  };
}
