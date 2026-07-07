import {
  baseNodeConfigSections,
} from "../node-config-schema";
import type {
  InspectorTab,
  WorkflowNodeData,
  WorkflowNode,
  NodeRunRecord,
  WorkflowVariables,
} from "../types";
import { BasePanel } from "./base-panel";
import {
  LastRunPanel,
  NodeVariablesPanel,
} from "./inspector-tabs";
import { PanelComponentMap } from "./registry";
import { NodeConfigSchemaSections } from "./schema-fields";
import type { NodeSettingsProps } from "./types";

export function NodeConfigPanel({
  activeTab,
  lastRun,
  node,
  onClose,
  onNodeChange,
  onRunNode,
  onTabChange,
  variables,
}: {
  activeTab: InspectorTab;
  lastRun?: NodeRunRecord;
  node?: WorkflowNode;
  onClose: () => void;
  onNodeChange: (patch: Partial<WorkflowNodeData>) => void;
  onRunNode: () => void;
  onTabChange: (tab: InspectorTab) => void;
  variables?: WorkflowVariables;
}) {
  if (!node) {
    return (
      <aside aria-label="节点配置" className="bg-background p-5" role="complementary">
        <p className="text-sm text-muted-foreground">请选择一个节点</p>
      </aside>
    );
  }

  return (
    <BasePanel
      activeTab={activeTab}
      node={node}
      onClose={onClose}
      onRunNode={onRunNode}
      onTabChange={onTabChange}
    >
      {activeTab === "settings" ? (
        <NodeSettingsForm node={node} onNodeChange={onNodeChange} />
      ) : null}
      {activeTab === "run" ? (
        <LastRunPanel lastRun={lastRun} node={node} onRunNode={onRunNode} />
      ) : null}
      {activeTab === "variables" && variables ? <NodeVariablesPanel variables={variables} /> : null}
    </BasePanel>
  );
}

function NodeSettingsForm({ node, onNodeChange }: NodeSettingsProps) {
  const SettingsPanel = PanelComponentMap[node.data.kind];

  return (
    <>
      <NodeConfigSchemaSections
        data={node.data}
        onNodeChange={onNodeChange}
        sections={baseNodeConfigSections}
      />

      <SettingsPanel node={node} onNodeChange={onNodeChange} />
    </>
  );
}
