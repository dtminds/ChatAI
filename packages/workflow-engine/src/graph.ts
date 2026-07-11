import type {
  WorkflowDraft,
  WorkflowDraftEdge,
  WorkflowDraftNode,
} from "@chatai/contracts";
import type { WorkflowCompilationIssue } from "./errors.js";

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
  if (node.data.kind === "wait") {
    const delayDays = (node.data as Record<string, unknown>).delayDays;
    if (typeof delayDays !== "number" || !Number.isFinite(delayDays) || delayDays < 0) {
      issues.push({
        code: "invalid-node-config",
        message: "Wait node requires a non-negative delayDays",
        nodeId: node.id,
      });
    }
    return;
  }

  if (node.data.kind !== "branch") return;
  const branchPaths = parseBranchPaths((node.data as Record<string, unknown>).branchPaths);
  const outletIds = branchPaths.map((path) => path.id);
  const defaultPathCount = branchPaths.filter((path) => path.isDefault).length;
  if (branchPaths.length === 0
    || new Set(outletIds).size !== outletIds.length
    || defaultPathCount !== 1) {
    issues.push({
      code: "invalid-node-config",
      message: "Branch node requires unique outlet ids and exactly one default path",
      nodeId: node.id,
    });
  }
}

export function getWorkflowSourceOutletId(edge: WorkflowDraftEdge) {
  return edge.sourceHandle || DEFAULT_OUTLET_ID;
}

function validateNodeOutlets(
  node: WorkflowDraftNode,
  edges: WorkflowDraftEdge[],
  issues: WorkflowCompilationIssue[],
) {
  if (node.data.kind === "end") {
    return;
  }

  const outletIds = node.data.kind === "branch"
    ? getBranchOutletIds(node)
    : [DEFAULT_OUTLET_ID];
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

function getBranchOutletIds(node: WorkflowDraftNode) {
  return parseBranchPaths((node.data as Record<string, unknown>).branchPaths)
    .map((path) => path.id);
}

function parseBranchPaths(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((path) => {
    if (!path || typeof path !== "object" || !("id" in path)
      || typeof path.id !== "string" || path.id.length === 0) {
      return [];
    }
    return [{
      id: path.id,
      isDefault: "isDefault" in path && path.isDefault === true,
    }];
  });
}

function indexEdges(edges: WorkflowDraftEdge[], key: "source" | "target") {
  const index = new Map<string, WorkflowDraftEdge[]>();
  for (const edge of edges) {
    const nodeId = edge[key];
    index.set(nodeId, [...index.get(nodeId) ?? [], edge]);
  }
  return index;
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
