import type { Edge, Node } from "@xyflow/react";
import type {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "./constants";

export type InspectorTab = "settings" | "run" | "variables";
export type WorkflowNodeKind = "trigger" | "wait" | "branch" | "action" | "ai" | "goal";
export type WorkflowNodeStatus = "ready" | "running" | "warning";
export type InsertableWorkflowNodeKind = Exclude<WorkflowNodeKind, "trigger" | "goal">;

export type WorkflowNodeData = Record<string, unknown> & {
  actionType?: "message" | "coupon" | "tag" | "handoff" | "ai";
  agentName?: string;
  audience?: string;
  branchRule?: string;
  conversion?: number;
  delayDays?: number;
  kind: WorkflowNodeKind;
  label: string;
  metric: string;
  status: WorkflowNodeStatus;
  summary: string;
  title: string;
};

export type WorkflowNodeRuntimeData = {
  insertMenuOpen?: boolean;
  insertMenuSourceHandle?: string;
  onDuplicate?: (nodeId: string) => void;
  onInsertAfter?: (
    nodeId: string,
    kind: InsertableWorkflowNodeKind,
    sourceHandle?: string,
  ) => void;
  onDelete?: (nodeId: string) => void;
  onToggleInsertMenu?: (nodeId: string, sourceHandle?: string) => void;
  onSelect?: (nodeId: string) => void;
  selected?: boolean;
};

export type WorkflowNodeRenderData = WorkflowNodeData & WorkflowNodeRuntimeData;
export type WorkflowNode = Node<WorkflowNodeData, typeof WORKFLOW_NODE_TYPE>;
export type WorkflowRenderNode = Node<WorkflowNodeRenderData, typeof WORKFLOW_NODE_TYPE>;
export type WorkflowEdgeHighlightState = "connected" | "dimmed";
export type WorkflowEdgeData = Record<string, unknown> & {
  label?: string;
};
export type WorkflowEdgeRuntimeData = {
  highlightState?: WorkflowEdgeHighlightState;
  insertMenuOpen?: boolean;
  insertableNodeKinds?: InsertableWorkflowNodeKind[];
  onInsertBetween?: (
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: InsertableWorkflowNodeKind,
  ) => void;
  onToggleInsertMenu?: (edgeId: string) => void;
};
export type WorkflowEdgeRenderData = WorkflowEdgeData & WorkflowEdgeRuntimeData;
export type WorkflowEdge = Edge<WorkflowEdgeData, typeof WORKFLOW_EDGE_TYPE>;
export type WorkflowRenderEdge = Edge<WorkflowEdgeRenderData, typeof WORKFLOW_EDGE_TYPE>;

export type WorkflowDraft = {
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
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
  messages?: string[];
  nodeId?: string;
  status: "ready" | "warning";
  title: string;
};

export type WorkflowNodeValidationIssue = {
  code: string;
  message: string;
  severity: "warning";
  source: "catalog" | "runtime";
};

export type WorkflowNodeValidationContext = {
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
};
