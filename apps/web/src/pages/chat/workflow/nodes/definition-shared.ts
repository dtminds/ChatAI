import {
  WORKFLOW_BRANCH_NODE_ESTIMATED_HEIGHT,
  WORKFLOW_BRANCH_NODE_WIDTH,
  WORKFLOW_COMPACT_NODE_ESTIMATED_HEIGHT,
  WORKFLOW_NODE_ESTIMATED_HEIGHT,
  WORKFLOW_NODE_WIDTH,
  WORKFLOW_TERMINAL_NODE_ESTIMATED_HEIGHT,
} from "../constants";
import type {
  BranchNodeData,
  WorkflowNodeData,
  WorkflowNodeDataMap,
  WorkflowNodeKind,
  WorkflowNodeStatus,
  WorkflowNodeValidationIssue,
} from "../types";
import {
  getBranchPathTop,
  getWorkflowBranchPaths,
} from "../branch-paths";
import type {
  WorkflowSourceHandleDefinition,
  WorkflowTargetHandleDefinition,
} from "../node-handle-definitions";
import type { WorkflowNodeLayoutMetrics } from "./definition-types";

type NodeDataInput<TKind extends WorkflowNodeKind> = Omit<
  WorkflowNodeDataMap[TKind],
  "kind" | "schemaVersion" | "status"
> & {
  status?: WorkflowNodeStatus;
};

export const sourceNodeKinds: WorkflowNodeKind[] = [
  "start",
  "wait",
  "branch",
  "message",
  "tag",
  "coupon",
  "handoff",
];
export const targetNodeKinds: WorkflowNodeKind[] = [
  "wait",
  "branch",
  "message",
  "tag",
  "coupon",
  "handoff",
  "end",
];

export const standardNodeLayout: WorkflowNodeLayoutMetrics = {
  estimatedHeight: WORKFLOW_NODE_ESTIMATED_HEIGHT,
  width: WORKFLOW_NODE_WIDTH,
};

export const compactNodeLayout: WorkflowNodeLayoutMetrics = {
  estimatedHeight: WORKFLOW_COMPACT_NODE_ESTIMATED_HEIGHT,
  width: WORKFLOW_NODE_WIDTH,
};

export const terminalNodeLayout: WorkflowNodeLayoutMetrics = {
  estimatedHeight: WORKFLOW_TERMINAL_NODE_ESTIMATED_HEIGHT,
  width: WORKFLOW_NODE_WIDTH,
};

export const branchNodeLayout: WorkflowNodeLayoutMetrics = {
  estimatedHeight: WORKFLOW_BRANCH_NODE_ESTIMATED_HEIGHT,
  width: WORKFLOW_BRANCH_NODE_WIDTH,
};

export function createNodeData<TKind extends WorkflowNodeKind>(
  kind: TKind,
  schemaVersion: number,
  data: NodeDataInput<TKind>,
): WorkflowNodeData<TKind> {
  return {
    ...data,
    kind,
    schemaVersion,
    status: data.status ?? "ready",
  } as WorkflowNodeData<TKind>;
}

export function pickDefinedWorkflowConfig(config: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  );
}

export function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function createCatalogIssue(
  code: string,
  message: string,
): WorkflowNodeValidationIssue {
  return {
    code,
    message,
    severity: "warning",
    source: "catalog",
  };
}

export function createDefaultSourceHandles(): WorkflowSourceHandleDefinition[] {
  return [{ outletKind: "default", top: 16 }];
}

export function createNoSourceHandles(): WorkflowSourceHandleDefinition[] {
  return [];
}

export function createBranchSourceHandles(
  data: BranchNodeData,
): WorkflowSourceHandleDefinition[] {
  return getWorkflowBranchPaths(data).map((branch) => ({
    id: branch.id,
    label: branch.label,
    outletKind: "branch-path",
    top: getBranchPathTop(data, branch.id),
  }));
}

export function createDefaultTargetHandles(): WorkflowTargetHandleDefinition[] {
  return [{ maxConnections: Number.POSITIVE_INFINITY }];
}

export function createNoTargetHandles(): WorkflowTargetHandleDefinition[] {
  return [];
}
