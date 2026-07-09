import type {
  WorkflowEdge,
  WorkflowNode,
} from "../types";
import {
  getWorkflowConnectionPolicyViolation,
} from "../connection-policy";
import {
  findWorkflowEntryNode,
  findWorkflowTerminalNode,
  isWorkflowEntryNode,
} from "../node-catalog";
import {
  getNodeSourceHandleDefinitions,
  getWorkflowHandleKey,
  getNodeTargetHandleCapacity,
  getNodeUnconnectedSourceHandles,
} from "../node-handle-definitions";

export const WORKFLOW_MAX_TREE_DEPTH = 20;

export type WorkflowGraphValidationIssue = {
  code:
    | "edge-cycle"
    | "edge-invalid-connection"
    | "branch-path-unconnected"
    | "goal-unreachable"
    | "missing-goal"
    | "missing-trigger"
    | "node-disconnected"
    | "node-multiple-incoming"
    | "node-multiple-outgoing"
    | "source-handle-unconnected"
    | "source-handle-multiple-outgoing"
    | "target-handle-multiple-incoming"
    | "tree-depth-exceeded";
  edgeIds?: string[];
  message: string;
  nodeId?: string;
  severity: "warning";
  source: "graph";
};

export type WorkflowGraphValidationResult = {
  disconnectedNodeIds: Set<string>;
  graphIssues: WorkflowGraphValidationIssue[];
  hasCycle: boolean;
  maxDepth: number;
  reachableNodeIds: Set<string>;
  validNodes: WorkflowNode[];
};

export function validateWorkflowGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options: {
    maxDepth?: number;
  } = {},
): WorkflowGraphValidationResult {
  const maxDepthLimit = options.maxDepth ?? WORKFLOW_MAX_TREE_DEPTH;
  const triggerNode = findWorkflowEntryNode(nodes);
  const goalNode = findWorkflowTerminalNode(nodes);
  const { maxDepth, reachableNodeIds, validNodes } = getValidWorkflowTreeNodes(nodes, edges, triggerNode?.id);
  const disconnectedNodeIds = new Set(nodes
    .filter((node) => !reachableNodeIds.has(node.id))
    .map((node) => node.id));
  const graphIssues: WorkflowGraphValidationIssue[] = [];

  if (!triggerNode) {
    graphIssues.push({
      code: "missing-trigger",
      message: "Workflow 需要一个触发节点",
      severity: "warning",
      source: "graph",
    });
  }

  if (!goalNode) {
    graphIssues.push({
      code: "missing-goal",
      message: "Workflow 需要一个目标节点",
      severity: "warning",
      source: "graph",
    });
  }
  else if (!reachableNodeIds.has(goalNode.id)) {
    graphIssues.push({
      code: "goal-unreachable",
      message: "目标节点未接入从触发节点开始的主链路",
      nodeId: goalNode.id,
      severity: "warning",
      source: "graph",
    });
  }

  disconnectedNodeIds.forEach((nodeId) => {
    const node = nodes.find((item) => item.id === nodeId);

    if (!node || isWorkflowEntryNode(node)) {
      return;
    }

    graphIssues.push({
      code: "node-disconnected",
      message: "节点未接入从触发节点开始的主链路",
      nodeId,
      severity: "warning",
      source: "graph",
    });
  });

  if (maxDepth > maxDepthLimit) {
    graphIssues.push({
      code: "tree-depth-exceeded",
      message: `Workflow 链路深度不能超过 ${maxDepthLimit} 层`,
      severity: "warning",
      source: "graph",
    });
  }

  const cycleEdgeIds = getCycleEdgeIds(nodes, edges);
  if (cycleEdgeIds.length > 0) {
    graphIssues.push({
      code: "edge-cycle",
      edgeIds: cycleEdgeIds,
      message: "Workflow 不能包含循环连线",
      severity: "warning",
      source: "graph",
    });
  }

  getCardinalityIssues(nodes, edges).forEach((issue) => graphIssues.push(issue));
  getConnectionPolicyIssues(nodes, edges).forEach((issue) => graphIssues.push(issue));
  getSourceHandleOutletIssues(nodes, edges).forEach((issue) => graphIssues.push(issue));

  return {
    disconnectedNodeIds,
    graphIssues,
    hasCycle: cycleEdgeIds.length > 0,
    maxDepth,
    reachableNodeIds,
    validNodes,
  };
}

export function getValidWorkflowTreeNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  startNodeId: string | undefined,
): {
  maxDepth: number;
  reachableNodeIds: Set<string>;
  validNodes: WorkflowNode[];
} {
  if (!startNodeId) {
    return {
      maxDepth: 0,
      reachableNodeIds: new Set(),
      validNodes: [],
    };
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoingEdges = createOutgoingEdgesMap(edges);
  const reachableNodeIds = new Set<string>();
  const validNodes: WorkflowNode[] = [];
  let maxDepth = 0;

  const traverse = (nodeId: string, depth: number) => {
    const node = nodeById.get(nodeId);

    if (!node || reachableNodeIds.has(nodeId)) {
      return;
    }

    reachableNodeIds.add(nodeId);
    validNodes.push(node);
    maxDepth = Math.max(maxDepth, depth);

    (outgoingEdges.get(nodeId) ?? []).forEach((edge) => {
      traverse(edge.target, depth + 1);
    });
  };

  traverse(startNodeId, 1);

  return {
    maxDepth,
    reachableNodeIds,
    validNodes,
  };
}

function getConnectionPolicyIssues(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowGraphValidationIssue[] {
  const issues: WorkflowGraphValidationIssue[] = [];
  const sourceHandleIssueByKey = new Map<string, WorkflowGraphValidationIssue>();
  const targetHandleIssueByKey = new Map<string, WorkflowGraphValidationIssue>();

  edges.forEach((edge) => {
    const violation = getWorkflowConnectionPolicyViolation({
      edges,
      nodes,
      viewport: { x: 0, y: 0, zoom: 1 },
    }, {
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? null,
      target: edge.target,
      targetHandle: edge.targetHandle ?? null,
    }, {
      checkCycle: false,
      ignoreEdgeId: edge.id,
    });

    if (!violation) {
      return;
    }

    const issueCode = getConnectionPolicyIssueCode(violation);
    const issue: WorkflowGraphValidationIssue = {
      code: issueCode,
      edgeIds: [edge.id],
      message: getConnectionPolicyIssueMessage(violation),
      nodeId: getConnectionPolicyIssueNodeId(edge, issueCode, nodes),
      severity: "warning",
      source: "graph",
    };

    if (issueCode === "source-handle-multiple-outgoing") {
      const sourceHandleKey = getWorkflowHandleKey(edge.sourceHandle);
      const issueKey = `${edge.source}:${sourceHandleKey}`;
      const existingIssue = sourceHandleIssueByKey.get(issueKey);

      if (existingIssue) {
        existingIssue.edgeIds = [...(existingIssue.edgeIds ?? []), edge.id];
        return;
      }

      sourceHandleIssueByKey.set(issueKey, issue);
    }

    if (issueCode === "target-handle-multiple-incoming") {
      const targetHandleKey = getWorkflowHandleKey(edge.targetHandle);
      const issueKey = `${edge.target}:${targetHandleKey}`;
      const existingIssue = targetHandleIssueByKey.get(issueKey);

      if (existingIssue) {
        existingIssue.edgeIds = [...(existingIssue.edgeIds ?? []), edge.id];
        return;
      }

      targetHandleIssueByKey.set(issueKey, issue);
    }

    issues.push(issue);
  });

  return issues;
}

function getConnectionPolicyIssueNodeId(
  edge: WorkflowEdge,
  issueCode: WorkflowGraphValidationIssue["code"],
  nodes: WorkflowNode[],
) {
  const nodeId = issueCode === "target-handle-multiple-incoming" ? edge.target : edge.source;

  return nodes.find((node) => node.id === nodeId)?.id;
}

function getConnectionPolicyIssueCode(
  violation: NonNullable<ReturnType<typeof getWorkflowConnectionPolicyViolation>>,
): WorkflowGraphValidationIssue["code"] {
  if (violation === "source-handle-occupied") {
    return "source-handle-multiple-outgoing";
  }

  if (violation === "target-handle-occupied") {
    return "target-handle-multiple-incoming";
  }

  return "edge-invalid-connection";
}

function getConnectionPolicyIssueMessage(
  violation: NonNullable<ReturnType<typeof getWorkflowConnectionPolicyViolation>>,
) {
  switch (violation) {
    case "duplicate-connection":
      return "不能存在重复连线";
    case "invalid-handle":
      return "连线使用了当前节点不支持的连接桩";
    case "invalid-node-kind":
      return "连线不符合当前节点连接规则";
    case "missing-endpoint":
    case "missing-node":
      return "连线引用了不存在的节点";
    case "self-connection":
      return "节点不能连接到自身";
    case "source-handle-occupied":
      return "同一个出口只能连接一条下游连线";
    case "target-handle-occupied":
      return "同一个入口只能连接一条上游连线";
    case "edge-cycle":
      return "Workflow 不能包含循环连线";
  }
}

function getSourceHandleOutletIssues(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowGraphValidationIssue[] {
  return nodes
    .flatMap((node) => {
      const unconnectedHandles = getNodeUnconnectedSourceHandles(node, edges, { nodes });

      if (!unconnectedHandles.length) {
        return [];
      }

      const hasBranchOutlet = unconnectedHandles.some((handle) => handle.outletKind === "branch-path");

      return [{
        code: hasBranchOutlet ? "branch-path-unconnected" as const : "source-handle-unconnected" as const,
        message: hasBranchOutlet ? "条件分支存在未连接的出口" : "节点存在未连接的出口",
        nodeId: node.id,
        severity: "warning" as const,
        source: "graph" as const,
      }];
    });
}

function getCycleEdgeIds(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoingEdges = createOutgoingEdgesMap(edges.filter((edge) =>
    nodeIds.has(edge.source) && nodeIds.has(edge.target),
  ));
  const visitedNodeIds = new Set<string>();
  const visitingNodeIds = new Set<string>();
  const cycleEdgeIds = new Set<string>();

  const visit = (nodeId: string) => {
    if (visitingNodeIds.has(nodeId)) {
      return true;
    }

    if (visitedNodeIds.has(nodeId)) {
      return false;
    }

    visitingNodeIds.add(nodeId);

    for (const edge of outgoingEdges.get(nodeId) ?? []) {
      if (visit(edge.target)) {
        cycleEdgeIds.add(edge.id);
        return true;
      }
    }

    visitingNodeIds.delete(nodeId);
    visitedNodeIds.add(nodeId);
    return false;
  };

  nodes.forEach((node) => {
    visit(node.id);
  });

  return [...cycleEdgeIds];
}

function getCardinalityIssues(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowGraphValidationIssue[] {
  const issues: WorkflowGraphValidationIssue[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingByTarget = new Map<string, WorkflowEdge[]>();
  const outgoingBySource = new Map<string, WorkflowEdge[]>();

  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      return;
    }

    incomingByTarget.set(edge.target, [...incomingByTarget.get(edge.target) ?? [], edge]);
    outgoingBySource.set(edge.source, [...outgoingBySource.get(edge.source) ?? [], edge]);
  });

  nodes.forEach((node) => {
    const incomingEdges = incomingByTarget.get(node.id) ?? [];
    const outgoingEdges = outgoingBySource.get(node.id) ?? [];
    const targetHandleCapacity = getNodeTargetHandleCapacity(node.data);

    if (incomingEdges.length > targetHandleCapacity) {
      issues.push({
        code: "node-multiple-incoming",
        edgeIds: incomingEdges.map((edge) => edge.id),
        message: "节点入口数量超出当前连接桩能力",
        nodeId: node.id,
        severity: "warning",
        source: "graph",
      });
    }

    const sourceHandleCapacity = getNodeSourceHandleDefinitions(node.data).length;

    if (sourceHandleCapacity <= 1 && outgoingEdges.length > 1) {
      issues.push({
        code: "node-multiple-outgoing",
        edgeIds: outgoingEdges.map((edge) => edge.id),
        message: "节点出口数量超出当前连接桩能力",
        nodeId: node.id,
        severity: "warning",
        source: "graph",
      });
    }
  });

  return issues;
}

function createOutgoingEdgesMap(edges: WorkflowEdge[]) {
  const outgoingEdges = new Map<string, WorkflowEdge[]>();

  edges.forEach((edge) => {
    outgoingEdges.set(edge.source, [...outgoingEdges.get(edge.source) ?? [], edge]);
  });

  return outgoingEdges;
}
