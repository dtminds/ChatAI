import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
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
  WorkflowWaitEventDelayUnit,
  WorkflowWaitEventTimeoutUnit,
  WorkflowWaitEventType,
} from "../../types";
import {
  getWaitEventMetric,
  normalizeWaitEventDelay,
  normalizeWaitEventTimeout,
  normalizeWaitEventType,
  WAIT_EVENT_DELAY_MAX_BY_UNIT,
  WAIT_EVENT_TIMEOUT_MAX_BY_UNIT,
} from "./config";
import { workflowWaitEventDefinitions } from "./events";

export function WaitEventConfig({ node, onNodeChange }: NodeSettingsProps<"wait-event">) {
  const eventType = normalizeWaitEventType(node.data.event?.type);
  const delay = normalizeWaitEventDelay(node.data.delay);
  const timeout = normalizeWaitEventTimeout(node.data.timeout);

  const updateConfig = ({
    delay: nextDelay = delay,
    event: nextEvent = { type: eventType },
    timeout: nextTimeout = timeout,
  }: {
    delay?: typeof delay;
    event?: { type: WorkflowWaitEventType };
    timeout?: typeof timeout;
  }) => {
    onNodeChange({
      delay: nextDelay,
      event: nextEvent,
      metric: getWaitEventMetric({ delay: nextDelay, event: nextEvent, timeout: nextTimeout }),
      status: "ready",
      timeout: nextTimeout,
    });
  };

  return (
    <>
      <WorkflowSettingsSection title="等待事件">
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
      </WorkflowSettingsSection>

      <WorkflowSettingsSection title="事件到达后">
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <BoundedDurationInput
            ariaLabel="事件到达后等待时间"
            max={WAIT_EVENT_DELAY_MAX_BY_UNIT[delay.unit]}
            min={delay.unit === "second" ? 0 : 1}
            onValueChange={(duration) => updateConfig({ delay: { ...delay, duration } })}
            value={delay.duration}
          />
          <Select
            onValueChange={(unit: WorkflowWaitEventDelayUnit) => {
              const minimum = unit === "second" ? 0 : 1;
              updateConfig({
                delay: {
                  duration: Math.min(
                    WAIT_EVENT_DELAY_MAX_BY_UNIT[unit],
                    Math.max(minimum, delay.duration),
                  ),
                  unit,
                },
              });
            }}
            value={delay.unit}
          >
            <SelectTrigger aria-label="事件到达后等待时间单位" className="h-9 w-24 px-2.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="second">秒</SelectItem>
              <SelectItem value="minute">分钟</SelectItem>
              <SelectItem value="hour">小时</SelectItem>
              <SelectItem value="day">天</SelectItem>
            </SelectContent>
          </Select>
          <span>后，执行事件到达分支</span>
        </div>
      </WorkflowSettingsSection>

      <WorkflowSettingsSection title="最长等待">
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <BoundedDurationInput
            ariaLabel="最长等待时间"
            max={WAIT_EVENT_TIMEOUT_MAX_BY_UNIT[timeout.unit]}
            min={1}
            onValueChange={(duration) => updateConfig({
              timeout: { ...timeout, duration },
            })}
            value={timeout.duration}
          />
          <Select
            onValueChange={(unit: WorkflowWaitEventTimeoutUnit) => updateConfig({
              timeout: {
                duration: Math.min(timeout.duration, WAIT_EVENT_TIMEOUT_MAX_BY_UNIT[unit]),
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
          <span>后，执行后续节点</span>
        </div>
      </WorkflowSettingsSection>
    </>
  );
}

function BoundedDurationInput({ ariaLabel, max, min, onValueChange, value }: {
  ariaLabel: string;
  max: number;
  min: number;
  onValueChange: (value: number) => void;
  value: number;
}) {
  const [draftValue, setDraftValue] = useState(String(value));
  useEffect(() => setDraftValue(String(value)), [value]);

  const commitValue = (rawValue: string) => {
    const parsed = Math.trunc(Number(rawValue));
    const nextValue = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
    setDraftValue(String(nextValue));
    if (nextValue !== value) onValueChange(nextValue);
  };

  return (
    <Input
      aria-label={ariaLabel}
      className="h-9 w-24 px-2.5"
      max={max}
      min={min}
      onBlur={() => commitValue(draftValue)}
      onChange={(event) => {
        const nextDraftValue = event.target.value;
        setDraftValue(nextDraftValue);
        if (/^\d+$/.test(nextDraftValue)) {
          const parsed = Number(nextDraftValue);
          if (parsed >= min && parsed <= max) onValueChange(parsed);
        }
      }}
      placeholder="请输入"
      step={1}
      type="number"
      value={draftValue}
    />
  );
}
