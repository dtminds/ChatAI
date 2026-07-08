import type {
  WorkflowEdge,
  WorkflowNodeData,
  WorkflowNode,
} from "../types";

export type NodeSettingsProps = {
  edges: WorkflowEdge[];
  node: WorkflowNode;
  onNodeChange: (patch: Partial<WorkflowNodeData>) => void;
};
