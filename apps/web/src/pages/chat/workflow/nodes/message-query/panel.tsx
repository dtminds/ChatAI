import { useEffect, useMemo, useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { nodeVisuals } from "../../node-definitions";
import type { NodeSettingsProps } from "../../panels/types";
import type {
  MessageQueryNodeData,
  WorkflowDynamicTimeReference,
  WorkflowNode,
  WorkflowTimeRange,
  WorkflowVariableDefinition,
} from "../../types";
import {
  getAvailableTimeReferenceNodesForNode,
  getAvailableTimeReferenceOutputsForNode,
  getWorkflowVariableDisplayLabel,
  getWorkflowVariableSelectorKey,
} from "../../workflow-variables";
import {
  createDefaultMessageQueryTimeRange,
  getDynamicTimeReferenceLabel,
  getMessageQueryMetric,
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
  const upstreamNodes = getAvailableTimeReferenceNodesForNode(node.id, nodes, edges);
  const timeOutputs = getAvailableTimeReferenceOutputsForNode(node.id, nodes, edges);
  const timeRange = normalizeMessageQueryTimeRange(node.data.timeRange);

  const updateConfig = (patch: Partial<Pick<
    MessageQueryNodeData,
    "limit" | "take" | "timeRange"
  >>) => {
    const next = {
      limit: patch.limit ?? node.data.limit,
      take: patch.take ?? node.data.take,
    };
    onNodeChange({
      ...patch,
      metric: getMessageQueryMetric(next),
      status: "ready",
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
              currentNode={node}
              onChange={(nextRange) => updateConfig({ timeRange: nextRange })}
              outputs={timeOutputs}
              upstreamNodes={upstreamNodes}
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
  currentNode,
  onChange,
  outputs,
  upstreamNodes,
  value,
}: {
  currentNode: WorkflowNode<"message-query">;
  onChange: (value: Extract<WorkflowTimeRange, { mode: "dynamic" }>) => void;
  outputs: WorkflowVariableDefinition[];
  upstreamNodes: WorkflowNode[];
  value: Extract<WorkflowTimeRange, { mode: "dynamic" }>;
}) {
  return (
    <div className="space-y-4">
      <DynamicTimeField
        currentNode={currentNode}
        label="开始时间"
        onChange={(start) => onChange({ ...value, start })}
        outputs={outputs}
        upstreamNodes={upstreamNodes}
        value={value.start}
      />
      <DynamicTimeField
        currentNode={currentNode}
        label="结束时间"
        onChange={(end) => onChange({ ...value, end })}
        outputs={outputs}
        upstreamNodes={upstreamNodes}
        value={value.end}
      />
    </div>
  );
}

function DynamicTimeField({
  currentNode,
  label,
  onChange,
  outputs,
  upstreamNodes,
  value,
}: {
  currentNode: WorkflowNode<"message-query">;
  label: string;
  onChange: (value: WorkflowDynamicTimeReference) => void;
  outputs: WorkflowVariableDefinition[];
  upstreamNodes: WorkflowNode[];
  value: WorkflowDynamicTimeReference;
}) {
  const nodeTitleById = useMemo(() => new Map([
    ...upstreamNodes.map((item) => [item.id, item.data.title] as const),
    [currentNode.id, "当前节点"] as const,
  ]), [currentNode.id, upstreamNodes]);
  const outputLabelBySelector = useMemo(() => new Map(outputs.map((output) => [
    getWorkflowVariableSelectorKey(output.selector),
    getWorkflowVariableDisplayLabel(output),
  ])), [outputs]);

  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
      <span className="text-sm">{label}</span>
      <TimeReferencePicker
        currentNode={currentNode}
        label={label}
        onSelect={onChange}
        outputs={outputs}
        upstreamNodes={upstreamNodes}
        valueLabel={getDynamicTimeReferenceLabel(
          value,
          (nodeId) => nodeTitleById.get(nodeId),
          (selector) => outputLabelBySelector.get(getWorkflowVariableSelectorKey(selector)),
        )}
      />
    </div>
  );
}

function TimeReferencePicker({
  currentNode,
  label,
  onSelect,
  outputs,
  upstreamNodes,
  valueLabel,
}: {
  currentNode: WorkflowNode<"message-query">;
  label: string;
  onSelect: (reference: WorkflowDynamicTimeReference) => void;
  outputs: WorkflowVariableDefinition[];
  upstreamNodes: WorkflowNode[];
  valueLabel: string;
}) {
  const outputsByNodeId = new Map<string, WorkflowVariableDefinition[]>();
  outputs.forEach((output) => {
    if (!output.sourceNodeId) return;
    outputsByNodeId.set(output.sourceNodeId, [
      ...outputsByNodeId.get(output.sourceNodeId) ?? [],
      output,
    ]);
  });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`${label}时间点`}
          className="h-9 w-full justify-between px-3 font-normal"
          type="button"
          variant="outline"
        >
          <span className="min-w-0 truncate">{valueLabel}</span>
          <HugeiconsIcon className="shrink-0 text-muted-foreground" icon={ArrowDown01Icon} size={16} strokeWidth={1.8} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {upstreamNodes.map((upstreamNode) => (
          <NodeTimeSubMenu
            key={upstreamNode.id}
            node={upstreamNode}
            onSelect={onSelect}
            outputs={outputsByNodeId.get(upstreamNode.id) ?? []}
          />
        ))}
        <NodeTimeSubMenu
          current
          node={currentNode}
          onSelect={onSelect}
          outputs={[]}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NodeTimeSubMenu({ current = false, node, onSelect, outputs }: {
  current?: boolean;
  node: WorkflowNode;
  onSelect: (reference: WorkflowDynamicTimeReference) => void;
  outputs: WorkflowVariableDefinition[];
}) {
  const visual = nodeVisuals[node.data.kind];

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className={`flex size-5 shrink-0 items-center justify-center rounded-md ${visual.accentClassName}`}>
          <HugeiconsIcon icon={visual.icon} size={13} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1 truncate">{current ? "当前节点" : node.data.title}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        {node.data.kind === "start" ? (
          <TimeReferenceItem
            label="触发时间"
            onSelect={() => onSelect({ field: "occurredAt", kind: "workflow-trigger" })}
          />
        ) : null}
        <TimeReferenceItem
          label="进入时间"
          onSelect={() => onSelect(current
            ? { field: "enteredAt", kind: "current-node-lifecycle" }
            : { field: "enteredAt", kind: "node-lifecycle", nodeId: node.id })}
        />
        {!current && node.data.kind !== "start" ? (
          <TimeReferenceItem
            label="退出时间"
            onSelect={() => onSelect({ field: "exitedAt", kind: "node-lifecycle", nodeId: node.id })}
          />
        ) : null}
        {outputs.map((output) => (
          <TimeReferenceItem
            key={getWorkflowVariableSelectorKey(output.selector)}
            label={output.label}
            onSelect={() => onSelect({ kind: "node-output", selector: output.selector })}
          />
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function TimeReferenceItem({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <DropdownMenuItem
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      {label}
    </DropdownMenuItem>
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
