import {
  WORKFLOW_TICKET_DESCRIPTION_MAX_LENGTH,
  WORKFLOW_TICKET_TITLE_MAX_LENGTH,
  type TicketPriority,
} from "@chatai/contracts";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import { getAvailableVariablesForNode } from "../../workflow-variables";
import {
  getVariableContentPreview,
  normalizeVariableContent,
} from "../variable-content/content";
import { VariableContentEditor } from "../variable-content/editor";

export function TicketCreateConfig({
  edges,
  node,
  nodes,
  onNodeChange,
  resources,
}: NodeSettingsProps<"ticket-create">) {
  const variables = getAvailableVariablesForNode(
    node.id,
    nodes,
    edges,
    resources?.customFields?.fields,
  );

  return (
    <>
      <WorkflowSettingsSection title={<><span>标题</span><span aria-hidden="true" className="ml-0.5 text-destructive">*</span></>}>
        <VariableContentEditor
          ariaLabel="工单标题"
          customFieldVisibility="all"
          maxLength={WORKFLOW_TICKET_TITLE_MAX_LENGTH}
          onChange={(ticketTitle) => {
            const preview = getVariableContentPreview(ticketTitle, variables);
            onNodeChange({
              metric: preview || "待配置标题",
              status: preview ? "ready" : "warning",
              ticketTitle,
            });
          }}
          placeholder="请输入工单标题，可插入变量"
          segments={normalizeVariableContent(node.data.ticketTitle)}
          variables={variables}
        />
      </WorkflowSettingsSection>
      <WorkflowSettingsSection title="描述">
        <VariableContentEditor
          ariaLabel="工单描述"
          customFieldVisibility="all"
          maxLength={WORKFLOW_TICKET_DESCRIPTION_MAX_LENGTH}
          onChange={description => onNodeChange({ description })}
          placeholder="补充处理背景或要求，可插入变量"
          segments={normalizeVariableContent(node.data.description)}
          variables={variables}
        />
      </WorkflowSettingsSection>
      <WorkflowSettingsSection title="优先级">
        <SegmentedControl
          aria-label="优先级"
          className="w-full"
          onValueChange={(value) => {
            if (value) onNodeChange({ priority: value as TicketPriority });
          }}
          type="single"
          value={node.data.priority}
        >
          <SegmentedControlItem value="low">低</SegmentedControlItem>
          <SegmentedControlItem value="medium">中</SegmentedControlItem>
          <SegmentedControlItem value="high">高</SegmentedControlItem>
        </SegmentedControl>
      </WorkflowSettingsSection>
    </>
  );
}
