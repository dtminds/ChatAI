import type { ComponentType } from "react";
import {
  nodeDefinitionCore,
  orderedNodeDefinitionCore,
} from "./node-definition-core";
import type { NodeDefinitionCore } from "./node-definition-core";
import type { WorkflowNodeKind } from "./types";
import { workflowNodeUiBindings } from "./node-ui-bindings";
import type { WorkflowNodeUiBinding } from "./nodes/ui-types";
import type { NodeSettingsProps } from "./panels/types";

export {
  createDefaultNodeData,
  canDeleteNodeKind,
  canDuplicateNodeKind,
  canInsertAfterNodeKind,
  canInsertNodeKind,
  canRenameNodeKind,
  getInsertableNodeKindsBetween,
  getInsertableNodeKindsForSource,
  getNodeDefinitionCore,
  getPaletteItemsByKinds,
  getWorkflowPaletteItemGroups,
  insertableNodeKinds,
  nodeDefinitionCore,
  nodeVisuals,
  orderedNodeDefinitionCore,
  paletteItems,
  workflowNodePaletteGroups,
} from "./node-definition-core";
export type {
  NodeDefinitionCore,
  NodeVisual,
  WorkflowNodeCatalogEntry,
  WorkflowNodePaletteGroup,
  WorkflowNodePaletteGroupId,
  WorkflowPaletteItem,
  WorkflowPaletteItemGroup,
} from "./node-definition-core";

type NodeDefinition<TKind extends WorkflowNodeKind> = NodeDefinitionCore<TKind> & {
  body: WorkflowNodeUiBinding<TKind>["body"];
  settings: ComponentType<NodeSettingsProps<TKind>> | null;
};

type NodeDefinitionMap = {
  [TKind in WorkflowNodeKind]: NodeDefinition<TKind>;
};

export const nodeDefinitions = Object.fromEntries(
  Object.entries(nodeDefinitionCore).map(([kind, coreDefinition]) => [
    kind,
    {
      ...coreDefinition,
      ...workflowNodeUiBindings[kind as WorkflowNodeKind],
    },
  ]),
) as NodeDefinitionMap;

export const orderedNodeDefinitions = orderedNodeDefinitionCore.map(
  (definition) => nodeDefinitions[definition.kind],
);

export function getNodeDefinition<TKind extends WorkflowNodeKind>(kind: TKind) {
  return nodeDefinitions[kind] as unknown as NodeDefinition<TKind>;
}

export function hasNodeSettings(kind: WorkflowNodeKind) {
  return getNodeDefinition(kind).settings !== null;
}
