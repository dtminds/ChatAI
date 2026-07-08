import type { ReactNode } from "react";
import type { WorkflowNodeKind } from "../../types";
import { getNodeConfigSections } from "../../node-config-schema";
import { NodeConfigSchemaSections } from "../schema-fields";
import type { NodeSettingsProps } from "../types";

type SchemaNodeSettingsPanelProps = NodeSettingsProps & {
  children?: ReactNode;
  kind?: WorkflowNodeKind;
};

export function SchemaNodeSettingsPanel({
  children,
  kind,
  node,
  onNodeChange,
}: SchemaNodeSettingsPanelProps) {
  return (
    <>
      <NodeConfigSchemaSections
        data={node.data}
        onNodeChange={onNodeChange}
        sections={getNodeConfigSections(kind ?? node.data.kind)}
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
    <SchemaNodeSettingsPanel kind={kind} {...props}>
      {renderAfterSchema?.(props)}
    </SchemaNodeSettingsPanel>
  );

  SchemaSettingsPanel.displayName = `${kind}SchemaNodeSettingsPanel`;

  return SchemaSettingsPanel;
}
