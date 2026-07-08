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

export type WorkflowTargetHandleDefinition = {
  id?: string;
};

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
      .map((edge) => getSourceHandleKey(edge.sourceHandle)),
  );

  return getNodeSourceHandleDefinitions(node.data)
    .filter((handle) => !connectedSourceHandles.has(getSourceHandleKey(handle.id)));
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

export function getNodeSourceHandleIndex(
  data: WorkflowNodeRenderData | undefined,
  sourceHandle?: string | null,
) {
  const handles = data ? getNodeSourceHandleDefinitions(data) : [];
  const index = handles.findIndex((handle) =>
    (handle.id ?? null) === (sourceHandle ?? null),
  );

  return index >= 0 ? index : 0;
}

export function getNodeSourceHandleLabel(
  data: WorkflowNodeRenderData | undefined,
  sourceHandle?: string | null,
) {
  return data
    ? getNodeSourceHandleDefinitions(data).find((handle) =>
        (handle.id ?? null) === (sourceHandle ?? null),
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
  sourceHandle?: string,
) {
  return getNodeSourceHandleDefinitions(node.data)
    .find((handle) => handle.id === sourceHandle)
    ?.top ?? WORKFLOW_NODE_HANDLE_TOP;
}

function getSourceHandleKey(sourceHandle: string | null | undefined) {
  return sourceHandle ?? "__default__";
}
