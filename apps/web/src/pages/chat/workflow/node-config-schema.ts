import { getNodeDefinitionCore } from "./node-definition-core";
import type {
  WorkflowNodeConfigPatch,
  WorkflowNodeKind,
} from "./types";
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

export const baseNodeConfigSections: NodeConfigSection<WorkflowNodeKind>[] = [
  {
    fields: [
      {
        getValue: (data) => data.title,
        id: "workflow-node-title",
        kind: "text",
        label: "节点名称",
        toPatch: (value) => ({ title: value }) as WorkflowNodeConfigPatch,
      },
      {
        getValue: (data) => data.summary,
        id: "workflow-node-summary",
        kind: "textarea",
        label: "节点说明",
        minRows: 4,
        toPatch: (value) => ({ summary: value }) as WorkflowNodeConfigPatch,
      },
    ],
    id: "base",
    title: "基础信息",
  },
];

export function getNodeConfigSections<TKind extends WorkflowNodeKind>(kind: TKind) {
  return getNodeDefinitionCore(kind).configSections as NodeConfigSection<TKind>[];
}

export type WorkflowNodeConfigSchema<TKind extends WorkflowNodeKind = WorkflowNodeKind> = {
  baseSections: NodeConfigSection<TKind>[];
  fields: NodeConfigField<TKind>[];
  nodeSections: NodeConfigSection<TKind>[];
  sections: NodeConfigSection<TKind>[];
};

export function getWorkflowNodeConfigSchema<TKind extends WorkflowNodeKind>(
  kind: TKind,
): WorkflowNodeConfigSchema<TKind> {
  const baseSections = baseNodeConfigSections as unknown as NodeConfigSection<TKind>[];
  const nodeSections = getNodeConfigSections(kind);
  const sections = [
    ...baseSections,
    ...nodeSections,
  ];

  return {
    baseSections,
    fields: sections.flatMap((section) => section.fields),
    nodeSections,
    sections,
  };
}
