import type { ReactNode } from "react";
import {
  Cancel01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { nodeVisuals } from "../node-definitions";
import type { WorkflowNode } from "../types";

export function BasePanel({
  children,
  node,
  onClose,
}: {
  children: ReactNode;
  node: WorkflowNode;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label="节点配置"
      className="workflow-config-panel absolute bottom-1 right-1 top-1 z-20 flex w-[26.25rem] min-h-0 flex-col rounded-2xl border-[0.5px] border-[var(--workflow-border)] bg-[var(--workflow-panel-bg-blur)] shadow-[0_18px_44px_var(--shadow-medium)] backdrop-blur-[10px] max-xl:w-[23.5rem] max-lg:relative max-lg:inset-auto max-lg:min-h-[280px] max-lg:w-full max-lg:rounded-none max-lg:border-x-0"
      role="complementary"
    >
      <PanelHeader node={node} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}

function PanelHeader({
  node,
  onClose,
}: {
  node: WorkflowNode;
  onClose: () => void;
}) {
  const visual = nodeVisuals[node.data.kind];
  const showNodeType = node.data.title !== visual.label;

  return (
    <div className="border-b border-[var(--workflow-border)] p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
            visual.accentClassName,
          )}
        >
          <HugeiconsIcon icon={visual.icon} size={17} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold">{node.data.title}</h2>
            {showNodeType ? (
              <Badge className="h-5 rounded-md px-1.5 text-[11px]" variant="secondary">
                {visual.label}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button aria-label="更多节点操作" className="size-8 rounded-lg p-0" type="button" variant="ghost">
            <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.8} />
          </Button>
          <Button
            aria-label="关闭节点配置"
            className="size-8 rounded-lg p-0"
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.8} />
          </Button>
        </div>
      </div>
    </div>
  );
}
