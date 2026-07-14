import { memo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Copy01Icon,
  Delete02Icon,
  Edit03Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import aiIconUrl from "@/assets/workflow/ai-icon.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  canDeleteNodeKind,
  canDuplicateNodeKind,
  canRenameNodeKind,
  getNodeDefinition,
  nodeVisuals,
} from "../node-definitions";
import type { NodeVisual } from "../node-definitions";
import type { WorkflowNodeRenderData } from "../types";

function WorkflowBaseNodeComponent({
  body,
  data,
  id,
  sourceHandles,
  targetHandles,
}: {
  body: ReactNode;
  data: WorkflowNodeRenderData;
  id: string;
  sourceHandles?: ReactNode;
  targetHandles?: ReactNode;
}) {
  const visual = nodeVisuals[data.kind];
  const definition = getNodeDefinition(data.kind);
  const isSelected = Boolean(data.selected);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(data.title);
  const renameCancelledRef = useRef(false);
  const nodeCardStyle = {
    "--workflow-node-accent-rgb": visual.accentRgb,
  } as CSSProperties;

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
          definition.body.kind === "none" && "!pb-0",
          definition.cardClassName,
        )}
        style={nodeCardStyle}
      >
        {targetHandles}
        <NodeActionMenu
          actionMenuOpen={actionMenuOpen}
          data={data}
          id={id}
          onRename={() => {
            renameCancelledRef.current = false;
            setRenameValue(data.title);
            setIsRenaming(true);
          }}
          setActionMenuOpen={setActionMenuOpen}
        />
        <div
          aria-label={data.title}
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
          <NodeHeader
            data={data}
            isRenaming={isRenaming}
            onCancelRename={() => {
              renameCancelledRef.current = true;
              setRenameValue(data.title);
              setIsRenaming(false);
            }}
            onCommitRename={() => {
              if (renameCancelledRef.current) {
                renameCancelledRef.current = false;
                return;
              }

              const title = renameValue.trim();
              setIsRenaming(false);

              if (title && title !== data.title) {
                data.onRename?.(id, title);
              }
              else {
                setRenameValue(data.title);
              }
            }}
            onRenameValueChange={setRenameValue}
            renameValue={renameValue}
            visual={visual}
          />
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
  isRenaming,
  onCancelRename,
  onCommitRename,
  onRenameValueChange,
  renameValue,
  visual,
}: {
  data: WorkflowNodeRenderData;
  isRenaming: boolean;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onRenameValueChange: (value: string) => void;
  renameValue: string;
  visual: NodeVisual;
}) {
  return (
    <span className="flex items-center rounded-t-2xl py-3 pl-4 pr-10">
      <span
        className={cn(
          "mr-1 flex size-5 shrink-0 items-center justify-center rounded-lg",
          visual.accentClassName,
        )}
      >
        <HugeiconsIcon icon={visual.icon} size={14} strokeWidth={1.8} />
      </span>
      <span className="flex min-h-7 min-w-0 flex-1 items-center">
        {isRenaming ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              aria-label="节点名称"
              autoFocus
              className="nodrag nopan h-7 min-w-0 rounded px-2.5 text-xs font-normal"
              onBlur={onCommitRename}
              onChange={(event) => onRenameValueChange(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();

                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelRename();
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              value={renameValue}
            />
            <NodeAiBadge visual={visual} />
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold text-foreground">{data.title}</span>
            <NodeAiBadge visual={visual} />
          </span>
        )}
      </span>
    </span>
  );
}

function NodeAiBadge({ visual }: { visual: NodeVisual }) {
  if (visual.badge !== "ai") return null;

  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-3 w-auto shrink-0"
      src={aiIconUrl}
    />
  );
}

function NodeActionMenu({
  actionMenuOpen,
  data,
  id,
  onRename,
  setActionMenuOpen,
}: {
  actionMenuOpen: boolean;
  data: WorkflowNodeRenderData;
  id: string;
  onRename: () => void;
  setActionMenuOpen: (open: boolean) => void;
}) {
  const canRename = canRenameNodeKind(data.kind) && Boolean(data.onRename);
  const canDuplicate = canDuplicateNodeKind(data.kind) && Boolean(data.onDuplicate);
  const canDelete = canDeleteNodeKind(data.kind) && Boolean(data.onDelete);

  if (!canRename && !canDuplicate && !canDelete) {
    return null;
  }

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
          {canRename ? (
            <DropdownMenuItem onSelect={onRename}>
              <HugeiconsIcon icon={Edit03Icon} size={14} strokeWidth={1.8} />
              重命名
            </DropdownMenuItem>
          ) : null}
          {canDuplicate ? (
            <DropdownMenuItem
              onSelect={() => {
                data.onDuplicate?.(id);
              }}
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.8} />
              复制节点
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive data-[highlighted]:text-destructive"
                onSelect={() => {
                  data.onDelete?.(id);
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
                删除节点
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </div>
    </DropdownMenu>
  );
}
