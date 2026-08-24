import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { WorkflowAudienceGroupSnapshot } from "@chatai/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import { listWorkflowAudienceGroups } from "./api";
import {
  getWorkflowAudienceFilterMetric,
  isWorkflowAudienceFilterConfigured,
  normalizeWorkflowAudienceGroup,
} from "./config";

export function AudienceFilterConfig({ node, onNodeChange }: NodeSettingsProps<"audience-filter">) {
  const selectedGroup = normalizeWorkflowAudienceGroup(node.data.group);
  const [groups, setGroups] = useState<WorkflowAudienceGroupSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listWorkflowAudienceGroups()
      .then((nextGroups) => {
        if (!cancelled) setGroups(nextGroups);
      })
      .catch(() => {
        if (!cancelled) {
          setGroups([]);
          toast.error("操作失败，请稍后重试");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    if (!selectedGroup) return groups;
    return groups.some(group => group.id === selectedGroup.id)
      ? groups
      : [selectedGroup, ...groups];
  }, [groups, selectedGroup]);

  return (
    <WorkflowSettingsSection title="选择人群包">
      <Select
        onValueChange={(value) => {
          const group = options.find(item => String(item.id) === value);
          if (!group) return;
          onNodeChange({
            group,
            metric: getWorkflowAudienceFilterMetric(group),
            status: isWorkflowAudienceFilterConfigured(group) ? "ready" : "warning",
          });
        }}
        value={selectedGroup ? String(selectedGroup.id) : undefined}
      >
        <SelectTrigger aria-label="选择人群包" className="w-full">
          <SelectValue placeholder="请选择人群包" />
        </SelectTrigger>
        <SelectContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-2 py-3 text-sm text-muted-foreground" role="status">
              <Spinner />
              正在加载
            </div>
          ) : options.length === 0 ? (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">暂无数据</div>
          ) : options.map(group => (
            <SelectItem key={group.id} value={String(group.id)}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </WorkflowSettingsSection>
  );
}
