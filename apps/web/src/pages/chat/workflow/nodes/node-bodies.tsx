import { cn } from "@/lib/utils";
import { getWorkflowBranchPaths } from "../branch-paths";
import type { WorkflowNodeRenderData } from "../types";
import type { NodeBodyProps } from "./types";

export function StandardNodeBody<TKind extends WorkflowNodeRenderData["kind"]>({
  data,
  visual,
}: NodeBodyProps<TKind>) {
  return (
    <span className="workflow-node-section mx-3 mb-2 block overflow-hidden rounded-[10px] bg-[var(--workflow-param-bg)] p-2">
      <span className="workflow-node-section-title mb-1.5 block text-[11px] font-semibold uppercase leading-4 text-[var(--workflow-text-tertiary)]">{visual.label}</span>
      <NodeStatusRow data={data} />
      <span className="workflow-node-param mt-[5px] flex min-w-0 items-center justify-between gap-2 rounded-[7px] bg-white/75 px-[7px] py-[5px] text-[11px] leading-4 text-[var(--workflow-text-tertiary)]">
        <span className="shrink-0 whitespace-nowrap">配置</span>
        <span className="workflow-node-param-value min-w-0 flex-1 truncate text-right font-medium text-foreground">{data.summary}</span>
      </span>
      <span className="workflow-node-param mt-[5px] flex min-w-0 items-center justify-between gap-2 rounded-[7px] bg-white/75 px-[7px] py-[5px] text-[11px] leading-4 text-[var(--workflow-text-tertiary)]">
        <span className="shrink-0 whitespace-nowrap">输出</span>
        <span className="workflow-node-param-value min-w-0 flex-1 truncate text-right font-medium text-foreground">{data.metric}</span>
      </span>
    </span>
  );
}

export function BranchNodeBody({ data, visual }: NodeBodyProps<"branch">) {
  return (
    <>
      <span className="workflow-node-section workflow-branch-overview mx-3 mb-1 block overflow-hidden rounded-[10px] bg-[var(--workflow-param-bg)] p-2">
        <span className="workflow-node-section-title mb-1.5 block text-[11px] font-semibold uppercase leading-4 text-[var(--workflow-text-tertiary)]">{visual.label}</span>
        <NodeStatusRow data={data} />
      </span>
      <span className="workflow-branch-paths grid gap-1.5 px-3 pb-0.5" aria-label="条件分支出口">
        {getWorkflowBranchPaths(data).map((branch) => (
          <span
            className="workflow-branch-path grid gap-1"
            data-testid={`workflow-branch-path-${branch.id}`}
            key={branch.id}
          >
            <span className="workflow-branch-path-heading flex items-center justify-between text-[11px] font-bold leading-4 text-[var(--workflow-text-tertiary)]">
              <span>{branch.title}</span>
              <span>{branch.operator}</span>
            </span>
            <span className="workflow-branch-path-rule flex min-h-[34px] items-center rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs font-medium text-foreground">
              <span className="truncate">{branch.label}</span>
            </span>
          </span>
        ))}
      </span>
    </>
  );
}

function NodeStatusRow<TKind extends WorkflowNodeRenderData["kind"]>({
  data,
}: {
  data: WorkflowNodeRenderData<TKind>;
}) {
  const isWarning = data.status === "warning";
  const isRunning = data.status === "running";

  return (
    <span className="workflow-node-param flex min-w-0 items-center justify-between gap-2 rounded-[7px] bg-white/75 px-[7px] py-[5px] text-[11px] leading-4 text-[var(--workflow-text-tertiary)]">
      <span className="shrink-0 whitespace-nowrap">状态</span>
      <span
        className={cn(
          "workflow-node-param-value min-w-0 flex-1 truncate text-right font-medium text-foreground",
          isRunning && "text-emerald-700",
          isWarning && "text-amber-700",
        )}
      >
        {isRunning ? "Running" : isWarning ? "Missing config" : "Ready"}
      </span>
    </span>
  );
}
