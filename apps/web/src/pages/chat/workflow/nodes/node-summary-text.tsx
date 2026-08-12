import type { CSSProperties } from "react";
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
      {segments.map((segment, index) => (
        <span
          className={cn(
            getSegmentClassName(segment),
          )}
          data-summary-kind={segment.kind}
          data-summary-tone={segment.tone ?? "default"}
          key={`${segment.kind}-${segment.text}-${index}`}
        >
          {segment.text}
        </span>
      ))}
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
    variable: "font-medium text-primary",
  }[segment.kind];
}
