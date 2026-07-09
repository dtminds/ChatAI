import type {
  InspectorTab,
  WorkflowEdge,
  WorkflowNodeConfigPatch,
  WorkflowNode,
  NodeRunRecord,
  WorkflowVariables,
} from "../types";
import { BasePanel } from "./base-panel";
import {
  LastRunPanel,
  NodeVariablesPanel,
} from "./inspector-tabs";
import { getNodeDefinition } from "../node-definitions";
import type { NodeSettingsProps } from "./types";

export function NodeConfigPanel({
  activeTab,
  edges,
  lastRun,
  node,
  onClose,
  onNodeChange,
  onRunNode,
  onTabChange,
  readOnlyRunMode = false,
  variables,
}: {
  activeTab: InspectorTab;
  edges: WorkflowEdge[];
  lastRun?: NodeRunRecord;
  node?: WorkflowNode;
  onClose: () => void;
  onNodeChange: (patch: WorkflowNodeConfigPatch) => void;
  onRunNode: () => void;
  onTabChange: (tab: InspectorTab) => void;
  readOnlyRunMode?: boolean;
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
      onTabChange={readOnlyRunMode ? () => undefined : onTabChange}
    >
      {activeTab === "settings" && !readOnlyRunMode ? (
        <NodeSettingsForm edges={edges} node={node} onNodeChange={onNodeChange} />
      ) : null}
      {activeTab === "run" || readOnlyRunMode ? (
        <LastRunPanel lastRun={lastRun} node={node} onRunNode={onRunNode} />
      ) : null}
      {activeTab === "variables" && variables && !readOnlyRunMode ? <NodeVariablesPanel variables={variables} /> : null}
    </BasePanel>
  );
}

function NodeSettingsForm({ edges, node, onNodeChange }: NodeSettingsProps) {
  const SettingsPanel = getNodeDefinition(node.data.kind).settings;

  return <SettingsPanel edges={edges} node={node} onNodeChange={onNodeChange} />;
}
