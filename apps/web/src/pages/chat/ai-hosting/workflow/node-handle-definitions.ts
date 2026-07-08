import {
  getBranchPathTop,
  getDefaultBranchPathId,
  getWorkflowBranchPaths,
} from "./branch-paths";
import type {
  WorkflowEdge,
  WorkflowNodeKind,
  WorkflowNode,
  WorkflowNodeRenderData,
} from "./types";

export type WorkflowSourceHandleDefinition = {
  id?: string;
  label?: string;
  outletKind: "branch-path" | "default";
  top: number;
};

export type WorkflowTargetHandleDefinition = {
  id?: string;
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
      outletKind: "branch-path",
      top: getBranchPathTop(data, branch.id),
    }));
  }

  return [{ outletKind: "default", top: 16 }];
}

export function getNodeTargetHandleDefinitions(
  data: WorkflowNodeRenderData,
): WorkflowTargetHandleDefinition[] {
  if (data.kind === "trigger") {
    return [];
  }

  return [{}];
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

export function getNodeUnconnectedSourceHandles(
  node: WorkflowNode,
  edges: WorkflowEdge[],
  options: {
    nodes?: WorkflowNode[];
  } = {},
): WorkflowSourceHandleDefinition[] {
  const nodeIds = options.nodes
    ? new Set(options.nodes.map((item) => item.id))
    : undefined;
  const connectedSourceHandles = new Set(
    edges
      .filter((edge) =>
        edge.source === node.id
        && typeof edge.sourceHandle === "string"
        && (!nodeIds || nodeIds.has(edge.target)),
      )
      .map((edge) => edge.sourceHandle),
  );

  return getNodeSourceHandleDefinitions(node.data)
    .filter((handle) => handle.id && !connectedSourceHandles.has(handle.id));
}

export function getNodeSourceOutletDefinition(
  node: WorkflowNode,
  sourceHandle?: string | null,
) {
  const handle = getNodeSourceHandleDefinitions(node.data).find((definition) =>
    (definition.id ?? null) === (sourceHandle ?? null),
  );

  if (!handle) {
    return null;
  }

  return {
    id: handle.id ?? "default",
    kind: handle.outletKind,
    label: handle.label,
  };
}
