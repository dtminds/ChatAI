import { useCallback } from "react";
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

export type WorkflowActionResult = {
  edgeId?: string;
  nodeId?: string;
};

export function useWorkflowController() {
  const history = useWorkflowHistory(() => ({
    edges: createInitialEdges(),
    nodes: createInitialNodes(),
  }));
  const { commitDraft, currentDraft, replaceDraft } = history;
  const { edges, nodes } = currentDraft;

  const onNodesChange: OnNodesChange<MarketingWorkflowRenderNode> = useCallback(
    (changes: NodeChange<MarketingWorkflowRenderNode>[]) => {
      replaceDraft((draft) => ({
        ...draft,
        nodes: applyNodeChanges(changes as NodeChange<MarketingWorkflowNode>[], draft.nodes),
      }));
    },
    [replaceDraft],
  );

  const onEdgesChange: OnEdgesChange<MarketingWorkflowRenderEdge> = useCallback(
    (changes: EdgeChange<MarketingWorkflowRenderEdge>[]) => {
      replaceDraft((draft) => ({
        ...draft,
        edges: applyEdgeChanges(changes as EdgeChange<MarketingWorkflowEdge>[], draft.edges),
      }));
    },
    [replaceDraft],
  );

  const updateNodeData = useCallback((
    nodeId: string,
    patch: Partial<MarketingNodeData>,
  ): WorkflowActionResult | undefined => {
    const node = nodes.find((currentNode) => currentNode.id === nodeId);

    if (!node) {
      return undefined;
    }

    commitDraft(
      "node:config-change",
      (draft) => ({
        ...draft,
        nodes: draft.nodes.map((currentNode) =>
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
      }),
      {
        nodeId,
        nodeTitle: node.data.title,
      },
    );

    return { nodeId };
  }, [commitDraft, nodes]);

  const insertNodeAfter = useCallback((
    previousNodeId: string,
    kind: InsertableMarketingNodeKind,
    sourceHandle?: string,
  ): WorkflowActionResult => {
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
  }, [commitDraft, edges, nodes]);

  const insertNodeBetween = useCallback((
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ): WorkflowActionResult => {
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
  }, [commitDraft, edges, nodes]);

  const addNode = useCallback((kind: MarketingNodeKind): WorkflowActionResult | undefined => {
    if (kind === "trigger" || kind === "goal") {
      return undefined;
    }

    return insertNodeAfter(findLastActionNodeId(nodes, edges), kind);
  }, [edges, insertNodeAfter, nodes]);

  const connectNodes = useCallback((connection: Connection): WorkflowActionResult | undefined => {
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
  }, [commitDraft, edges]);

  const deleteNode = useCallback((nodeId: string): WorkflowActionResult | undefined => {
    const node = nodes.find((currentNode) => currentNode.id === nodeId);

    if (!node || node.data.kind === "trigger" || node.data.kind === "goal") {
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
  }, [commitDraft, nodes]);

  const arrangeNodes = useCallback(() => {
    commitDraft("layout:organize", (draft) => ({
      ...draft,
      nodes: arrangeWorkflowNodes(draft.nodes, draft.edges),
    }));
  }, [commitDraft]);

  return {
    ...history,
    addNode,
    arrangeNodes,
    connectNodes,
    deleteNode,
    edges,
    insertNodeAfter,
    insertNodeBetween,
    nodes,
    onEdgesChange,
    onNodesChange,
    updateNodeData,
  };
}
