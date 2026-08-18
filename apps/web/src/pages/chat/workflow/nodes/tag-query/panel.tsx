import {
  WORKFLOW_TAG_QUERY_MAX_COUNT,
  type WorkflowTagQueryMatchMode,
} from "@chatai/contracts";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { WecomTagSelector } from "@/pages/chat/components/wecom-tag-selector";
import type { NodeSettingsProps } from "../../panels/types";
import {
  getWorkflowTagQueryMetric,
  normalizeWorkflowTagQueryIds,
  normalizeWorkflowTagQueryMatchMode,
} from "./config";

export function TagQueryConfig({ node, onNodeChange }: NodeSettingsProps<"tag-query">) {
  const matchMode = normalizeWorkflowTagQueryMatchMode(node.data.matchMode);
  const tagIds = normalizeWorkflowTagQueryIds(node.data.tagIds);

  const updateQuery = ({
    matchMode: nextMatchMode = matchMode,
    tagIds: nextTagIds = tagIds,
  }: {
    matchMode?: WorkflowTagQueryMatchMode;
    tagIds?: number[];
  }) => {
    onNodeChange({
      matchMode: nextMatchMode,
      metric: getWorkflowTagQueryMetric(nextMatchMode, nextTagIds),
      status: nextTagIds.length > 0 ? "ready" : "warning",
      tagIds: nextTagIds,
    });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">客户标签</h3>
        <WecomTagSelector
          allowCrossGroup
          maxSelected={WORKFLOW_TAG_QUERY_MAX_COUNT}
          multiple
          onChange={(value) => updateQuery({
            tagIds: normalizeWorkflowTagQueryIds(value),
          })}
          value={tagIds}
        />
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">匹配方式</h3>
        <RadioGroup
          aria-label="标签匹配方式"
          className="flex items-center gap-6"
          onValueChange={(value) => {
            if (value === "any" || value === "all" || value === "none") {
              updateQuery({ matchMode: value });
            }
          }}
          value={matchMode}
        >
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <RadioGroupItem value="any" />
            <span>满足任一</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <RadioGroupItem value="all" />
            <span>满足全部</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <RadioGroupItem value="none" />
            <span>均不包含</span>
          </label>
        </RadioGroup>
      </section>
    </div>
  );
}
