import { getWorkflowNodeCatalogEntry } from "../node-catalog";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeValidationIssue,
} from "../types";

export type WorkflowValidationNodeIssue = {
  issues: WorkflowNodeValidationIssue[];
  node: WorkflowNode;
};

export type WorkflowValidationResult = {
  configuredAiNodes: WorkflowNode[];
  disconnectedNodes: WorkflowNode[];
  goalNode?: WorkflowNode;
  nodeIssues: WorkflowValidationNodeIssue[];
  reachableNodeIds: Set<string>;
  triggerNode?: WorkflowNode;
};

export function validateWorkflowDraft(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowValidationResult {
  const triggerNode = nodes.find((node) => node.data.kind === "trigger");
  const goalNode = nodes.find((node) => node.data.kind === "goal");
  const reachableNodeIds = getReachableNodeIds(triggerNode?.id, edges);
  const disconnectedNodes = triggerNode
    ? nodes.filter((node) => !reachableNodeIds.has(node.id))
    : nodes.filter((node) => node.data.kind !== "trigger");
  const nodeIssues = nodes
    .map((node) => ({
      issues: [
        ...validateWorkflowNode(node, nodes, edges),
        ...validateWorkflowNodeConnectivity(node, disconnectedNodes, triggerNode?.id),
      ],
      node,
    }))
    .filter((item) => item.issues.length > 0);
  const configuredAiNodes = nodes.filter(
    (node) => node.data.kind === "ai" && hasText(node.data.agentName),
  );

  return {
    configuredAiNodes,
    disconnectedNodes,
    goalNode,
    nodeIssues,
    reachableNodeIds,
    triggerNode,
  };
}

function validateWorkflowNode(
  node: WorkflowNode,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNodeValidationIssue[] {
  const entry = getWorkflowNodeCatalogEntry(node.data.kind);
  const issues = entry.validate?.(node, { edges, nodes }) ?? [];

  if (issues.length === 0 && node.data.status === "warning") {
    return [
      {
        code: "node-runtime-warning",
        message: "节点仍需补全配置",
        severity: "warning",
        source: "runtime",
      },
    ];
  }

  return issues;
}

function validateWorkflowNodeConnectivity(
  node: WorkflowNode,
  disconnectedNodes: WorkflowNode[],
  triggerNodeId: string | undefined,
): WorkflowNodeValidationIssue[] {
  if (node.id === triggerNodeId || !disconnectedNodes.some((item) => item.id === node.id)) {
    return [];
  }

  return [
    {
      code: "node-disconnected",
      message: "节点未接入从触发节点开始的主链路",
      severity: "warning",
      source: "runtime",
    },
  ];
}

function getReachableNodeIds(
  startNodeId: string | undefined,
  edges: WorkflowEdge[],
) {
  const reachableNodeIds = new Set<string>();
  if (!startNodeId) {
    return reachableNodeIds;
  }

  const outgoingEdges = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoingEdges.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoingEdges.set(edge.source, targets);
  }

  const pending = [startNodeId];
  while (pending.length > 0) {
    const nodeId = pending.shift();
    if (!nodeId || reachableNodeIds.has(nodeId)) {
      continue;
    }

    reachableNodeIds.add(nodeId);
    pending.push(...(outgoingEdges.get(nodeId) ?? []));
  }

  return reachableNodeIds;
}

function hasText(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}
