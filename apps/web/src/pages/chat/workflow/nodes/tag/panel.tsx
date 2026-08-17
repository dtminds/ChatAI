import { WORKFLOW_TAG_MAX_COUNT, type WorkflowTagOperation } from "@chatai/contracts";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { WecomTagSelector } from "@/pages/chat/components/wecom-tag-selector";
import type { NodeSettingsProps } from "../../panels/types";
import {
  getWorkflowTagMetric,
  normalizeWorkflowTagIds,
  normalizeWorkflowTagOperation,
} from "./config";

export function TagConfig({ node, onNodeChange }: NodeSettingsProps<"tag">) {
  const operation = normalizeWorkflowTagOperation(node.data.operation);
  const tagIds = normalizeWorkflowTagIds(node.data.tagIds);

  const updateTag = ({
    operation: nextOperation = operation,
    tagIds: nextTagIds = tagIds,
  }: {
    operation?: WorkflowTagOperation;
    tagIds?: number[];
  }) => {
    onNodeChange({
      metric: getWorkflowTagMetric(nextOperation, nextTagIds),
      operation: nextOperation,
      status: nextTagIds.length > 0 ? "ready" : "warning",
      tagIds: nextTagIds,
    });
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">标签操作</h3>
          <SegmentedControl
            aria-label="标签操作方式"
            className="h-9 rounded-full p-1"
            onValueChange={(value) => {
              if (value === "add" || value === "remove") {
                updateTag({ operation: value });
              }
            }}
            type="single"
            value={operation}
          >
            <SegmentedControlItem
              className="h-7 w-auto rounded-full px-3 text-xs font-medium data-[state=on]:bg-foreground data-[state=on]:text-background"
              value="add"
            >
              添加
            </SegmentedControlItem>
            <SegmentedControlItem
              className="h-7 w-auto rounded-full px-3 text-xs font-medium data-[state=on]:bg-foreground data-[state=on]:text-background"
              value="remove"
            >
              移除
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">客户标签</h3>
        <WecomTagSelector
          allowCrossGroup
          maxSelected={WORKFLOW_TAG_MAX_COUNT}
          multiple
          onChange={(value) => updateTag({ tagIds: normalizeWorkflowTagIds(value) })}
          value={tagIds}
        />
      </section>
    </div>
  );
}
