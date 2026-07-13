import type { Edge, Node, Viewport } from "@xyflow/react";
import type {
  WorkflowEntryPolicy,
  WorkflowStartTrigger,
  WorkflowWaitConfig,
} from "@chatai/contracts";
import type { WorkflowNodeMetric } from "@chatai/contracts";
import type {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "./constants";

export type WorkflowNodeKind =
  | "start"
  | "wait"
  | "branch"
  | "message"
  | "tag"
  | "coupon"
  | "handoff"
  | "end";
export type WorkflowNodeStatus = "ready" | "running" | "warning";
export type InsertableWorkflowNodeKind = Exclude<WorkflowNodeKind, "start" | "end">;

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

export type StartNodeData = WorkflowNodeDataBase<"start"> & {
  accountIds: string[];
  entryPolicy: WorkflowEntryPolicy;
  triggers: WorkflowStartTrigger[];
};

export type WaitNodeData = WorkflowNodeDataBase<"wait"> & WorkflowWaitConfig;

export type BranchNodeData = WorkflowNodeDataBase<"branch"> & {
  branchPaths?: WorkflowBranchPath[];
  branchRule?: string;
};

export type WorkflowVariableScope = "customer" | "node" | "system" | "trigger";
export type WorkflowVariableValueType = "boolean" | "datetime" | "number" | "object" | "string";
export type WorkflowVariableSelector = string[];

export type WorkflowVariableDefinition = {
  key: string;
  label: string;
  scope: WorkflowVariableScope;
  selector: WorkflowVariableSelector;
  sourceNodeId?: string;
  sourceNodeKind?: WorkflowNodeKind;
  sourceNodeTitle?: string;
  type: WorkflowVariableValueType;
};

export type WorkflowNodeOutputDefinition = {
  key: string;
  label: string;
  type: WorkflowVariableValueType;
};

export type WorkflowMessageContentSegment =
  | { type: "text"; value: string }
  | { selector: WorkflowVariableSelector; type: "variable" };

export type MessageNodeData = WorkflowNodeDataBase<"message"> & {
  content?: WorkflowMessageContentSegment[];
};
export type TagNodeData = WorkflowNodeDataBase<"tag">;
export type CouponNodeData = WorkflowNodeDataBase<"coupon">;
export type HandoffNodeData = WorkflowNodeDataBase<"handoff">;
export type EndNodeData = WorkflowNodeDataBase<"end">;

export type WorkflowNodeDataMap = {
  branch: BranchNodeData;
  coupon: CouponNodeData;
  end: EndNodeData;
  handoff: HandoffNodeData;
  message: MessageNodeData;
  start: StartNodeData;
  tag: TagNodeData;
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
  dataMetric?: WorkflowNodeMetric;
  insertMenuOpen?: boolean;
  insertMenuSourceHandle?: string;
  onDuplicate?: (nodeId: string) => void;
  onInsertAfter?: (
    nodeId: string,
    kind: InsertableWorkflowNodeKind,
    sourceHandle?: string,
  ) => void;
  onRename?: (nodeId: string, title: string) => void;
  onDelete?: (nodeId: string) => void;
  onDataMetricClick?: (nodeId: string) => void;
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

export type WorkflowPublishCheck = {
  blocksPublish: boolean;
  category: "connectivity" | "config" | "end" | "start";
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
  id: "start" | "connectivity" | "config" | "end";
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
