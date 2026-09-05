import type { Edge, Node, Viewport } from "@xyflow/react";
import type {
  WorkflowAiCollectDraftConfig,
  WorkflowAiCollectField as SharedWorkflowAiCollectField,
  WorkflowAiCollectFieldType as SharedWorkflowAiCollectFieldType,
  WorkflowAiCollectTimeout as SharedWorkflowAiCollectTimeout,
  WorkflowAudienceFilterDraftConfig,
  WorkflowAiIntentDraftConfig,
  WorkflowBranchCondition as SharedWorkflowBranchCondition,
  WorkflowBranchConfig,
  WorkflowBranchConditionValue as SharedWorkflowBranchConditionValue,
  WorkflowBranchLogic as SharedWorkflowBranchLogic,
  WorkflowBranchOperator as SharedWorkflowBranchOperator,
  WorkflowBranchPath as SharedWorkflowBranchPath,
  WorkflowCustomerUpdateDraftConfig,
  WorkflowCouponDraftConfig,
  WorkflowIntentOption as SharedWorkflowIntentOption,
  WorkflowHandoffDraftConfig,
  WorkflowLlmDraftConfig,
  WorkflowLlmInputParameter as SharedWorkflowLlmInputParameter,
  WorkflowLlmInputValue as SharedWorkflowLlmInputValue,
  WorkflowLlmOutputConfig as SharedWorkflowLlmOutputConfig,
  WorkflowLlmOutputField as SharedWorkflowLlmOutputField,
  WorkflowLlmOutputFieldType as SharedWorkflowLlmOutputFieldType,
  WorkflowMessageDraftConfig,
  WorkflowMessageQueryConfig,
  WorkflowOrderBindDraftConfig,
  WorkflowOrderConversionDraftConfig,
  WorkflowOrderQueryDraftConfig,
  WorkflowRatioSplitDraftConfig,
  WorkflowTagDraftConfig,
  WorkflowTagQueryDraftConfig,
  WorkflowNodeKind as SharedWorkflowNodeKind,
  WorkflowNodeOutputUsage as SharedWorkflowNodeOutputUsage,
  WorkflowOutputValueType as SharedWorkflowOutputValueType,
  WorkflowTimeRange as SharedWorkflowTimeRange,
  WorkflowVariableContentSegment as SharedWorkflowVariableContentSegment,
  WorkflowVariableSelector as SharedWorkflowVariableSelector,
  WorkflowChatAiStartDraftConfig,
  WorkflowWeComStartDraftConfig,
  WorkflowWaitConfig,
  WorkflowWaitEventDraftConfig,
} from "@chatai/contracts";
import type { WorkflowNodeMetric } from "@chatai/contracts";
import type {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "./constants";

export type WorkflowNodeKind = SharedWorkflowNodeKind;
export type WorkflowNodeStatus = "ready" | "running" | "warning";
export type InsertableWorkflowNodeKind = Exclude<WorkflowNodeKind, "start" | "end">;

export type WorkflowBranchLogic = SharedWorkflowBranchLogic;
export type WorkflowBranchOperator = SharedWorkflowBranchOperator;
export type WorkflowBranchConditionValue = SharedWorkflowBranchConditionValue;
export type WorkflowBranchCondition = SharedWorkflowBranchCondition;
export type WorkflowBranchPath = SharedWorkflowBranchPath;

type WorkflowNodeDataBase<TKind extends WorkflowNodeKind> = Record<string, unknown> & {
  kind: TKind;
  label: string;
  metric: string;
  schemaVersion: number;
  status: WorkflowNodeStatus;
  title: string;
};

export type ChatAiStartNodeData = WorkflowNodeDataBase<"start"> & WorkflowChatAiStartDraftConfig;
export type WeComStartNodeData = WorkflowNodeDataBase<"start"> & WorkflowWeComStartDraftConfig;
export type StartNodeData = ChatAiStartNodeData | WeComStartNodeData;

export function isChatAiStartNodeData(data: StartNodeData): data is ChatAiStartNodeData {
  return Array.isArray(data.seatIds);
}

export function isWeComStartNodeData(data: StartNodeData): data is WeComStartNodeData {
  return Array.isArray(data.workUserIds);
}

export function getStartNodeSourceIds(data: StartNodeData): number[] {
  if (isChatAiStartNodeData(data)) return data.seatIds;
  if (isWeComStartNodeData(data)) return data.workUserIds;
  return [];
}

export type WaitNodeData = WorkflowNodeDataBase<"wait"> & WorkflowWaitConfig;

export type BranchNodeData = WorkflowNodeDataBase<"branch"> & WorkflowBranchConfig;
export type RatioSplitNodeData = WorkflowNodeDataBase<"ratio-split">
  & WorkflowRatioSplitDraftConfig;

export type WorkflowVariableScope =
  | "current-node-lifecycle"
  | "input"
  | "node"
  | "node-lifecycle"
  | "subject"
  | "trigger";
export type WorkflowVariableValueType = "boolean" | "datetime" | "message-id-list" | "number" | "object" | "string";
export type WorkflowVariableSelector = SharedWorkflowVariableSelector;
export type WorkflowNodeOutputUsage = SharedWorkflowNodeOutputUsage;
export type WorkflowOutputValueType = SharedWorkflowOutputValueType;

export type WorkflowTimeRange = SharedWorkflowTimeRange;

export type WorkflowVariableDefinition = {
  availableOnSourceHandles?: string[];
  description?: string;
  key: string;
  label: string;
  optional?: boolean;
  scope: WorkflowVariableScope;
  selector: WorkflowVariableSelector;
  sourceNodeId?: string;
  sourceNodeKind?: WorkflowNodeKind;
  sourceNodeTitle?: string;
  type: WorkflowVariableValueType;
  usages?: WorkflowNodeOutputUsage[];
  valueType: WorkflowOutputValueType;
};

export type WorkflowNodeOutputDefinition = {
  availableOnSourceHandles?: string[];
  description?: string;
  key: string;
  label: string;
  optional?: boolean;
  usages: WorkflowNodeOutputUsage[];
  valueType: WorkflowOutputValueType;
};

export type WorkflowVariableContentSegment = SharedWorkflowVariableContentSegment;

export type MessageNodeData = WorkflowNodeDataBase<"message"> & WorkflowMessageDraftConfig;
export type MessageQueryNodeData = WorkflowNodeDataBase<"message-query"> & WorkflowMessageQueryConfig;
export type WorkflowWaitEventType = "message.received";
export type WorkflowWaitEventDelayUnit = "day" | "hour" | "minute" | "second";
export type WorkflowWaitEventTimeoutUnit = "day" | "hour" | "minute";
export type WaitEventNodeData = WorkflowNodeDataBase<"wait-event"> & WorkflowWaitEventDraftConfig;
export type TagNodeData = WorkflowNodeDataBase<"tag"> & WorkflowTagDraftConfig;
export type CouponNodeData = WorkflowNodeDataBase<"coupon"> & WorkflowCouponDraftConfig;
export type HandoffNodeData = WorkflowNodeDataBase<"handoff"> & WorkflowHandoffDraftConfig;
export type AgentNodeData = WorkflowNodeDataBase<"agent">;
export type WorkflowLlmInputValue = SharedWorkflowLlmInputValue;
export type WorkflowLlmInputParameter = SharedWorkflowLlmInputParameter;
export type WorkflowLlmOutputFieldType = SharedWorkflowLlmOutputFieldType;
export type WorkflowLlmOutputField = SharedWorkflowLlmOutputField;
export type WorkflowLlmOutputConfig = SharedWorkflowLlmOutputConfig;
export type LlmNodeData = WorkflowNodeDataBase<"llm"> & WorkflowLlmDraftConfig;
export type OrderBindNodeData = WorkflowNodeDataBase<"order-bind"> & WorkflowOrderBindDraftConfig;
export type OrderQueryNodeData = WorkflowNodeDataBase<"order-query"> & WorkflowOrderQueryDraftConfig;
export type OrderConversionNodeData = WorkflowNodeDataBase<"order-conversion">
  & WorkflowOrderConversionDraftConfig;
export type TagQueryNodeData = WorkflowNodeDataBase<"tag-query"> & WorkflowTagQueryDraftConfig;
export type CustomerUpdateNodeData = WorkflowNodeDataBase<"customer-update">
  & WorkflowCustomerUpdateDraftConfig;
export type WorkflowAiCollectField = SharedWorkflowAiCollectField;
export type WorkflowAiCollectFieldType = SharedWorkflowAiCollectFieldType;
export type WorkflowAiCollectTimeout = SharedWorkflowAiCollectTimeout;
export type AiCollectNodeData = WorkflowNodeDataBase<"ai-collect"> & WorkflowAiCollectDraftConfig;
export type AudienceFilterNodeData = WorkflowNodeDataBase<"audience-filter">
  & WorkflowAudienceFilterDraftConfig;
export type WorkflowIntentOption = SharedWorkflowIntentOption;
export type AiIntentNodeData = WorkflowNodeDataBase<"ai-intent"> & WorkflowAiIntentDraftConfig;
export type EndNodeData = WorkflowNodeDataBase<"end">;

export type WorkflowNodeDataMap = {
  agent: AgentNodeData;
  "ai-collect": AiCollectNodeData;
  "ai-intent": AiIntentNodeData;
  "audience-filter": AudienceFilterNodeData;
  branch: BranchNodeData;
  coupon: CouponNodeData;
  "customer-update": CustomerUpdateNodeData;
  end: EndNodeData;
  handoff: HandoffNodeData;
  llm: LlmNodeData;
  message: MessageNodeData;
  "message-query": MessageQueryNodeData;
  "order-bind": OrderBindNodeData;
  "order-query": OrderQueryNodeData;
  "order-conversion": OrderConversionNodeData;
  "ratio-split": RatioSplitNodeData;
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
  availableMessageContentOutputs?: WorkflowVariableDefinition[];
  availableTimeReferences?: WorkflowVariableDefinition[];
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
  readOnly?: boolean;
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

export type WorkflowCanvasFocusRequest = {
  nodeId: string;
  sequence: number;
};

export type WorkflowPublishCheck = {
  blocksPublish: boolean;
  category: "connectivity" | "config" | "end" | "start";
  description: string;
  id: string;
  messages?: string[];
  nodeId?: string;
  nodeKind?: WorkflowNodeKind;
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
