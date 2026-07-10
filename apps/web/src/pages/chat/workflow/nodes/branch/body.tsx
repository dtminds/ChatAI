import { getWorkflowBranchPaths } from "../../branch-paths";
import { NodeFieldList } from "../node-field-list";
import type { NodeBodyProps } from "../types";

export function BranchNodeBody({ data }: NodeBodyProps<"branch">) {
  return (
    <>
      <NodeFieldList
        fields={[
          {
            id: "rule",
            label: "分支条件",
            value: data.branchRule
              ? { kind: "text", text: data.branchRule }
              : { kind: "empty" },
          },
        ]}
      />
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
