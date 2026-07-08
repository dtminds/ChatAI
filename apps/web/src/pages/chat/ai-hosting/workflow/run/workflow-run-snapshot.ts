import type {
  WorkflowDraft,
  WorkflowEdgeData,
  WorkflowNodeData,
} from "../types";
import { canonicalizeWorkflowDraft } from "../workflow-draft-normalizer";

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
