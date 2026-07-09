import {
  WORKFLOW_BRANCH_NODE_ESTIMATED_HEIGHT,
  WORKFLOW_BRANCH_NODE_WIDTH,
  WORKFLOW_NODE_ESTIMATED_HEIGHT,
  WORKFLOW_NODE_WIDTH,
} from "../constants";
import type {
  WorkflowNode,
  WorkflowNodeData,
  WorkflowNodeKind,
  WorkflowNodeStatus,
  WorkflowNodeValidationIssue,
  WorkflowVariable,
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

type NodeDataInput = {
  actionType?: WorkflowNodeData["actionType"];
  agentName?: string;
  audience?: string;
  branchPaths?: WorkflowNodeData["branchPaths"];
  branchRule?: string;
  conversion?: number;
  delayDays?: number;
  entryLimitSummary?: string;
  handoffRule?: string;
  hostingAccountSummary?: string;
  label: string;
  metric: string;
  repeatEntryEnabled?: boolean;
  status?: WorkflowNodeStatus;
  summary: string;
  sendWindow?: string;
  title: string;
};

export const sourceNodeKinds: WorkflowNodeKind[] = ["trigger", "wait", "branch", "action", "ai"];
export const targetNodeKinds: WorkflowNodeKind[] = ["wait", "branch", "action", "ai", "goal"];

export const standardNodeLayout: WorkflowNodeLayoutMetrics = {
  estimatedHeight: WORKFLOW_NODE_ESTIMATED_HEIGHT,
  width: WORKFLOW_NODE_WIDTH,
};

export const branchNodeLayout: WorkflowNodeLayoutMetrics = {
  estimatedHeight: WORKFLOW_BRANCH_NODE_ESTIMATED_HEIGHT,
  width: WORKFLOW_BRANCH_NODE_WIDTH,
};

export function createNodeData(
  kind: WorkflowNodeKind,
  data: NodeDataInput,
): WorkflowNodeData {
  return {
    ...data,
    kind,
    status: data.status ?? "ready",
  };
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
  data: WorkflowNodeData,
): WorkflowSourceHandleDefinition[] {
  return getWorkflowBranchPaths(data).map((branch) => ({
    id: branch.id,
    label: branch.label,
    outletKind: "branch-path",
    top: getBranchPathTop(data, branch.id),
  }));
}

export function createDefaultTargetHandles(): WorkflowTargetHandleDefinition[] {
  return [{}];
}

export function createNoTargetHandles(): WorkflowTargetHandleDefinition[] {
  return [];
}

export function createDefaultOutputVariables(node: WorkflowNode): WorkflowVariable[] {
  return [
    {
      name: "result",
      type: "object",
      value: node.data.metric,
    },
    {
      name: "journey.next",
      type: "string",
      value: node.data.kind === "goal" ? "退出旅程" : "进入下一节点",
    },
  ];
}
