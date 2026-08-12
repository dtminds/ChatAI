import type {
  WorkflowEdge,
  WorkflowVariableContentSegment,
  WorkflowNode,
  WorkflowNodeOutputDefinition,
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "./types";
import {
  getWorkflowGuaranteedUpstreamNodeIds,
  isWorkflowOutputAvailableOnSourceOutlets,
} from "@chatai/workflow-engine/graph";
import {
  getWorkflowNodeOutputDefinitions,
  getWorkflowVariableValueType,
} from "./workflow-node-outputs";
import { getWorkflowVariableSelectorKey } from "./workflow-variable-selector";
import {
  getWorkflowContextVariables,
} from "./workflow-variable-registry";

export {
  getWorkflowVariableDisplayLabel,
  getWorkflowVariableSelectorKey,
} from "./workflow-variable-selector";
export { workflowContextVariables } from "./workflow-variable-registry";

export function getAvailableVariablesForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowVariableDefinition[] {
  return [
    ...getWorkflowContextVariables(nodes),
    ...getAvailableNodeOutputsForNode(nodeId, nodes, edges)
      .filter((variable) => variable.usages?.includes("variable")),
  ];
}

export function getAvailableBranchVariablesForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowVariableDefinition[] {
  const upstreamLifecycleVariables = getGuaranteedUpstreamNodes(nodeId, nodes, edges)
    .flatMap((sourceNode) => [
      createNodeLifecycleVariable(sourceNode, "enteredAt", "进入时间"),
      createNodeLifecycleVariable(sourceNode, "exitedAt", "退出时间"),
    ]);

  return [
    ...getAvailableVariablesForNode(nodeId, nodes, edges),
    {
      key: "enteredAt",
      label: "进入时间",
      scope: "current-node-lifecycle",
      selector: ["current-node-lifecycle", "enteredAt"],
      type: "datetime",
      usages: ["variable"],
      valueType: { kind: "datetime" },
    },
    ...upstreamLifecycleVariables,
  ];
}

export function getAvailableLlmInputVariablesForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowVariableDefinition[] {
  return [
    ...getWorkflowContextVariables(nodes),
    ...getAvailableNodeOutputsForNode(nodeId, nodes, edges),
  ];
}

export function getAvailableMessageContentOutputsForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  return getAvailableNodeOutputsForNode(nodeId, nodes, edges).filter((variable) =>
    variable.type === "string" && variable.usages?.includes("message-content"),
  );
}

export function getAvailableIntentInputOutputsForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  return getAvailableNodeOutputsForNode(nodeId, nodes, edges).filter((variable) =>
    variable.usages?.includes("intent-input"),
  );
}

export function getAvailableTimeReferenceOutputsForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  return getAvailableNodeOutputsForNode(nodeId, nodes, edges).filter((variable) =>
    variable.type === "datetime" && variable.usages?.includes("time-reference"),
  );
}

export function getAvailableTimeReferenceNodesForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  return getGuaranteedUpstreamNodes(nodeId, nodes, edges);
}

export function getGuaranteedUpstreamNodes(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  const guaranteedIds = getWorkflowGuaranteedUpstreamNodeIds(
    nodeId,
    nodes.map(node => node.id),
    edges,
  );
  return nodes.filter(node => guaranteedIds.has(node.id));
}

export function getNodeOutputVariables(node: WorkflowNode): WorkflowVariableDefinition[] {
  return scopeWorkflowNodeOutputs(
    node,
    getWorkflowNodeOutputDefinitions(node),
  );
}

function getAvailableNodeOutputsForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  return getGuaranteedUpstreamNodes(nodeId, nodes, edges).flatMap((sourceNode) =>
    getNodeOutputVariables(sourceNode).filter((output) =>
      !output.availableOnSourceHandles?.length
      || isWorkflowOutputAvailableOnSourceOutlets(
        sourceNode.id,
        nodeId,
        output.availableOnSourceHandles,
        edges,
      ),
    ),
  );
}

export function scopeWorkflowNodeOutputs(
  node: WorkflowNode,
  outputs: WorkflowNodeOutputDefinition[],
): WorkflowVariableDefinition[] {
  return outputs.map((output) => ({
    ...output,
    scope: "node" as const,
    selector: ["node", node.id, output.key],
    sourceNodeId: node.id,
    sourceNodeKind: node.data.kind,
    sourceNodeTitle: node.data.title,
    type: getWorkflowVariableValueType(output.valueType),
  }));
}

function createNodeLifecycleVariable(
  node: WorkflowNode,
  field: "enteredAt" | "exitedAt",
  label: string,
): WorkflowVariableDefinition {
  return {
    key: field,
    label,
    scope: "node-lifecycle",
    selector: ["node-lifecycle", node.id, field],
    sourceNodeId: node.id,
    sourceNodeKind: node.data.kind,
    sourceNodeTitle: node.data.title,
    type: "datetime",
    usages: ["variable"],
    valueType: { kind: "datetime" },
  };
}

export function resolveWorkflowVariable(
  variables: WorkflowVariableDefinition[],
  selector: WorkflowVariableSelector,
) {
  const selectorKey = getWorkflowVariableSelectorKey(selector);
  return variables.find((variable) =>
    getWorkflowVariableSelectorKey(variable.selector) === selectorKey,
  );
}

export function getInvalidVariableContentSelectors(
  segments: WorkflowVariableContentSegment[] | undefined,
  availableVariables: WorkflowVariableDefinition[],
) {
  const availableKeys = new Set(availableVariables.map((variable) =>
    getWorkflowVariableSelectorKey(variable.selector),
  ));

  return (segments ?? [])
    .filter((segment): segment is Extract<WorkflowVariableContentSegment, { type: "variable" }> =>
      segment.type === "variable")
    .map((segment) => segment.selector)
    .filter((selector) => !availableKeys.has(getWorkflowVariableSelectorKey(selector)));
}
