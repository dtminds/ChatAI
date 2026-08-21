import type { NodeBodyProps } from "../types";
import { formatBasisPoints, getWorkflowRatioSplitGroups } from "./groups";

export function RatioSplitNodeBody({ data }: NodeBodyProps<"ratio-split">) {
  const groups = getWorkflowRatioSplitGroups(data);

  return (
    <span aria-label="A/B 分流出口" className="mx-4 mb-3 grid gap-1.5">
      {groups.map(group => (
        <span
          className="flex h-9 min-w-0 items-center justify-between rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs"
          data-testid={`workflow-ratio-split-${group.id}`}
          key={group.id}
        >
          <span className="truncate font-medium text-foreground">{group.label}</span>
          <span className="shrink-0 text-muted-foreground">{formatBasisPoints(group.basisPoints)}</span>
        </span>
      ))}
    </span>
  );
}
