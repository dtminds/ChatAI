import {
  getWorkflowNodeCatalogEntry,
} from "./node-catalog";
import type { MarketingNodeKind } from "./types";
import type {
  NodeConfigField,
  NodeConfigSection,
} from "./node-config-types";

export type {
  NodeConfigField,
  NodeConfigNumberField,
  NodeConfigSection,
  NodeConfigTextField,
  NodeConfigTextareaField,
} from "./node-config-types";

export const baseNodeConfigSections = [
  {
    fields: [
      {
        getValue: (data) => data.title,
        id: "workflow-node-title",
        kind: "text",
        label: "节点名称",
        toPatch: (value) => ({ title: value }),
      },
      {
        getValue: (data) => data.summary,
        id: "workflow-node-summary",
        kind: "textarea",
        label: "节点说明",
        minRows: 4,
        toPatch: (value) => ({ summary: value }),
      },
    ],
    id: "base",
    title: "基础信息",
  },
] satisfies NodeConfigSection[];

export function getNodeConfigSections(kind: MarketingNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).configSections;
}

export type WorkflowNodeConfigSchema = {
  baseSections: NodeConfigSection[];
  fields: NodeConfigField[];
  sections: NodeConfigSection[];
};
