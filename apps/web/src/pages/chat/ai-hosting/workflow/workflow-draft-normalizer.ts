import { DEFAULT_WORKFLOW_VIEWPORT } from "./graph";
import { normalizeWorkflowBranchPaths } from "./branch-paths";
import { filterWorkflowEdgesByConnectionPolicy } from "./connection-policy";
import { WORKFLOW_EDGE_TYPE, WORKFLOW_NODE_TYPE } from "./constants";
import { createDefaultNodeData } from "./node-definition-core";
import { isWorkflowNodeKind } from "./node-catalog";
import type {
  WorkflowEdge,
  WorkflowEdgeData,
  WorkflowDraft,
  WorkflowNode,
  WorkflowNodeData,
} from "./types";

type UnknownDraft = Partial<WorkflowDraft> | undefined;

export function hydrateWorkflowDraft(draft: UnknownDraft): WorkflowDraft {
  const nodes = Array.isArray(draft?.nodes)
    ? hydrateWorkflowNodes(draft.nodes)
    : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(draft?.edges)
    ? draft.edges
        .filter((edge): edge is WorkflowEdge => isHydratableWorkflowEdge(edge, nodeIds))
        .map(hydrateWorkflowEdge)
    : [];

  return sanitizeDraft({
    edges: filterWorkflowEdgesByConnectionPolicy({
      edges: dedupeWorkflowEdges(edges),
      nodes,
      viewport: sanitizeViewport(draft?.viewport),
    }),
    nodes,
    viewport: sanitizeViewport(draft?.viewport),
  });
}

export function canonicalizeWorkflowDraft(draft: WorkflowDraft): WorkflowDraft {
  return hydrateWorkflowDraft(draft);
}

export function sanitizeDraft(draft: WorkflowDraft): WorkflowDraft {
  return {
    edges: draft.edges.map(sanitizeEdgeForDraft),
    nodes: draft.nodes.map(sanitizeNodeForDraft),
    viewport: sanitizeViewport(draft.viewport),
  };
}

export function isWorkflowDraftEqual(firstDraft: WorkflowDraft, secondDraft: WorkflowDraft) {
  const firstCanonicalDraft = canonicalizeWorkflowDraft(firstDraft);
  const secondCanonicalDraft = canonicalizeWorkflowDraft(secondDraft);

  if (
    firstCanonicalDraft.nodes.length !== secondCanonicalDraft.nodes.length
    || firstCanonicalDraft.edges.length !== secondCanonicalDraft.edges.length
  ) {
    return false;
  }

  return JSON.stringify(firstCanonicalDraft) === JSON.stringify(secondCanonicalDraft);
}

export function isWorkflowGraphEqual(firstDraft: WorkflowDraft, secondDraft: WorkflowDraft) {
  const firstCanonicalDraft = canonicalizeWorkflowDraft(firstDraft);
  const secondCanonicalDraft = canonicalizeWorkflowDraft(secondDraft);

  if (
    firstCanonicalDraft.nodes.length !== secondCanonicalDraft.nodes.length
    || firstCanonicalDraft.edges.length !== secondCanonicalDraft.edges.length
  ) {
    return false;
  }

  return JSON.stringify({
    edges: firstCanonicalDraft.edges,
    nodes: firstCanonicalDraft.nodes,
  }) === JSON.stringify({
    edges: secondCanonicalDraft.edges,
    nodes: secondCanonicalDraft.nodes,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFinitePosition(value: unknown): value is { x: number; y: number } {
  return isPlainObject(value)
    && typeof value.x === "number"
    && Number.isFinite(value.x)
    && typeof value.y === "number"
    && Number.isFinite(value.y);
}

function isHydratableWorkflowNode(value: unknown): value is WorkflowNode {
  if (!isPlainObject(value) || typeof value.id !== "string") {
    return false;
  }

  if (!isPlainObject(value.data) || !isWorkflowNodeKind(value.data.kind)) {
    return false;
  }

  return isFinitePosition(value.position);
}

function hydrateWorkflowNodes(rawNodes: unknown[]): WorkflowNode[] {
  const seenNodeIds = new Set<string>();
  const nodes: WorkflowNode[] = [];

  rawNodes.forEach((rawNode) => {
    if (!isHydratableWorkflowNode(rawNode) || seenNodeIds.has(rawNode.id)) {
      return;
    }

    seenNodeIds.add(rawNode.id);
    nodes.push(hydrateWorkflowNode(rawNode));
  });

  return nodes;
}

function hydrateWorkflowNode(node: WorkflowNode): WorkflowNode {
  return {
    ...node,
    data: {
      ...createDefaultNodeData(node.data.kind),
      ...sanitizeNodeData(node.data),
      kind: node.data.kind,
    },
    position: { ...node.position },
    type: WORKFLOW_NODE_TYPE,
  };
}

function isHydratableWorkflowEdge(value: unknown, nodeIds: Set<string>): value is WorkflowEdge {
  if (!isPlainObject(value)) {
    return false;
  }

  return typeof value.id === "string"
    && typeof value.source === "string"
    && typeof value.target === "string"
    && nodeIds.has(value.source)
    && nodeIds.has(value.target);
}

function hydrateWorkflowEdge(edge: WorkflowEdge): WorkflowEdge {
  return {
    ...edge,
    data: sanitizeEdgeData(edge.data),
    type: WORKFLOW_EDGE_TYPE,
  };
}

function dedupeWorkflowEdges(edges: WorkflowEdge[]): WorkflowEdge[] {
  const seenEdgeIds = new Set<string>();

  return edges.filter((edge) => {
    if (seenEdgeIds.has(edge.id)) {
      return false;
    }

    seenEdgeIds.add(edge.id);
    return true;
  });
}

function sanitizeNodeData(data: WorkflowNodeData): WorkflowNodeData {
  const {
    branchPaths,
    insertMenuOpen: _insertMenuOpen,
    insertMenuSourceHandle: _insertMenuSourceHandle,
    onDelete: _onDelete,
    onDuplicate: _onDuplicate,
    onInsertAfter: _onInsertAfter,
    onSelect: _onSelect,
    onToggleInsertMenu: _onToggleInsertMenu,
    selected: _selected,
    ...rawPersistableData
  } = data;
  const persistableData = sanitizePersistableDataRecord(rawPersistableData);

  if (persistableData.kind === "branch") {
    return {
      ...persistableData,
      branchPaths: normalizeWorkflowBranchPaths(branchPaths),
    };
  }

  return persistableData;
}

function sanitizeNodeForDraft(node: WorkflowNode): WorkflowNode {
  return {
    id: node.id,
    position: { ...node.position },
    selected: false,
    type: WORKFLOW_NODE_TYPE,
    zIndex: undefined,
    data: sanitizeNodeData(node.data),
  };
}

function sanitizeEdgeData(data: WorkflowEdgeData | undefined): WorkflowEdgeData | undefined {
  if (!data) {
    return data;
  }

  const {
    highlightState: _highlightState,
    insertMenuOpen: _insertMenuOpen,
    onInsertBetween: _onInsertBetween,
    onToggleInsertMenu: _onToggleInsertMenu,
    ...rawPersistableData
  } = data;
  const persistableData = sanitizePersistableDataRecord(rawPersistableData);

  return persistableData;
}

function sanitizePersistableDataRecord<TData extends Record<string, unknown>>(
  data: TData,
): TData {
  return Object.fromEntries(
    Object.entries(data).filter(([key, value]) =>
      !key.startsWith("_") && typeof value !== "function",
    ),
  ) as TData;
}

function sanitizeEdgeForDraft(edge: WorkflowEdge): WorkflowEdge {
  return {
    id: edge.id,
    selected: false,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    type: WORKFLOW_EDGE_TYPE,
    data: sanitizeEdgeData(edge.data),
  };
}

function sanitizeViewport(viewport: WorkflowDraft["viewport"] | undefined): WorkflowDraft["viewport"] {
  return {
    x: normalizeViewportNumber(viewport?.x, DEFAULT_WORKFLOW_VIEWPORT.x),
    y: normalizeViewportNumber(viewport?.y, DEFAULT_WORKFLOW_VIEWPORT.y),
    zoom: normalizeViewportNumber(viewport?.zoom, DEFAULT_WORKFLOW_VIEWPORT.zoom),
  };
}

function normalizeViewportNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
