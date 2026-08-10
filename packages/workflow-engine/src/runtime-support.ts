import type { WorkflowNodeKind } from "@chatai/contracts";

export const WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS = [
  "start",
  "wait",
  "end",
] as const satisfies readonly WorkflowNodeKind[];

export type WorkflowRuntimeSupportedNodeKind =
  (typeof WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS)[number];

const WORKFLOW_RUNTIME_SUPPORTED_NODE_KIND_SET = new Set<WorkflowNodeKind>(
  WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS,
);

export function isWorkflowRuntimeSupportedNodeKind(
  kind: WorkflowNodeKind,
): kind is WorkflowRuntimeSupportedNodeKind {
  return WORKFLOW_RUNTIME_SUPPORTED_NODE_KIND_SET.has(kind);
}
