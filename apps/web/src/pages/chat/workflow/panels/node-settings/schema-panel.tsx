import type { ReactNode } from "react";
import type { WorkflowNodeKind } from "../../types";
import {
  getNodeConfigSections,
  getWorkflowNodeConfigSchema,
} from "../../node-config-schema";
import { NodeConfigSchemaSections } from "../schema-fields";
import type { NodeSettingsProps } from "../types";

type SchemaNodeSettingsPanelProps = NodeSettingsProps & {
  children?: ReactNode;
  includeBase?: boolean;
  kind?: WorkflowNodeKind;
};

export function SchemaNodeSettingsPanel({
  children,
  includeBase = false,
  kind,
  node,
  onNodeChange,
}: SchemaNodeSettingsPanelProps) {
  const nodeKind = kind ?? node.data.kind;
  const sections = includeBase
    ? getWorkflowNodeConfigSchema(nodeKind).sections
    : getNodeConfigSections(nodeKind);

  return (
    <>
      <NodeConfigSchemaSections
        data={node.data}
        onNodeChange={onNodeChange}
        sections={sections}
      />
      {children}
    </>
  );
}

export function createSchemaNodeSettingsPanel(
  kind: WorkflowNodeKind,
  renderAfterSchema?: (props: NodeSettingsProps) => ReactNode,
) {
  const SchemaSettingsPanel = (props: NodeSettingsProps) => (
    <SchemaNodeSettingsPanel includeBase kind={kind} {...props}>
      {renderAfterSchema?.(props)}
    </SchemaNodeSettingsPanel>
  );

  SchemaSettingsPanel.displayName = `${kind}SchemaNodeSettingsPanel`;

  return SchemaSettingsPanel;
}
