import { getNodeDefinitionCore } from "../node-definition-core";
import {
  findWorkflowEntryNode,
  findWorkflowTerminalNode,
} from "../node-catalog";
import { validateNodeConfigSections } from "../node-config-validation";
import { getWorkflowNodeConfigSchema } from "../node-config-schema";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
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
  const triggerNode = findWorkflowEntryNode(nodes);
  const goalNode = findWorkflowTerminalNode(nodes);
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

  return {
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

export function validateWorkflowNodeConfig<TKind extends WorkflowNodeKind>(
  node: WorkflowNode<TKind>,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNodeValidationIssue[] {
  const definition = getNodeDefinitionCore(node.data.kind);
  const configIssues = validateNodeConfigSections(node, getWorkflowNodeConfigSchema(node.data.kind).sections);
  const definitionIssues = definition.validate?.(node, { edges, nodes }) ?? [];

  return [
    ...configIssues,
    ...definitionIssues,
  ];
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
