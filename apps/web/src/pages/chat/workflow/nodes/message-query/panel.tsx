import { useEffect, useState } from "react";
import { getMessageQueryRelativeAmountMax, isMessageQueryFixedRangeWithinBounds, isValidWorkflowLocalDateTime, WORKFLOW_MESSAGE_QUERY_TIME_RANGE_REJECTION_DAYS, type WorkflowMessageQueryRelativePoint } from "@chatai/contracts";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import type {
  MessageQueryNodeData,
  WorkflowTimeRange,
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "../../types";
import { WorkflowVariableSelect } from "../../workflow-variable-select";
import { getAvailableTimeReferenceVariablesForNode } from "../../workflow-variables";
import {
  createDefaultMessageQueryTimeRange,
  createDefaultMessageQueryRelativeTimeRange,
  getMessageQueryMetric,
  getMessageQueryStatus,
  MESSAGE_QUERY_LIMIT_MAX,
  MESSAGE_QUERY_LIMIT_MIN,
  normalizeMessageQueryTake,
  normalizeMessageQueryTimeRange,
} from "./config";

export function MessageQueryConfig({
  edges,
  node,
  nodes,
  onNodeChange,
  resources,
}: NodeSettingsProps<"message-query">) {
  const timeVariables = getAvailableTimeReferenceVariablesForNode(
    node.id,
    nodes,
    edges,
    resources?.customFields?.fields,
  );
  const timeRange = normalizeMessageQueryTimeRange(node.data.timeRange);

  const updateConfig = (patch: Partial<Pick<
    MessageQueryNodeData,
    "limit" | "take" | "timeRange"
  >>) => {
    const next = {
      limit: patch.limit ?? node.data.limit,
      take: patch.take ?? node.data.take,
      timeRange: patch.timeRange ?? node.data.timeRange,
    };
    onNodeChange({
      ...patch,
      metric: getMessageQueryMetric(next),
      status: getMessageQueryStatus(next),
    });
  };

  return (
    <>
      <WorkflowSettingsSection contentClassName="text-[13px]" title="时间范围">
        <RadioGroup
          aria-label="时间范围类型"
          className="flex flex-wrap items-center gap-6"
          onValueChange={(mode) => {
            if (mode !== "fixed" && mode !== "dynamic" && mode !== "relative") return;
            updateConfig({
              timeRange: mode === "relative"
                ? createDefaultMessageQueryRelativeTimeRange()
                : mode === "fixed"
                ? { endAt: "", mode: "fixed", startAt: "" }
                : createDefaultMessageQueryTimeRange(),
            });
          }}
          value={timeRange.mode}
        >
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <RadioGroupItem value="fixed" />
            <span>固定时间</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <RadioGroupItem value="dynamic" />
            <span>动态时间</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <RadioGroupItem value="relative" />
            <span>相对时间</span>
          </label>
        </RadioGroup>
        <div className="rounded-[8px] border bg-card p-4">
          {timeRange.mode === "fixed" ? (
            <FixedTimeRangeFields
              onChange={(nextRange) => updateConfig({ timeRange: nextRange })}
              value={timeRange}
            />
          ) : timeRange.mode === "relative" ? (
            <div className="space-y-4">
              <RelativeTimeField label="开始时间" value={timeRange.start} onChange={start => updateConfig({ timeRange: { ...timeRange, start } })} />
              <RelativeTimeField label="结束时间" value={timeRange.end} onChange={end => updateConfig({ timeRange: { ...timeRange, end } })} />
            </div>
          ) : (
            <DynamicTimeRangeFields
              onChange={(nextRange) => updateConfig({ timeRange: nextRange })}
              variables={timeVariables}
              value={timeRange}
            />
          )}
        </div>
      </WorkflowSettingsSection>

      <WorkflowSettingsSection contentClassName="text-[13px]" title="取数方式">
        <div className="flex flex-wrap items-center gap-2 rounded-[8px] border bg-card p-4 text-[13px]">
          <span>取时间范围内</span>
          <Select
            onValueChange={(take: MessageQueryNodeData["take"]) => updateConfig({
              take: normalizeMessageQueryTake(take),
            })}
            value={node.data.take}
          >
            <SelectTrigger aria-label="消息取数顺序" className="h-9 w-24 px-2.5 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem className="text-[13px]" value="latest">最新</SelectItem>
              <SelectItem className="text-[13px]" value="earliest">最早</SelectItem>
            </SelectContent>
          </Select>
          <BoundedNumberInput
            aria-label="消息数量"
            max={MESSAGE_QUERY_LIMIT_MAX}
            min={MESSAGE_QUERY_LIMIT_MIN}
            onValueChange={(limit) => updateConfig({ limit })}
            value={node.data.limit}
          />
          <span>条消息</span>
        </div>
      </WorkflowSettingsSection>
    </>
  );
}

function RelativeTimeField({ label, value, onChange }: {
  label: string;
  value: WorkflowMessageQueryRelativePoint;
  onChange: (value: WorkflowMessageQueryRelativePoint) => void;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[13px]">{label}</span>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_80px_92px] items-center gap-1.5">
        <BoundedNumberInput
          className="h-9 min-w-0 w-full px-2 text-[13px]"
          aria-label={`${label}相对数值`}
          min={0}
          max={getMessageQueryRelativeAmountMax(value.unit)}
          value={value.amount}
          onValueChange={amount => onChange({ ...value, amount })}
        />
        <Select value={value.unit} onValueChange={unit => {
          if (unit !== "day" && unit !== "hour" && unit !== "minute") return;
          const amount = Math.min(value.amount, getMessageQueryRelativeAmountMax(unit));
          onChange(unit === "day" ? { amount, unit, time: label === "开始时间" ? "00:00" : "23:59" } : { amount, unit });
        }}>
          <SelectTrigger aria-label={`${label}相对单位`} className="h-9 w-full min-w-0 px-2 text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">天前</SelectItem>
            <SelectItem value="hour">小时前</SelectItem>
            <SelectItem value="minute">分钟前</SelectItem>
          </SelectContent>
        </Select>
        {value.unit === "day" ? <TimePicker aria-label={`${label}时间点`} className="w-full min-w-0 px-2 text-[13px]" value={value.time} onValueChange={time => onChange({ ...value, time })} /> : null}
      </div>
    </div>
  );
}

function FixedTimeRangeFields({ onChange, value }: {
  onChange: (value: Extract<WorkflowTimeRange, { mode: "fixed" }>) => void;
  value: Extract<WorkflowTimeRange, { mode: "fixed" }>;
}) {
  const validate = (field: "startAt" | "endAt", selected: string) => {
    const next = { ...value, [field]: selected };
    if (selected && (!isValidWorkflowLocalDateTime(selected)
      || Date.parse(`${selected}:00+08:00`) <= Date.now() - WORKFLOW_MESSAGE_QUERY_TIME_RANGE_REJECTION_DAYS * 86_400_000)) {
      return "时间不能早于90天前";
    }
    if (next.startAt && next.endAt
      && !isMessageQueryFixedRangeWithinBounds(Date.now(), next.startAt, next.endAt)) {
      return "时间跨度不能超过90天，开始不能晚于结束";
    }
    return undefined;
  };
  return (
    <div className="space-y-3">
      <DateTimeField
        label="开始时间"
        onChange={(startAt) => onChange({ ...value, startAt })}
        validateValue={selected => validate("startAt", selected)}
        value={value.startAt}
      />
      <DateTimeField
        label="结束时间"
        onChange={(endAt) => onChange({ ...value, endAt })}
        validateValue={selected => validate("endAt", selected)}
        value={value.endAt}
      />
    </div>
  );
}

function DateTimeField({ label, onChange, value, validateValue }: {
  label: string;
  onChange: (value: string) => void;
  value: string;
  validateValue: (value: string) => string | undefined;
}) {
  return (
    <label className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 text-[13px]">
      <span>{label}</span>
      <DateTimePicker
        aria-label={label}
        className="text-[13px]"
        onValueChange={onChange}
        validateValue={validateValue}
        value={value}
      />
    </label>
  );
}

function DynamicTimeRangeFields({
  onChange,
  variables,
  value,
}: {
  onChange: (value: Extract<WorkflowTimeRange, { mode: "dynamic" }>) => void;
  variables: WorkflowVariableDefinition[];
  value: Extract<WorkflowTimeRange, { mode: "dynamic" }>;
}) {
  return (
    <div className="space-y-4">
      <DynamicTimeField
        label="开始时间"
        onChange={(start) => onChange({ ...value, start })}
        variables={variables}
        value={value.start}
      />
      <DynamicTimeField
        label="结束时间"
        onChange={(end) => onChange({ ...value, end })}
        variables={variables}
        value={value.end}
      />
    </div>
  );
}

function DynamicTimeField({
  label,
  onChange,
  variables,
  value,
}: {
  label: string;
  onChange: (value: WorkflowVariableSelector) => void;
  variables: WorkflowVariableDefinition[];
  value: WorkflowVariableSelector;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[13px]">{label}</span>
      <WorkflowVariableSelect
        ariaLabel={`${label}时间点`}
        customFieldVisibility="compatible"
        invalidLabel="时间变量不可用"
        onSelect={(variable) => onChange(variable.selector)}
        value={value}
        variables={variables}
      />
    </div>
  );
}

function BoundedNumberInput({
  "aria-label": ariaLabel,
  className = "h-9 w-20 px-2.5 text-[13px]",
  max,
  min,
  onValueChange,
  value,
}: {
  "aria-label": string;
  className?: string;
  max: number;
  min: number;
  onValueChange(value: number): void;
  value: number;
}) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => setDraftValue(String(value)), [value]);

  const commitValue = (rawValue: string) => {
    const parsedValue = Math.trunc(Number(rawValue));
    const boundedValue = Number.isFinite(parsedValue)
      ? Math.min(max, Math.max(min, parsedValue))
      : min;
    setDraftValue(String(boundedValue));
    if (boundedValue !== value) onValueChange(boundedValue);
  };

  return (
    <Input
      aria-label={ariaLabel}
      className={className}
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
