import type { Edge, Node, Viewport } from "@xyflow/react";
import type {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "./constants";

export type InspectorTab = "settings" | "run" | "variables";
export type WorkflowNodeKind = "trigger" | "wait" | "branch" | "action" | "ai" | "goal";
export type WorkflowNodeStatus = "ready" | "running" | "warning";
export type InsertableWorkflowNodeKind = Exclude<WorkflowNodeKind, "trigger" | "goal">;

export type WorkflowBranchPath = {
  id: string;
  isDefault?: boolean;
  label: string;
  operator: "ELIF" | "ELSE" | "IF";
  title: string;
};

export type WorkflowNodeData = Record<string, unknown> & {
  actionType?: "message" | "coupon" | "tag" | "handoff" | "ai";
  agentName?: string;
  audience?: string;
  branchPaths?: WorkflowBranchPath[];
  branchRule?: string;
  conversion?: number;
  delayDays?: number;
  entryLimitSummary?: string;
  handoffRule?: string;
  hostingAccountSummary?: string;
  kind: WorkflowNodeKind;
  label: string;
  metric: string;
  repeatEntryEnabled?: boolean;
  status: WorkflowNodeStatus;
  summary: string;
  sendWindow?: string;
  title: string;
};

export type WorkflowNodeConfigPatch = Omit<Partial<WorkflowNodeData>, "kind"> & {
  kind?: never;
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
  onSelect?: (nodeId: string, options?: { additive?: boolean }) => void;
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
  viewport: Viewport;
};

export type QuickInsertTarget = {
  nodeId: string;
  sourceHandle?: string;
};

export type NodeRunRecord = {
  completedAt?: number;
  durationMs: number;
  errorMessage?: string;
  finishedAt: string;
  input: string;
  logs: string[];
  output: string;
  status: "failed" | "running" | "stopped" | "succeeded" | "waiting";
  startedAt?: number;
};

export type WorkflowRunTraceItem = {
  durationMs: number;
  errorMessage?: string;
  finishedAt: string;
  logs: string[];
  nodeId: string;
  nodeTitle: string;
  nodeType: WorkflowNodeKind;
  startedAt: string;
  status: NodeRunRecord["status"];
};

export type WorkflowRunRecord = {
  createdAt: string;
  draft: WorkflowDraft;
  durationMs: number;
  errorMessage?: string;
  finishedAt: string;
  id: string;
  inputs: Record<string, unknown>;
  nodeRuns: Record<string, NodeRunRecord>;
  outputs: Record<string, unknown>;
  status: "failed" | "running" | "stopped" | "succeeded";
  totalTokens: number;
  title: string;
  totalNodes: number;
  totalSteps: number;
  trace: WorkflowRunTraceItem[];
};

export type WorkflowVariable = {
  name: string;
  scope?: "node" | "system";
  selector?: string[];
  sourceNodeId?: string;
  sourceNodeTitle?: string;
  type: string;
  value: string;
};

export type WorkflowVariables = {
  inputs: WorkflowVariable[];
  outputs: WorkflowVariable[];
};

export type WorkflowPublishCheck = {
  blocksPublish: boolean;
  blocksRun: boolean;
  category: "connectivity" | "config" | "goal" | "trigger";
  description: string;
  id: string;
  messages?: string[];
  nodeId?: string;
  status: "warning";
  title: string;
};

export type WorkflowPublishCheckSummaryItem = {
  blocksPublish: boolean;
  blocksRun: boolean;
  description: string;
  id: "trigger" | "connectivity" | "config" | "goal";
  status: "ready" | "warning";
  title: string;
};

export type WorkflowNodeValidationIssue = {
  code: string;
  message: string;
  severity: "warning";
  source: "catalog" | "config" | "graph";
};

export type WorkflowNodeValidationContext = {
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
};
