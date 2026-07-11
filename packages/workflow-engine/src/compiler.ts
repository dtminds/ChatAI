import type { WorkflowDraft, WorkflowExecutionSpec } from "@chatai/contracts";
import { WorkflowCompilationError } from "./errors.js";
import { getWorkflowSourceOutletId, validateWorkflowGraph } from "./graph.js";

const UI_NODE_DATA_KEYS = new Set([
  "kind",
  "label",
  "metric",
  "schemaVersion",
  "status",
  "summary",
  "title",
]);

export function compileWorkflowDraft({
  draft,
  revision,
  workflowId,
}: {
  draft: WorkflowDraft;
  revision: number;
  workflowId: string;
}): WorkflowExecutionSpec {
  const validation = validateWorkflowGraph(draft);
  if (validation.issues.length > 0) {
    throw new WorkflowCompilationError(validation.issues);
  }

  return {
    edges: draft.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceOutletId: getWorkflowSourceOutletId(edge),
      target: edge.target,
    })),
    entryNodeId: validation.entryNode.id,
    nodes: validation.topologicalNodeIds.map((nodeId) => {
      const node = draft.nodes.find((item) => item.id === nodeId)!;
      return {
        config: createExecutionConfig(node.data),
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

function createExecutionConfig(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key, value]) => !UI_NODE_DATA_KEYS.has(key) && typeof value !== "function")
      .map(([key, value]) => [key, cloneJsonValue(value)]),
  );
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
