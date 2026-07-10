import { getNodeDefinitionCore } from "./node-definition-core";
import { WORKFLOW_NODE_HANDLE_TOP } from "./constants";
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

export type WorkflowSourceOutletDefinition = {
  id: string;
  kind: WorkflowSourceHandleDefinition["outletKind"];
  label?: string;
};

export type WorkflowTargetHandleDefinition = {
  id?: string;
  maxConnections?: number;
};

export const WORKFLOW_DEFAULT_HANDLE_KEY = "__default__";

export function getWorkflowHandleKey(handleId: string | null | undefined) {
  return handleId ?? WORKFLOW_DEFAULT_HANDLE_KEY;
}

export function isWorkflowHandleIdEqual(
  firstHandleId: string | null | undefined,
  secondHandleId: string | null | undefined,
) {
  return getWorkflowHandleKey(firstHandleId) === getWorkflowHandleKey(secondHandleId);
}

export function getNodeSourceHandleDefinitions(
  data: WorkflowNodeRenderData,
): WorkflowSourceHandleDefinition[] {
  return getNodeDefinitionCore(data.kind).getSourceHandles(data);
}

export function getNodeTargetHandleDefinitions(
  data: WorkflowNodeRenderData,
): WorkflowTargetHandleDefinition[] {
  return getNodeDefinitionCore(data.kind).getTargetHandles(data);
}

export function getNodeTargetHandleCapacity(
  data: WorkflowNodeRenderData,
) {
  return getNodeTargetHandleDefinitions(data).reduce(
    (capacity, handle) => capacity + (handle.maxConnections ?? 1),
    0,
  );
}

export function getNodeTargetHandleConnectionCapacity(
  data: WorkflowNodeRenderData,
  targetHandle?: string | null,
) {
  return getNodeTargetHandleDefinitions(data).find((handle) =>
    isWorkflowHandleIdEqual(handle.id, targetHandle),
  )?.maxConnections ?? 1;
}

export function getDefaultSourceHandleId(
  kind: WorkflowNodeKind,
  data?: WorkflowNodeRenderData,
) {
  return getNodeDefinitionCore(kind).getSourceHandles(data ?? getNodeDefinitionCore(kind).createDefaultData())
    .find((handle) => typeof handle.id === "string")
    ?.id;
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
        && (!nodeIds || nodeIds.has(edge.target)),
      )
      .map((edge) => getWorkflowHandleKey(edge.sourceHandle)),
  );

  return getNodeSourceHandleDefinitions(node.data)
    .filter((handle) => !connectedSourceHandles.has(getWorkflowHandleKey(handle.id)));
}

export function getNodeSourceOutletDefinition(
  node: WorkflowNode,
  sourceHandle?: string | null,
): WorkflowSourceOutletDefinition | null {
  const handle = getNodeSourceHandleDefinitions(node.data).find((definition) =>
    isWorkflowHandleIdEqual(definition.id, sourceHandle),
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

export function getNodeSourceHandleIndex(
  data: WorkflowNodeRenderData | undefined,
  sourceHandle?: string | null,
) {
  const handles = data ? getNodeSourceHandleDefinitions(data) : [];
  const index = handles.findIndex((handle) =>
    isWorkflowHandleIdEqual(handle.id, sourceHandle),
  );

  return index >= 0 ? index : 0;
}

export function getNodeSourceHandleLabel(
  data: WorkflowNodeRenderData | undefined,
  sourceHandle?: string | null,
) {
  return data
    ? getNodeSourceHandleDefinitions(data).find((handle) =>
        isWorkflowHandleIdEqual(handle.id, sourceHandle),
      )?.label
    : undefined;
}

export function getNodeSourceHandleLaneOffset(
  node: WorkflowNode | undefined,
  sourceHandle?: string | null,
) {
  const handles = node ? getNodeSourceHandleDefinitions(node.data) : [];

  if (handles.length <= 1) {
    return 0;
  }

  return getNodeSourceHandleIndex(node?.data, sourceHandle) - (handles.length - 1) / 2;
}

export function getNodeSourceHandleTop(
  node: WorkflowNode,
  sourceHandle?: string | null,
) {
  return getNodeSourceHandleDefinitions(node.data)
    .find((handle) => isWorkflowHandleIdEqual(handle.id, sourceHandle))
    ?.top ?? WORKFLOW_NODE_HANDLE_TOP;
}
