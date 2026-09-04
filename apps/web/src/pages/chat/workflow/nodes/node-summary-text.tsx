import type { CSSProperties, ReactNode } from "react";
import { AbsoluteIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import {
  getWorkflowNodeSummaryText,
  type WorkflowNodeSummarySegment,
} from "../workflow-node-summary";

export function NodeSummaryText({
  className,
  maxLines = 1,
  segments,
}: {
  className?: string;
  maxLines?: number;
  segments: WorkflowNodeSummarySegment[];
}) {
  const normalizedMaxLines = Math.max(1, Math.floor(maxLines));

  return (
    <span
      aria-label={getWorkflowNodeSummaryText(segments)}
      className={cn(
        "min-w-0 overflow-hidden",
        normalizedMaxLines === 1 && "block truncate whitespace-nowrap",
        normalizedMaxLines > 1 && "break-words",
        className,
      )}
      style={normalizedMaxLines > 1
        ? {
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: normalizedMaxLines,
            display: "-webkit-box",
          } as CSSProperties
        : undefined}
    >
      {renderSummaryItems(segments)}
    </span>
  );
}

function renderSummaryItems(segments: WorkflowNodeSummarySegment[]) {
  const items: ReactNode[] = [];

  for (let index = 0; index < segments.length;) {
    const current = segments[index];
    const next = segments[index + 1];
    const after = segments[index + 2];
    if (
      current?.kind === "source"
      && next?.kind === "text"
      && next.text === "."
      && after?.kind === "variable"
    ) {
      items.push(
        <SummaryVariableChip
          key={`variable-${after.text}-${index}`}
          label={after.text}
          sourceLabel={current.text}
          tone={after.tone}
        />,
      );
      index += 3;
      continue;
    }

    if (current?.kind === "variable") {
      items.push(
        <SummaryVariableChip
          key={`variable-${current.text}-${index}`}
          label={current.text}
          tone={current.tone}
        />,
      );
      index += 1;
      continue;
    }

    if (!current) break;

    items.push(
      <span
        className={getSegmentClassName(current)}
        data-summary-kind={current.kind}
        data-summary-tone={current.tone ?? "default"}
        key={`${current.kind}-${current.text}-${index}`}
      >
        {current.text}
      </span>,
    );
    index += 1;
  }

  return items;
}

function SummaryVariableChip({
  label,
  sourceLabel,
  tone,
}: {
  label: string;
  sourceLabel?: string;
  tone?: WorkflowNodeSummarySegment["tone"];
}) {
  return (
    <span
      className={cn(
        "font-medium",
        tone === "warning" ? "text-warning" : "text-foreground",
      )}
      data-summary-kind="variable"
      data-summary-tone={tone ?? "default"}
    >
      <HugeiconsIcon
        aria-hidden="true"
        className={cn(
          "mr-0.5 mb-0 inline size-[1em] align-text-bottom",
          tone === "warning" ? "text-warning" : "text-purple-500",
        )}
        icon={AbsoluteIcon}
        size={12}
        strokeWidth={1.8}
      />
      {sourceLabel ? (
        <>
          <span
            data-summary-kind="source"
            data-summary-tone={tone ?? "default"}
          >
            {sourceLabel}
          </span>
          <span>.</span>
        </>
      ) : null}
      <span>{label}</span>
    </span>
  );
}

function getSegmentClassName(segment: WorkflowNodeSummarySegment) {
  if (segment.tone === "warning") return "font-medium text-warning";
  if (segment.tone === "muted") return "font-normal text-[var(--workflow-text-tertiary)]";

  return {
    operator: "text-muted-foreground",
    source: "text-muted-foreground",
    text: "text-foreground",
    value: "font-medium text-foreground",
    variable: "font-medium text-foreground",
  }[segment.kind];
}
