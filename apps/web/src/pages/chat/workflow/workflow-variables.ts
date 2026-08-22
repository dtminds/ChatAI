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
  getWorkflowVariableDisplaySourceLabel,
  getWorkflowVariableSelectorKey,
} from "./workflow-variable-selector";
export { workflowContextVariables } from "./workflow-variable-registry";

export function getAvailableVariablesForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowVariableDefinition[] {
  return getWorkflowVariableCatalogForNode(nodeId, nodes, edges)
    .filter((variable) => supportsUsage(variable, "variable"));
}

export function getAvailableBranchVariablesForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowVariableDefinition[] {
  return getAvailableVariablesForNode(nodeId, nodes, edges);
}

export function getAvailableLlmInputVariablesForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowVariableDefinition[] {
  return getWorkflowVariableCatalogForNode(nodeId, nodes, edges);
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

export function getAvailableTimeReferenceVariablesForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  return getWorkflowVariableCatalogForNode(nodeId, nodes, edges).filter((variable) =>
    variable.type === "datetime"
    && (variable.scope !== "node" || variable.usages?.includes("time-reference")),
  );
}

export function getWorkflowVariableCatalogForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowVariableDefinition[] {
  const upstreamNodes = getGuaranteedUpstreamNodes(nodeId, nodes, edges);
  const currentNode = nodes.find(node => node.id === nodeId);
  return [
    ...getWorkflowContextVariables(nodes),
    ...upstreamNodes.flatMap((sourceNode) => [
      ...getAvailableNodeOutputsFromSource(sourceNode, nodeId, edges),
      createNodeLifecycleVariable(sourceNode, "enteredAt", "进入时间"),
      createNodeLifecycleVariable(sourceNode, "exitedAt", "退出时间"),
    ]),
    ...(currentNode ? [createCurrentNodeLifecycleVariable(currentNode)] : []),
  ];
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
    getAvailableNodeOutputsFromSource(sourceNode, nodeId, edges),
  );
}

function getAvailableNodeOutputsFromSource(
  sourceNode: WorkflowNode,
  targetNodeId: string,
  edges: WorkflowEdge[],
) {
  return getNodeOutputVariables(sourceNode).filter((output) =>
    !output.availableOnSourceHandles?.length
    || isWorkflowOutputAvailableOnSourceOutlets(
      sourceNode.id,
      targetNodeId,
      output.availableOnSourceHandles,
      edges,
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

function createCurrentNodeLifecycleVariable(
  node: WorkflowNode,
): WorkflowVariableDefinition {
  return {
    key: "enteredAt",
    label: "进入时间",
    scope: "current-node-lifecycle",
    selector: ["current-node-lifecycle", "enteredAt"],
    sourceNodeId: node.id,
    sourceNodeKind: node.data.kind,
    sourceNodeTitle: node.data.title,
    type: "datetime",
    usages: ["variable"],
    valueType: { kind: "datetime" },
  };
}

function supportsUsage(
  variable: WorkflowVariableDefinition,
  usage: WorkflowNodeOutputDefinition["usages"][number],
) {
  return !variable.usages || variable.usages.includes(usage);
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
