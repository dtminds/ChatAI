import { getNodeDefinitionCore } from "./node-definition-core";
import type { WorkflowNodeKind } from "./types";
import type {
  NodeConfigField,
  NodeConfigSection,
} from "./node-config-types";

export type {
  NodeConfigField,
  NodeConfigNumberField,
  NodeConfigOptionCard,
  NodeConfigOptionCardsField,
  NodeConfigSection,
  NodeConfigSwitchField,
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

export function getNodeConfigSections(kind: WorkflowNodeKind) {
  return getNodeDefinitionCore(kind).configSections;
}

export type WorkflowNodeConfigSchema = {
  baseSections: NodeConfigSection[];
  fields: NodeConfigField[];
  nodeSections: NodeConfigSection[];
  sections: NodeConfigSection[];
};

export function getWorkflowNodeConfigSchema(kind: WorkflowNodeKind): WorkflowNodeConfigSchema {
  const nodeSections = getNodeConfigSections(kind);
  const sections = [
    ...baseNodeConfigSections,
    ...nodeSections,
  ];

  return {
    baseSections: baseNodeConfigSections,
    fields: sections.flatMap((section) => section.fields),
    nodeSections,
    sections,
  };
}
