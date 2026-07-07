import { getWorkflowNodeCatalogEntry } from "../node-catalog";
import type {
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
  WorkflowNodeValidationIssue,
} from "../types";

export type WorkflowValidationNodeIssue = {
  issues: WorkflowNodeValidationIssue[];
  node: MarketingWorkflowNode;
};

export type WorkflowValidationResult = {
  configuredAiNodes: MarketingWorkflowNode[];
  disconnectedNodes: MarketingWorkflowNode[];
  goalNode?: MarketingWorkflowNode;
  nodeIssues: WorkflowValidationNodeIssue[];
  reachableNodeIds: Set<string>;
  triggerNode?: MarketingWorkflowNode;
};

export function validateWorkflowDraft(
  nodes: MarketingWorkflowNode[],
  edges: MarketingWorkflowEdge[],
): WorkflowValidationResult {
  const triggerNode = nodes.find((node) => node.data.kind === "trigger");
  const goalNode = nodes.find((node) => node.data.kind === "goal");
  const reachableNodeIds = getReachableNodeIds(triggerNode?.id, edges);
  const disconnectedNodes = triggerNode
    ? nodes.filter((node) => !reachableNodeIds.has(node.id))
    : nodes.filter((node) => node.data.kind !== "trigger");
  const nodeIssues = nodes
    .map((node) => ({
      issues: validateWorkflowNode(node, nodes, edges),
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
  node: MarketingWorkflowNode,
  nodes: MarketingWorkflowNode[],
  edges: MarketingWorkflowEdge[],
) {
  const entry = getWorkflowNodeCatalogEntry(node.data.kind);
  const issues = entry.validate?.(node, { edges, nodes }) ?? [];

  if (issues.length === 0 && node.data.status === "warning") {
    return [
      {
        message: "节点仍需补全配置",
      },
    ];
  }

  return issues;
}

function getReachableNodeIds(
  startNodeId: string | undefined,
  edges: MarketingWorkflowEdge[],
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
