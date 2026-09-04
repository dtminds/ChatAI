import type { ComponentType } from "react";
import {
  orderedWorkflowNodeCatalog,
  workflowNodeCatalog,
} from "./node-catalog";
import type { WorkflowNodeDefinition } from "./nodes/definition-types";
import type { WorkflowNodeKind } from "./types";
import { workflowNodeUiBindings } from "./node-ui-bindings";
import type { WorkflowNodeUiBinding } from "./nodes/ui-types";
import type { NodeSettingsProps } from "./panels/types";

export {
  canDeleteNodeKind,
  canDuplicateNodeKind,
  canInsertAfterNodeKind,
  canInsertNodeKind,
  canRenameNodeKind,
  createDefaultNodeData,
  getInsertableNodeKindsBetween,
  getInsertableNodeKindsForSource,
  getPaletteItemsByKinds,
  getWorkflowNodeCatalogEntry,
  getWorkflowPaletteItemGroups,
  insertableNodeKinds,
  nodeVisuals,
  orderedWorkflowNodeCatalog,
  paletteItems,
  workflowNodeCatalog,
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

type NodeDefinition<TKind extends WorkflowNodeKind> = WorkflowNodeDefinition<TKind> & {
  body: WorkflowNodeUiBinding<TKind>["body"];
  settings: ComponentType<NodeSettingsProps<TKind>> | null;
};

type NodeDefinitionMap = {
  [TKind in WorkflowNodeKind]: NodeDefinition<TKind>;
};

export const nodeDefinitions = Object.fromEntries(
  Object.entries(workflowNodeCatalog).map(([kind, coreDefinition]) => [
    kind,
    {
      ...coreDefinition,
      ...workflowNodeUiBindings[kind as WorkflowNodeKind],
    },
  ]),
) as NodeDefinitionMap;

export const orderedNodeDefinitions = orderedWorkflowNodeCatalog.map(
  (definition) => nodeDefinitions[definition.kind],
);

export function getNodeDefinition<TKind extends WorkflowNodeKind>(kind: TKind) {
  return nodeDefinitions[kind] as unknown as NodeDefinition<TKind>;
}

export function hasNodeSettings(kind: WorkflowNodeKind) {
  return getNodeDefinition(kind).settings !== null;
}
