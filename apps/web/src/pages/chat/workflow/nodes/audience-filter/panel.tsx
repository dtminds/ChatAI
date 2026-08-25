import type { WorkflowAudienceFilterMatchMode } from "@chatai/contracts";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import { AudienceGroupSelector } from "./audience-group-selector";
import {
  getWorkflowAudienceFilterMetric,
  isWorkflowAudienceFilterConfigured,
  normalizeWorkflowAudienceFilterMatchMode,
  normalizeWorkflowAudienceGroups,
} from "./config";

export function AudienceFilterConfig({ node, onNodeChange }: NodeSettingsProps<"audience-filter">) {
  const matchMode = normalizeWorkflowAudienceFilterMatchMode(node.data.matchMode);
  const groups = normalizeWorkflowAudienceGroups(node.data.groups);

  const updateFilter = ({
    groups: nextGroups = groups,
    matchMode: nextMatchMode = matchMode,
  }: {
    groups?: typeof groups;
    matchMode?: WorkflowAudienceFilterMatchMode;
  }) => {
    onNodeChange({
      groups: nextGroups,
      matchMode: nextMatchMode,
      metric: getWorkflowAudienceFilterMetric(nextMatchMode, nextGroups),
      status: isWorkflowAudienceFilterConfigured(nextGroups) ? "ready" : "warning",
    });
  };

  return (
    <>
      <WorkflowSettingsSection title="选择人群包">
        <AudienceGroupSelector
          onChange={(value) => updateFilter({
            groups: normalizeWorkflowAudienceGroups(value),
          })}
          value={groups}
        />
      </WorkflowSettingsSection>

      <WorkflowSettingsSection title="匹配方式">
        <RadioGroup
          aria-label="人群包匹配方式"
          className="flex items-center gap-6"
          onValueChange={(value) => {
            if (value === "any" || value === "all" || value === "none") {
              updateFilter({ matchMode: value });
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
      </WorkflowSettingsSection>
    </>
  );
}
