import type { WorkflowEdge, WorkflowNodeConfigPatch, WorkflowNode } from "../types";
import { BasePanel } from "./base-panel";
import { getNodeDefinition } from "../node-definitions";
import type { NodeSettingsProps } from "./types";
import { NodeOutputsSection } from "./node-outputs-section";
import { SettingWorkspace, SettingWorkspaceProvider } from "./setting-workspace";

export function NodeConfigPanel({
  animateOnMount,
  edges,
  node,
  nodes,
  onClose,
  onNodeChange,
  onRenameNode,
}: {
  animateOnMount?: boolean;
  edges: WorkflowEdge[];
  node?: WorkflowNode;
  nodes: WorkflowNode[];
  onClose: () => void;
  onNodeChange: (patch: WorkflowNodeConfigPatch) => void;
  onRenameNode: (nodeId: string, title: string) => void;
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
    <SettingWorkspaceProvider key={node.id}>
      <SettingWorkspace animateOnMount={animateOnMount}>
        <BasePanel node={node} onClose={onClose} onRenameNode={onRenameNode}>
          <NodeSettingsForm edges={edges} node={node} nodes={nodes} onNodeChange={onNodeChange} />
          {!getNodeDefinition(node.data.kind).ownsOutputConfiguration
            ? <NodeOutputsSection node={node} />
            : null}
        </BasePanel>
      </SettingWorkspace>
    </SettingWorkspaceProvider>
  );
}

function NodeSettingsForm({ edges, node, nodes, onNodeChange }: NodeSettingsProps) {
  const SettingsPanel = getNodeDefinition(node.data.kind).settings;

  if (!SettingsPanel) {
    return null;
  }

  return <SettingsPanel edges={edges} node={node} nodes={nodes} onNodeChange={onNodeChange} />;
}
