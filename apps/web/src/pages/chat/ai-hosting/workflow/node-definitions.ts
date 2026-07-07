import type { ComponentType } from "react";
import {
  getWorkflowNodeCatalogEntry,
  orderedWorkflowNodeCatalog,
  workflowNodeCatalog,
} from "./node-catalog";
import type {
  InsertableWorkflowNodeKind,
  WorkflowNodeKind,
} from "./types";
import type { NodeBodyProps } from "./nodes/node-bodies";
import { workflowNodeUiBindings } from "./node-ui-bindings";
import type { NodeSettingsProps } from "./panels/types";

export {
  getInsertableNodeKindsBetween,
  getInsertableNodeKindsForSource,
  getPaletteItemsByKinds,
  insertableNodeKinds,
  nodeVisuals,
  paletteItems,
} from "./node-catalog";
export type { NodeVisual, WorkflowNodeCatalogEntry } from "./node-catalog";

type NodeDefinition = (typeof workflowNodeCatalog)[WorkflowNodeKind] & {
  body: ComponentType<NodeBodyProps>;
  settings: ComponentType<NodeSettingsProps>;
};

export const nodeDefinitions = Object.fromEntries(
  Object.entries(workflowNodeCatalog).map(([kind, catalogEntry]) => [
    kind,
    {
      ...catalogEntry,
      ...workflowNodeUiBindings[kind as WorkflowNodeKind],
    },
  ]),
) as Record<WorkflowNodeKind, NodeDefinition>;

export const orderedNodeDefinitions = orderedWorkflowNodeCatalog.map(
  (definition) => nodeDefinitions[definition.kind],
);

export function getNodeDefinition(kind: WorkflowNodeKind) {
  return nodeDefinitions[kind];
}

export function canDeleteNodeKind(kind: WorkflowNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).canDelete;
}

export function canDuplicateNodeKind(kind: WorkflowNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).canDuplicate;
}

export function canInsertAfterNodeKind(kind: WorkflowNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).canInsertAfter;
}

export function canInsertNodeKind(kind: WorkflowNodeKind): kind is InsertableWorkflowNodeKind {
  return getWorkflowNodeCatalogEntry(kind).insertable;
}

export function createDefaultNodeData(kind: WorkflowNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).createDefaultData();
}
