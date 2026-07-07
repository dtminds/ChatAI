import type { MarketingNodeData, MarketingWorkflowNode } from "../types";

export type NodeSettingsProps = {
  node: MarketingWorkflowNode;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
};
