import type { ComponentType } from "react";
import {
  getWorkflowNodeCatalogEntry,
  orderedWorkflowNodeCatalog,
  workflowNodeCatalog,
} from "./node-catalog";
import type {
  InsertableMarketingNodeKind,
  MarketingNodeKind,
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

type NodeDefinition = (typeof workflowNodeCatalog)[MarketingNodeKind] & {
  body: ComponentType<NodeBodyProps>;
  settings: ComponentType<NodeSettingsProps>;
};

export const nodeDefinitions = Object.fromEntries(
  Object.entries(workflowNodeCatalog).map(([kind, catalogEntry]) => [
    kind,
    {
      ...catalogEntry,
      ...workflowNodeUiBindings[kind as MarketingNodeKind],
    },
  ]),
) as Record<MarketingNodeKind, NodeDefinition>;

export const orderedNodeDefinitions = orderedWorkflowNodeCatalog.map(
  (definition) => nodeDefinitions[definition.kind],
);

export function getNodeDefinition(kind: MarketingNodeKind) {
  return nodeDefinitions[kind];
}

export function canDeleteNodeKind(kind: MarketingNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).canDelete;
}

export function canDuplicateNodeKind(kind: MarketingNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).canDuplicate;
}

export function canInsertAfterNodeKind(kind: MarketingNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).canInsertAfter;
}

export function canInsertNodeKind(kind: MarketingNodeKind): kind is InsertableMarketingNodeKind {
  return getWorkflowNodeCatalogEntry(kind).insertable;
}

export function createDefaultNodeData(kind: MarketingNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).createDefaultData();
}
