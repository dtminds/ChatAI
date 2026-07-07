import { useCallback, useEffect, useRef } from "react";
import type {
  Connection,
  EdgeChange,
  NodeChange,
} from "@xyflow/react";
import {
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import { isWorkflowConnectionAllowed } from "./connection-policy";
import { sanitizeDraft } from "./workflow-draft-normalizer";
import {
  addNodeOperation,
  arrangeNodesOperation,
  connectNodesOperation,
  deleteEdgeOperation,
  deleteNodeOperation,
  deleteNodesOperation,
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
  InsertableWorkflowNodeKind,
  WorkflowNodeData,
  WorkflowNodeKind,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRenderEdge,
  WorkflowRenderNode,
  WorkflowDraft,
} from "./types";
import {
  createWorkflowClipboardData,
  pasteWorkflowClipboardData,
} from "./workflow-clipboard";
import type { WorkflowClipboardData } from "./workflow-clipboard";
import { createUniqueWorkflowNodeIdFactory } from "./workflow-id";

const WORKFLOW_CONFIG_HISTORY_DEBOUNCE_MS = 500;

type PendingConfigHistory = {
  meta: {
    nodeId: string;
    nodeTitle?: string;
  };
  nextDraft: {
    edges: WorkflowEdge[];
    nodes: WorkflowNode[];
  };
  previousDraft: {
    edges: WorkflowEdge[];
    nodes: WorkflowNode[];
  };
};

type WorkflowControllerActionResult = WorkflowActionResult & {
  draft: WorkflowDraft;
};

type WorkflowNodePositionChange = NodeChange<WorkflowRenderNode> & {
  dragging?: boolean;
  id: string;
  position?: {
    x: number;
    y: number;
  };
  type: "position";
};

function isFinalNodePositionChange(
  change: NodeChange<WorkflowRenderNode>,
): change is WorkflowNodePositionChange {
  return change.type === "position"
    && "position" in change
    && Boolean(change.position)
    && "dragging" in change
    && change.dragging === false;
}

function isNodePositionChange(
  change: NodeChange<WorkflowRenderNode>,
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
    edges: WorkflowEdge[];
    nodes: WorkflowNode[];
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
    (changes: NodeChange<WorkflowRenderNode>[]) => {
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
          nodes: applyNodeChanges(changes as NodeChange<WorkflowNode>[], currentDraft.nodes),
        });

        replaceDraft(() => nextDraft);
        return { draft: nextDraft };
      }

      const previousDraft = moveStartDraftRef.current ?? currentDraft;
      const nextDraft = sanitizeDraft({
        ...currentDraft,
        nodes: applyNodeChanges(changes as NodeChange<WorkflowNode>[], currentDraft.nodes),
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

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowRenderEdge>[]) => {
      flushConfigHistory();
      const nextDraft = sanitizeDraft({
        ...currentDraft,
        edges: applyEdgeChanges(changes as EdgeChange<WorkflowEdge>[], currentDraft.edges),
      });
      const currentEdgeIds = new Set(currentDraft.edges.map((edge) => edge.id));
      const removedEdgeIds = changes
        .filter((change): change is EdgeChange<WorkflowRenderEdge> & { id: string; type: "remove" } =>
          change.type === "remove" && "id" in change && typeof change.id === "string",
        )
        .map((change) => change.id)
        .filter((edgeId) => currentEdgeIds.has(edgeId));

      if (removedEdgeIds.length > 0) {
        commitFromDrafts(
          "edge:delete",
          currentDraft,
          nextDraft,
          removedEdgeIds.length === 1 ? { edgeId: removedEdgeIds[0] } : undefined,
        );

        return {
          draft: nextDraft,
          edgeId: removedEdgeIds[0],
        };
      }

      replaceDraft(() => nextDraft);
      return undefined;
    },
    [commitFromDrafts, currentDraft, flushConfigHistory, replaceDraft],
  );

  const updateNodeData = useCallback((
    nodeId: string,
    patch: Partial<WorkflowNodeData>,
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
    kind: InsertableWorkflowNodeKind,
    sourceHandle?: string,
  ): WorkflowControllerActionResult => {
    flushConfigHistory();
    const createNodeId = createUniqueWorkflowNodeIdFactory(currentDraft);
    const nodeId = createNodeId(kind);
    return commitGraphOperation(insertNodeAfterOperation(currentDraft, previousNodeId, kind, nodeId, sourceHandle))
      ?? { draft: currentDraft, nodeId };
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const insertNodeBetween = useCallback((
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableWorkflowNodeKind,
  ): WorkflowControllerActionResult => {
    flushConfigHistory();
    const createNodeId = createUniqueWorkflowNodeIdFactory(currentDraft);
    const nodeId = createNodeId(kind);
    return commitGraphOperation(insertNodeBetweenOperation(
      currentDraft,
      edgeId,
      sourceNodeId,
      targetNodeId,
      kind,
      nodeId,
    )) ?? { draft: currentDraft, edgeId, nodeId };
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const addNode = useCallback((kind: WorkflowNodeKind): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    const createNodeId = createUniqueWorkflowNodeIdFactory(currentDraft);
    return commitGraphOperation(addNodeOperation(currentDraft, kind, createNodeId(kind)));
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

  const deleteNodes = useCallback((nodeIds: string[]): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphOperation(deleteNodesOperation(currentDraft, nodeIds));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

  const duplicateNode = useCallback((nodeId: string): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    const node = nodes.find((currentNode) => currentNode.id === nodeId);
    const createNodeId = createUniqueWorkflowNodeIdFactory(currentDraft);
    const duplicatedNodeId = createNodeId(node?.data.kind ?? "action");
    return commitGraphOperation(duplicateNodeOperation(currentDraft, nodeId, duplicatedNodeId));
  }, [commitGraphOperation, currentDraft, flushConfigHistory, nodes]);

  const copyNode = useCallback((nodeId: string): WorkflowClipboardData | undefined => {
    flushConfigHistory();
    return createWorkflowClipboardData(currentDraft, [nodeId]);
  }, [currentDraft, flushConfigHistory]);

  const copyNodes = useCallback((nodeIds: string[]): WorkflowClipboardData | undefined => {
    flushConfigHistory();
    return createWorkflowClipboardData(currentDraft, nodeIds);
  }, [currentDraft, flushConfigHistory]);

  const pasteClipboardData = useCallback((
    clipboardData: WorkflowClipboardData,
  ): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    const createNodeId = createUniqueWorkflowNodeIdFactory(currentDraft);
    return commitGraphOperation(pasteWorkflowClipboardData(currentDraft, clipboardData, {
      nodeIdFactory: (kind) => createNodeId(kind),
    }));
  }, [commitGraphOperation, currentDraft, flushConfigHistory]);

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
      draft: sanitizeDraft(previousState.draft),
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
      draft: sanitizeDraft(nextState.draft),
    };
  }, [flushConfigHistory, futureStates, history]);

  return {
    ...history,
    addNode,
    arrangeNodes,
    connectNodes,
    copyNode,
    copyNodes,
    deleteEdge,
    deleteNode,
    deleteNodes,
    duplicateNode,
    edges,
    insertNodeAfter,
    insertNodeBetween,
    isValidConnection,
    nodes,
    onEdgesChange,
    onNodesChange,
    markDraftDirty,
    pasteClipboardData,
    redo,
    undo,
    updateNodeData,
  };
}
