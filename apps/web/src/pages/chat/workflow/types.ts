import type { Edge, Node, Viewport } from "@xyflow/react";
import type {
  WorkbenchQuickReplyAttachment,
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
  | "wait-event"
  | "branch"
  | "message"
  | "message-query"
  | "tag"
  | "coupon"
  | "handoff"
  | "agent"
  | "llm"
  | "order-query"
  | "tag-query"
  | "customer-update"
  | "ai-collect"
  | "ai-intent"
  | "end";
export type WorkflowNodeStatus = "ready" | "running" | "warning";
export type InsertableWorkflowNodeKind = Exclude<WorkflowNodeKind, "start" | "end">;

export type WorkflowBranchLogic = "all" | "any";
export type WorkflowBranchOperator =
  | "contains"
  | "datetime-after"
  | "datetime-after-or-equal"
  | "datetime-before"
  | "datetime-before-or-equal"
  | "datetime-between"
  | "ends-with"
  | "equals"
  | "greater-than"
  | "greater-than-or-equal"
  | "is-empty"
  | "is-false"
  | "is-not-empty"
  | "is-true"
  | "less-than"
  | "less-than-or-equal"
  | "not-contains"
  | "not-equals"
  | "starts-with";
export type WorkflowBranchConditionValue = boolean | number | string | [string, string];
export type WorkflowBranchCondition = {
  id: string;
  operator: WorkflowBranchOperator;
  selector?: WorkflowVariableSelector;
  value?: WorkflowBranchConditionValue;
};
export type WorkflowBranchPath = {
  conditions: WorkflowBranchCondition[];
  id: string;
  isDefault?: boolean;
  label: string;
  logic: WorkflowBranchLogic;
};

type WorkflowNodeDataBase<TKind extends WorkflowNodeKind> = Record<string, unknown> & {
  kind: TKind;
  label: string;
  metric: string;
  schemaVersion: number;
  status: WorkflowNodeStatus;
  title: string;
};

export type StartNodeData = WorkflowNodeDataBase<"start"> & {
  accountIds: string[];
  entryPolicy: WorkflowEntryPolicy;
  triggers: WorkflowStartTrigger[];
};

export type WaitNodeData = WorkflowNodeDataBase<"wait"> & WorkflowWaitConfig;

export type BranchNodeData = WorkflowNodeDataBase<"branch"> & {
  branchPaths: WorkflowBranchPath[];
};

export type WorkflowVariableScope = "customer" | "node" | "system" | "trigger";
export type WorkflowVariableValueType = "boolean" | "datetime" | "message-id-list" | "number" | "object" | "string";
export type WorkflowVariableSelector = string[];
export type WorkflowNodeOutputUsage = "intent-input" | "message-content" | "time-reference" | "variable";

export type WorkflowDynamicTimeReference =
  | {
      field: "occurredAt";
      kind: "workflow-trigger";
    }
  | {
      field: "enteredAt";
      kind: "current-node-lifecycle";
    }
  | {
      field: "enteredAt" | "exitedAt";
      kind: "node-lifecycle";
      nodeId: string;
    }
  | {
      kind: "node-output";
      selector: WorkflowVariableSelector;
    };

export type WorkflowTimeRange =
  | {
      endAt: string;
      mode: "fixed";
      startAt: string;
    }
  | {
      end: WorkflowDynamicTimeReference;
      mode: "dynamic";
      start: WorkflowDynamicTimeReference;
    };

export type WorkflowVariableDefinition = {
  availableOnSourceHandles?: string[];
  key: string;
  label: string;
  scope: WorkflowVariableScope;
  selector: WorkflowVariableSelector;
  sourceNodeId?: string;
  sourceNodeKind?: WorkflowNodeKind;
  sourceNodeTitle?: string;
  type: WorkflowVariableValueType;
  usages?: WorkflowNodeOutputUsage[];
};

export type WorkflowNodeOutputDefinition = {
  availableOnSourceHandles?: string[];
  key: string;
  label: string;
  type: WorkflowVariableValueType;
  usages: WorkflowNodeOutputUsage[];
};

export type WorkflowVariableContentSegment =
  | { type: "text"; value: string }
  | { selector: WorkflowVariableSelector; type: "variable" };

export type MessageNodeData = WorkflowNodeDataBase<"message"> & {
  attachments: WorkbenchQuickReplyAttachment[];
  content: WorkflowVariableContentSegment[];
  contentMode: "custom" | "node-output";
  outputSelector?: WorkflowVariableSelector;
};
export type MessageQueryNodeData = WorkflowNodeDataBase<"message-query"> & {
  limit: number;
  take: "earliest" | "latest";
  timeRange: WorkflowTimeRange;
};
export type WorkflowWaitEventType = "customer.message.received";
export type WorkflowWaitEventTimeoutUnit = "day" | "hour" | "minute";
export type WaitEventNodeData = WorkflowNodeDataBase<"wait-event"> & {
  event: {
    type: WorkflowWaitEventType;
  };
  timeout: {
    duration: number;
    unit: WorkflowWaitEventTimeoutUnit;
  };
};
export type TagNodeData = WorkflowNodeDataBase<"tag">;
export type CouponNodeData = WorkflowNodeDataBase<"coupon">;
export type HandoffNodeData = WorkflowNodeDataBase<"handoff"> & {
  customerMessage?: WorkflowVariableContentSegment[];
  operatorMessage?: WorkflowVariableContentSegment[];
};
export type AgentNodeData = WorkflowNodeDataBase<"agent">;
export type LlmNodeData = WorkflowNodeDataBase<"llm">;
export type OrderQueryNodeData = WorkflowNodeDataBase<"order-query">;
export type TagQueryNodeData = WorkflowNodeDataBase<"tag-query">;
export type CustomerUpdateNodeData = WorkflowNodeDataBase<"customer-update">;
export type AiCollectNodeData = WorkflowNodeDataBase<"ai-collect">;
export type WorkflowIntentOption = {
  description: string;
  id: string;
};
export type AiIntentNodeData = WorkflowNodeDataBase<"ai-intent"> & {
  advancedEnabled: boolean;
  inputSelector?: WorkflowVariableSelector;
  intents: WorkflowIntentOption[];
  prompt: string;
};
export type EndNodeData = WorkflowNodeDataBase<"end">;

export type WorkflowNodeDataMap = {
  agent: AgentNodeData;
  "ai-collect": AiCollectNodeData;
  "ai-intent": AiIntentNodeData;
  branch: BranchNodeData;
  coupon: CouponNodeData;
  "customer-update": CustomerUpdateNodeData;
  end: EndNodeData;
  handoff: HandoffNodeData;
  llm: LlmNodeData;
  message: MessageNodeData;
  "message-query": MessageQueryNodeData;
  "order-query": OrderQueryNodeData;
  start: StartNodeData;
  tag: TagNodeData;
  "tag-query": TagQueryNodeData;
  wait: WaitNodeData;
  "wait-event": WaitEventNodeData;
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
  availableIntentInputs?: WorkflowVariableDefinition[];
  availableTimeReferences?: {
    nodes: Array<{ id: string; title: string }>;
    outputs: WorkflowVariableDefinition[];
  };
  availableVariables?: WorkflowVariableDefinition[];
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
  onToggleInsertMenu?: (edgeId: string, open?: boolean) => void;
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
  availableVariables: WorkflowVariableDefinition[];
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
};
