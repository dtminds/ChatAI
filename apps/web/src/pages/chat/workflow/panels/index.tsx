import type { WorkflowEdge, WorkflowNodeConfigPatch, WorkflowNode } from "../types";
import { BasePanel } from "./base-panel";
import { getNodeDefinition } from "../node-definitions";
import type { NodeSettingsProps } from "./types";

export function NodeConfigPanel({
  edges,
  node,
  nodes,
  onClose,
  onNodeChange,
}: {
  edges: WorkflowEdge[];
  node?: WorkflowNode;
  nodes: WorkflowNode[];
  onClose: () => void;
  onNodeChange: (patch: WorkflowNodeConfigPatch) => void;
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
    <BasePanel node={node} onClose={onClose}>
      <NodeSettingsForm edges={edges} node={node} nodes={nodes} onNodeChange={onNodeChange} />
    </BasePanel>
  );
}

function NodeSettingsForm({ edges, node, nodes, onNodeChange }: NodeSettingsProps) {
  const SettingsPanel = getNodeDefinition(node.data.kind).settings;

  if (!SettingsPanel) {
    return null;
  }

  return <SettingsPanel edges={edges} node={node} nodes={nodes} onNodeChange={onNodeChange} />;
}
