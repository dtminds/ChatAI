import { DEFAULT_WORKFLOW_VIEWPORT } from "./graph";
import { filterWorkflowEdgesByConnectionPolicy } from "./connection-policy";
import { WORKFLOW_EDGE_TYPE, WORKFLOW_NODE_TYPE } from "./constants";
import {
  createDefaultNodeData,
  getNodeDefinitionCore,
} from "./node-definition-core";
import { isWorkflowNodeKind } from "./node-catalog";
import type {
  WorkflowEdge,
  WorkflowEdgeData,
  WorkflowDraft,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowNodeKind,
} from "./types";

type UnknownDraft = {
  edges?: unknown;
  nodes?: unknown;
  viewport?: unknown;
} | undefined;

type HydratableWorkflowNode = Omit<WorkflowNode, "data"> & {
  data: Record<string, unknown> & {
    kind: WorkflowNodeKind;
  };
};

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

function isHydratableWorkflowNode(value: unknown): value is HydratableWorkflowNode {
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

function hydrateWorkflowNode(node: HydratableWorkflowNode): WorkflowNode {
  return {
    ...node,
    data: hydrateWorkflowNodeData(node.data.kind, node.data),
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

function hydrateWorkflowNodeData<TKind extends WorkflowNodeKind>(
  kind: TKind,
  data: Record<string, unknown>,
): WorkflowNodeData<TKind> {
  const {
    availableTimeReferences: _availableTimeReferences,
    availableVariables: _availableVariables,
    insertMenuOpen: _insertMenuOpen,
    insertMenuSourceHandle: _insertMenuSourceHandle,
    onDelete: _onDelete,
    onDuplicate: _onDuplicate,
    onInsertAfter: _onInsertAfter,
    onSelect: _onSelect,
    onToggleInsertMenu: _onToggleInsertMenu,
    selected: _selected,
    kind: _kind,
    ...rawPersistableData
  } = data;
  const persistableData = sanitizePersistableDataRecord(rawPersistableData);
  const {
    branchPaths: _foreignBranchPaths,
    ...nonBranchPersistableData
  } = persistableData;
  const kindPersistableData = kind === "branch"
    ? persistableData
    : nonBranchPersistableData;
  const definition = getNodeDefinitionCore(kind);
  const fromVersion = getNodeSchemaVersion(kindPersistableData.schemaVersion);
  const migrationInput = {
    ...kindPersistableData,
    kind,
  } as unknown as Partial<WorkflowNodeData<TKind>> & Pick<WorkflowNodeData<TKind>, "kind">;
  const migratedData = fromVersion < definition.schemaVersion
    ? definition.migrateData?.({
        data: migrationInput,
        fromVersion,
        toVersion: definition.schemaVersion,
      }) ?? migrationInput
    : migrationInput;
  const nextData = {
    ...createDefaultNodeData(kind),
    ...migratedData,
    kind,
    schemaVersion: Math.max(fromVersion, definition.schemaVersion),
  } as WorkflowNodeData<TKind>;

  return definition.sanitizeData?.(nextData) ?? nextData;
}

function sanitizeNodeData<TKind extends WorkflowNodeKind>(
  data: WorkflowNodeData<TKind>,
): WorkflowNodeData<TKind> {
  return hydrateWorkflowNodeData<TKind>(data.kind as TKind, data);
}

function getNodeSchemaVersion(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
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
    Object.entries(data)
      .flatMap(([key, value]) => {
        const sanitizedValue = sanitizePersistableDataValue(key, value);

        return sanitizedValue === undefined ? [] : [[key, sanitizedValue]];
      }),
  ) as TData;
}

function sanitizePersistableDataValue(
  key: string,
  value: unknown,
): unknown {
  if (key.startsWith("_") || typeof value === "function") {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePersistableArrayItem(item))
      .filter((item) => item !== undefined);
  }

  if (isPlainObject(value)) {
    return sanitizePersistableDataRecord(value);
  }

  return value;
}

function sanitizePersistableArrayItem(value: unknown): unknown {
  if (typeof value === "function") {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePersistableArrayItem(item))
      .filter((item) => item !== undefined);
  }

  if (isPlainObject(value)) {
    return sanitizePersistableDataRecord(value);
  }

  return value;
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

function sanitizeViewport(viewport: unknown): WorkflowDraft["viewport"] {
  const rawViewport = isPlainObject(viewport) ? viewport : undefined;

  return {
    x: normalizeViewportNumber(rawViewport?.x, DEFAULT_WORKFLOW_VIEWPORT.x),
    y: normalizeViewportNumber(rawViewport?.y, DEFAULT_WORKFLOW_VIEWPORT.y),
    zoom: normalizeViewportNumber(rawViewport?.zoom, DEFAULT_WORKFLOW_VIEWPORT.zoom),
  };
}

function normalizeViewportNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
