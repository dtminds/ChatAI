import { NodeFieldList } from "../node-field-list";
import type { NodeBodyProps } from "../types";
import {
  getWaitEventUnitLabel,
  normalizeWaitEventTimeout,
  normalizeWaitEventType,
} from "./config";
import { getWorkflowWaitEventDefinition } from "./events";

export function WaitEventNodeBody({ data }: NodeBodyProps<"wait-event">) {
  const event = getWorkflowWaitEventDefinition(normalizeWaitEventType(data.event?.type));
  const timeout = normalizeWaitEventTimeout(data.timeout);

  return (
    <>
      <NodeFieldList
        fields={[
          {
            id: "event",
            label: "等待事件",
            value: { kind: "text", text: event.label },
          },
          {
            id: "timeout",
            label: "最长等待",
            value: {
              kind: "text",
              text: `${timeout.duration} ${getWaitEventUnitLabel(timeout.unit)}`,
            },
          },
        ]}
      />
      <span aria-label="等待事件出口" className="mx-4 mb-3 grid gap-1.5">
        <span className="flex h-9 items-center rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs font-medium text-foreground">
          事件到达（{event.shortLabel}）
        </span>
        <span className="flex h-9 items-center rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs font-medium text-foreground">
          等待超时
        </span>
      </span>
    </>
  );
}
