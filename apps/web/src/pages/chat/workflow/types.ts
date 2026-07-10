import type { Edge, Node, Viewport } from "@xyflow/react";
import type {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "./constants";

export type InspectorTab = "settings" | "variables";
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

type WorkflowNodeDataBase<TKind extends WorkflowNodeKind> = Record<string, unknown> & {
  kind: TKind;
  label: string;
  metric: string;
  schemaVersion: number;
  status: WorkflowNodeStatus;
  summary: string;
  title: string;
};

export type TriggerNodeData = WorkflowNodeDataBase<"trigger"> & {
  audience?: string;
  entryLimitSummary?: string;
  hostingAccountSummary?: string;
  repeatEntryEnabled?: boolean;
  sendWindow?: string;
};

export type WaitNodeData = WorkflowNodeDataBase<"wait"> & {
  delayDays?: number;
};

export type BranchNodeData = WorkflowNodeDataBase<"branch"> & {
  branchPaths?: WorkflowBranchPath[];
  branchRule?: string;
};

export type ActionNodeData = WorkflowNodeDataBase<"action"> & {
  actionType?: "message" | "coupon" | "tag" | "handoff";
};

export type AiNodeData = WorkflowNodeDataBase<"ai"> & {
  actionType?: "ai";
  agentName?: string;
  handoffRule?: string;
};

export type GoalNodeData = WorkflowNodeDataBase<"goal"> & {
  conversion?: number;
};

export type WorkflowNodeDataMap = {
  action: ActionNodeData;
  ai: AiNodeData;
  branch: BranchNodeData;
  goal: GoalNodeData;
  trigger: TriggerNodeData;
  wait: WaitNodeData;
};

export type WorkflowNodeData<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  WorkflowNodeDataMap[TKind];

type WorkflowNodeConfigPatchFor<TData> = TData extends WorkflowNodeData
  ? Omit<Partial<TData>, "kind" | "schemaVersion"> & {
      kind?: never;
      schemaVersion?: never;
    }
  : never;

export type WorkflowNodeConfigPatch<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  WorkflowNodeConfigPatchFor<WorkflowNodeData<TKind>>;

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

export type WorkflowNodeRenderData<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  WorkflowNodeData<TKind> & WorkflowNodeRuntimeData;
export type WorkflowNode<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  Node<WorkflowNodeData<TKind>, typeof WORKFLOW_NODE_TYPE>;
export type WorkflowRenderNode<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  Node<WorkflowNodeRenderData<TKind>, typeof WORKFLOW_NODE_TYPE>;
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
