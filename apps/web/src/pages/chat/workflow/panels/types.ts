import type {
  WorkflowEdge,
  WorkflowNodeConfigPatch,
  WorkflowNode,
} from "../types";

export type NodeSettingsProps = {
  edges: WorkflowEdge[];
  node: WorkflowNode;
  onNodeChange: (patch: WorkflowNodeConfigPatch) => void;
};
