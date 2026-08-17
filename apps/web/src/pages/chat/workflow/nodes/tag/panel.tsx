import { WORKFLOW_TAG_MAX_COUNT, type WorkflowTagOperation } from "@chatai/contracts";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
        <h3 className="mb-3 text-sm font-semibold text-foreground">标签操作</h3>
        <RadioGroup
          aria-label="标签操作方式"
          className="flex items-center gap-6"
          onValueChange={(value) => {
            if (value === "add" || value === "remove") {
              updateTag({ operation: value });
            }
          }}
          value={operation}
        >
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <RadioGroupItem value="add" />
            <span>添加标签</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <RadioGroupItem value="remove" />
            <span>移除标签</span>
          </label>
        </RadioGroup>
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
