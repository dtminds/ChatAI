import {
  WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT,
  type WorkflowMarketingMessageWait,
} from "@chatai/contracts";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import { getMarketingMessageMetric, normalizeMarketingMessageWait, normalizeMarketingPlan } from "./config";
import { MarketingPlanSelector } from "./plan-selector";

export function MarketingMessageConfig({
  node,
  onNodeChange,
  workflowType,
}: NodeSettingsProps<"marketing-message">) {
  const plan = normalizeMarketingPlan(node.data.plan);
  const wait = normalizeMarketingMessageWait(node.data.wait);
  const update = (nextPlan = plan, nextWait = wait) => onNodeChange({
    ...(nextPlan ? { plan: nextPlan } : {}),
    wait: nextWait,
    metric: getMarketingMessageMetric(nextPlan),
    status: nextPlan ? "ready" : "warning",
  });

  return <>
    <WorkflowSettingsSection
      actions={workflowType === "wecom_sop"
        ? <Button className="h-auto p-0 text-[13px]" disabled type="button" variant="link">去创建</Button>
        : undefined}
      title="触达任务"
    >
      <MarketingPlanSelector onChange={value => update(value, wait)} value={plan} />
    </WorkflowSettingsSection>
    <WorkflowSettingsSection title="等待时长">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-foreground">
        <span>等待</span>
        <BoundedInput
          max={WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT[wait.unit]}
          onChange={duration => update(plan, { ...wait, duration })}
          value={wait.duration}
        />
        <Select
          onValueChange={(unit: WorkflowMarketingMessageWait["unit"]) => update(plan, {
            duration: Math.min(wait.duration, WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT[unit]),
            unit,
          })}
          value={wait.unit}
        >
          <SelectTrigger aria-label="等待时间单位" className="h-9 w-24"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="minute">分钟</SelectItem><SelectItem value="hour">小时</SelectItem></SelectContent>
        </Select>
        <span>后继续执行下一节点</span>
      </div>
    </WorkflowSettingsSection>
  </>;
}

function BoundedInput({ max, onChange, value }: { max: number; onChange(value: number): void; value: number }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Math.trunc(Number(draft));
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : 1;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return <Input
    aria-label="等待时长"
    className="h-9 w-24 text-[13px] md:text-[13px]"
    max={max}
    min={1}
    onBlur={commit}
    onChange={(event) => {
      setDraft(event.target.value);
      const parsed = Number(event.target.value);
      if (/^\d+$/.test(event.target.value) && parsed >= 1 && parsed <= max) onChange(parsed);
    }}
    type="number"
    value={draft}
  />;
}
