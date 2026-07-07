import { useState } from "react";
import type { ReactNode } from "react";
import { Delete02Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { branchHandleOptions } from "../constants";
import {
  canDeleteNodeKind,
  canInsertAfterNodeKind,
  nodeVisuals,
} from "../node-definitions";
import type { NodeVisual } from "../node-definitions";
import type { MarketingNodeRenderData } from "../types";
import { WorkflowTargetHandle } from "./node-handles";

export function WorkflowBaseNode({
  body,
  data,
  id,
  sourceHandles,
}: {
  body: ReactNode;
  data: MarketingNodeRenderData;
  id: string;
  sourceHandles?: ReactNode;
}) {
  const visual = nodeVisuals[data.kind];
  const isSelected = Boolean(data.selected);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        "workflow-node-shell",
        isSelected && "workflow-node-shell-selected",
      )}
    >
      <div
        className={cn(
          "workflow-node-card group",
          data.kind === "branch" && "workflow-node-card-branch",
        )}
      >
        {data.kind !== "trigger" ? <WorkflowTargetHandle /> : null}
        <NodeActionMenu
          actionMenuOpen={actionMenuOpen}
          data={data}
          id={id}
          setActionMenuOpen={setActionMenuOpen}
        />
        <button
          aria-label={`${data.title} ${data.summary}`}
          className="workflow-node-select"
          onClick={() => data.onSelect?.(id)}
          type="button"
        >
          <NodeHeader data={data} visual={visual} />
          {body}
        </button>
        {sourceHandles}
      </div>
    </div>
  );
}

function NodeHeader({
  data,
  visual,
}: {
  data: MarketingNodeRenderData;
  visual: NodeVisual;
}) {
  return (
    <span className="flex items-center rounded-t-2xl px-3 pb-2 pr-10 pt-3">
      <span
        className={cn(
          "mr-2 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1",
          visual.accentClassName,
        )}
      >
        <HugeiconsIcon icon={visual.icon} size={15} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-foreground">{data.title}</span>
        </span>
      </span>
    </span>
  );
}

function NodeActionMenu({
  actionMenuOpen,
  data,
  id,
  setActionMenuOpen,
}: {
  actionMenuOpen: boolean;
  data: MarketingNodeRenderData;
  id: string;
  setActionMenuOpen: (open: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "workflow-node-actionbar nodrag nopan",
        (data.selected || actionMenuOpen) && "workflow-node-actionbar-visible",
      )}
    >
      <DropdownMenu modal={false} open={actionMenuOpen} onOpenChange={setActionMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`更多操作：${data.title}`}
            className="workflow-node-actionbar-button"
            onClick={(event) => event.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} size={14} strokeWidth={1.8} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[132px]" side="bottom">
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              data.onSelect?.(id);
              setActionMenuOpen(false);
            }}
          >
            打开配置
          </DropdownMenuItem>
          {canInsertAfterNodeKind(data.kind) ? (
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                data.onToggleInsertMenu?.(
                  id,
                  data.kind === "branch" ? branchHandleOptions[0].id : undefined,
                );
                setActionMenuOpen(false);
              }}
            >
              添加后续节点
            </DropdownMenuItem>
          ) : null}
          {canDeleteNodeKind(data.kind) ? (
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                data.onDelete?.(id);
                setActionMenuOpen(false);
              }}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
              删除节点
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
