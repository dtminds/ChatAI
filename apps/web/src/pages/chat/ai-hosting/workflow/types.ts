import type { Edge, Node } from "@xyflow/react";

export type InspectorTab = "settings" | "run" | "variables";
export type MarketingNodeKind = "trigger" | "wait" | "branch" | "action" | "ai" | "goal";
export type MarketingNodeStatus = "ready" | "running" | "warning";
export type InsertableMarketingNodeKind = Exclude<MarketingNodeKind, "trigger" | "goal">;

export type MarketingNodeData = Record<string, unknown> & {
  actionType?: "message" | "coupon" | "tag" | "handoff" | "ai";
  agentName?: string;
  audience?: string;
  branchRule?: string;
  conversion?: number;
  delayDays?: number;
  kind: MarketingNodeKind;
  label: string;
  metric: string;
  status: MarketingNodeStatus;
  summary: string;
  title: string;
};

export type MarketingNodeRuntimeData = {
  insertMenuOpen?: boolean;
  insertMenuSourceHandle?: string;
  onInsertAfter?: (
    nodeId: string,
    kind: InsertableMarketingNodeKind,
    sourceHandle?: string,
  ) => void;
  onDelete?: (nodeId: string) => void;
  onToggleInsertMenu?: (nodeId: string, sourceHandle?: string) => void;
  onSelect?: (nodeId: string) => void;
  selected?: boolean;
};

export type MarketingNodeRenderData = MarketingNodeData & MarketingNodeRuntimeData;
export type MarketingWorkflowNode = Node<MarketingNodeData, "marketing">;
export type MarketingWorkflowRenderNode = Node<MarketingNodeRenderData, "marketing">;
export type MarketingEdgeHighlightState = "connected" | "dimmed";
export type MarketingEdgeData = Record<string, unknown> & {
  label?: string;
};
export type MarketingEdgeRuntimeData = {
  highlightState?: MarketingEdgeHighlightState;
  insertMenuOpen?: boolean;
  onInsertBetween?: (
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableMarketingNodeKind,
  ) => void;
  onDelete?: (edgeId: string) => void;
  onToggleInsertMenu?: (edgeId: string) => void;
};
export type MarketingEdgeRenderData = MarketingEdgeData & MarketingEdgeRuntimeData;
export type MarketingWorkflowEdge = Edge<MarketingEdgeData, "marketing">;
export type MarketingWorkflowRenderEdge = Edge<MarketingEdgeRenderData, "marketing">;

export type WorkflowDraft = {
  edges: MarketingWorkflowEdge[];
  nodes: MarketingWorkflowNode[];
};

export type QuickInsertTarget = {
  nodeId: string;
  sourceHandle?: string;
};

export type NodeRunRecord = {
  durationMs: number;
  finishedAt: string;
  input: string;
  logs: string[];
  output: string;
  status: "succeeded" | "waiting";
};

export type WorkflowVariable = {
  name: string;
  type: string;
  value: string;
};

export type WorkflowVariables = {
  inputs: WorkflowVariable[];
  outputs: WorkflowVariable[];
};

export type WorkflowPublishCheck = {
  description: string;
  id: string;
  status: "ready" | "warning";
  title: string;
};
