import { cn } from "@/lib/utils";
import {
  getBranchConditionSummary,
  getWorkflowBranchPaths,
  isWorkflowBranchConditionComplete,
} from "../../branch-paths";
import type { NodeBodyProps } from "../types";

export function BranchNodeBody({ data }: NodeBodyProps<"branch">) {
  const variables = data.availableVariables ?? [];

  return (
    <span aria-label="条件分支出口" className="mx-4 mb-3 grid gap-1.5">
      {getWorkflowBranchPaths(data).map((path) => {
        const summary = getBranchConditionSummary(path, variables);
        const incomplete = !path.isDefault && path.conditions.some((condition) =>
          !isWorkflowBranchConditionComplete(condition, variables));

        return (
          <span
            className="flex h-9 min-w-0 items-center rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs"
            data-testid={`workflow-branch-path-${path.id}`}
            key={path.id}
            title={`${path.label}：${summary}`}
          >
            <span className="shrink-0 font-medium text-foreground">{path.label}：</span>
            <span className={cn(
              "min-w-0 flex-1 truncate",
              incomplete ? "text-muted-foreground" : "text-foreground",
            )}>
              {summary}
            </span>
          </span>
        );
      })}
    </span>
  );
}
