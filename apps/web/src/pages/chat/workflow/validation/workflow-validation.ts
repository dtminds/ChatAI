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
import { getVariableContentText } from "../nodes/variable-content/content";
import { QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH } from "@chatai/contracts";
import {
  getAvailableMessageContentOutputsForNode,
  getAvailableVariablesForNode,
  getInvalidVariableContentSelectors,
  resolveWorkflowVariable,
} from "../workflow-variables";
import {
  normalizeWorkflowMessageContentMode,
  normalizeWorkflowMessageOutputSelector,
} from "../nodes/message/content-source";
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
  const variableIssues = validateNodeVariableContent(node, nodes, edges);

  return [
    ...configIssues,
    ...definitionIssues,
    ...variableIssues,
  ];
}

function validateNodeVariableContent(
  node: WorkflowNode,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNodeValidationIssue[] {
  const availableVariables = getAvailableVariablesForNode(node.id, nodes, edges);

  if (node.data.kind === "message") {
    const issues: WorkflowNodeValidationIssue[] = [];
    const contentMode = normalizeWorkflowMessageContentMode(node.data.contentMode);

    if (
      contentMode === "custom"
      && getInvalidVariableContentSelectors(node.data.content, availableVariables).length
    ) {
      issues.push(createVariableContentIssue(
        "message-variable-invalid",
        "消息内容引用了不可用变量",
      ));
    }
    if (
      contentMode === "custom"
      && getVariableContentText(node.data.content, availableVariables).length > QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH
    ) {
      issues.push(createVariableContentIssue(
        "message-content-too-long",
        `消息内容不能超过 ${QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH} 字`,
      ));
    }

    const outputSelector = normalizeWorkflowMessageOutputSelector(node.data.outputSelector);
    if (
      contentMode === "node-output"
      && outputSelector
      && !resolveWorkflowVariable(
        getAvailableMessageContentOutputsForNode(node.id, nodes, edges),
        outputSelector,
      )
    ) {
      issues.push(createVariableContentIssue(
        "message-output-invalid",
        "消息内容引用了不可用的节点输出",
      ));
    }
    return issues;
  }

  if (node.data.kind !== "handoff") {
    return [];
  }

  const fields = [
    ["operator", node.data.operatorMessage],
    ["customer", node.data.customerMessage],
  ] as const;

  return fields.flatMap(([field, content]) => {
    const issues: WorkflowNodeValidationIssue[] = [];
    if (getInvalidVariableContentSelectors(content, availableVariables).length) {
      issues.push(createVariableContentIssue(
        `handoff-${field}-message-variable-invalid`,
        "转发话术引用了不可用变量",
      ));
    }
    if (getVariableContentText(content, availableVariables).length > 100) {
      issues.push(createVariableContentIssue(
        `handoff-${field}-message-too-long`,
        "转发话术不能超过 100 字",
      ));
    }
    return issues;
  });
}

function createVariableContentIssue(code: string, message: string): WorkflowNodeValidationIssue {
  return {
    code,
    message,
    severity: "warning",
    source: "config",
  };
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
