import type {
  MarketingNodeKind,
  WorkflowDraft,
} from "./types";

export type WorkflowNodeIdGenerator = (kind: MarketingNodeKind) => string;

let workflowNodeIdSequence = 0;

export function createWorkflowNodeId(kind: MarketingNodeKind) {
  workflowNodeIdSequence += 1;
  return `${kind}-${workflowNodeIdSequence.toString(36)}`;
}

export function createUniqueWorkflowNodeIdFactory(
  draft: WorkflowDraft,
  generator: WorkflowNodeIdGenerator = createWorkflowNodeId,
) {
  const reservedNodeIds = new Set(draft.nodes.map((node) => node.id));

  return (kind: MarketingNodeKind) => {
    let candidate = generator(kind);
    let suffix = 1;

    while (reservedNodeIds.has(candidate)) {
      candidate = `${generator(kind)}-${suffix}`;
      suffix += 1;
    }

    reservedNodeIds.add(candidate);
    return candidate;
  };
}
