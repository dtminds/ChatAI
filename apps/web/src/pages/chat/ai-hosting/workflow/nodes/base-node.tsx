import { memo, useState } from "react";
import type { ReactNode } from "react";
import { Copy01Icon, Delete02Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  canDeleteNodeKind,
  canDuplicateNodeKind,
  canInsertAfterNodeKind,
  nodeVisuals,
} from "../node-definitions";
import { getDefaultSourceHandleId } from "../node-handle-definitions";
import type { NodeVisual } from "../node-definitions";
import type { WorkflowNodeRenderData } from "../types";
import { WorkflowTargetHandle } from "./node-handles";

function WorkflowBaseNodeComponent({
  body,
  data,
  id,
  sourceHandles,
}: {
  body: ReactNode;
  data: WorkflowNodeRenderData;
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
        <div
          aria-label={`${data.title} ${data.summary}`}
          className="workflow-node-select"
          onClick={(event) => {
            event.stopPropagation();
            data.onSelect?.(id, {
              additive: event.metaKey || event.ctrlKey || event.shiftKey,
            });
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }

            event.preventDefault();
            data.onSelect?.(id);
          }}
          role="button"
          tabIndex={0}
        >
          <NodeHeader data={data} visual={visual} />
          {body}
        </div>
        {sourceHandles}
      </div>
    </div>
  );
}

export const WorkflowBaseNode = memo(WorkflowBaseNodeComponent);

function NodeHeader({
  data,
  visual,
}: {
  data: WorkflowNodeRenderData;
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
  data: WorkflowNodeRenderData;
  id: string;
  setActionMenuOpen: (open: boolean) => void;
}) {
  return (
    <DropdownMenu modal={false} open={actionMenuOpen} onOpenChange={setActionMenuOpen}>
      <div
        className={cn(
          "workflow-node-actionbar nodrag nopan",
          (data.selected || actionMenuOpen) && "workflow-node-actionbar-visible",
        )}
      >
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
        <DropdownMenuContent
          align="end"
          aria-label={`节点操作：${data.title}`}
          className="w-36"
          onClick={(event) => event.stopPropagation()}
          sideOffset={4}
        >
          <DropdownMenuItem
            onSelect={() => {
              data.onSelect?.(id);
            }}
          >
            打开配置
          </DropdownMenuItem>
          {canInsertAfterNodeKind(data.kind) ? (
            <DropdownMenuItem
              onSelect={() => {
                data.onToggleInsertMenu?.(
                  id,
                  getDefaultSourceHandleId(data.kind, data),
                );
              }}
            >
              添加后续节点
            </DropdownMenuItem>
          ) : null}
          {canDuplicateNodeKind(data.kind) ? (
            <DropdownMenuItem
              onSelect={() => {
                data.onDuplicate?.(id);
              }}
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.8} />
              复制节点
            </DropdownMenuItem>
          ) : null}
          {canDeleteNodeKind(data.kind) ? (
            <DropdownMenuItem
              onSelect={() => {
                data.onDelete?.(id);
              }}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
              删除节点
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </div>
    </DropdownMenu>
  );
}
