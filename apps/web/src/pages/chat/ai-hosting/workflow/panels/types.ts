import type { WorkflowNodeData, WorkflowNode } from "../types";

export type NodeSettingsProps = {
  node: WorkflowNode;
  onNodeChange: (patch: Partial<WorkflowNodeData>) => void;
};
