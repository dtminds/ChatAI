import {
  getBranchPathTop,
  getDefaultBranchPathId,
  getWorkflowBranchPaths,
} from "./branch-paths";
import type {
  WorkflowNodeKind,
  WorkflowNodeRenderData,
} from "./types";

export type WorkflowSourceHandleDefinition = {
  id?: string;
  label?: string;
  top: number;
};

export function getNodeSourceHandleDefinitions(
  data: WorkflowNodeRenderData,
): WorkflowSourceHandleDefinition[] {
  if (data.kind === "goal") {
    return [];
  }

  if (data.kind === "branch") {
    return getWorkflowBranchPaths(data).map((branch) => ({
      id: branch.id,
      label: branch.label,
      top: getBranchPathTop(data, branch.id),
    }));
  }

  return [{ top: 16 }];
}

export function getDefaultSourceHandleId(
  kind: WorkflowNodeKind,
  data?: WorkflowNodeRenderData,
) {
  if (kind === "branch") {
    return getDefaultBranchPathId(data);
  }

  return undefined;
}
