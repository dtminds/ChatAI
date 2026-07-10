import {
  orderedWorkflowNodeCatalog,
  workflowNodeCatalog,
} from "./node-catalog";
import type {
  InsertableWorkflowNodeKind,
  WorkflowNodeData,
  WorkflowNodeKind,
} from "./types";
import type { WorkflowNodeDefinition } from "./nodes/definition-types";

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

export type NodeDefinitionCore<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  WorkflowNodeDefinition<TKind>;

export const nodeDefinitionCore = workflowNodeCatalog;

export const orderedNodeDefinitionCore = orderedWorkflowNodeCatalog.map(
  (definition) => nodeDefinitionCore[definition.kind],
);

export function getNodeDefinitionCore<TKind extends WorkflowNodeKind>(
  kind: TKind,
): NodeDefinitionCore<TKind> {
  return nodeDefinitionCore[kind] as unknown as WorkflowNodeDefinition<TKind>;
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

export function createDefaultNodeData<TKind extends WorkflowNodeKind>(
  kind: TKind,
): WorkflowNodeData<TKind> {
  return getNodeDefinitionCore(kind).createDefaultData();
}
