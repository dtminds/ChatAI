import {
  WORKFLOW_LAYOUT_X_GAP,
  WORKFLOW_LAYOUT_Y_GAP,
  WORKFLOW_NODE_ESTIMATED_HEIGHT,
} from "./constants";
import {
  getNodeSourceHandleIndex,
  getNodeSourceHandleLaneOffset,
} from "./node-handle-definitions";
import { isWorkflowEntryNode } from "./node-catalog";
import { getWorkflowNodeEstimatedHeight } from "./layout";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "./types";

const NODE_VERTICAL_PADDING = 80;

type LayoutNodeInfo = {
  layer: number;
  lane: number;
  x: number;
  y: number;
};

type LayoutEdge = WorkflowEdge & {
  order: number;
};

export type WorkflowLayoutResult = {
  nodes: Map<string, LayoutNodeInfo>;
};

export function arrangeWorkflowNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  return applyWorkflowLayoutToNodes(nodes, computeWorkflowLayout(nodes, edges));
}

export function computeWorkflowLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowLayoutResult {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const originalIndexById = new Map(nodes.map((node, index) => [node.id, index]));
  const outgoingById = new Map(nodes.map((node) => [node.id, [] as LayoutEdge[]]));
  const incomingById = new Map(nodes.map((node) => [node.id, [] as LayoutEdge[]]));

  edges.forEach((edge, order) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      return;
    }

    const layoutEdge = { ...edge, order };
    outgoingById.get(edge.source)?.push(layoutEdge);
    incomingById.get(edge.target)?.push(layoutEdge);
  });

  outgoingById.forEach((outgoingEdges) => {
    outgoingEdges.sort(compareEdgesForLayout(originalIndexById, nodeById));
  });

  const traversalOrder = createPortAwareTraversalOrder(nodes, outgoingById, incomingById, originalIndexById);
  const traversalIndexById = new Map(traversalOrder.map((nodeId, index) => [nodeId, index]));
  const layerById = computeLayerById(nodes, incomingById, outgoingById, traversalIndexById);
  const laneById = computeLaneById(nodes, incomingById, traversalIndexById, layerById, nodeById);

  return {
    nodes: createLayoutNodeMap(nodes, originalIndexById, traversalIndexById, layerById, laneById),
  };
}

export function applyWorkflowLayoutToNodes(
  nodes: WorkflowNode[],
  layout: WorkflowLayoutResult,
) {
  return nodes.map((node) => {
    const layoutInfo = layout.nodes.get(node.id);

    if (!layoutInfo) {
      return node;
    }

    return {
      ...node,
      position: {
        x: layoutInfo.x,
        y: layoutInfo.y,
      },
    };
  });
}

function createLayoutNodeMap(
  nodes: WorkflowNode[],
  originalIndexById: Map<string, number>,
  traversalIndexById: Map<string, number>,
  layerById: Map<string, number>,
  laneById: Map<string, number>,
) {
  const nodesByLayer = new Map<number, WorkflowNode[]>();

  nodes.forEach((node) => {
    const layer = layerById.get(node.id) ?? 0;
    nodesByLayer.set(layer, [...(nodesByLayer.get(layer) ?? []), node]);
  });

  const layoutNodes = new Map<string, LayoutNodeInfo>();

  nodesByLayer.forEach((layerNodes, layer) => {
    const sortedNodes = [...layerNodes].sort(compareNodesForLayout(originalIndexById, traversalIndexById, laneById));
    const yById = resolveLayerYPositions(sortedNodes, laneById);

    sortedNodes.forEach((node) => {
      layoutNodes.set(node.id, {
        layer,
        lane: laneById.get(node.id) ?? 0,
        x: layer * WORKFLOW_LAYOUT_X_GAP,
        y: yById.get(node.id) ?? node.position.y,
      });
    });
  });

  return layoutNodes;
}

function resolveLayerYPositions(
  nodes: WorkflowNode[],
  laneById: Map<string, number>,
) {
  const yById = new Map<string, number>();
  let previousNode: WorkflowNode | undefined;
  let previousY = 0;

  nodes.forEach((node) => {
    const desiredY = (laneById.get(node.id) ?? 0) * getLaneGap();

    if (!previousNode) {
      yById.set(node.id, desiredY);
      previousNode = node;
      previousY = desiredY;
      return;
    }

    const minY = previousY
      + getWorkflowNodeEstimatedHeight(previousNode) / 2
      + NODE_VERTICAL_PADDING
      + getWorkflowNodeEstimatedHeight(node) / 2;
    const y = Math.max(desiredY, minY);

    yById.set(node.id, y);
    previousNode = node;
    previousY = y;
  });

  return yById;
}

function getInitialLane(node: WorkflowNode) {
  return Math.round(node.position.y / getLaneGap());
}

function createPortAwareTraversalOrder(
  nodes: WorkflowNode[],
  outgoingById: Map<string, LayoutEdge[]>,
  incomingById: Map<string, LayoutEdge[]>,
  originalIndexById: Map<string, number>,
) {
  const roots = nodes
    .filter((node) => (incomingById.get(node.id) ?? []).length === 0)
    .sort(compareRootNodesForLayout(originalIndexById));
  const visited = new Set<string>();
  const orderedNodeIds: string[] = [];

  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    orderedNodeIds.push(nodeId);
    (outgoingById.get(nodeId) ?? []).forEach((edge) => visit(edge.target));
  };

  roots.forEach((node) => visit(node.id));
  nodes
    .sort(compareRootNodesForLayout(originalIndexById))
    .forEach((node) => visit(node.id));

  return orderedNodeIds;
}

function computeLayerById(
  nodes: WorkflowNode[],
  incomingById: Map<string, LayoutEdge[]>,
  outgoingById: Map<string, LayoutEdge[]>,
  traversalIndexById: Map<string, number>,
) {
  const layerById = new Map(nodes.map((node) => [node.id, 0]));
  const remainingIncomingCountById = new Map(
    nodes.map((node) => [node.id, (incomingById.get(node.id) ?? []).length]),
  );
  const queue = nodes
    .filter((node) => (remainingIncomingCountById.get(node.id) ?? 0) === 0)
    .sort(compareNodesByTraversalOrder(traversalIndexById));
  const visitedNodeIds = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift();

    if (!node || visitedNodeIds.has(node.id)) {
      continue;
    }

    visitedNodeIds.add(node.id);

    (outgoingById.get(node.id) ?? []).forEach((edge) => {
      layerById.set(edge.target, Math.max(layerById.get(edge.target) ?? 0, (layerById.get(node.id) ?? 0) + 1));
      remainingIncomingCountById.set(edge.target, (remainingIncomingCountById.get(edge.target) ?? 1) - 1);

      if (remainingIncomingCountById.get(edge.target) === 0) {
        queue.push(nodes.find((item) => item.id === edge.target)!);
        queue.sort(compareNodesByTraversalOrder(traversalIndexById));
      }
    });
  }

  nodes.forEach((node) => {
    if (visitedNodeIds.has(node.id)) {
      return;
    }

    const parentLayers = (incomingById.get(node.id) ?? [])
      .map((edge) => layerById.get(edge.source))
      .filter((layer): layer is number => typeof layer === "number");

    layerById.set(node.id, parentLayers.length > 0
      ? Math.max(...parentLayers) + 1
      : Math.max(0, Math.round(node.position.x / WORKFLOW_LAYOUT_X_GAP)));
  });

  return layerById;
}

function computeLaneById(
  nodes: WorkflowNode[],
  incomingById: Map<string, LayoutEdge[]>,
  traversalIndexById: Map<string, number>,
  layerById: Map<string, number>,
  nodeById: Map<string, WorkflowNode>,
) {
  const laneById = new Map<string, number>();
  const sortedNodes = [...nodes].sort(
    (first, second) =>
      (layerById.get(first.id) ?? 0) - (layerById.get(second.id) ?? 0)
      || (traversalIndexById.get(first.id) ?? 0) - (traversalIndexById.get(second.id) ?? 0),
  );

  sortedNodes.forEach((node) => {
    const incomingEdges = incomingById.get(node.id) ?? [];

    if (incomingEdges.length === 0) {
      laneById.set(node.id, getInitialLane(node));
      return;
    }

    const parentLanes = incomingEdges
      .map((edge) => {
        const sourceNode = nodeById.get(edge.source);

        if (!sourceNode) {
          return undefined;
        }

        return (laneById.get(sourceNode.id) ?? getInitialLane(sourceNode))
          + getSourceHandleLaneOffset(sourceNode, edge);
      })
      .filter((lane): lane is number => typeof lane === "number");

    laneById.set(node.id, parentLanes.length > 0
      ? parentLanes.reduce((sum, lane) => sum + lane, 0) / parentLanes.length
      : getInitialLane(node));
  });

  return laneById;
}

function getSourceHandleLaneOffset(sourceNode: WorkflowNode, edge: WorkflowEdge) {
  return getNodeSourceHandleLaneOffset(sourceNode, edge.sourceHandle);
}

function getLaneGap() {
  return Math.max(WORKFLOW_LAYOUT_Y_GAP, WORKFLOW_NODE_ESTIMATED_HEIGHT + NODE_VERTICAL_PADDING);
}

function compareEdgesForLayout(
  originalIndexById: Map<string, number>,
  nodeById: Map<string, WorkflowNode>,
) {
  return (first: LayoutEdge, second: LayoutEdge) =>
    getNodeSourceHandleIndex(nodeById.get(first.source)?.data, first.sourceHandle)
    - getNodeSourceHandleIndex(nodeById.get(second.source)?.data, second.sourceHandle)
    || (originalIndexById.get(first.target) ?? 0) - (originalIndexById.get(second.target) ?? 0)
    || first.order - second.order
    || first.target.localeCompare(second.target);
}

function compareRootNodesForLayout(
  originalIndexById: Map<string, number>,
) {
  return (first: WorkflowNode, second: WorkflowNode) => {
    if (isWorkflowEntryNode(first)) {
      return -1;
    }

    if (isWorkflowEntryNode(second)) {
      return 1;
    }

    return first.position.x - second.position.x
      || first.position.y - second.position.y
      || (originalIndexById.get(first.id) ?? 0) - (originalIndexById.get(second.id) ?? 0);
  };
}

function compareNodesByTraversalOrder(
  traversalIndexById: Map<string, number>,
) {
  return (first: WorkflowNode, second: WorkflowNode) =>
    (traversalIndexById.get(first.id) ?? 0) - (traversalIndexById.get(second.id) ?? 0);
}

function compareNodesForLayout(
  originalIndexById: Map<string, number>,
  traversalIndexById: Map<string, number>,
  laneById: Map<string, number>,
) {
  return (first: WorkflowNode, second: WorkflowNode) => {
    if (isWorkflowEntryNode(first)) {
      return -1;
    }

    if (isWorkflowEntryNode(second)) {
      return 1;
    }

    return (laneById.get(first.id) ?? 0) - (laneById.get(second.id) ?? 0)
      || (traversalIndexById.get(first.id) ?? 0) - (traversalIndexById.get(second.id) ?? 0)
      || first.position.y - second.position.y
      || first.position.x - second.position.x
      || (originalIndexById.get(first.id) ?? 0) - (originalIndexById.get(second.id) ?? 0);
  };
}
