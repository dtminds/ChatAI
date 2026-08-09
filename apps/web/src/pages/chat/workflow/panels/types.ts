import type {
  WorkflowEntryEventType,
} from "@chatai/contracts";
import type {
  WorkflowEdge,
  WorkflowNodeConfigPatch,
  WorkflowNode,
  WorkflowNodeKind,
} from "../types";

export type NodeSettingsProps<TKind extends WorkflowNodeKind = WorkflowNodeKind> = {
  allowedEntryEventTypes?: readonly WorkflowEntryEventType[];
  edges: WorkflowEdge[];
  node: WorkflowNode<TKind>;
  nodes: WorkflowNode[];
  onNodeChange: (patch: WorkflowNodeConfigPatch<TKind>) => void;
};
