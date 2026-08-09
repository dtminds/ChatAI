import {
  WORKFLOW_WAIT_DAY_OFFSET_MAX,
  WORKFLOW_WAIT_DURATION_MAX_BY_UNIT,
  type WorkflowWaitConfig,
} from "@chatai/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NodeSettingsProps } from "../../panels/types";

const waitUnitLabels = {
  day: "天",
  hour: "小时",
  minute: "分钟",
} as const;

export function WaitConfig({ node, onNodeChange }: NodeSettingsProps<"wait">) {
  const config = node.data;

  const updateConfig = (nextConfig: WorkflowWaitConfig) => {
    onNodeChange({
      ...nextConfig,
      metric: getWaitMetric(nextConfig),
      status: "ready",
    });
  };

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">等待时间配置</h3>
      <RadioGroup
        className="gap-5 rounded-[8px] border bg-card p-4"
        onValueChange={(mode) => updateConfig(createWaitConfig(mode))}
        value={config.mode}
      >
        <WaitOption value="duration">
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span>客户进入节点</span>
            <BoundedNumberInput
              aria-label="等待时长"
              disabled={config.mode !== "duration"}
              max={config.mode === "duration"
                ? WORKFLOW_WAIT_DURATION_MAX_BY_UNIT[config.unit]
                : WORKFLOW_WAIT_DURATION_MAX_BY_UNIT.day}
              min={1}
              onValueChange={(duration) => {
                if (config.mode !== "duration") return;
                updateConfig({ ...config, duration });
              }}
              value={config.mode === "duration" ? config.duration : 1}
            />
            <Select
              disabled={config.mode !== "duration"}
              onValueChange={(unit: "day" | "hour" | "minute") => {
                if (config.mode !== "duration") return;
                updateConfig({
                  ...config,
                  duration: Math.min(config.duration, WORKFLOW_WAIT_DURATION_MAX_BY_UNIT[unit]),
                  unit,
                });
              }}
              value={config.mode === "duration" ? config.unit : "day"}
            >
              <SelectTrigger aria-label="等待时间单位" className="h-9 w-24 px-2.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minute">分钟</SelectItem>
                <SelectItem value="hour">小时</SelectItem>
                <SelectItem value="day">天</SelectItem>
              </SelectContent>
            </Select>
            <span>后，执行后续节点</span>
          </div>
        </WaitOption>

        <WaitOption value="fixed-time">
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span>客户进入节点</span>
            <BoundedNumberInput
              aria-label="等待天数"
              disabled={config.mode !== "fixed-time"}
              max={WORKFLOW_WAIT_DAY_OFFSET_MAX}
              min={1}
              onValueChange={(dayOffset) => {
                if (config.mode !== "fixed-time") return;
                updateConfig({ ...config, dayOffset });
              }}
              value={config.mode === "fixed-time" ? config.dayOffset : 1}
            />
            <span>天后的</span>
            <TimePicker
              aria-label="执行时间"
              disabled={config.mode !== "fixed-time"}
              onValueChange={(time) => {
                if (config.mode !== "fixed-time") return;
                updateConfig({ ...config, time });
              }}
              value={config.mode === "fixed-time" ? config.time : "09:00"}
            />
            <span>执行后续节点</span>
          </div>
        </WaitOption>
      </RadioGroup>
    </section>
  );
}

function WaitOption({ children, value }: {
  children: ReactNode;
  value: WorkflowWaitConfig["mode"];
}) {
  return (
    <div className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2.5">
      <RadioGroupItem aria-label={value === "duration" ? "常规时长等待" : "固定时间等待"} className="mt-2.5" value={value} />
      <div>{children}</div>
    </div>
  );
}

function createWaitConfig(mode: string): WorkflowWaitConfig {
  return mode === "fixed-time"
    ? { dayOffset: 1, mode: "fixed-time", time: "09:00" }
    : { duration: 1, mode: "duration", unit: "day" };
}

function getWaitMetric(config: WorkflowWaitConfig) {
  return config.mode === "fixed-time"
    ? `${config.dayOffset} 天后 ${config.time} 唤醒`
    : `${config.duration} ${waitUnitLabels[config.unit]}后唤醒`;
}

function BoundedNumberInput({
  "aria-label": ariaLabel,
  disabled,
  max,
  min,
  onValueChange,
  value,
}: {
  "aria-label": string;
  disabled: boolean;
  max: number;
  min: number;
  onValueChange(value: number): void;
  value: number;
}) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => setDraftValue(String(value)), [value]);

  const commitValue = (rawValue: string) => {
    const parsedValue = Math.trunc(Number(rawValue));
    const nextValue = Number.isFinite(parsedValue)
      ? Math.min(max, Math.max(min, parsedValue))
      : min;
    setDraftValue(String(nextValue));
    if (nextValue !== value) onValueChange(nextValue);
  };

  return (
    <Input
      aria-label={ariaLabel}
      className="h-9 w-24 px-2.5"
      disabled={disabled}
      max={max}
      min={min}
      onBlur={() => commitValue(draftValue)}
      onChange={(event) => {
        const nextDraftValue = event.target.value;
        setDraftValue(nextDraftValue);
        if (/^\d+$/.test(nextDraftValue)) {
          const parsedValue = Number(nextDraftValue);
          if (parsedValue >= min && parsedValue <= max) onValueChange(parsedValue);
        }
      }}
      step={1}
      type="number"
      value={draftValue}
    />
  );
}
