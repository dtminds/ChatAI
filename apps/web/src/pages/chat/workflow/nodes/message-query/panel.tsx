import { useEffect, useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NodeSettingsProps } from "../../panels/types";
import type {
  MessageQueryNodeData,
  WorkflowTimeRange,
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "../../types";
import {
  getAvailableTimeReferenceVariablesForNode,
  getWorkflowVariableDisplayLabel,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import { WorkflowVariablePicker } from "../../workflow-variable-picker";
import {
  createDefaultMessageQueryTimeRange,
  getDynamicTimeReferenceLabel,
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
}: NodeSettingsProps<"message-query">) {
  const timeVariables = getAvailableTimeReferenceVariablesForNode(node.id, nodes, edges);
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
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">时间范围</h3>
          <SegmentedControl
            aria-label="时间范围类型"
            className="h-9 rounded-full p-1"
            onValueChange={(mode) => {
              if (mode !== "fixed" && mode !== "dynamic") return;
              updateConfig({
                timeRange: mode === "fixed"
                  ? { endAt: "", mode: "fixed", startAt: "" }
                  : createDefaultMessageQueryTimeRange(),
              });
            }}
            type="single"
            value={timeRange.mode}
          >
            <SegmentedControlItem
              className="h-7 w-auto rounded-full px-3 text-xs font-medium data-[state=on]:bg-foreground data-[state=on]:text-background"
              value="fixed"
            >
              固定时间
            </SegmentedControlItem>
            <SegmentedControlItem
              className="h-7 w-auto rounded-full px-3 text-xs font-medium data-[state=on]:bg-foreground data-[state=on]:text-background"
              value="dynamic"
            >
              动态时间
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
        <div className="rounded-[8px] border bg-card p-4">
          {timeRange.mode === "fixed" ? (
            <FixedTimeRangeFields
              onChange={(nextRange) => updateConfig({ timeRange: nextRange })}
              value={timeRange}
            />
          ) : (
            <DynamicTimeRangeFields
              onChange={(nextRange) => updateConfig({ timeRange: nextRange })}
              variables={timeVariables}
              value={timeRange}
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">取数方式</h3>
        <div className="flex flex-wrap items-center gap-2 rounded-[8px] border bg-card p-4 text-sm">
          <span>取时间范围内</span>
          <Select
            onValueChange={(take: MessageQueryNodeData["take"]) => updateConfig({
              take: normalizeMessageQueryTake(take),
            })}
            value={node.data.take}
          >
            <SelectTrigger aria-label="消息取数顺序" className="h-9 w-24 px-2.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">最新</SelectItem>
              <SelectItem value="earliest">最早</SelectItem>
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
      </section>
    </div>
  );
}

function FixedTimeRangeFields({ onChange, value }: {
  onChange: (value: Extract<WorkflowTimeRange, { mode: "fixed" }>) => void;
  value: Extract<WorkflowTimeRange, { mode: "fixed" }>;
}) {
  return (
    <div className="space-y-3">
      <DateTimeField
        label="开始时间"
        onChange={(startAt) => onChange({ ...value, startAt })}
        value={value.startAt}
      />
      <DateTimeField
        label="结束时间"
        onChange={(endAt) => onChange({ ...value, endAt })}
        value={value.endAt}
      />
    </div>
  );
}

function DateTimeField({ label, onChange, value }: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 text-sm">
      <span>{label}</span>
      <DateTimePicker
        aria-label={label}
        onValueChange={onChange}
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedVariable = resolveWorkflowVariable(variables, value);

  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
      <span className="text-sm">{label}</span>
      <WorkflowVariablePicker
        onOpenChange={setPickerOpen}
        onSelect={(variable) => {
          onChange(variable.selector);
          setPickerOpen(false);
        }}
        open={pickerOpen}
        variables={variables}
      >
        <Button
          aria-label={`${label}时间点`}
          className="h-9 w-full justify-between px-3 font-normal"
          type="button"
          variant="outline"
        >
          <span className="min-w-0 truncate">
            {getDynamicTimeReferenceLabel(
              value,
              () => selectedVariable
                ? getWorkflowVariableDisplayLabel(selectedVariable)
                : undefined,
            )}
          </span>
          <HugeiconsIcon className="shrink-0 text-muted-foreground" icon={ArrowDown01Icon} size={16} strokeWidth={1.8} />
        </Button>
      </WorkflowVariablePicker>
    </div>
  );
}

function BoundedNumberInput({
  "aria-label": ariaLabel,
  className = "h-9",
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
      className={`${className} w-20 px-2.5`}
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
