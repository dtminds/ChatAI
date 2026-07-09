import type {
  WorkflowDraft,
  WorkflowEdgeData,
  WorkflowNode,
  WorkflowNodeData,
} from "../types";
import { canonicalizeWorkflowDraft } from "../workflow-draft-normalizer";
import {
  createWorkflowExecutionGraph,
  type WorkflowExecutionGraph,
} from "../workflow-dsl";

export type WorkflowRuntimeSnapshot = {
  draft: WorkflowDraft;
  executionGraph: WorkflowExecutionGraph;
};

export function createWorkflowRunDraftSnapshot(draft: WorkflowDraft): WorkflowDraft {
  const canonicalDraft = canonicalizeWorkflowDraft(draft);

  return {
    edges: canonicalDraft.edges.map((edge) => ({
      ...edge,
      data: clonePlainData(edge.data),
    })),
    nodes: canonicalDraft.nodes.map((node) => ({
      ...node,
      data: clonePlainData(node.data),
      position: { ...node.position },
    })),
    viewport: { ...canonicalDraft.viewport },
  };
}

export function createWorkflowNodeRunSnapshot(node: WorkflowNode): WorkflowNode | undefined {
  return createWorkflowRunDraftSnapshot({
    edges: [],
    nodes: [node],
    viewport: { x: 0, y: 0, zoom: 1 },
  }).nodes[0];
}

export function createWorkflowRuntimeSnapshot(draft: WorkflowDraft): WorkflowRuntimeSnapshot {
  const draftSnapshot = createWorkflowRunDraftSnapshot(draft);

  return {
    draft: draftSnapshot,
    executionGraph: createWorkflowExecutionGraph(draftSnapshot),
  };
}

function clonePlainData<TData extends WorkflowEdgeData | WorkflowNodeData | undefined>(
  data: TData,
): TData {
  if (!data) {
    return data;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }

  return JSON.parse(JSON.stringify(data)) as TData;
}
