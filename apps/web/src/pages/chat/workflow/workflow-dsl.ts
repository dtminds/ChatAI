import { canonicalizeWorkflowDraft, hydrateWorkflowDraft } from "./workflow-draft-normalizer";
import {
  createWorkflowNodeExecutionConfig,
  findWorkflowEntryNode,
  getWorkflowNodeRole,
} from "./node-catalog";
import {
  getNodeSourceOutletDefinition,
  type WorkflowSourceOutletDefinition,
} from "./node-handle-definitions";
import type {
  WorkflowDraft,
  WorkflowEdge,
  WorkflowNode,
} from "./types";

export const WORKFLOW_DSL_KIND = "chatai-workflow";
export const WORKFLOW_DSL_SCHEMA_VERSION = 1;
export const SUPPORTED_WORKFLOW_DSL_SCHEMA_VERSIONS = [1] as const;
const LEGACY_WORKFLOW_DSL_KINDS = ["chatai-marketing-workflow"] as const;

export type WorkflowDslDocument = {
  exportedAt: string;
  kind: typeof WORKFLOW_DSL_KIND;
  meta: {
    producer: "ChatAI";
    supportedSchemaVersions: readonly number[];
  };
  schemaVersion: typeof WORKFLOW_DSL_SCHEMA_VERSION;
  workflow: {
    draft: WorkflowDraft;
    executionGraph: WorkflowExecutionGraph;
    id?: string;
    name: string;
    revision?: number;
  };
};

export type WorkflowExecutionGraph = {
  edges: WorkflowExecutionEdge[];
  entryNodeId: string | null;
  incoming: Record<string, string[]>;
  nodes: WorkflowExecutionNode[];
  outgoing: Record<string, string[]>;
  terminalNodeIds: string[];
  topologicalNodeIds: string[];
};

export type WorkflowExecutionNode = {
  config: Record<string, unknown>;
  id: string;
  kind: WorkflowNode["data"]["kind"];
};

export type WorkflowExecutionEdge = {
  id: string;
  source: string;
  sourceHandle: string | null;
  sourceOutlet: WorkflowSourceOutletDefinition | null;
  target: string;
  targetHandle: string | null;
};

export type WorkflowDslParseIssue = {
  code:
    | "dropped-edges"
    | "dropped-nodes"
    | "empty-draft"
    | "invalid-json"
    | "invalid-kind"
    | "invalid-schema-version"
    | "legacy-graph-format"
    | "missing-draft"
    | "normalized-viewport";
  message: string;
};

export type WorkflowDslSourceFormat = "draft" | "graph";

export type WorkflowDslParseResult =
  | {
    document: WorkflowDslDocument;
    draft: WorkflowDraft;
    importedSchemaVersion: number;
    ok: true;
    sourceFormat: WorkflowDslSourceFormat;
    warnings: WorkflowDslParseIssue[];
  }
  | {
    issues: WorkflowDslParseIssue[];
    ok: false;
  };

type UnknownDslDocument = Partial<{
  exportedAt: unknown;
  kind: unknown;
  meta: unknown;
  schemaVersion: unknown;
  workflow: Partial<{
    draft: unknown;
    graph: unknown;
    id: unknown;
    name: unknown;
    revision: unknown;
  }>;
}>;

export function createWorkflowDslDocument({
  draft,
  exportedAt = new Date().toISOString(),
  workflowId,
  workflowName,
  workflowRevision,
}: {
  draft: WorkflowDraft;
  exportedAt?: string;
  workflowId?: string;
  workflowName: string;
  workflowRevision?: number;
}): WorkflowDslDocument {
  const canonicalDraft = canonicalizeWorkflowDraft(draft);

  return {
    exportedAt,
    kind: WORKFLOW_DSL_KIND,
    meta: {
      producer: "ChatAI",
      supportedSchemaVersions: SUPPORTED_WORKFLOW_DSL_SCHEMA_VERSIONS,
    },
    schemaVersion: WORKFLOW_DSL_SCHEMA_VERSION,
    workflow: {
      draft: canonicalDraft,
      executionGraph: createWorkflowExecutionGraph(canonicalDraft),
      id: workflowId,
      name: workflowName,
      revision: workflowRevision,
    },
  };
}

export function stringifyWorkflowDslDocument(document: WorkflowDslDocument): string {
  const draft = canonicalizeWorkflowDraft(document.workflow.draft);

  return JSON.stringify({
    ...document,
    workflow: {
      ...document.workflow,
      draft,
      executionGraph: createWorkflowExecutionGraph(draft),
    },
  }, null, 2);
}

export function exportWorkflowDsl(options: Parameters<typeof createWorkflowDslDocument>[0]): string {
  return stringifyWorkflowDslDocument(createWorkflowDslDocument(options));
}

export function createWorkflowExecutionGraph(draft: WorkflowDraft): WorkflowExecutionGraph {
  const canonicalDraft = canonicalizeWorkflowDraft(draft);
  const nodeById = new Map(canonicalDraft.nodes.map((node) => [node.id, node]));
  const entryNode = findWorkflowEntryNode(canonicalDraft.nodes);
  const terminalNodeIds = canonicalDraft.nodes
    .filter((node) => getWorkflowNodeRole(node.data.kind) === "terminal")
    .map((node) => node.id);
  const edges = canonicalDraft.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? null,
    sourceOutlet: createWorkflowExecutionEdgeOutlet(edge, nodeById.get(edge.source)),
    target: edge.target,
    targetHandle: edge.targetHandle ?? null,
  }));

  return {
    edges,
    entryNodeId: entryNode?.id ?? null,
    incoming: createWorkflowExecutionEdgeIndex(canonicalDraft.nodes, edges, "target"),
    nodes: canonicalDraft.nodes.map((node) => {
      return {
        config: createWorkflowNodeExecutionConfig(node.data),
        id: node.id,
        kind: node.data.kind,
      };
    }),
    outgoing: createWorkflowExecutionEdgeIndex(canonicalDraft.nodes, edges, "source"),
    terminalNodeIds,
    topologicalNodeIds: createWorkflowExecutionTopologicalOrder(canonicalDraft.nodes, edges, entryNode?.id),
  };
}

function createWorkflowExecutionTopologicalOrder(
  nodes: WorkflowNode[],
  edges: WorkflowExecutionEdge[],
  entryNodeId: string | undefined,
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const incomingCountByNodeId = new Map(nodes.map((node) => [node.id, 0]));
  const outgoingEdgesByNodeId = new Map<string, WorkflowExecutionEdge[]>();

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return;
    }

    incomingCountByNodeId.set(edge.target, (incomingCountByNodeId.get(edge.target) ?? 0) + 1);
    outgoingEdgesByNodeId.set(edge.source, [...outgoingEdgesByNodeId.get(edge.source) ?? [], edge]);
  });

  const queue = nodes
    .filter((node) => incomingCountByNodeId.get(node.id) === 0)
    .sort((first, second) => getNodeQueuePriority(first.id, entryNodeId, nodeOrder) - getNodeQueuePriority(second.id, entryNodeId, nodeOrder))
    .map((node) => node.id);
  const orderedNodeIds: string[] = [];
  const visitedNodeIds = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;

    if (visitedNodeIds.has(nodeId)) {
      continue;
    }

    visitedNodeIds.add(nodeId);
    orderedNodeIds.push(nodeId);

    const outgoingEdges = [...outgoingEdgesByNodeId.get(nodeId) ?? []].sort(
      (first, second) => getEdgeQueuePriority(first, nodeOrder) - getEdgeQueuePriority(second, nodeOrder),
    );

    outgoingEdges.forEach((edge) => {
      const nextIncomingCount = (incomingCountByNodeId.get(edge.target) ?? 0) - 1;
      incomingCountByNodeId.set(edge.target, nextIncomingCount);

      if (nextIncomingCount === 0) {
        queue.push(edge.target);
        queue.sort((first, second) => getNodeQueuePriority(first, entryNodeId, nodeOrder) - getNodeQueuePriority(second, entryNodeId, nodeOrder));
      }
    });
  }

  nodes.forEach((node) => {
    if (!visitedNodeIds.has(node.id)) {
      orderedNodeIds.push(node.id);
    }
  });

  return orderedNodeIds;
}

function getNodeQueuePriority(
  nodeId: string,
  entryNodeId: string | undefined,
  nodeOrder: Map<string, number>,
) {
  const entryPriority = nodeId === entryNodeId ? -100000 : 0;

  return entryPriority + (nodeOrder.get(nodeId) ?? Number.MAX_SAFE_INTEGER);
}

function getEdgeQueuePriority(
  edge: WorkflowExecutionEdge,
  nodeOrder: Map<string, number>,
) {
  return nodeOrder.get(edge.target) ?? Number.MAX_SAFE_INTEGER;
}

function createWorkflowExecutionEdgeIndex(
  nodes: WorkflowNode[],
  edges: WorkflowExecutionEdge[],
  direction: "source" | "target",
) {
  const index = Object.fromEntries(nodes.map((node) => [node.id, [] as string[]]));

  edges.forEach((edge) => {
    index[edge[direction]]?.push(edge.id);
  });

  return index;
}

function createWorkflowExecutionEdgeOutlet(
  edge: WorkflowEdge,
  sourceNode: WorkflowNode | undefined,
): WorkflowSourceOutletDefinition | null {
  if (!sourceNode) {
    return null;
  }

  return getNodeSourceOutletDefinition(sourceNode, edge.sourceHandle);
}

export function parseWorkflowDslText(text: string): WorkflowDslParseResult {
  if (!text.trim()) {
    return createDslParseFailure("invalid-json", "DSL 内容不能为空");
  }

  let parsed: UnknownDslDocument;

  try {
    parsed = JSON.parse(text) as UnknownDslDocument;
  }
  catch {
    return createDslParseFailure("invalid-json", "DSL 必须是合法 JSON");
  }

  if (!isPlainObject(parsed) || !isSupportedWorkflowDslKind(parsed.kind)) {
    return createDslParseFailure("invalid-kind", "DSL 类型不匹配");
  }

  if (!isSupportedWorkflowDslSchemaVersion(parsed.schemaVersion)) {
    return createDslParseFailure("invalid-schema-version", "DSL 版本不支持");
  }

  if (!isPlainObject(parsed.workflow)) {
    return createDslParseFailure("missing-draft", "DSL 缺少 Workflow 数据");
  }

  const sourceFormat = isPlainObject(parsed.workflow.draft) ? "draft" : "graph";
  const rawDraft = parsed.workflow.draft ?? parsed.workflow.graph;

  if (!isPlainObject(rawDraft)) {
    return createDslParseFailure("missing-draft", "DSL 缺少画布草稿");
  }

  const draft = hydrateWorkflowDraft(rawDraft as Partial<WorkflowDraft>);

  if (!draft.nodes.length) {
    return createDslParseFailure("empty-draft", "DSL 中没有可用节点");
  }

  const warnings = buildWorkflowDslImportWarnings(
    rawDraft as Partial<WorkflowDraft>,
    draft,
    sourceFormat,
  );
  const document = createWorkflowDslDocument({
    draft,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    workflowId: typeof parsed.workflow.id === "string" ? parsed.workflow.id : undefined,
    workflowName: typeof parsed.workflow.name === "string" && parsed.workflow.name.trim()
      ? parsed.workflow.name
      : "导入的 Workflow",
    workflowRevision: typeof parsed.workflow.revision === "number" && Number.isFinite(parsed.workflow.revision)
      ? parsed.workflow.revision
      : undefined,
  });

  return {
    document,
    draft,
    importedSchemaVersion: parsed.schemaVersion,
    ok: true,
    sourceFormat,
    warnings,
  };
}

export function buildWorkflowDslImportWarnings(
  rawDraft: Partial<WorkflowDraft>,
  hydratedDraft: WorkflowDraft,
  sourceFormat: WorkflowDslSourceFormat = "draft",
): WorkflowDslParseIssue[] {
  const warnings: WorkflowDslParseIssue[] = [];
  const rawNodes = Array.isArray(rawDraft.nodes) ? rawDraft.nodes as WorkflowNode[] : [];
  const rawEdges = Array.isArray(rawDraft.edges) ? rawDraft.edges as WorkflowEdge[] : [];

  if (sourceFormat === "graph") {
    warnings.push({
      code: "legacy-graph-format",
      message: "已从旧版 graph 格式兼容导入",
    });
  }

  if (rawNodes.length !== hydratedDraft.nodes.length) {
    warnings.push({
      code: "dropped-nodes",
      message: "部分节点不受支持，已在导入时忽略",
    });
  }

  if (rawEdges.length !== hydratedDraft.edges.length) {
    warnings.push({
      code: "dropped-edges",
      message: "部分连线无效，已在导入时忽略",
    });
  }

  if (isViewportNormalized(rawDraft.viewport, hydratedDraft.viewport)) {
    warnings.push({
      code: "normalized-viewport",
      message: "画布视角包含无效数值，已恢复为默认视角",
    });
  }

  return warnings;
}

function createDslParseFailure(
  code: WorkflowDslParseIssue["code"],
  message: string,
): WorkflowDslParseResult {
  return {
    issues: [{ code, message }],
    ok: false,
  };
}

function isSupportedWorkflowDslSchemaVersion(value: unknown): value is typeof WORKFLOW_DSL_SCHEMA_VERSION {
  return typeof value === "number"
    && SUPPORTED_WORKFLOW_DSL_SCHEMA_VERSIONS.includes(value as typeof WORKFLOW_DSL_SCHEMA_VERSION);
}

function isSupportedWorkflowDslKind(value: unknown) {
  return value === WORKFLOW_DSL_KIND
    || LEGACY_WORKFLOW_DSL_KINDS.includes(value as (typeof LEGACY_WORKFLOW_DSL_KINDS)[number]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isViewportNormalized(
  rawViewport: WorkflowDraft["viewport"] | undefined,
  hydratedViewport: WorkflowDraft["viewport"],
) {
  if (!isPlainObject(rawViewport)) {
    return false;
  }

  return rawViewport.x !== hydratedViewport.x
    || rawViewport.y !== hydratedViewport.y
    || rawViewport.zoom !== hydratedViewport.zoom;
}
