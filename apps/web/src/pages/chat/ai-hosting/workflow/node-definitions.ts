import type { ComponentType } from "react";
import {
  orderedWorkflowNodeCatalog,
  workflowNodeCatalog,
} from "./node-catalog";
import type {
  WorkflowNodeRenderData,
  InsertableWorkflowNodeKind,
  WorkflowNodeKind,
} from "./types";
import type {
  WorkflowSourceHandleDefinition,
  WorkflowTargetHandleDefinition,
} from "./node-handle-definitions";
import {
  getNodeSourceHandleDefinitions,
  getNodeTargetHandleDefinitions,
} from "./node-handle-definitions";
import type { NodeBodyProps } from "./nodes/types";
import { workflowNodeUiBindings } from "./node-ui-bindings";
import type { NodeSettingsProps } from "./panels/types";

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

type NodeDefinition = (typeof workflowNodeCatalog)[WorkflowNodeKind] & {
  body: ComponentType<NodeBodyProps>;
  getSourceHandles: (data: WorkflowNodeRenderData) => WorkflowSourceHandleDefinition[];
  getTargetHandles: (data: WorkflowNodeRenderData) => WorkflowTargetHandleDefinition[];
  settings: ComponentType<NodeSettingsProps>;
};

export const nodeDefinitions = Object.fromEntries(
  Object.entries(workflowNodeCatalog).map(([kind, catalogEntry]) => [
    kind,
    {
      ...catalogEntry,
      ...workflowNodeUiBindings[kind as WorkflowNodeKind],
      getSourceHandles: getNodeSourceHandleDefinitions,
      getTargetHandles: getNodeTargetHandleDefinitions,
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
  return getNodeDefinition(kind).canDelete;
}

export function canDuplicateNodeKind(kind: WorkflowNodeKind) {
  return getNodeDefinition(kind).canDuplicate;
}

export function canInsertAfterNodeKind(kind: WorkflowNodeKind) {
  return getNodeDefinition(kind).canInsertAfter;
}

export function canInsertNodeKind(kind: WorkflowNodeKind): kind is InsertableWorkflowNodeKind {
  return getNodeDefinition(kind).insertable;
}

export function createDefaultNodeData(kind: WorkflowNodeKind) {
  return getNodeDefinition(kind).createDefaultData();
}
