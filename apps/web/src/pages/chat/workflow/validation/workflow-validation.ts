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
import { getAvailableVariablesForNode, getInvalidMessageVariableSelectors } from "../workflow-variables";
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
  endNode?: WorkflowNode;
  graphIssues: WorkflowGraphValidationIssue[];
  maxDepth: number;
  nodeIssues: WorkflowValidationNodeIssue[];
  reachableNodeIds: Set<string>;
  startNode?: WorkflowNode;
  validNodes: WorkflowNode[];
};

export function validateWorkflowDraft(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowValidationResult {
  const startNode = findWorkflowEntryNode(nodes);
  const endNode = findWorkflowTerminalNode(nodes);
  const graphValidation = validateWorkflowGraph(nodes, edges);
  const { reachableNodeIds } = graphValidation;
  const disconnectedNodes = nodes.filter((node) => graphValidation.disconnectedNodeIds.has(node.id));
  const nodeIssues = nodes
    .map((node) => ({
      issues: [
        ...validateWorkflowNodeConfig(node, nodes, edges),
        ...validateWorkflowNodeGraphState(node, disconnectedNodes, startNode?.id),
      ],
      node,
    }))
    .filter((item) => item.issues.length > 0);

  return {
    disconnectedNodes,
    endNode,
    graphIssues: graphValidation.graphIssues,
    maxDepth: graphValidation.maxDepth,
    nodeIssues,
    reachableNodeIds,
    startNode,
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
  const variableIssues: WorkflowNodeValidationIssue[] = node.data.kind === "message"
    && getInvalidMessageVariableSelectors(
      node.data.content,
      getAvailableVariablesForNode(node.id, nodes, edges),
    ).length
    ? [{
        code: "message-variable-invalid",
        message: "消息内容引用了不可用变量",
        severity: "warning",
        source: "config",
      }]
    : [];

  return [
    ...configIssues,
    ...definitionIssues,
    ...variableIssues,
  ];
}

export function validateWorkflowNodeGraphState(
  node: WorkflowNode,
  disconnectedNodes: WorkflowNode[],
  startNodeId: string | undefined,
): WorkflowNodeValidationIssue[] {
  if (node.id === startNodeId || !disconnectedNodes.some((item) => item.id === node.id)) {
    return [];
  }

  return [
    {
      code: "node-disconnected",
      message: "节点未接入从开始节点出发的主链路",
      severity: "warning",
      source: "graph",
    },
  ];
}
