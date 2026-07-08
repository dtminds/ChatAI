import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Connection,
  EdgeChange,
  NodeChange,
  Viewport,
} from "@xyflow/react";
import { isWorkflowConnectionAllowed } from "./connection-policy";
import {
  sanitizeDraft,
} from "./workflow-draft-normalizer";
import {
  moveNodesInDraft,
} from "./graph-operations";
import type {
  WorkflowActionResult,
  WorkflowGraphOperation,
  WorkflowNodePositionUpdate,
} from "./graph-operations";
import { useWorkflowHistory } from "./history";
import type { WorkflowHistoryEventMeta } from "./history";
import type {
  InsertableWorkflowNodeKind,
  WorkflowNodeConfigPatch,
  WorkflowNodeKind,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRenderEdge,
  WorkflowRenderNode,
  WorkflowDraft,
} from "./types";
import {
  createWorkflowClipboardData,
} from "./workflow-clipboard";
import type { WorkflowClipboardData } from "./workflow-clipboard";
import {
  runWorkflowGraphCommand,
} from "./workflow-commands";
import type { WorkflowGraphCommand } from "./workflow-commands";

const WORKFLOW_CONFIG_HISTORY_DEBOUNCE_MS = 500;

type PendingConfigHistory = {
  event: WorkflowGraphOperation["event"];
  meta: WorkflowHistoryEventMeta & { nodeId: string };
  nextDraft: WorkflowDraft;
  previousDraft: WorkflowDraft;
};

type WorkflowControllerActionResult = WorkflowActionResult & {
  draft: WorkflowDraft;
  transient?: boolean;
};

function preserveCurrentViewport(
  draft: WorkflowDraft,
  currentDraft: WorkflowDraft,
): WorkflowDraft {
  return {
    ...draft,
    viewport: currentDraft.viewport,
  };
}

export function useWorkflowController(initialDraft: WorkflowDraft) {
  const history = useWorkflowHistory(() => initialDraft);
  const {
    commitFromDrafts,
    commitFromDraftsAndUndo,
    currentDraft,
    futureStates,
    pastStates,
    replaceDraft,
    replaceDraftTransient,
    resetDraft,
  } = history;
  const { edges, nodes } = currentDraft;
  const [currentViewport, setCurrentViewport] = useState(initialDraft.viewport);
  const [pendingConfigHistoryActive, setPendingConfigHistoryActive] = useState(false);
  const pendingConfigHistoryRef = useRef<PendingConfigHistory | null>(null);
  const configHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveStartDraftRef = useRef<{
    edges: WorkflowEdge[];
    nodes: WorkflowNode[];
    viewport: WorkflowDraft["viewport"];
  } | null>(null);

  const clearConfigHistoryTimer = useCallback(() => {
    if (!configHistoryTimerRef.current) {
      return;
    }

    clearTimeout(configHistoryTimerRef.current);
    configHistoryTimerRef.current = null;
  }, []);

  const flushConfigHistory = useCallback((): PendingConfigHistory | null => {
    const pendingHistory = pendingConfigHistoryRef.current;

    clearConfigHistoryTimer();

    if (!pendingHistory) {
      return null;
    }

    pendingConfigHistoryRef.current = null;
    setPendingConfigHistoryActive(false);
    commitFromDrafts(
      pendingHistory.event,
      pendingHistory.previousDraft,
      pendingHistory.nextDraft,
      pendingHistory.meta,
    );
    return pendingHistory;
  }, [clearConfigHistoryTimer, commitFromDrafts]);

  const undoPendingConfigHistory = useCallback((): PendingConfigHistory | null => {
    const pendingHistory = pendingConfigHistoryRef.current;

    clearConfigHistoryTimer();

    if (!pendingHistory) {
      return null;
    }

    pendingConfigHistoryRef.current = null;
    setPendingConfigHistoryActive(false);
    commitFromDraftsAndUndo(
      pendingHistory.event,
      pendingHistory.previousDraft,
      pendingHistory.nextDraft,
      pendingHistory.meta,
    );
    return pendingHistory;
  }, [clearConfigHistoryTimer, commitFromDraftsAndUndo]);

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
    setPendingConfigHistoryActive(false);
    moveStartDraftRef.current = null;
    setCurrentViewport(initialDraft.viewport);
    clearConfigHistoryTimer();
    resetDraft(initialDraft);
  }, [clearConfigHistoryTimer, initialDraft, resetDraft]);

  const onNodesChange = useCallback(
    (_changes: NodeChange<WorkflowRenderNode>[]) => {
      flushConfigHistory();
      return undefined;
    },
    [flushConfigHistory],
  );

  const beginNodeDrag = useCallback(() => {
    flushConfigHistory();
    moveStartDraftRef.current = currentDraft;
  }, [currentDraft, flushConfigHistory]);

  const updateNodeDrag = useCallback((nodeId: string, position: WorkflowNode["position"]) => {
    const nextDraft = moveNodesInDraft(currentDraft, [{ nodeId, position }]);

    if (nextDraft === currentDraft) {
      return undefined;
    }

    replaceDraftTransient(() => nextDraft);
    return {
      draft: nextDraft,
      nodeId,
      transient: true,
    };
  }, [currentDraft, replaceDraftTransient]);

  const finishNodeDrag = useCallback((
    nodeId: string,
    position: WorkflowNode["position"],
    draggedNodes: Array<Pick<WorkflowNode, "id" | "position">> = [],
  ) => {
    flushConfigHistory();
    const previousDraft = moveStartDraftRef.current ?? currentDraft;
    const positionUpdates: WorkflowNodePositionUpdate[] = draggedNodes.length > 0
      ? draggedNodes.map((node) => ({
          nodeId: node.id,
          position: node.position,
        }))
      : [{ nodeId, position }];

    if (!positionUpdates.some((update) => update.nodeId === nodeId)) {
      positionUpdates.push({ nodeId, position });
    }

    const operation = runWorkflowGraphCommand(previousDraft, {
      nodeId,
      type: "move-nodes",
      updates: positionUpdates,
    });
    moveStartDraftRef.current = null;

    if (!operation) {
      replaceDraftTransient(() => sanitizeDraft(moveNodesInDraft(currentDraft, positionUpdates)));
      return undefined;
    }

    commitFromDrafts(operation.event, previousDraft, operation.draft, operation.meta);
    return {
      ...operation.result,
      draft: preserveCurrentViewport(operation.draft, currentDraft),
      nodeId,
    };
  }, [commitFromDrafts, currentDraft, flushConfigHistory, replaceDraftTransient]);

  const flushPendingConfigHistory = useCallback(() => {
    flushConfigHistory();
  }, [flushConfigHistory]);

  const updateViewport = useCallback((viewport: Viewport) => {
    if (
      currentViewport.x === viewport.x
      && currentViewport.y === viewport.y
      && currentViewport.zoom === viewport.zoom
    ) {
      return undefined;
    }

    setCurrentViewport(viewport);
    return {
      draft: {
        ...currentDraft,
        viewport,
      },
      transient: true,
    };
  }, [currentDraft, currentViewport]);

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowRenderEdge>[]) => {
      flushConfigHistory();
      const currentEdgeIds = new Set(currentDraft.edges.map((edge) => edge.id));
      const removedEdgeIds = changes
        .filter((change): change is EdgeChange<WorkflowRenderEdge> & { id: string; type: "remove" } =>
          change.type === "remove" && "id" in change && typeof change.id === "string",
        )
        .map((change) => change.id)
        .filter((edgeId) => currentEdgeIds.has(edgeId));

      if (removedEdgeIds.length > 0) {
        const operation = runWorkflowGraphCommand(currentDraft, {
          edgeIds: removedEdgeIds,
          type: "delete-edges",
        });

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
      }

      return undefined;
    },
    [commitFromDrafts, currentDraft, flushConfigHistory],
  );

  const updateNodeData = useCallback((
    nodeId: string,
    patch: WorkflowNodeConfigPatch,
  ): WorkflowControllerActionResult | undefined => {
    const operation = runWorkflowGraphCommand(currentDraft, {
      nodeId,
      patch,
      type: "update-node-data",
    });

    if (!operation) {
      return undefined;
    }

    if (!operation.meta?.nodeId) {
      return undefined;
    }

    pendingConfigHistoryRef.current = {
      event: operation.event,
      meta: {
        ...operation.meta,
        nodeId: operation.meta.nodeId,
      },
      nextDraft: operation.draft,
      previousDraft: pendingConfigHistoryRef.current?.previousDraft ?? currentDraft,
    };
    setPendingConfigHistoryActive(true);
    replaceDraft(() => operation.draft, { clearFuture: true });
    scheduleConfigHistoryCommit();

    return {
      ...operation.result,
      draft: operation.draft,
    };
  }, [currentDraft, replaceDraft, scheduleConfigHistoryCommit]);

  const commitGraphCommand = useCallback((command: WorkflowGraphCommand) => {
    const operation = runWorkflowGraphCommand(currentDraft, command);

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
  ): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphCommand({
      kind,
      previousNodeId,
      sourceHandle,
      type: "insert-node-after",
    });
  }, [commitGraphCommand, flushConfigHistory]);

  const insertNodeBetween = useCallback((
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableWorkflowNodeKind,
  ): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphCommand({
      edgeId,
      kind,
      sourceNodeId,
      targetNodeId,
      type: "insert-node-between",
    });
  }, [commitGraphCommand, flushConfigHistory]);

  const addNode = useCallback((kind: WorkflowNodeKind): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphCommand({ kind, type: "add-node" });
  }, [commitGraphCommand, flushConfigHistory]);

  const connectNodes = useCallback((connection: Connection): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphCommand({ connection, type: "connect-nodes" });
  }, [commitGraphCommand, flushConfigHistory]);

  const isValidConnection = useCallback((connection: Connection) => (
    isWorkflowConnectionAllowed(currentDraft, connection)
  ), [currentDraft]);

  const deleteNode = useCallback((nodeId: string): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphCommand({ nodeId, type: "delete-node" });
  }, [commitGraphCommand, flushConfigHistory]);

  const deleteNodes = useCallback((nodeIds: string[]): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphCommand({ nodeIds, type: "delete-nodes" });
  }, [commitGraphCommand, flushConfigHistory]);

  const duplicateNode = useCallback((nodeId: string): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphCommand({ nodeId, type: "duplicate-node" });
  }, [commitGraphCommand, flushConfigHistory]);

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
    return commitGraphCommand({ clipboardData, type: "paste-clipboard" });
  }, [commitGraphCommand, flushConfigHistory]);

  const deleteEdge = useCallback((edgeId: string): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphCommand({ edgeId, type: "delete-edge" });
  }, [commitGraphCommand, flushConfigHistory]);

  const arrangeNodes = useCallback((): WorkflowControllerActionResult | undefined => {
    flushConfigHistory();
    return commitGraphCommand({ type: "arrange-nodes" });
  }, [commitGraphCommand, flushConfigHistory]);

  const undo = useCallback((): WorkflowControllerActionResult | undefined => {
    const pendingConfigHistory = undoPendingConfigHistory();
    if (pendingConfigHistory) {
      return {
        draft: sanitizeDraft(preserveCurrentViewport(pendingConfigHistory.previousDraft, currentDraft)),
      };
    }

    const previousState = pastStates.at(-1);
    if (!previousState) {
      return undefined;
    }

    history.undo();
    return {
      draft: sanitizeDraft(preserveCurrentViewport(previousState.beforeDraft, currentDraft)),
    };
  }, [currentDraft, history, pastStates, undoPendingConfigHistory]);

  const redo = useCallback((): WorkflowControllerActionResult | undefined => {
    const pendingConfigHistory = flushConfigHistory();
    if (pendingConfigHistory) {
      return {
        draft: sanitizeDraft(preserveCurrentViewport(pendingConfigHistory.nextDraft, currentDraft)),
      };
    }

    const nextState = futureStates[0];
    if (!nextState) {
      return undefined;
    }

    history.redo();
    return {
      draft: sanitizeDraft(preserveCurrentViewport(nextState.afterDraft, currentDraft)),
    };
  }, [currentDraft, flushConfigHistory, futureStates, history]);

  return {
    ...history,
    addNode,
    arrangeNodes,
    beginNodeDrag,
    canUndo: pendingConfigHistoryActive || history.canUndo,
    connectNodes,
    copyNode,
    copyNodes,
    currentViewport,
    deleteEdge,
    deleteNode,
    deleteNodes,
    duplicateNode,
    edges,
    finishNodeDrag,
    insertNodeAfter,
    insertNodeBetween,
    isValidConnection,
    nodes,
    onEdgesChange,
    onNodesChange,
    flushPendingConfigHistory,
    nextUndoLabel: pendingConfigHistoryActive ? "修改节点配置" : history.nextUndoLabel,
    pasteClipboardData,
    redo,
    undo,
    updateViewport,
    updateNodeData,
    updateNodeDrag,
  };
}
