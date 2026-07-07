import { useCallback, useEffect, useRef } from "react";
import type {
  Connection,
  EdgeChange,
  NodeChange,
  OnEdgesChange,
} from "@xyflow/react";
import {
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import { isWorkflowConnectionAllowed } from "./connection-policy";
import { sanitizeDraft } from "./history-engine";
import {
  addNodeOperation,
  arrangeNodesOperation,
  connectNodesOperation,
  deleteEdgeOperation,
  deleteNodeOperation,
  duplicateNodeOperation,
  insertNodeAfterOperation,
  insertNodeBetweenOperation,
  updateNodeDataOperation,
} from "./graph-operations";
import type {
  WorkflowActionResult,
  WorkflowGraphOperation,
} from "./graph-operations";
import { useWorkflowHistory } from "./history";
import type {
  InsertableMarketingNodeKind,
  MarketingNodeData,
  MarketingNodeKind,
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
  MarketingWorkflowRenderEdge,
  MarketingWorkflowRenderNode,
  WorkflowDraft,
} from "./types";

const WORKFLOW_CONFIG_HISTORY_DEBOUNCE_MS = 500;

type PendingConfigHistory = {
  meta: {
    nodeId: string;
    nodeTitle?: string;
  };
  nextDraft: {
    edges: MarketingWorkflowEdge[];
    nodes: MarketingWorkflowNode[];
  };
  previousDraft: {
    edges: MarketingWorkflowEdge[];
    nodes: MarketingWorkflowNode[];
  };
};

type WorkflowControllerActionResult = WorkflowActionResult & {
  draft: WorkflowDraft;
};

type WorkflowNodePositionChange = NodeChange<MarketingWorkflowRenderNode> & {
  dragging?: boolean;
  id: string;
  position?: {
    x: number;
    y: number;
  };
  type: "position";
};

function isFinalNodePositionChange(
  change: NodeChange<MarketingWorkflowRenderNode>,
): change is WorkflowNodePositionChange {
  return change.type === "position"
    && "position" in change
    && Boolean(change.position)
    && "dragging" in change
    && change.dragging === false;
}

function isNodePositionChange(
  change: NodeChange<MarketingWorkflowRenderNode>,
): change is WorkflowNodePositionChange {
  return change.type === "position"
    && "position" in change
    && Boolean(change.position);
}

export function useWorkflowController(initialDraft: WorkflowDraft) {
  const history = useWorkflowHistory(() => initialDraft);
  const {
    commitFromDrafts,
    currentDraft,
    futureStates,
    pastStates,
    replaceDraft,
    resetDraft,
  } = history;
  const { edges, nodes } = currentDraft;
  const pendingConfigHistoryRef = useRef<PendingConfigHistory | null>(null);
  const configHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveStartDraftRef = useRef<{
    edges: MarketingWorkflowEdge[];
    nodes: MarketingWorkflowNode[];
  } | null>(null);

  const clearConfigHistoryTimer = useCallback(() => {
    if (!configHistoryTimerRef.current) {
      return;
    }

    clearTimeout(configHistoryTimerRef.current);
    configHistoryTimerRef.current = null;
  }, []);

  const flushConfigHistory = useCallback(() => {
    const pendingHistory = pendingConfigHistoryRef.current;

    clearConfigHistoryTimer();

    if (!pendingHistory) {
      return;
    }

    pendingConfigHistoryRef.current = null;
    commitFromDrafts(
      "node:config-change",
      pendingHistory.previousDraft,
      pendingHistory.nextDraft,
      pendingHistory.meta,
    );
  }, [clearConfigHistoryTimer, commitFromDrafts]);

  const scheduleConfigHistoryCommit = useCallback(() => {
    clearConfigHistoryTimer();
    configHistoryTimerRef.current = setTimeout(() => {
      flushConfigHistory();
    }, WORKFLOW_CONFIG_HISTORY_DEBOUNCE_MS);
  }, [clearConfigHistoryTimer, flushConfigHistory]);

  useEffect(() => () => {
    clearConfigHistoryTimer();
  }, [clearConfigHistoryTimer]);

  useEffect(() => {
    pendingConfigHistoryRef.current = null;
    moveStartDraftRef.current = null;
    clearConfigHistoryTimer();
    resetDraft(initialDraft);
  }, [clearConfigHistoryTimer, initialDraft, resetDraft]);

  const onNodesChange = useCallback(
    (changes: NodeChange<MarketingWorkflowRenderNode>[]) => {
      flushConfigHistory();
      const hasPositionChange = changes.some(isNodePositionChange);

      if (!hasPositionChange) {
        return undefined;
      }

      const hasFinalPositionChange = changes.some(isFinalNodePositionChange);

      if (!hasFinalPositionChange) {
        if (!moveStartDraftRef.current) {
          moveStartDraftRef.current = currentDraft;
        }

        const nextDraft = sanitizeDraft({
          ...currentDraft,
          nodes: applyNodeChanges(changes as NodeChange<MarketingWorkflowNode>[], currentDraft.nodes),
        });

        replaceDraft(() => nextDraft);
        return { draft: nextDraft };
      }

      const previousDraft = moveStartDraftRef.current ?? currentDraft;
      const nextDraft = sanitizeDraft({
        ...currentDraft,
        nodes: applyNodeChanges(changes as NodeChange<MarketingWorkflowNode>[], currentDraft.nodes),
      });
      const movedNodeId = changes.find(isFinalNodePositionChange)?.id;
      moveStartDraftRef.current = null;

      commitFromDrafts(
        "node:move",
        previousDraft,
        nextDraft,
        movedNodeId ? { nodeId: movedNodeId } : undefined,
      );
      return {
        draft: nextDraft,
        nodeId: movedNodeId,
      };
    },
    [commitFromDrafts, currentDraft, flushConfigHistory, replaceDraft],
  );

  const markDraftDirty = useCallback(() => {
    flushConfigHistory();
  }, [flushConfigHistory]);

  const onEdgesChange: OnEdgesChange<MarketingWorkflowRenderEdge> = useCallback(
    (changes: EdgeChange<MarketingWorkflowRenderEdge>[]) => {
      flushConfigHistory();
      replaceDraft((draft) => ({
        ...draft,
        edges: applyEdgeChanges(changes as EdgeChange<MarketingWorkflowEdge>[], draft.edges),
      }));
    },
    [flushConfigHistory, replaceDraft],
  );

  const updateNodeData = useCallback((
    nodeId: string,
    patch: Partial<MarketingNodeData>,
  ): WorkflowControllerActionResult | undefined => {
    const operation = updateNodeDataOperation(currentDraft, nodeId, patch);

    if (!operation) {
      return undefined;
    }

    pendingConfigHistoryRef.current = {
      meta: operation.meta,
      nextDraft: operation.draft,
      previousDraft: pendingConfigHistoryRef.current?.previousDraft ?? currentDraft,
    };
    replaceDraft(() => operation.draft);
    scheduleConfigHistoryCommit();

    return {
      ...operation.result,
      draft: operation.draft,
    };
  }, [currentDraft, replaceDraft, scheduleConfigHistoryCommit]);

  const commitGraphOperation = useCallback((operation: WorkflowGraphOperation | undefined) => {
    if (!operation) {
      return undefined;
    }

    commitFromDrafts(
      operation.event,
      currentDraft,
      operation.draft,
      operation.meta,
    );

    return {
      ...operation.result,
      draft: operation.draft,
    };
  }, [commitFromDrafts, currentDraft]);

  const insertNodeAfter = useCallback((
    previousNodeId: string,
    kind: InsertableMarketingNodeKind,
    sourceHandle?: string,
  ): WorkflowControllerActionResult => {
    flushConfigHistory();
    const nodeId = `${kind}-${Date.now()}`;
    return commitGraphOperation(insertNodeAfterOperation(currentDraft, previousNodeId, kind, nodeId, sourceHandle))
      ?? { draft: currentDraft, nodeId };
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const insertNodeBetween = useCallback((
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ): WorkflowControllerActionResult => {
    flushConfigHistory();
    const nodeId = `${kind}-${Date.now()}`;
    return commitGraphOperation(insertNodeBetweenOperation(
      currentDraft,
      edgeId,
      sourceNodeId,
      targetNodeId,
      kind,
      nodeId,
    )) ?? { draft: currentDraft, edgeId, nodeId };
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const addNode = useCallback((kind: MarketingNodeKind): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphOperation(addNodeOperation(currentDraft, kind, `${kind}-${Date.now()}`));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const connectNodes = useCallback((connection: Connection): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphOperation(connectNodesOperation(currentDraft, connection));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const isValidConnection = useCallback((connection: Connection) => (
    isWorkflowConnectionAllowed(currentDraft, connection)
  ), [currentDraft]);

  const deleteNode = useCallback((nodeId: string): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphOperation(deleteNodeOperation(currentDraft, nodeId));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const duplicateNode = useCallback((nodeId: string): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    const node = nodes.find((currentNode) => currentNode.id === nodeId);
    const duplicatedNodeId = `${node?.data.kind ?? "node"}-${Date.now()}`;
    return commitGraphOperation(duplicateNodeOperation(currentDraft, nodeId, duplicatedNodeId));
  }, [commitGraphOperation, currentDraft, flushConfigHistory, nodes]);

  const deleteEdge = useCallback((edgeId: string): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphOperation(deleteEdgeOperation(currentDraft, edgeId));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const arrangeNodes = useCallback((): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphOperation(arrangeNodesOperation(currentDraft));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const undo = useCallback((): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    const previousState = pastStates.at(-1);
    if (!previousState) {
      return undefined;
    }

    history.undo();
    return {
      draft: sanitizeDraft({
        edges: previousState.edges,
        nodes: previousState.nodes,
      }),
    };
  }, [flushConfigHistory, history, pastStates]);

  const redo = useCallback((): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    const nextState = futureStates[0];
    if (!nextState) {
      return undefined;
    }

    history.redo();
    return {
      draft: sanitizeDraft({
        edges: nextState.edges,
        nodes: nextState.nodes,
      }),
    };
  }, [flushConfigHistory, futureStates, history]);

  return {
    ...history,
    addNode,
    arrangeNodes,
    connectNodes,
    deleteEdge,
    deleteNode,
    duplicateNode,
    edges,
    insertNodeAfter,
    insertNodeBetween,
    isValidConnection,
    nodes,
    onEdgesChange,
    onNodesChange,
    markDraftDirty,
    redo,
    undo,
    updateNodeData,
  };
}
