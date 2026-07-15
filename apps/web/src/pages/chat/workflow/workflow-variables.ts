import { getNodeDefinitionCore } from "./node-definition-core";
import { findWorkflowEntryNode } from "./node-catalog";
import type {
  WorkflowEdge,
  WorkflowVariableContentSegment,
  WorkflowNode,
  WorkflowNodeOutputDefinition,
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "./types";
import { getWorkflowVariableSelectorKey } from "./workflow-variable-selector";
import { workflowContextVariables } from "./workflow-variable-registry";

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
    ...workflowContextVariables,
    ...getAvailableNodeOutputsForNode(nodeId, nodes, edges)
      .filter((variable) => variable.usages?.includes("variable")),
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

export function getGuaranteedUpstreamNodes(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  const entryNode = findWorkflowEntryNode(nodes);

  if (!entryNode || !nodes.some((node) => node.id === nodeId)) {
    return [];
  }

  const reachableNodeIds = getReachableNodeIds(entryNode.id, edges);

  if (!reachableNodeIds.has(nodeId)) {
    return [];
  }

  const reachableNodes = nodes.filter((node) => reachableNodeIds.has(node.id));
  const allReachableIds = new Set(reachableNodes.map((node) => node.id));
  const dominators = new Map<string, Set<string>>();

  reachableNodes.forEach((node) => {
    dominators.set(
      node.id,
      node.id === entryNode.id ? new Set([entryNode.id]) : new Set(allReachableIds),
    );
  });

  let changed = true;
  while (changed) {
    changed = false;

    for (const node of reachableNodes) {
      if (node.id === entryNode.id) {
        continue;
      }

      const predecessorIds = edges
        .filter((edge) => edge.target === node.id && reachableNodeIds.has(edge.source))
        .map((edge) => edge.source);
      const predecessorDominators = predecessorIds
        .map((predecessorId) => dominators.get(predecessorId))
        .filter((value): value is Set<string> => Boolean(value));
      const next = predecessorDominators.length
        ? intersectSets(predecessorDominators)
        : new Set<string>();
      next.add(node.id);

      if (!setsEqual(next, dominators.get(node.id) ?? new Set())) {
        dominators.set(node.id, next);
        changed = true;
      }
    }
  }

  const guaranteedIds = dominators.get(nodeId) ?? new Set<string>();
  return reachableNodes.filter((node) => node.id !== nodeId && guaranteedIds.has(node.id));
}

export function getNodeOutputVariables(node: WorkflowNode): WorkflowVariableDefinition[] {
  return scopeWorkflowNodeOutputs(
    node,
    getNodeDefinitionCore(node.data.kind).getOutputVariables?.(node) ?? [],
  );
}

function getAvailableNodeOutputsForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  return getGuaranteedUpstreamNodes(nodeId, nodes, edges).flatMap(getNodeOutputVariables);
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
  }));
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

function getReachableNodeIds(entryNodeId: string, edges: WorkflowEdge[]) {
  const outgoing = new Map<string, string[]>();
  edges.forEach((edge) => outgoing.set(edge.source, [...outgoing.get(edge.source) ?? [], edge.target]));
  const reachable = new Set<string>();
  const queue = [entryNodeId];

  while (queue.length) {
    const current = queue.shift()!;
    if (reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    queue.push(...outgoing.get(current) ?? []);
  }

  return reachable;
}

function intersectSets(sets: Set<string>[]) {
  const [first, ...rest] = sets;
  return new Set([...first].filter((value) => rest.every((set) => set.has(value))));
}

function setsEqual(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
