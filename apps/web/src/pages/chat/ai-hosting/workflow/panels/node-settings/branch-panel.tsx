import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addWorkflowBranchPath,
  getWorkflowBranchPaths,
  moveWorkflowBranchPath,
  removeWorkflowBranchPath,
  renameWorkflowBranchPath,
} from "../../branch-paths";
import { FieldGroup } from "../field-group";
import { SchemaNodeSettingsPanel } from "./schema-panel";
import type { NodeSettingsProps } from "../types";

export function BranchConfig({ edges, node, onNodeChange }: NodeSettingsProps) {
  const branchPaths = getWorkflowBranchPaths(node.data);
  const nonDefaultPathCount = branchPaths.filter((branch) => !branch.isDefault).length;
  const connectedCountByHandle = new Map<string, number>();

  edges.forEach((edge) => {
    if (edge.source !== node.id || !edge.sourceHandle) {
      return;
    }

    connectedCountByHandle.set(
      edge.sourceHandle,
      (connectedCountByHandle.get(edge.sourceHandle) ?? 0) + 1,
    );
  });

  const updateBranchPaths = (nextBranchPaths: typeof branchPaths) => {
    onNodeChange({ branchPaths: nextBranchPaths });
  };

  return (
    <>
      <SchemaNodeSettingsPanel node={node} onNodeChange={onNodeChange} edges={edges} />
      <FieldGroup title="分支路径">
        <div className="space-y-2">
          {branchPaths.map((branch, index) => {
            const connectedCount = connectedCountByHandle.get(branch.id) ?? 0;
            const canMoveUp = !branch.isDefault && index > 0;
            const canMoveDown = !branch.isDefault && index < nonDefaultPathCount - 1;
            const canDelete = !branch.isDefault && nonDefaultPathCount > 1 && connectedCount === 0;
            const branchActionLabel = branch.label || branch.title;

            return (
              <div
                className="grid gap-2 rounded-[8px] border bg-card px-3 py-2"
                key={branch.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {branch.title} · {branch.operator}
                    </span>
                    {connectedCount > 0 ? (
                      <span className="text-[11px] text-muted-foreground">已连接 {connectedCount} 条</span>
                    ) : null}
                  </div>
                  {!branch.isDefault ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        aria-label={`上移${branchActionLabel}`}
                        className="size-7 rounded-md"
                        disabled={!canMoveUp}
                        onClick={() => updateBranchPaths(moveWorkflowBranchPath(branchPaths, branch.id, "up"))}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={ArrowUp02Icon} size={14} strokeWidth={1.8} />
                      </Button>
                      <Button
                        aria-label={`下移${branchActionLabel}`}
                        className="size-7 rounded-md"
                        disabled={!canMoveDown}
                        onClick={() => updateBranchPaths(moveWorkflowBranchPath(branchPaths, branch.id, "down"))}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />
                      </Button>
                      <Button
                        aria-label={`删除${branchActionLabel}`}
                        className="size-7 rounded-md text-destructive hover:text-destructive"
                        disabled={!canDelete}
                        onClick={() => updateBranchPaths(removeWorkflowBranchPath(branchPaths, branch.id))}
                        size="icon"
                        title={connectedCount > 0 ? "先删除该分支连线" : undefined}
                        type="button"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <Input
                  aria-label={`${branch.title} 路径名称`}
                  className="h-8 rounded-md px-2.5 text-xs"
                  onChange={(event) =>
                    updateBranchPaths(renameWorkflowBranchPath(branchPaths, branch.id, event.target.value))}
                  value={branch.label}
                />
              </div>
            );
          })}
        </div>
        <Button
          className="h-8 w-full rounded-md text-xs"
          onClick={() => updateBranchPaths(addWorkflowBranchPath(branchPaths))}
          type="button"
          variant="outline"
        >
          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
          添加分支
        </Button>
      </FieldGroup>
    </>
  );
}
