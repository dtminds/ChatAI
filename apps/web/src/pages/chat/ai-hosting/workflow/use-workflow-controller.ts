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
import { WORKFLOW_LAYOUT_X_GAP } from "./constants";
import {
  arrangeWorkflowNodes,
  createEdge,
  createInitialEdges,
  createInitialNodes,
  createNodeFromKind,
  findLastActionNodeId,
  getAfterNodesInSameBranch,
  getBranchHandleLabel,
  getBranchInsertY,
  getNodeIdSet,
  shiftNodesRight,
} from "./graph";
import { canDeleteNodeKind, canInsertNodeKind } from "./node-definitions";
import { useWorkflowHistory } from "./history";
import type {
  InsertableMarketingNodeKind,
  MarketingNodeData,
  MarketingNodeKind,
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
  MarketingWorkflowRenderEdge,
  MarketingWorkflowRenderNode,
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

export type WorkflowActionResult = {
  edgeId?: string;
  nodeId?: string;
};

export function useWorkflowController() {
  const history = useWorkflowHistory(() => ({
    edges: createInitialEdges(),
    nodes: createInitialNodes(),
  }));
  const { commitDraft, commitFromDrafts, currentDraft, replaceDraft } = history;
  const { edges, nodes } = currentDraft;
  const pendingConfigHistoryRef = useRef<PendingConfigHistory | null>(null);
  const configHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const onNodesChange: OnNodesChange<MarketingWorkflowRenderNode> = useCallback(
    (changes: NodeChange<MarketingWorkflowRenderNode>[]) => {
      flushConfigHistory();
      const hasFinalPositionChange = changes.some(isFinalNodePositionChange);

      if (!hasFinalPositionChange) {
        replaceDraft((draft) => ({
          ...draft,
          nodes: applyNodeChanges(changes as NodeChange<MarketingWorkflowNode>[], draft.nodes),
        }));
        return;
      }

      const previousDraft = currentDraft;
      const nextDraft = {
        ...previousDraft,
        nodes: applyNodeChanges(changes as NodeChange<MarketingWorkflowNode>[], previousDraft.nodes),
      };
      const movedNodeId = changes.find(isFinalNodePositionChange)?.id;

      commitFromDrafts(
        "node:move",
        previousDraft,
        nextDraft,
        movedNodeId ? { nodeId: movedNodeId } : undefined,
      );
    },
    [commitFromDrafts, currentDraft, flushConfigHistory, replaceDraft],
  );

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
    const node = nodes.find((currentNode) => currentNode.id === nodeId);

    if (!node) {
      return undefined;
    }

    const nextDraft = {
      ...currentDraft,
      nodes: currentDraft.nodes.map((currentNode) =>
        currentNode.id === nodeId
          ? {
              ...currentNode,
              data: {
                ...currentNode.data,
                ...patch,
              },
            }
          : currentNode,
      ),
    };

    pendingConfigHistoryRef.current = {
      meta: {
        nodeId,
        nodeTitle: node.data.title,
      },
      nextDraft,
      previousDraft: pendingConfigHistoryRef.current?.previousDraft ?? currentDraft,
    };
    replaceDraft(() => nextDraft);
    scheduleConfigHistoryCommit();

    return { nodeId };
  }, [currentDraft, nodes, replaceDraft, scheduleConfigHistoryCommit]);

  const insertNodeAfter = useCallback((
    previousNodeId: string,
    kind: InsertableMarketingNodeKind,
    sourceHandle?: string,
  ): WorkflowActionResult => {
    flushConfigHistory();
    const nodeId = `${kind}-${Date.now()}`;
    const previousNode = nodes.find((node) => node.id === previousNodeId);
    const replacedEdge = edges.find((edge) =>
      edge.source === previousNodeId
      && (sourceHandle ? edge.sourceHandle === sourceHandle : !edge.sourceHandle),
    );
    const nextNodeId = replacedEdge?.target ?? "goal";
    const nextNode = nodes.find((node) => node.id === nextNodeId);
    const nodesToShift = replacedEdge
      ? getAfterNodesInSameBranch(nodes, edges, nextNodeId)
      : [];
    const shiftedNodeIds = getNodeIdSet(nodesToShift);
    const node = {
      ...createNodeFromKind(kind, nodeId, nodes.length),
      position: {
        x: nextNode?.position.x ?? (previousNode?.position.x ?? 0) + WORKFLOW_LAYOUT_X_GAP,
        y:
          nextNode?.position.y
          ?? (previousNode?.data.kind === "branch"
            ? getBranchInsertY(previousNode.position.y, sourceHandle)
            : previousNode?.position.y ?? 0),
      },
    };

    commitDraft(
      replacedEdge ? "node:insert" : "node:add",
      (draft) => ({
        edges: [
          ...draft.edges.filter(
            (edge) => edge.id !== replacedEdge?.id,
          ),
          createEdge(previousNodeId, nodeId, replacedEdge?.data?.label ?? getBranchHandleLabel(sourceHandle), {
            sourceHandle: replacedEdge?.sourceHandle ?? sourceHandle,
          }),
          createEdge(nodeId, nextNodeId, undefined, {
            targetHandle: replacedEdge?.targetHandle,
          }),
        ],
        nodes: [...shiftNodesRight(draft.nodes, shiftedNodeIds), node],
      }),
      {
        nodeId,
        nodeTitle: node.data.title,
      },
    );

    return { edgeId: replacedEdge?.id, nodeId };
  }, [commitDraft, edges, flushConfigHistory, nodes]);

  const insertNodeBetween = useCallback((
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ): WorkflowActionResult => {
    flushConfigHistory();
    const nodeId = `${kind}-${Date.now()}`;
    const sourceNode = nodes.find((node) => node.id === sourceNodeId);
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    const replacedEdge = edges.find((edge) => edge.id === edgeId);
    const nodesToShift = getAfterNodesInSameBranch(nodes, edges, targetNodeId);
    const shiftedNodeIds = getNodeIdSet(nodesToShift);
    const node = {
      ...createNodeFromKind(kind, nodeId, nodes.length),
      position: {
        x: targetNode?.position.x ?? (sourceNode?.position.x ?? 0) + WORKFLOW_LAYOUT_X_GAP,
        y: targetNode?.position.y ?? sourceNode?.position.y ?? 0,
      },
    };

    commitDraft(
      "node:insert",
      (draft) => ({
        edges: [
          ...draft.edges.filter((edge) => edge.id !== edgeId),
          createEdge(sourceNodeId, nodeId, replacedEdge?.data?.label, {
            sourceHandle: replacedEdge?.sourceHandle,
            targetHandle: replacedEdge?.targetHandle,
          }),
          createEdge(nodeId, targetNodeId),
        ],
        nodes: [...shiftNodesRight(draft.nodes, shiftedNodeIds), node],
      }),
      {
        edgeId,
        nodeId,
        nodeTitle: node.data.title,
      },
    );

    return { edgeId, nodeId };
  }, [commitDraft, edges, flushConfigHistory, nodes]);

  const addNode = useCallback((kind: MarketingNodeKind): WorkflowActionResult | undefined => {
    if (!canInsertNodeKind(kind)) {
      return undefined;
    }

    return insertNodeAfter(findLastActionNodeId(nodes, edges), kind);
  }, [edges, insertNodeAfter, nodes]);

  const connectNodes = useCallback((connection: Connection): WorkflowActionResult | undefined => {
    flushConfigHistory();
    const { source, sourceHandle, target, targetHandle } = connection;

    if (!source || !target || source === target) {
      return undefined;
    }

    if (
      edges.some((edge) =>
        edge.source === source
        && edge.sourceHandle === (sourceHandle ?? undefined)
        && edge.target === target
        && edge.targetHandle === (targetHandle ?? undefined),
      )
    ) {
      return undefined;
    }

    const edge = createEdge(source, target, undefined, { sourceHandle, targetHandle });

    commitDraft(
      "edge:connect",
      (draft) => ({
        ...draft,
        edges: [
          ...draft.edges,
          edge,
        ],
      }),
      {
        nodeId: source,
      },
    );

    return { edgeId: edge.id, nodeId: source };
  }, [commitDraft, edges, flushConfigHistory]);

  const deleteNode = useCallback((nodeId: string): WorkflowActionResult | undefined => {
    flushConfigHistory();
    const node = nodes.find((currentNode) => currentNode.id === nodeId);

    if (!node || !canDeleteNodeKind(node.data.kind)) {
      return undefined;
    }

    commitDraft(
      "node:delete",
      (draft) => ({
        edges: draft.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
        nodes: draft.nodes.filter((currentNode) => currentNode.id !== nodeId),
      }),
      {
        nodeId,
        nodeTitle: node.data.title,
      },
    );

    return { nodeId };
  }, [commitDraft, flushConfigHistory, nodes]);

  const deleteEdge = useCallback((edgeId: string): WorkflowActionResult | undefined => {
    flushConfigHistory();

    const edge = edges.find((currentEdge) => currentEdge.id === edgeId);

    if (!edge) {
      return undefined;
    }

    commitDraft(
      "edge:delete",
      (draft) => ({
        ...draft,
        edges: draft.edges.filter((currentEdge) => currentEdge.id !== edgeId),
      }),
      {
        edgeId,
        nodeId: edge.source,
      },
    );

    return { edgeId, nodeId: edge.source };
  }, [commitDraft, edges, flushConfigHistory]);

  const arrangeNodes = useCallback(() => {
    flushConfigHistory();
    commitDraft("layout:organize", (draft) => ({
      ...draft,
      nodes: arrangeWorkflowNodes(draft.nodes, draft.edges),
    }));
  }, [commitDraft, flushConfigHistory]);

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
    edges,
    insertNodeAfter,
    insertNodeBetween,
    nodes,
    onEdgesChange,
    onNodesChange,
    redo,
    undo,
    updateNodeData,
  };
}
