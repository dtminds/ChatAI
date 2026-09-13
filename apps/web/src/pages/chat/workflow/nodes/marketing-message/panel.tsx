import {
  WORKFLOW_MARKETING_MESSAGE_WAIT_MIN_BY_UNIT,
  WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT,
  type WorkflowMarketingMessageWait,
} from "@chatai/contracts";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  const isFixedWait = wait.mode === "fixed";
  const waitUnit = isFixedWait ? wait.unit : "minute";
  const waitMinimum = WORKFLOW_MARKETING_MESSAGE_WAIT_MIN_BY_UNIT[waitUnit];
  const waitMaximum = WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT[waitUnit];
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
    <WorkflowSettingsSection title="等待策略">
      <RadioGroup
        className="gap-4"
        onValueChange={(mode) => update(plan, createMarketingMessageWait(mode))}
        value={wait.mode}
      >
        <div className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-2.5">
          <RadioGroupItem aria-label="不等待" value="none" />
          <span className="text-[13px] leading-5 text-foreground">不等待，下发成功后立即执行后续节点</span>
        </div>
        <div className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2">
          <RadioGroupItem aria-label="等待并查询" value="fixed" />
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
            <span>下发成功后等待</span>
            <BoundedInput
              disabled={!isFixedWait}
              max={waitMaximum}
              min={waitMinimum}
              onChange={duration => {
                if (wait.mode === "fixed") update(plan, { ...wait, duration });
              }}
              value={isFixedWait ? wait.duration : waitMinimum}
            />
            <Select
              disabled={!isFixedWait}
              onValueChange={(unit: "minute" | "hour") => {
                if (wait.mode !== "fixed") return;
                const currentMinutes = wait.unit === "hour" ? wait.duration * 60 : wait.duration;
                const nextMinimum = WORKFLOW_MARKETING_MESSAGE_WAIT_MIN_BY_UNIT[unit];
                const nextMaximum = WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT[unit];
                const nextDuration = unit === "hour" ? Math.ceil(currentMinutes / 60) : currentMinutes;
                update(plan, {
                  duration: Math.min(nextMaximum, Math.max(nextMinimum, nextDuration)),
                  mode: "fixed",
                  unit,
                });
              }}
              value={waitUnit}
            >
              <SelectTrigger aria-label="等待时间单位" className="h-9 w-24"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="minute">分钟</SelectItem><SelectItem value="hour">小时</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="col-start-2 min-w-0 text-[13px] leading-5 text-foreground">查询一次触达结果，然后继续执行后续节点</div>
        </div>
      </RadioGroup>
    </WorkflowSettingsSection>
  </>;
}

function createMarketingMessageWait(mode: string): WorkflowMarketingMessageWait {
  return mode === "fixed" ? { duration: 30, mode: "fixed", unit: "minute" } : { mode: "none" };
}

function BoundedInput({ disabled, max, min, onChange, value }: { disabled?: boolean; max: number; min: number; onChange(value: number): void; value: number }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Math.trunc(Number(draft));
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return <Input
    aria-label="等待时长"
    className="h-9 w-24 text-[13px] md:text-[13px]"
    disabled={disabled}
    max={max}
    min={min}
    onBlur={commit}
    onChange={(event) => {
      setDraft(event.target.value);
      const parsed = Number(event.target.value);
      if (/^\d+$/.test(event.target.value) && parsed >= min && parsed <= max) onChange(parsed);
    }}
    type="number"
    value={draft}
  />;
}
