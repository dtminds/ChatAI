import { useCallback, useEffect, useRef } from "react";
import type {
  Connection,
  EdgeChange,
  NodeChange,
  OnEdgesChange,
  OnNodesChange,
} from "@xyflow/react";
import {
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
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
  const { commitFromDrafts, currentDraft, replaceDraft, resetDraft } = history;
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

  const onNodesChange: OnNodesChange<MarketingWorkflowRenderNode> = useCallback(
    (changes: NodeChange<MarketingWorkflowRenderNode>[]) => {
      flushConfigHistory();
      const hasFinalPositionChange = changes.some(isFinalNodePositionChange);

      if (!hasFinalPositionChange) {
        if (changes.some(isNodePositionChange) && !moveStartDraftRef.current) {
          moveStartDraftRef.current = currentDraft;
        }

        replaceDraft((draft) => ({
          ...draft,
          nodes: applyNodeChanges(changes as NodeChange<MarketingWorkflowNode>[], draft.nodes),
        }));
        return;
      }

      const previousDraft = moveStartDraftRef.current ?? currentDraft;
      const nextDraft = {
        ...currentDraft,
        nodes: applyNodeChanges(changes as NodeChange<MarketingWorkflowNode>[], currentDraft.nodes),
      };
      const movedNodeId = changes.find(isFinalNodePositionChange)?.id;
      moveStartDraftRef.current = null;

      commitFromDrafts(
        "node:move",
        previousDraft,
        nextDraft,
        movedNodeId ? { nodeId: movedNodeId } : undefined,
      );
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
  ): WorkflowActionResult | undefined => {
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

    return operation.result;
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

    return operation.result;
  }, [commitFromDrafts, currentDraft]);

  const insertNodeAfter = useCallback((
    previousNodeId: string,
    kind: InsertableMarketingNodeKind,
    sourceHandle?: string,
  ): WorkflowActionResult => {
    flushConfigHistory();
    const nodeId = `${kind}-${Date.now()}`;
    return commitGraphOperation(insertNodeAfterOperation(currentDraft, previousNodeId, kind, nodeId, sourceHandle))
      ?? { nodeId };
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const insertNodeBetween = useCallback((
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ): WorkflowActionResult => {
    flushConfigHistory();
    const nodeId = `${kind}-${Date.now()}`;
    return commitGraphOperation(insertNodeBetweenOperation(
      currentDraft,
      edgeId,
      sourceNodeId,
      targetNodeId,
      kind,
      nodeId,
    )) ?? { edgeId, nodeId };
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const addNode = useCallback((kind: MarketingNodeKind): WorkflowActionResult | undefined => {
    flushConfigHistory();
    return commitGraphOperation(addNodeOperation(currentDraft, kind, `${kind}-${Date.now()}`));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const connectNodes = useCallback((connection: Connection): WorkflowActionResult | undefined => {
    flushConfigHistory();
    return commitGraphOperation(connectNodesOperation(currentDraft, connection));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const deleteNode = useCallback((nodeId: string): WorkflowActionResult | undefined => {
    flushConfigHistory();
    return commitGraphOperation(deleteNodeOperation(currentDraft, nodeId));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const duplicateNode = useCallback((nodeId: string): WorkflowActionResult | undefined => {
    flushConfigHistory();
    const node = nodes.find((currentNode) => currentNode.id === nodeId);
    const duplicatedNodeId = `${node?.data.kind ?? "node"}-${Date.now()}`;
    return commitGraphOperation(duplicateNodeOperation(currentDraft, nodeId, duplicatedNodeId));
  }, [commitGraphOperation, currentDraft, flushConfigHistory, nodes]);

  const deleteEdge = useCallback((edgeId: string): WorkflowActionResult | undefined => {
    flushConfigHistory();
    return commitGraphOperation(deleteEdgeOperation(currentDraft, edgeId));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const arrangeNodes = useCallback(() => {
    flushConfigHistory();
    commitGraphOperation(arrangeNodesOperation(currentDraft));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const undo = useCallback(() => {
    flushConfigHistory();
    history.undo();
  }, [flushConfigHistory, history]);

  const redo = useCallback(() => {
    flushConfigHistory();
    history.redo();
  }, [flushConfigHistory, history]);

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
    nodes,
    onEdgesChange,
    onNodesChange,
    markDraftDirty,
    redo,
    undo,
    updateNodeData,
  };
}
