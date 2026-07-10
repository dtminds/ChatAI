import type {
  WorkflowEdge,
  WorkflowNodeConfigPatch,
  WorkflowNode,
  WorkflowNodeKind,
} from "../types";

export type NodeSettingsProps<TKind extends WorkflowNodeKind = WorkflowNodeKind> = {
  edges: WorkflowEdge[];
  node: WorkflowNode<TKind>;
  onNodeChange: (patch: WorkflowNodeConfigPatch<TKind>) => void;
};
