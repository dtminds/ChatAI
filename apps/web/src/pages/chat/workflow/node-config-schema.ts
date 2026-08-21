import { getWorkflowNodeCatalogEntry } from "./node-catalog";
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

export function getNodeConfigSections<TKind extends WorkflowNodeKind>(kind: TKind) {
  return getWorkflowNodeCatalogEntry(kind).configSections as NodeConfigSection<TKind>[];
}

export type WorkflowNodeConfigSchema<TKind extends WorkflowNodeKind = WorkflowNodeKind> = {
  fields: NodeConfigField<TKind>[];
  nodeSections: NodeConfigSection<TKind>[];
  sections: NodeConfigSection<TKind>[];
};

export function getWorkflowNodeConfigSchema<TKind extends WorkflowNodeKind>(
  kind: TKind,
): WorkflowNodeConfigSchema<TKind> {
  const nodeSections = getNodeConfigSections(kind);
  const sections = nodeSections;

  return {
    fields: sections.flatMap((section) => section.fields),
    nodeSections,
    sections,
  };
}
