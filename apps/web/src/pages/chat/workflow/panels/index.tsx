import type { WorkflowEntryEventType } from "@chatai/contracts";
import type { ComponentProps } from "react";
import type { WorkflowEdge, WorkflowNodeConfigPatch, WorkflowNode } from "../types";
import { BasePanel } from "./base-panel";
import { getNodeDefinition } from "../node-definitions";
import type { NodeSettingsProps } from "./types";
import { NodeOutputsSection } from "./node-outputs-section";
import { SettingWorkspace, SettingWorkspaceProvider, useSettingWorkspace } from "./setting-workspace";
import { LlmTestWorkspaceTrigger } from "../nodes/llm/test-workspace";
import { AiIntentTestWorkspaceTrigger } from "../nodes/ai-intent/test-workspace";
import type { WorkflowNodeTestContext } from "./types";

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
  resources,
  testContext,
  workflowId,
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
  resources?: NodeSettingsProps["resources"];
  testContext?: WorkflowNodeTestContext;
  workflowId?: string;
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
        <GuardedBasePanel
          headerActions={testContext
            ? node.data.kind === "llm"
              ? <LlmTestWorkspaceTrigger nodeId={node.id} />
              : node.data.kind === "ai-intent"
                ? <AiIntentTestWorkspaceTrigger nodeId={node.id} />
                : undefined
            : undefined}
          node={node}
          onClose={onClose}
          onRenameNode={onRenameNode}
          readOnly={readOnly}
        >
          <fieldset
            className="min-w-0 border-0 p-0 disabled:cursor-default"
            disabled={readOnly}
            inert={readOnly}
          >
            <NodeSettingsForm
              allowedEntryEventTypes={allowedEntryEventTypes}
              edges={edges}
              node={node}
              nodes={nodes}
              onNodeChange={onNodeChange}
              resources={resources}
              testContext={testContext}
              workflowId={workflowId}
            />
            {!getNodeDefinition(node.data.kind).ownsOutputConfiguration
              ? <NodeOutputsSection node={node} />
              : null}
          </fieldset>
        </GuardedBasePanel>
      </SettingWorkspace>
    </SettingWorkspaceProvider>
  );
}

function GuardedBasePanel({ onClose, ...props }: ComponentProps<typeof BasePanel>) {
  const { requestClose } = useSettingWorkspace();
  return <BasePanel {...props} onClose={() => requestClose(onClose)} />;
}

function NodeSettingsForm(props: NodeSettingsProps) {
  const { node } = props;
  const SettingsPanel = getNodeDefinition(node.data.kind).settings;

  if (!SettingsPanel) {
    return null;
  }

  return <SettingsPanel {...props} />;
}
