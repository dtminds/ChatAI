import { WORKFLOW_WAIT_DURATION_MAX_BY_UNIT } from "@chatai/contracts";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NodeSettingsProps } from "../../panels/types";
import type {
  WorkflowWaitEventTimeoutUnit,
  WorkflowWaitEventType,
} from "../../types";
import {
  getWaitEventMetric,
  normalizeWaitEventTimeout,
  normalizeWaitEventType,
} from "./config";
import { workflowWaitEventDefinitions } from "./events";

export function WaitEventConfig({ node, onNodeChange }: NodeSettingsProps<"wait-event">) {
  const eventType = normalizeWaitEventType(node.data.event?.type);
  const timeout = normalizeWaitEventTimeout(node.data.timeout);

  const updateConfig = ({
    event: nextEvent = { type: eventType },
    timeout: nextTimeout = timeout,
  }: {
    event?: { type: WorkflowWaitEventType };
    timeout?: typeof timeout;
  }) => {
    onNodeChange({
      event: nextEvent,
      metric: getWaitEventMetric({ event: nextEvent, timeout: nextTimeout }),
      status: "ready",
      timeout: nextTimeout,
    });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">等待事件</h3>
        <Select
          onValueChange={(type: WorkflowWaitEventType) => updateConfig({ event: { type } })}
          value={eventType}
        >
          <SelectTrigger aria-label="等待事件类型" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(workflowWaitEventDefinitions).map((definition) => (
              <SelectItem key={definition.type} value={definition.type}>
                {definition.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">最长等待</h3>
        <div className="flex items-center gap-2 rounded-[8px] border bg-card p-4">
          <BoundedTimeoutInput
            max={WORKFLOW_WAIT_DURATION_MAX_BY_UNIT[timeout.unit]}
            onValueChange={(duration) => updateConfig({
              timeout: { ...timeout, duration },
            })}
            value={timeout.duration}
          />
          <Select
            onValueChange={(unit: WorkflowWaitEventTimeoutUnit) => updateConfig({
              timeout: {
                duration: Math.min(timeout.duration, WORKFLOW_WAIT_DURATION_MAX_BY_UNIT[unit]),
                unit,
              },
            })}
            value={timeout.unit}
          >
            <SelectTrigger aria-label="最长等待时间单位" className="h-9 w-24 px-2.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minute">分钟</SelectItem>
              <SelectItem value="hour">小时</SelectItem>
              <SelectItem value="day">天</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>
    </div>
  );
}

function BoundedTimeoutInput({ max, onValueChange, value }: {
  max: number;
  onValueChange: (value: number) => void;
  value: number;
}) {
  const [draftValue, setDraftValue] = useState(String(value));
  useEffect(() => setDraftValue(String(value)), [value]);

  const commitValue = (rawValue: string) => {
    const parsed = Math.trunc(Number(rawValue));
    const nextValue = Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : 1;
    setDraftValue(String(nextValue));
    if (nextValue !== value) onValueChange(nextValue);
  };

  return (
    <Input
      aria-label="最长等待时间"
      className="h-9 w-24 px-2.5"
      max={max}
      min={1}
      onBlur={() => commitValue(draftValue)}
      onChange={(event) => {
        const nextDraftValue = event.target.value;
        setDraftValue(nextDraftValue);
        if (/^\d+$/.test(nextDraftValue)) {
          const parsed = Number(nextDraftValue);
          if (parsed >= 1 && parsed <= max) onValueChange(parsed);
        }
      }}
      step={1}
      type="number"
      value={draftValue}
    />
  );
}
