import {
  extractWorkflowNodeDraftConfig,
  isWorkflowDynamicTimeRangeProvablyInvalid,
  WorkflowDraft,
  WorkflowDraftEdge,
  WorkflowDraftNode,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import type { WorkflowCompilationIssue } from "./errors.js";
import { getWorkflowNodeDraftConfigError } from "./node-contract-registry.js";
import { isWorkflowRuntimeSupportedNodeKind } from "./runtime-support.js";

const MAX_GRAPH_DEPTH = 20;
const DEFAULT_OUTLET_ID = "default";

export type ValidatedWorkflowGraph = {
  entryNode: WorkflowDraftNode;
  issues: WorkflowCompilationIssue[];
  terminalNode: WorkflowDraftNode;
  topologicalNodeIds: string[];
};

export function validateWorkflowGraph(draft: WorkflowDraft): ValidatedWorkflowGraph {
  const issues: WorkflowCompilationIssue[] = [];
  const nodeById = new Map<string, WorkflowDraftNode>();
  const edgeIds = new Set<string>();

  for (const node of draft.nodes) {
    if (nodeById.has(node.id)) {
      issues.push({ code: "duplicate-node-id", message: `Duplicate node id: ${node.id}`, nodeId: node.id });
    } else {
      nodeById.set(node.id, node);
    }
  }

  const validEdges: WorkflowDraftEdge[] = [];
  for (const edge of draft.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({ code: "duplicate-edge-id", edgeId: edge.id, message: `Duplicate edge id: ${edge.id}` });
      continue;
    }
    edgeIds.add(edge.id);

    if (!nodeById.has(edge.source) || !nodeById.has(edge.target) || edge.source === edge.target) {
      issues.push({ code: "invalid-edge", edgeId: edge.id, message: `Invalid edge: ${edge.id}` });
      continue;
    }
    validEdges.push(edge);
  }

  const entryNodes = draft.nodes.filter((node) => node.data.kind === "start");
  const terminalNodes = draft.nodes.filter((node) => node.data.kind === "end");
  if (entryNodes.length !== 1) {
    issues.push({ code: "invalid-entry", message: "Workflow must contain exactly one start node" });
  }
  if (terminalNodes.length !== 1) {
    issues.push({ code: "invalid-terminal", message: "Workflow must contain exactly one end node" });
  }

  const entryNode = entryNodes[0] ?? draft.nodes[0];
  const terminalNode = terminalNodes[0] ?? draft.nodes[draft.nodes.length - 1];
  const outgoing = indexEdges(validEdges, "source");
  const incoming = indexEdges(validEdges, "target");

  if (entryNode && (incoming.get(entryNode.id)?.length ?? 0) > 0) {
    issues.push({ code: "invalid-entry", message: "Start node cannot have incoming edges", nodeId: entryNode.id });
  }
  if (terminalNode && (outgoing.get(terminalNode.id)?.length ?? 0) > 0) {
    issues.push({ code: "invalid-terminal", message: "End node cannot have outgoing edges", nodeId: terminalNode.id });
  }

  for (const node of draft.nodes) {
    validateNodeConfig(node, issues);
    validateNodeOutlets(node, outgoing.get(node.id) ?? [], issues);
  }

  const traversal = entryNode
    ? traverseGraph(entryNode.id, outgoing)
    : { cycleNodeIds: new Set<string>(), depthByNodeId: new Map<string, number>(), reachableNodeIds: new Set<string>() };

  for (const nodeId of traversal.cycleNodeIds) {
    issues.push({ code: "cycle", message: "Workflow graph must be acyclic", nodeId });
  }
  for (const node of draft.nodes) {
    if (!traversal.reachableNodeIds.has(node.id)) {
      issues.push({ code: "unreachable-node", message: `Node is not reachable from start: ${node.id}`, nodeId: node.id });
    }
  }
  for (const [nodeId, depth] of traversal.depthByNodeId) {
    if (depth > MAX_GRAPH_DEPTH) {
      issues.push({ code: "max-depth", message: `Workflow depth exceeds ${MAX_GRAPH_DEPTH}`, nodeId });
    }
  }

  return {
    entryNode: entryNode!,
    issues: deduplicateIssues(issues),
    terminalNode: terminalNode!,
    topologicalNodeIds: createTopologicalOrder(draft.nodes, validEdges),
  };
}

function validateNodeConfig(
  node: WorkflowDraftNode,
  issues: WorkflowCompilationIssue[],
) {
  if (!isWorkflowRuntimeSupportedNodeKind(node.data.kind)) {
    issues.push({
      code: "unsupported-runtime-node",
      message: `Node kind is not available in Phase 3: ${node.data.kind}`,
      nodeId: node.id,
    });
    return;
  }

  const draftConfig = extractWorkflowNodeDraftConfig(node.data.kind, node.data);
  const draftConfigError = getWorkflowNodeDraftConfigError(node.data.kind, draftConfig);
  if (draftConfigError) {
    issues.push({
      code: "invalid-node-config",
      message: draftConfigError,
      nodeId: node.id,
    });
  }
}

export function getWorkflowSourceOutletId(edge: WorkflowDraftEdge) {
  return edge.sourceHandle || DEFAULT_OUTLET_ID;
}

export function getWorkflowGuaranteedUpstreamNodeIds(
  targetNodeId: string,
  nodeIds: readonly string[],
  edges: readonly Pick<WorkflowDraftEdge, "source" | "target">[],
) {
  const existingNodeIds = new Set(nodeIds);
  if (!existingNodeIds.has(targetNodeId)) return new Set<string>();
  const ancestorIds = getAncestorNodeIds(targetNodeId, edges, existingNodeIds);
  const predecessorIds = new Map([...ancestorIds].map(nodeId => [nodeId, [] as string[]]));
  edges.forEach((edge) => {
    if (!ancestorIds.has(edge.source) || !ancestorIds.has(edge.target)) return;
    predecessorIds.get(edge.target)?.push(edge.source);
  });
  const rootIds = new Set([...ancestorIds].filter(nodeId =>
    predecessorIds.get(nodeId)?.length === 0));
  const dominators = new Map<string, Set<string>>();
  for (const nodeId of ancestorIds) {
    dominators.set(
      nodeId,
      rootIds.has(nodeId) ? new Set([nodeId]) : new Set(ancestorIds),
    );
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of ancestorIds) {
      if (rootIds.has(nodeId)) continue;
      const predecessorDominators = (predecessorIds.get(nodeId) ?? [])
        .map(predecessorId => dominators.get(predecessorId))
        .filter((value): value is Set<string> => Boolean(value));
      const next = predecessorDominators.length > 0
        ? intersectSets(predecessorDominators)
        : new Set<string>();
      next.add(nodeId);
      if (!setsEqual(next, dominators.get(nodeId) ?? new Set())) {
        dominators.set(nodeId, next);
        changed = true;
      }
    }
  }

  const guaranteed = new Set(dominators.get(targetNodeId) ?? []);
  guaranteed.delete(targetNodeId);
  return guaranteed;
}

export function isWorkflowDynamicTimeRangeProvablyInvalidInGraph(input: {
  edges: readonly Pick<WorkflowDraftEdge, "source" | "target">[];
  end: WorkflowVariableSelector;
  nodeIds: readonly string[];
  start: WorkflowVariableSelector;
}) {
  if (isWorkflowDynamicTimeRangeProvablyInvalid(input.start, input.end)) return true;
  const [startScope, startNodeId] = input.start;
  const [endScope, endNodeId] = input.end;
  if (startScope !== "node-lifecycle"
    || endScope !== "node-lifecycle"
    || !startNodeId
    || !endNodeId
    || startNodeId === endNodeId) {
    return false;
  }
  return getWorkflowGuaranteedUpstreamNodeIds(
    startNodeId,
    input.nodeIds,
    input.edges,
  ).has(endNodeId);
}

export function isWorkflowOutputAvailableOnSourceOutlets(
  sourceNodeId: string,
  targetNodeId: string,
  allowedSourceOutlets: readonly string[],
  edges: readonly Pick<WorkflowDraftEdge, "source" | "sourceHandle" | "target">[],
) {
  const allowedOutlets = new Set(allowedSourceOutlets);
  const sourceEdges = edges.filter(edge => edge.source === sourceNodeId);
  const reachesTarget = (edge: Pick<WorkflowDraftEdge, "target">) =>
    edge.target === targetNodeId
    || getReachableNodeIds(edge.target, edges).has(targetNodeId);
  const hasAllowedPath = sourceEdges.some(edge =>
    allowedOutlets.has(edge.sourceHandle || DEFAULT_OUTLET_ID)
    && reachesTarget(edge));
  const hasDisallowedPath = sourceEdges.some(edge =>
    !allowedOutlets.has(edge.sourceHandle || DEFAULT_OUTLET_ID)
    && reachesTarget(edge));
  return hasAllowedPath && !hasDisallowedPath;
}

function validateNodeOutlets(
  node: WorkflowDraftNode,
  edges: WorkflowDraftEdge[],
  issues: WorkflowCompilationIssue[],
) {
  if (node.data.kind === "end") {
    return;
  }

  const outletIds = getNodeOutletIds(node);
  const edgeCountByOutlet = new Map<string, number>();

  for (const edge of edges) {
    const outletId = getWorkflowSourceOutletId(edge);
    edgeCountByOutlet.set(outletId, (edgeCountByOutlet.get(outletId) ?? 0) + 1);
    if (!outletIds.includes(outletId)) {
      issues.push({
        code: "invalid-branch-outlet",
        edgeId: edge.id,
        message: `Unknown source outlet: ${outletId}`,
        nodeId: node.id,
      });
    }
  }

  for (const outletId of outletIds) {
    const edgeCount = edgeCountByOutlet.get(outletId) ?? 0;
    if (edgeCount === 0) {
      issues.push({
        code: "source-outlet-unconnected",
        message: `Source outlet is not connected: ${outletId}`,
        nodeId: node.id,
      });
    } else if (edgeCount > 1) {
      issues.push({
        code: "source-outlet-used-multiple-times",
        message: `Source outlet has multiple edges: ${outletId}`,
        nodeId: node.id,
      });
    }
  }
}

function getNodeOutletIds(node: WorkflowDraftNode) {
  if (node.data.kind === "branch") return getConfiguredOutletIds(node, "branchPaths");
  if (node.data.kind === "ratio-split") return getConfiguredOutletIds(node, "groups");
  if (node.data.kind === "wait-event") return ["triggered", "timeout"];
  if (node.data.kind === "ai-collect") return ["completed", "incomplete"];
  if (node.data.kind === "ai-intent") {
    return [...getConfiguredOutletIds(node, "intents", "intent:"), "fallback"];
  }
  return [DEFAULT_OUTLET_ID];
}

function getConfiguredOutletIds(
  node: WorkflowDraftNode,
  key: "branchPaths" | "groups" | "intents",
  prefix = "",
) {
  const items = (node.data as Record<string, unknown>)[key];
  if (!Array.isArray(items)) return [];
  return items.flatMap(item => item && typeof item === "object" && "id" in item
    && typeof item.id === "string" && item.id.length > 0 ? [`${prefix}${item.id}`] : []);
}

function indexEdges(edges: WorkflowDraftEdge[], key: "source" | "target") {
  const index = new Map<string, WorkflowDraftEdge[]>();
  for (const edge of edges) {
    const nodeId = edge[key];
    index.set(nodeId, [...index.get(nodeId) ?? [], edge]);
  }
  return index;
}

function getAncestorNodeIds(
  nodeId: string,
  edges: readonly Pick<WorkflowDraftEdge, "source" | "target">[],
  existingNodeIds: Set<string>,
) {
  return getConnectedNodeIds(nodeId, edges, "incoming", existingNodeIds);
}

function getReachableNodeIds(
  entryNodeId: string,
  edges: readonly Pick<WorkflowDraftEdge, "source" | "target">[],
) {
  return getConnectedNodeIds(entryNodeId, edges, "outgoing");
}

function getConnectedNodeIds(
  entryNodeId: string,
  edges: readonly Pick<WorkflowDraftEdge, "source" | "target">[],
  direction: "incoming" | "outgoing",
  existingNodeIds?: Set<string>,
) {
  const adjacent = new Map<string, string[]>();
  for (const edge of edges) {
    if (existingNodeIds
      && (!existingNodeIds.has(edge.source) || !existingNodeIds.has(edge.target))) continue;
    const [from, to] = direction === "incoming"
      ? [edge.target, edge.source]
      : [edge.source, edge.target];
    adjacent.set(from, [...adjacent.get(from) ?? [], to]);
  }
  const connected = new Set<string>();
  const queue = [entryNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (connected.has(current)) continue;
    connected.add(current);
    queue.push(...adjacent.get(current) ?? []);
  }
  return connected;
}

function intersectSets(sets: Set<string>[]) {
  const [first, ...rest] = sets;
  return new Set([...first!].filter(value => rest.every(set => set.has(value))));
}

function setsEqual(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every(value => right.has(value));
}

function traverseGraph(startNodeId: string, outgoing: Map<string, WorkflowDraftEdge[]>) {
  const reachableNodeIds = new Set<string>();
  const cycleNodeIds = new Set<string>();
  const depthByNodeId = new Map<string, number>();
  const activePath = new Set<string>();

  function visit(nodeId: string, depth: number) {
    if (activePath.has(nodeId)) {
      cycleNodeIds.add(nodeId);
      return;
    }
    const previousDepth = depthByNodeId.get(nodeId) ?? 0;
    if (reachableNodeIds.has(nodeId) && depth <= previousDepth) {
      return;
    }
    depthByNodeId.set(nodeId, depth);
    reachableNodeIds.add(nodeId);
    activePath.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) {
      visit(edge.target, depth + 1);
    }
    activePath.delete(nodeId);
  }

  visit(startNodeId, 1);
  return { cycleNodeIds, depthByNodeId, reachableNodeIds };
}

function createTopologicalOrder(nodes: WorkflowDraftNode[], edges: WorkflowDraftEdge[]) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = indexEdges(edges, "source");
  for (const edge of edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const result: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) {
      const next = (indegree.get(edge.target) ?? 0) - 1;
      indegree.set(edge.target, next);
      if (next === 0) {
        queue.push(edge.target);
      }
    }
  }
  return result;
}

function deduplicateIssues(issues: WorkflowCompilationIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.nodeId ?? ""}:${issue.edgeId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
