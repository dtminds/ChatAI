import {
  orderedWorkflowNodeCatalog,
  workflowNodeCatalog,
} from "./node-catalog";
import type {
  InsertableWorkflowNodeKind,
  WorkflowNodeKind,
  WorkflowNodeRenderData,
} from "./types";
import type {
  WorkflowSourceHandleDefinition,
  WorkflowTargetHandleDefinition,
} from "./node-handle-definitions";
import {
  getNodeSourceHandleDefinitions,
  getNodeTargetHandleDefinitions,
} from "./node-handle-definitions";

export {
  getInsertableNodeKindsBetween,
  getInsertableNodeKindsForSource,
  getPaletteItemsByKinds,
  getWorkflowPaletteItemGroups,
  insertableNodeKinds,
  nodeVisuals,
  paletteItems,
  workflowNodePaletteGroups,
} from "./node-catalog";
export type {
  NodeVisual,
  WorkflowNodeCatalogEntry,
  WorkflowNodePaletteGroup,
  WorkflowNodePaletteGroupId,
  WorkflowPaletteItem,
  WorkflowPaletteItemGroup,
} from "./node-catalog";

export type NodeDefinitionCore = (typeof workflowNodeCatalog)[WorkflowNodeKind] & {
  getSourceHandles: (data: WorkflowNodeRenderData) => WorkflowSourceHandleDefinition[];
  getTargetHandles: (data: WorkflowNodeRenderData) => WorkflowTargetHandleDefinition[];
};

export const nodeDefinitionCore = Object.fromEntries(
  Object.entries(workflowNodeCatalog).map(([kind, catalogEntry]) => [
    kind,
    {
      ...catalogEntry,
      getSourceHandles: getNodeSourceHandleDefinitions,
      getTargetHandles: getNodeTargetHandleDefinitions,
    },
  ]),
) as Record<WorkflowNodeKind, NodeDefinitionCore>;

export const orderedNodeDefinitionCore = orderedWorkflowNodeCatalog.map(
  (definition) => nodeDefinitionCore[definition.kind],
);

export function getNodeDefinitionCore(kind: WorkflowNodeKind) {
  return nodeDefinitionCore[kind];
}

export function canDeleteNodeKind(kind: WorkflowNodeKind) {
  return getNodeDefinitionCore(kind).canDelete;
}

export function canDuplicateNodeKind(kind: WorkflowNodeKind) {
  return getNodeDefinitionCore(kind).canDuplicate;
}

export function canInsertAfterNodeKind(kind: WorkflowNodeKind) {
  return getNodeDefinitionCore(kind).canInsertAfter;
}

export function canInsertNodeKind(kind: WorkflowNodeKind): kind is InsertableWorkflowNodeKind {
  return getNodeDefinitionCore(kind).insertable;
}

export function createDefaultNodeData(kind: WorkflowNodeKind) {
  return getNodeDefinitionCore(kind).createDefaultData();
}
