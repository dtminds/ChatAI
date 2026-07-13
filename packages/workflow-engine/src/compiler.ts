import {
  normalizeWorkflowEntryPolicy,
  type WorkflowDraft,
  type WorkflowExecutionSpec,
  type WorkflowNodeKind,
} from "@chatai/contracts";
import { WorkflowCompilationError } from "./errors.js";
import { getWorkflowSourceOutletId, validateWorkflowGraph } from "./graph.js";

export function compileWorkflowDraft({
  draft,
  revision,
  workflowId,
}: {
  draft: WorkflowDraft;
  revision: number;
  workflowId: string;
}): WorkflowExecutionSpec {
  const normalizedDraft = normalizeWorkflowDraft(draft);
  const validation = validateWorkflowGraph(normalizedDraft);
  if (validation.issues.length > 0) {
    throw new WorkflowCompilationError(validation.issues);
  }

  return {
    edges: normalizedDraft.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceOutletId: getWorkflowSourceOutletId(edge),
      target: edge.target,
    })),
    entryNodeId: validation.entryNode.id,
    nodes: validation.topologicalNodeIds.map((nodeId) => {
      const node = normalizedDraft.nodes.find((item) => item.id === nodeId)!;
      return {
        config: createExecutionConfig(node.data.kind, node.data),
        id: node.id,
        kind: node.data.kind,
        nodeSchemaVersion: node.data.schemaVersion,
      };
    }),
    revision,
    schemaVersion: 1,
    terminalNodeId: validation.terminalNode.id,
    workflowId,
  };
}

export function normalizeWorkflowDraft(draft: WorkflowDraft): WorkflowDraft {
  return {
    ...structuredClone(draft),
    nodes: draft.nodes.map((node) => {
      if (node.data.kind !== "start") return structuredClone(node);
      const data = node.data as typeof node.data & { entryPolicy?: unknown };
      return {
        ...structuredClone(node),
        data: {
          ...structuredClone(data),
          entryPolicy: normalizeWorkflowEntryPolicy(data.entryPolicy),
        },
      };
    }),
  } as WorkflowDraft;
}

function createExecutionConfig(kind: WorkflowNodeKind, data: Record<string, unknown>) {
  if (kind === "start") {
    return cloneJsonValue({
      accountIds: data.accountIds,
      entryPolicy: data.entryPolicy,
      triggers: data.triggers,
    }) as Record<string, unknown>;
  }
  if (kind === "wait") {
    return cloneJsonValue({ duration: data.duration, unit: data.unit }) as Record<string, unknown>;
  }
  if (kind === "end") return {};
  return {};
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        typeof item === "function" ? [] : [[key, cloneJsonValue(item)]]),
    );
  }
  return value;
}
