import { sanitizeDraft } from "./workflow-draft-normalizer";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "./constants";
import { getUniqueDuplicatedNodeTitle } from "./graph";
import { canDuplicateNodeKind, canInsertNodeKind } from "./node-definitions";
import type {
  WorkflowNodeKind,
  WorkflowEdge,
  WorkflowNode,
  WorkflowDraft,
} from "./types";

export const WORKFLOW_CLIPBOARD_KIND = "chatai-marketing-workflow-clipboard";
export const WORKFLOW_CLIPBOARD_VERSION = 1;
const PASTE_OFFSET = 48;

export type WorkflowClipboardData = {
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
};

type WorkflowClipboardPayload = WorkflowClipboardData & {
  kind: typeof WORKFLOW_CLIPBOARD_KIND;
  version: typeof WORKFLOW_CLIPBOARD_VERSION;
};

type NavigatorClipboardCapability = Navigator & {
  clipboard?: {
    readText?: () => Promise<string>;
    writeText?: (text: string) => Promise<void>;
  };
};

export type WorkflowPasteOptions = {
  nodeIdFactory: (kind: WorkflowNodeKind, index: number) => string;
  offset?: {
    x: number;
    y: number;
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWorkflowNodeKind(value: unknown): value is WorkflowNodeKind {
  return value === "trigger"
    || value === "wait"
    || value === "branch"
    || value === "action"
    || value === "ai"
    || value === "goal";
}

function isFinitePosition(value: unknown): value is { x: number; y: number } {
  return isPlainObject(value)
    && Number.isFinite(value.x)
    && Number.isFinite(value.y);
}

export function isClipboardNodeStructurallyValid(value: unknown): value is WorkflowNode {
  if (!isPlainObject(value)) {
    return false;
  }

  if (typeof value.id !== "string" || value.type !== WORKFLOW_NODE_TYPE) {
    return false;
  }

  if (!isPlainObject(value.data) || !isWorkflowNodeKind(value.data.kind)) {
    return false;
  }

  return isFinitePosition(value.position);
}

export function isClipboardEdgeStructurallyValid(value: unknown): value is WorkflowEdge {
  if (!isPlainObject(value)) {
    return false;
  }

  return typeof value.id === "string"
    && typeof value.source === "string"
    && typeof value.target === "string"
    && value.type === WORKFLOW_EDGE_TYPE;
}

export function stringifyWorkflowClipboardData(data: WorkflowClipboardData) {
  const payload: WorkflowClipboardPayload = {
    kind: WORKFLOW_CLIPBOARD_KIND,
    version: WORKFLOW_CLIPBOARD_VERSION,
    edges: data.edges,
    nodes: data.nodes,
  };

  return JSON.stringify(payload);
}

export function parseWorkflowClipboardText(text: string): WorkflowClipboardData | undefined {
  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as Partial<WorkflowClipboardPayload>;

    if (
      parsed.kind !== WORKFLOW_CLIPBOARD_KIND
      || parsed.version !== WORKFLOW_CLIPBOARD_VERSION
      || !Array.isArray(parsed.nodes)
      || !Array.isArray(parsed.edges)
    ) {
      return undefined;
    }

    const nodes = parsed.nodes.filter(isClipboardNodeStructurallyValid);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = parsed.edges
      .filter(isClipboardEdgeStructurallyValid)
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

    return { edges, nodes };
  }
  catch {
    return undefined;
  }
}

export async function writeWorkflowClipboard(data: WorkflowClipboardData) {
  const clipboard = getNavigatorClipboard();

  if (!clipboard?.writeText) {
    return false;
  }

  try {
    await clipboard.writeText(stringifyWorkflowClipboardData(data));
    return true;
  }
  catch {
    return false;
  }
}

export async function readWorkflowClipboard() {
  const clipboard = getNavigatorClipboard();

  if (!clipboard?.readText) {
    return undefined;
  }

  try {
    return parseWorkflowClipboardText(await clipboard.readText());
  }
  catch {
    return undefined;
  }
}

export function canReadWorkflowClipboard() {
  return typeof getNavigatorClipboard()?.readText === "function";
}

function getNavigatorClipboard() {
  return (navigator as NavigatorClipboardCapability).clipboard;
}

export function createWorkflowClipboardData(
  draft: WorkflowDraft,
  nodeIds: string[],
): WorkflowClipboardData | undefined {
  const copiedNodeIdSet = new Set(nodeIds);
  const nodes = draft.nodes.filter((node) =>
    copiedNodeIdSet.has(node.id) && canDuplicateNodeKind(node.data.kind),
  );

  if (!nodes.length) {
    return undefined;
  }

  const validNodeIdSet = new Set(nodes.map((node) => node.id));
  return sanitizeDraft({
    edges: draft.edges.filter((edge) =>
      validNodeIdSet.has(edge.source) && validNodeIdSet.has(edge.target),
    ),
    nodes,
  });
}

export function pasteWorkflowClipboardData(
  draft: WorkflowDraft,
  clipboardData: WorkflowClipboardData,
  options: WorkflowPasteOptions,
) {
  const sourceNodes = clipboardData.nodes
    .filter(isClipboardNodeStructurallyValid)
    .filter((node) => canInsertNodeKind(node.data.kind) && canDuplicateNodeKind(node.data.kind));

  if (!sourceNodes.length) {
    return undefined;
  }

  const sourceNodeIds = new Set(sourceNodes.map((node) => node.id));
  const sourceEdges = clipboardData.edges
    .filter(isClipboardEdgeStructurallyValid)
    .filter((edge) => sourceNodeIds.has(edge.source) && sourceNodeIds.has(edge.target));
  const reservedTitles = new Set(draft.nodes.map((node) => node.data.title));
  const reservedNodeIds = new Set(draft.nodes.map((node) => node.id));
  const idMapping = new Map<string, string>();
  const offset = options.offset ?? { x: PASTE_OFFSET, y: PASTE_OFFSET };

  const pastedNodes = sourceNodes.map((node, index) => {
    const nodeId = getUniquePastedNodeId(options.nodeIdFactory(node.data.kind, index), reservedNodeIds);
    idMapping.set(node.id, nodeId);

    return {
      ...node,
      data: {
        ...node.data,
        title: getUniqueDuplicatedNodeTitle(node.data.title, reservedTitles),
      },
      id: nodeId,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      selected: false,
      zIndex: undefined,
    };
  });

  const pastedEdges = sourceEdges.flatMap((edge) => {
    const source = idMapping.get(edge.source);
    const target = idMapping.get(edge.target);

    if (!source || !target) {
      return [];
    }

    return [{
      ...edge,
      id: ["edge", source, edge.sourceHandle, target, edge.targetHandle].filter(Boolean).join("-"),
      selected: false,
      source,
      target,
    }];
  });

  const nextDraft = sanitizeDraft({
    edges: [...draft.edges, ...pastedEdges],
    nodes: [...draft.nodes, ...pastedNodes],
  });
  const firstPastedNode = pastedNodes[0];

  return {
    draft: nextDraft,
    event: "node:paste" as const,
    meta: {
      nodeId: firstPastedNode.id,
      nodeTitle: firstPastedNode.data.title,
    },
    result: {
      nodeId: firstPastedNode.id,
    },
  };
}

function getUniquePastedNodeId(nodeId: string, reservedNodeIds: Set<string>) {
  let candidate = nodeId;
  let suffix = 1;

  while (reservedNodeIds.has(candidate)) {
    candidate = `${nodeId}-${suffix}`;
    suffix += 1;
  }

  reservedNodeIds.add(candidate);
  return candidate;
}
