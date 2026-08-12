import type { WorkflowEntryEventType } from "@chatai/contracts";
import type { WorkflowEdge, WorkflowNodeConfigPatch, WorkflowNode } from "../types";
import { BasePanel } from "./base-panel";
import { getNodeDefinition } from "../node-definitions";
import type { NodeSettingsProps } from "./types";
import { NodeOutputsSection } from "./node-outputs-section";
import { SettingWorkspace, SettingWorkspaceProvider } from "./setting-workspace";

export function NodeConfigPanel({
  allowedEntryEventTypes,
  animateOnMount,
  edges,
  node,
  nodes,
  onClose,
  onNodeChange,
  onRenameNode,
  readOnly = false,
}: {
  allowedEntryEventTypes: readonly WorkflowEntryEventType[];
  animateOnMount?: boolean;
  edges: WorkflowEdge[];
  node?: WorkflowNode;
  nodes: WorkflowNode[];
  onClose: () => void;
  onNodeChange: (patch: WorkflowNodeConfigPatch) => void;
  onRenameNode: (nodeId: string, title: string) => void;
  readOnly?: boolean;
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
        <BasePanel node={node} onClose={onClose} onRenameNode={onRenameNode} readOnly={readOnly}>
          <fieldset
            className="min-w-0 space-y-4 border-0 p-0 disabled:cursor-default"
            disabled={readOnly}
            inert={readOnly}
          >
            <NodeSettingsForm
              allowedEntryEventTypes={allowedEntryEventTypes}
              edges={edges}
              node={node}
              nodes={nodes}
              onNodeChange={onNodeChange}
            />
            {!getNodeDefinition(node.data.kind).ownsOutputConfiguration
              ? <NodeOutputsSection node={node} />
              : null}
          </fieldset>
        </BasePanel>
      </SettingWorkspace>
    </SettingWorkspaceProvider>
  );
}

function NodeSettingsForm(props: NodeSettingsProps) {
  const { node } = props;
  const SettingsPanel = getNodeDefinition(node.data.kind).settings;

  if (!SettingsPanel) {
    return null;
  }

  return <SettingsPanel {...props} />;
}
