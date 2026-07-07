import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  InspectorTab,
  MarketingNodeData,
  MarketingWorkflowNode,
  NodeRunRecord,
} from "../types";
import { BasePanel } from "./base-panel";
import { FieldGroup } from "./field-group";
import {
  LastRunPanel,
  NodeVariablesPanel,
} from "./inspector-tabs";
import { PanelComponentMap } from "./registry";
import type { NodeSettingsProps } from "./types";

export function NodeConfigPanel({
  activeTab,
  lastRun,
  node,
  onClose,
  onNodeChange,
  onRunNode,
  onTabChange,
}: {
  activeTab: InspectorTab;
  lastRun?: NodeRunRecord;
  node?: MarketingWorkflowNode;
  onClose: () => void;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
  onRunNode: () => void;
  onTabChange: (tab: InspectorTab) => void;
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
      {activeTab === "variables" ? <NodeVariablesPanel node={node} /> : null}
    </BasePanel>
  );
}

function NodeSettingsForm({ node, onNodeChange }: NodeSettingsProps) {
  const SettingsPanel = PanelComponentMap[node.data.kind];

  return (
    <>
      <FieldGroup title="基础信息">
        <div className="space-y-2">
          <Label htmlFor="workflow-node-title">节点名称</Label>
          <Input
            id="workflow-node-title"
            onChange={(event) =>
              onNodeChange({
                title: event.target.value,
              })
            }
            value={node.data.title}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workflow-node-summary">节点说明</Label>
          <Textarea
            className="min-h-20 resize-none"
            id="workflow-node-summary"
            onChange={(event) =>
              onNodeChange({
                summary: event.target.value,
              })
            }
            value={node.data.summary}
          />
        </div>
      </FieldGroup>

      <SettingsPanel node={node} onNodeChange={onNodeChange} />
    </>
  );
}
