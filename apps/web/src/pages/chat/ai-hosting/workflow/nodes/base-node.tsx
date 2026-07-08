import { memo, useState } from "react";
import type { ReactNode } from "react";
import { Copy01Icon, Delete02Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { useWorkflowDismissableLayer } from "../workflow-hooks";
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
  const menuRef = useWorkflowDismissableLayer<HTMLDivElement>({
    enabled: actionMenuOpen,
    onDismiss: () => setActionMenuOpen(false),
  });

  return (
    <div
      className={cn(
        "workflow-node-actionbar nodrag nopan",
        (data.selected || actionMenuOpen) && "workflow-node-actionbar-visible",
      )}
      ref={menuRef}
    >
      <button
        aria-expanded={actionMenuOpen}
        aria-haspopup="menu"
        aria-label={`更多操作：${data.title}`}
        className="workflow-node-actionbar-button"
        onClick={(event) => {
          event.stopPropagation();
          setActionMenuOpen(!actionMenuOpen);
        }}
        type="button"
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={14} strokeWidth={1.8} />
      </button>
      {actionMenuOpen ? (
        <div
          aria-label={`节点操作：${data.title}`}
          className="workflow-node-menu"
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          <button
            className="workflow-node-menu-item"
            onClick={(event) => {
              event.stopPropagation();
              data.onSelect?.(id);
              setActionMenuOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            打开配置
          </button>
          {canInsertAfterNodeKind(data.kind) ? (
            <button
              className="workflow-node-menu-item"
              onClick={(event) => {
                event.stopPropagation();
                data.onToggleInsertMenu?.(
                  id,
                  getDefaultSourceHandleId(data.kind, data),
                );
                setActionMenuOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              添加后续节点
            </button>
          ) : null}
          {canDuplicateNodeKind(data.kind) ? (
            <button
              className="workflow-node-menu-item"
              onClick={(event) => {
                event.stopPropagation();
                data.onDuplicate?.(id);
                setActionMenuOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.8} />
              复制节点
            </button>
          ) : null}
          {canDeleteNodeKind(data.kind) ? (
            <button
              className="workflow-node-menu-item"
              onClick={(event) => {
                event.stopPropagation();
                data.onDelete?.(id);
                setActionMenuOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
              删除节点
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
