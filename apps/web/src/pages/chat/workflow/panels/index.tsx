import type {
  InspectorTab,
  WorkflowEdge,
  WorkflowNodeConfigPatch,
  WorkflowNode,
  WorkflowVariables,
} from "../types";
import { BasePanel } from "./base-panel";
import {
  NodeVariablesPanel,
} from "./inspector-tabs";
import { getNodeDefinition } from "../node-definitions";
import type { NodeSettingsProps } from "./types";

export function NodeConfigPanel({
  activeTab,
  edges,
  node,
  onClose,
  onNodeChange,
  onTabChange,
  variables,
}: {
  activeTab: InspectorTab;
  edges: WorkflowEdge[];
  node?: WorkflowNode;
  onClose: () => void;
  onNodeChange: (patch: WorkflowNodeConfigPatch) => void;
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

  if (!getNodeDefinition(node.data.kind).settings) {
    return null;
  }

  return (
    <BasePanel
      activeTab={activeTab}
      node={node}
      onClose={onClose}
      onTabChange={onTabChange}
    >
      {activeTab === "settings" ? (
        <NodeSettingsForm edges={edges} node={node} onNodeChange={onNodeChange} />
      ) : null}
      {activeTab === "variables" && variables ? <NodeVariablesPanel variables={variables} /> : null}
    </BasePanel>
  );
}

function NodeSettingsForm({ edges, node, onNodeChange }: NodeSettingsProps) {
  const SettingsPanel = getNodeDefinition(node.data.kind).settings;

  if (!SettingsPanel) {
    return null;
  }

  return <SettingsPanel edges={edges} node={node} onNodeChange={onNodeChange} />;
}
