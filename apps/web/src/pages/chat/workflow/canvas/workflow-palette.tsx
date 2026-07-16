import type React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WORKFLOW_AI_BADGE_URL } from "../constants";
import { getWorkflowPaletteItemGroups } from "../node-definitions";
import type {
  WorkflowPaletteItem,
  WorkflowPaletteItemGroup,
} from "../node-definitions";
import type { InsertableWorkflowNodeKind } from "../types";

export type WorkflowNodePickerAddContext = {
  clientY: number;
  pickerRight: number;
};

export function WorkflowNodePicker({
  className,
  kinds,
  onAddNode,
  role = "region",
  style,
}: {
  className?: string;
  kinds?: InsertableWorkflowNodeKind[];
  onAddNode: (kind: InsertableWorkflowNodeKind, context?: WorkflowNodePickerAddContext) => void;
  role?: "menu" | "region";
  style?: React.CSSProperties;
}) {
  const paletteGroups = getWorkflowPaletteItemGroups({ kinds });

  return (
    <section
      aria-label={role === "menu" ? "选择要添加的节点" : "节点库"}
      className={cn(
        "workflow-node-picker nodrag nopan z-[18] flex min-h-0 flex-col overflow-hidden rounded-[10px] border-[0.5px] border-[var(--workflow-border)] bg-[var(--workflow-panel-bg)] shadow-[0_12px_28px_var(--shadow-soft)] pointer-events-auto",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
      role={role}
      style={style}
    >
      <TooltipProvider delayDuration={300}>
        <WorkflowNodePickerGroups
          groups={paletteGroups}
          itemRole={role === "menu" ? "menuitem" : undefined}
          onAddNode={onAddNode}
        />
      </TooltipProvider>
    </section>
  );
}

function WorkflowNodePickerGroups({
  groups,
  itemRole,
  onAddNode,
}: {
  groups: WorkflowPaletteItemGroup[];
  itemRole?: "menuitem";
  onAddNode: (kind: InsertableWorkflowNodeKind, context?: WorkflowNodePickerAddContext) => void;
}) {
  return (
    <div className="workflow-node-picker-groups min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
      {groups.map((group) => (
        <div className="workflow-node-picker-group mt-3.5 first:mt-0" key={group.id}>
          <div className="workflow-node-picker-group-title mb-1.5 text-[11px] font-semibold leading-4 text-[var(--workflow-text-tertiary)]">{group.label}</div>
          <div
            className="workflow-node-picker-grid grid grid-cols-2 gap-x-1.5 gap-y-1.5"
          >
            {group.items.map((item, itemIndex) => (
              <WorkflowNodePickerItem
                item={item}
                itemRole={itemRole}
                key={item.id}
                onAddNode={onAddNode}
                tooltipSide={itemIndex % 2 === 0 ? "left" : "right"}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkflowNodePickerItem({
  item,
  itemRole,
  onAddNode,
  tooltipSide,
}: {
  item: WorkflowPaletteItem;
  itemRole?: "menuitem";
  onAddNode: (kind: InsertableWorkflowNodeKind, context?: WorkflowNodePickerAddContext) => void;
  tooltipSide: "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={`添加 ${item.label}节点`}
          className="workflow-node-picker-item flex h-[30px] min-w-0 items-center gap-[7px] rounded-[7px] border-0 bg-transparent px-1.5 text-left text-foreground transition-colors hover:bg-[var(--workflow-panel-section)]"
          onClick={(event) => {
            event.stopPropagation();
            const picker = event.currentTarget.closest<HTMLElement>(".workflow-node-picker");
            const itemRect = event.currentTarget.getBoundingClientRect();
            onAddNode(item.id, {
              clientY: event.detail > 0
                ? event.clientY
                : itemRect.top + itemRect.height / 2,
              pickerRight: picker?.getBoundingClientRect().right ?? itemRect.right,
            });
          }}
          role={itemRole}
          type="button"
        >
          <span
            className={cn(
              "workflow-node-picker-item-icon flex size-[22px] shrink-0 items-center justify-center rounded-lg",
              item.accentClassName,
            )}
          >
            <HugeiconsIcon icon={item.icon} size={15} strokeWidth={1.8} />
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="workflow-node-picker-item-label min-w-0 truncate text-sm font-normal leading-5">{item.label}</span>
            {item.badge === "ai" ? (
              <img
                alt=""
                aria-hidden="true"
                className="h-3 w-auto shrink-0"
                src={WORKFLOW_AI_BADGE_URL}
              />
            ) : null}
          </span>
        </button>
      </TooltipTrigger>
      {item.description ? (
        <TooltipContent side={tooltipSide} sideOffset={12}>
          {item.description}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
