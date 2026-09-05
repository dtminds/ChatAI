import {
  isMessageQueryRelativeRangeComplete,
  isValidWorkflowLocalDateTime,
  isMessageQueryFixedRangeWithinBounds,
  isMessageQueryRelativeRangeWithinBounds,
  resolveMessageQueryRelativePoint,
  type CustomFieldItem,
} from "@chatai/contracts";
import {
  findWorkflowEntryNode,
  findWorkflowTerminalNode,
  getWorkflowNodeCatalogEntry,
} from "../node-catalog";
import { validateNodeConfigSections } from "../node-config-validation";
import { getWorkflowNodeConfigSchema } from "../node-config-schema";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowNodeValidationIssue,
  WorkflowVariableSelector,
} from "../types";
import { getVariableContentText } from "../nodes/variable-content/content";
import { QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH } from "@chatai/contracts";
import { isWorkflowDynamicTimeRangeProvablyInvalidInGraph } from "@chatai/workflow-engine/graph";
import {
  getAvailableBranchVariablesForNode,
  getAvailableIntentInputOutputsForNode,
  getAvailableLlmInputVariablesForNode,
  getAvailableMessageContentOutputsForNode,
  getAvailableTimeReferenceVariablesForNode,
  getAvailableVariablesForNode,
  getInvalidVariableContentSelectors,
  resolveWorkflowVariable,
} from "../workflow-variables";
import { normalizeLlmInputs } from "../nodes/llm/config";
import { normalizeAiIntentInputSelector } from "../nodes/ai-intent/config";
import {
  normalizeWorkflowMessageContentMode,
  normalizeWorkflowMessageOutputSelector,
} from "../nodes/message/content-source";
import { isWorkflowOutputValueTypeEqual } from "../workflow-node-outputs";
import {
  areDynamicTimeReferencesEqual,
  normalizeMessageQueryTimeRange,
} from "../nodes/message-query/config";
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
  customFields: readonly CustomFieldItem[] = [],
): WorkflowValidationResult {
  const startNode = findWorkflowEntryNode(nodes);
  const endNode = findWorkflowTerminalNode(nodes);
  const graphValidation = validateWorkflowGraph(nodes, edges);
  const { reachableNodeIds } = graphValidation;
  const disconnectedNodes = nodes.filter((node) => graphValidation.disconnectedNodeIds.has(node.id));
  const nodeIssues = nodes
    .map((node) => ({
      issues: [
        ...validateWorkflowNodeConfig(node, nodes, edges, customFields),
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
  customFields: readonly CustomFieldItem[] = [],
): WorkflowNodeValidationIssue[] {
  const definition = getWorkflowNodeCatalogEntry(node.data.kind);
  const configIssues = validateNodeConfigSections(node, getWorkflowNodeConfigSchema(node.data.kind).sections);
  const availableVariables = node.data.kind === "branch"
    ? getAvailableBranchVariablesForNode(node.id, nodes, edges, customFields)
    : getAvailableVariablesForNode(node.id, nodes, edges, customFields);
  const definitionIssues = definition.validate?.(node, {
    availableVariables,
    edges,
    nodes,
  }) ?? [];
  const variableIssues = validateNodeVariableContent(node, nodes, edges, customFields);
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
  customFields: readonly CustomFieldItem[],
): WorkflowNodeValidationIssue[] {
  const availableVariables = getAvailableVariablesForNode(node.id, nodes, edges, customFields);

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

  if (node.data.kind === "message-query") {
    const timeRange = normalizeMessageQueryTimeRange(node.data.timeRange);
    const availableTimeVariables = getAvailableTimeReferenceVariablesForNode(
      node.id,
      nodes,
      edges,
      customFields,
    );
    const issues = timeRange.mode === "dynamic"
      ? [
          ...validateMessageQueryTimeReference(
            "start",
            timeRange.start,
            availableTimeVariables,
          ),
          ...validateMessageQueryTimeReference(
            "end",
            timeRange.end,
            availableTimeVariables,
          ),
        ]
      : [];

    if (timeRange.mode === "relative") {
      const now = Date.now();
      if (!isMessageQueryRelativeRangeComplete(timeRange)
        || !isMessageQueryRelativeRangeWithinBounds(
          now,
          resolveMessageQueryRelativePoint(now, timeRange.start, false),
          resolveMessageQueryRelativePoint(now, timeRange.end, true),
        )) {
        issues.push(createVariableContentIssue(
          "message-query-relative-time-invalid",
          "时间不能早于90天前，跨度不能超过90天，开始不能晚于结束",
        ));
      }
    }

    const dynamicReferencesIdentical = timeRange.mode === "dynamic"
      && areDynamicTimeReferencesEqual(timeRange.start, timeRange.end);
    if (dynamicReferencesIdentical) {
      issues.push(createVariableContentIssue(
        "message-query-time-range-identical",
        "开始与结束时间不能相同",
      ));
    }

    if (timeRange.mode === "dynamic"
      && !dynamicReferencesIdentical
      && isWorkflowDynamicTimeRangeProvablyInvalidInGraph({
        edges,
        end: timeRange.end,
        nodeIds: nodes.map(candidate => candidate.id),
        start: timeRange.start,
      })) {
      issues.push(createVariableContentIssue(
        "message-query-time-range-invalid",
        "开始时间不能晚于结束时间",
      ));
    }

    if (
      timeRange.mode === "fixed"
      && timeRange.startAt
      && timeRange.endAt
      && timeRange.startAt > timeRange.endAt
    ) {
      issues.push(createVariableContentIssue(
        "message-query-time-range-invalid",
        "开始时间不能晚于结束时间",
      ));
    }
    if (timeRange.mode === "fixed" && timeRange.startAt && timeRange.endAt
      && isValidWorkflowLocalDateTime(timeRange.startAt)
      && isValidWorkflowLocalDateTime(timeRange.endAt)
      && timeRange.startAt <= timeRange.endAt
      && !isMessageQueryFixedRangeWithinBounds(Date.now(), timeRange.startAt, timeRange.endAt)) {
      issues.push(createVariableContentIssue(
        "message-query-fixed-time-bounds-invalid",
        "时间不能早于90天前，跨度不能超过90天",
      ));
    }
    return issues;
  }

  if (node.data.kind === "ai-intent") {
    const selector = normalizeAiIntentInputSelector(node.data.inputSelector);
    if (
      selector
      && !resolveWorkflowVariable(
        getAvailableIntentInputOutputsForNode(node.id, nodes, edges),
        selector,
      )
    ) {
      return [createVariableContentIssue(
        "ai-intent-input-invalid",
        "识别内容引用了不可用的前序节点输出",
      )];
    }
    return [];
  }

  if (node.data.kind === "llm") {
    const availableInputs = getAvailableLlmInputVariablesForNode(
      node.id,
      nodes,
      edges,
      customFields,
    );
    if (normalizeLlmInputs(node.data.inputs).some((input) => {
      if (input.value.kind !== "variable") return false;
      const variable = resolveWorkflowVariable(availableInputs, input.value.selector);
      return !variable || !isWorkflowOutputValueTypeEqual(input.value.valueType, variable.valueType);
    })) {
      return [createVariableContentIssue(
        "llm-input-variable-invalid",
        "输入参数引用了不可用或类型已变化的变量",
      )];
    }
    return [];
  }

  if (node.data.kind !== "handoff") {
    return [];
  }

  const fields = [
    ["operator", "给客服的转发提示", node.data.operatorMessage],
    ["customer", "对客话术", node.data.customerMessage],
  ] as const;

  return fields.flatMap(([field, label, content]) => {
    const issues: WorkflowNodeValidationIssue[] = [];
    if (getInvalidVariableContentSelectors(content, availableVariables).length) {
      issues.push(createVariableContentIssue(
        `handoff-${field}-message-variable-invalid`,
        `${label}引用了不可用变量`,
      ));
    }
    if (getVariableContentText(content, availableVariables).length > 100) {
      issues.push(createVariableContentIssue(
        `handoff-${field}-message-too-long`,
        `${label}不能超过 100 字`,
      ));
    }
    return issues;
  });
}

function validateMessageQueryTimeReference(
  field: "end" | "start",
  selector: WorkflowVariableSelector,
  availableVariables: ReturnType<typeof getAvailableTimeReferenceVariablesForNode>,
) {
  const valid = availableVariables.some(variable =>
    variable.selector.length === selector.length
    && variable.selector.every((part, index) => part === selector[index]));
  if (valid) return [];

  return [createVariableContentIssue(
    `message-query-${field}-time-invalid`,
    `${field === "start" ? "开始" : "结束"}时间引用的变量不可用`,
  )];
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
      message: "未接入从开始节点出发的主链路",
      severity: "warning",
      source: "graph",
    },
  ];
}
