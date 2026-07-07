import type { ComponentType } from "react";
import {
  getWorkflowNodeCatalogEntry,
  orderedWorkflowNodeCatalog,
  workflowNodeCatalog,
} from "./node-catalog";
import type {
  InsertableMarketingNodeKind,
  MarketingNodeKind,
  MarketingWorkflowNode,
  WorkflowVariables,
} from "./types";
import type { NodeBodyProps } from "./nodes/node-bodies";
import {
  BranchNodeBody,
  StandardNodeBody,
} from "./nodes/node-bodies";
import {
  ActionConfig,
  AiReceptionConfig,
  BranchConfig,
  GoalConfig,
  TriggerConfig,
  WaitConfig,
} from "./panels/node-settings";
import type { NodeSettingsProps } from "./panels/types";

export {
  insertableNodeKinds,
  nodeVisuals,
  paletteItems,
} from "./node-catalog";
export type { NodeVisual, WorkflowNodeCatalogEntry } from "./node-catalog";

type NodeDefinition = (typeof workflowNodeCatalog)[MarketingNodeKind] & {
  body: ComponentType<NodeBodyProps>;
  settings: ComponentType<NodeSettingsProps>;
};

const NodeBodyComponentMap: Record<MarketingNodeKind, ComponentType<NodeBodyProps>> = {
  action: StandardNodeBody,
  ai: StandardNodeBody,
  branch: BranchNodeBody,
  goal: StandardNodeBody,
  trigger: StandardNodeBody,
  wait: StandardNodeBody,
};

const NodeSettingsComponentMap: Record<MarketingNodeKind, ComponentType<NodeSettingsProps>> = {
  action: ActionConfig,
  ai: AiReceptionConfig,
  branch: BranchConfig,
  goal: GoalConfig,
  trigger: TriggerConfig,
  wait: WaitConfig,
};

export const nodeDefinitions = Object.fromEntries(
  Object.entries(workflowNodeCatalog).map(([kind, catalogEntry]) => [
    kind,
    {
      ...catalogEntry,
      body: NodeBodyComponentMap[kind as MarketingNodeKind],
      settings: NodeSettingsComponentMap[kind as MarketingNodeKind],
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

export function getNodeVariables(node: MarketingWorkflowNode): WorkflowVariables {
  return {
    inputs: [
      {
        name: "customer.profile",
        type: "object",
        value: node.data.audience ?? "上游客户画像",
      },
      {
        name: "journey.currentNode",
        type: "string",
        value: node.data.title,
      },
    ],
    outputs: [
      {
        name: `${node.data.kind}.result`,
        type: "object",
        value: node.data.metric,
      },
      {
        name: "journey.next",
        type: "string",
        value: node.data.kind === "goal" ? "退出旅程" : "进入下一节点",
      },
    ],
  };
}
