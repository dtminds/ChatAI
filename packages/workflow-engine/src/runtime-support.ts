import {
  workflowNodeContractRegistry,
  type WorkflowNodeKind,
} from "@chatai/contracts";

export type WorkflowRuntimeSupportedNodeKind =
  { [TKind in WorkflowNodeKind]:
    (typeof workflowNodeContractRegistry)[TKind]["maturity"] extends "runtime-ready"
      ? TKind
      : never;
  }[WorkflowNodeKind];

export const WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS = (
  Object.keys(workflowNodeContractRegistry) as WorkflowNodeKind[]
).filter(
  (kind): kind is WorkflowRuntimeSupportedNodeKind =>
    workflowNodeContractRegistry[kind].maturity === "runtime-ready",
);

const WORKFLOW_RUNTIME_SUPPORTED_NODE_KIND_SET = new Set<WorkflowNodeKind>(
  WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS,
);

export function isWorkflowRuntimeSupportedNodeKind(
  kind: WorkflowNodeKind,
): kind is WorkflowRuntimeSupportedNodeKind {
  return WORKFLOW_RUNTIME_SUPPORTED_NODE_KIND_SET.has(kind);
}
