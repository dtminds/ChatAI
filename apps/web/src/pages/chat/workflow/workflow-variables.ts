import type {
  WorkflowEdge,
  WorkflowVariableContentSegment,
  WorkflowNode,
  WorkflowNodeOutputDefinition,
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "./types";
import {
  getWorkflowNodeOutputDefinitions,
  getWorkflowVariableValueType,
} from "./workflow-node-outputs";
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
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(nodeId)) {
    return [];
  }

  const ancestorIds = getAncestorNodeIds(nodeId, edges, nodeIds);
  const ancestorNodes = nodes.filter((node) => ancestorIds.has(node.id));
  const predecessorIds = new Map<string, string[]>();
  ancestorNodes.forEach((node) => predecessorIds.set(node.id, []));
  edges.forEach((edge) => {
    if (!ancestorIds.has(edge.source) || !ancestorIds.has(edge.target)) return;
    predecessorIds.get(edge.target)?.push(edge.source);
  });
  const rootIds = new Set(ancestorNodes
    .filter((node) => predecessorIds.get(node.id)?.length === 0)
    .map((node) => node.id));

  if (!rootIds.size) {
    return [];
  }

  const dominators = new Map<string, Set<string>>();

  ancestorNodes.forEach((node) => {
    dominators.set(
      node.id,
      rootIds.has(node.id) ? new Set([node.id]) : new Set(ancestorIds),
    );
  });

  let changed = true;
  while (changed) {
    changed = false;

    for (const node of ancestorNodes) {
      if (rootIds.has(node.id)) {
        continue;
      }

      const predecessorDominators = (predecessorIds.get(node.id) ?? [])
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
  return ancestorNodes.filter((node) => node.id !== nodeId && guaranteedIds.has(node.id));
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
      || isOutputAvailableOnSourceHandles(
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

function getAncestorNodeIds(
  nodeId: string,
  edges: WorkflowEdge[],
  existingNodeIds: Set<string>,
) {
  const incoming = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!existingNodeIds.has(edge.source) || !existingNodeIds.has(edge.target)) return;
    incoming.set(edge.target, [...incoming.get(edge.target) ?? [], edge.source]);
  });
  const ancestors = new Set<string>();
  const queue = [nodeId];

  while (queue.length) {
    const current = queue.shift()!;
    if (ancestors.has(current)) continue;
    ancestors.add(current);
    queue.push(...incoming.get(current) ?? []);
  }

  return ancestors;
}

function isOutputAvailableOnSourceHandles(
  sourceNodeId: string,
  targetNodeId: string,
  allowedSourceHandles: string[],
  edges: WorkflowEdge[],
) {
  const allowedHandles = new Set(allowedSourceHandles);
  const sourceEdges = edges.filter((edge) => edge.source === sourceNodeId);
  const reachesTarget = (edge: WorkflowEdge) =>
    edge.target === targetNodeId || getReachableNodeIds(edge.target, edges).has(targetNodeId);
  const hasAllowedPath = sourceEdges.some((edge) =>
    edge.sourceHandle
    && allowedHandles.has(edge.sourceHandle)
    && reachesTarget(edge),
  );
  const hasDisallowedPath = sourceEdges.some((edge) =>
    (!edge.sourceHandle || !allowedHandles.has(edge.sourceHandle))
    && reachesTarget(edge),
  );

  return hasAllowedPath && !hasDisallowedPath;
}

function intersectSets(sets: Set<string>[]) {
  const [first, ...rest] = sets;
  return new Set([...first].filter((value) => rest.every((set) => set.has(value))));
}

function setsEqual(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
