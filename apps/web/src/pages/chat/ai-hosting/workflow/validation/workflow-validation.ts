import { getNodeDefinition } from "../node-definitions";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeValidationIssue,
} from "../types";
import {
  validateWorkflowGraph,
} from "./workflow-graph-validation";
import type {
  WorkflowGraphValidationIssue,
} from "./workflow-graph-validation";
export type {
  WorkflowGraphValidationIssue,
  WorkflowGraphValidationResult,
} from "./workflow-graph-validation";

export type WorkflowValidationNodeIssue = {
  issues: WorkflowNodeValidationIssue[];
  node: WorkflowNode;
};

export type WorkflowValidationResult = {
  configuredAiNodes: WorkflowNode[];
  disconnectedNodes: WorkflowNode[];
  goalNode?: WorkflowNode;
  graphIssues: WorkflowGraphValidationIssue[];
  maxDepth: number;
  nodeIssues: WorkflowValidationNodeIssue[];
  reachableNodeIds: Set<string>;
  triggerNode?: WorkflowNode;
  validNodes: WorkflowNode[];
};

export function validateWorkflowDraft(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowValidationResult {
  const triggerNode = nodes.find((node) => node.data.kind === "trigger");
  const goalNode = nodes.find((node) => node.data.kind === "goal");
  const graphValidation = validateWorkflowGraph(nodes, edges);
  const { reachableNodeIds } = graphValidation;
  const disconnectedNodes = nodes.filter((node) => graphValidation.disconnectedNodeIds.has(node.id));
  const nodeIssues = nodes
    .map((node) => ({
      issues: [
        ...validateWorkflowNodeConfig(node, nodes, edges),
        ...validateWorkflowNodeGraphState(node, disconnectedNodes, triggerNode?.id),
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
    graphIssues: graphValidation.graphIssues,
    maxDepth: graphValidation.maxDepth,
    nodeIssues,
    reachableNodeIds,
    triggerNode,
    validNodes: graphValidation.validNodes,
  };
}

export function validateWorkflowNodeConfig(
  node: WorkflowNode,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNodeValidationIssue[] {
  const definition = getNodeDefinition(node.data.kind);
  return definition.validate?.(node, { edges, nodes }) ?? [];
}

export function validateWorkflowNodeGraphState(
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
      source: "graph",
    },
  ];
}

function hasText(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}
