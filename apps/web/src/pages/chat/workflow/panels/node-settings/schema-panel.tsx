import type { ReactNode } from "react";
import type { WorkflowNodeKind } from "../../types";
import { getNodeConfigSections } from "../../node-config-schema";
import { NodeConfigSchemaSections } from "../schema-fields";
import type { NodeSettingsProps } from "../types";

type SchemaNodeSettingsPanelProps<TKind extends WorkflowNodeKind> = NodeSettingsProps<TKind> & {
  children?: ReactNode;
  kind?: TKind;
};

export function SchemaNodeSettingsPanel<TKind extends WorkflowNodeKind>({
  children,
  kind,
  node,
  onNodeChange,
}: SchemaNodeSettingsPanelProps<TKind>) {
  const nodeKind = (kind ?? node.data.kind) as TKind;
  const sections = getNodeConfigSections(nodeKind);

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

export function createSchemaNodeSettingsPanel<TKind extends WorkflowNodeKind>(
  kind: TKind,
  renderAfterSchema?: (props: NodeSettingsProps<TKind>) => ReactNode,
) {
  const SchemaSettingsPanel = (props: NodeSettingsProps<TKind>) => (
    <SchemaNodeSettingsPanel kind={kind} {...props}>
      {renderAfterSchema?.(props)}
    </SchemaNodeSettingsPanel>
  );

  SchemaSettingsPanel.displayName = `${kind}SchemaNodeSettingsPanel`;

  return SchemaSettingsPanel;
}
