import type React from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getWorkflowPaletteItemGroups } from "../node-definitions";
import type {
  WorkflowPaletteItem,
  WorkflowPaletteItemGroup,
} from "../node-definitions";
import type { InsertableWorkflowNodeKind } from "../types";

export function WorkflowNodePicker({
  className,
  kinds,
  onAddNode,
  onSearchChange,
  role = "region",
  searchValue,
  style,
}: {
  className?: string;
  kinds?: InsertableWorkflowNodeKind[];
  onAddNode: (kind: InsertableWorkflowNodeKind) => void;
  onSearchChange: (value: string) => void;
  role?: "menu" | "region";
  searchValue: string;
  style?: React.CSSProperties;
}) {
  const paletteGroups = getWorkflowPaletteItemGroups({ kinds, query: searchValue });

  return (
    <section
      aria-label={role === "menu" ? "选择要添加的节点" : "节点库"}
      className={cn(
        "workflow-node-picker nodrag nopan z-[18] flex min-h-0 flex-col overflow-hidden rounded-[10px] border-[0.5px] border-[var(--workflow-border)] bg-[var(--workflow-panel-bg)] shadow-[0_12px_28px_rgba(15,23,42,0.12)] pointer-events-auto",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
      role={role}
      style={style}
    >
      <TooltipProvider delayDuration={300}>
        <div className="workflow-node-picker-search relative shrink-0 p-2.5">
          <HugeiconsIcon
            className="workflow-node-picker-search-icon pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground"
            icon={Search01Icon}
            size={16}
            strokeWidth={1.8}
          />
          <Input
            aria-label="搜索节点"
            className="workflow-node-picker-search-input h-[30px] rounded-lg border-[var(--workflow-border)] bg-transparent pl-[30px] text-xs shadow-none"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索节点"
            value={searchValue}
          />
        </div>
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
  onAddNode: (kind: InsertableWorkflowNodeKind) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="workflow-node-picker-empty mx-2.5 mb-2.5 rounded-[10px] border border-dashed border-[var(--workflow-border)] px-2.5 py-5 text-center text-xs text-muted-foreground">
        未找到匹配节点
      </div>
    );
  }

  return (
    <div className="workflow-node-picker-groups min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
      {groups.map((group) => (
        <div className="workflow-node-picker-group mt-2.5 first:mt-0" key={group.id}>
          <div className="workflow-node-picker-group-title mb-1 text-[11px] font-semibold leading-4 text-[var(--workflow-text-tertiary)]">{group.label}</div>
          <div
            className="workflow-node-picker-grid grid grid-cols-2 gap-x-1.5 gap-y-0.5"
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
  onAddNode: (kind: InsertableWorkflowNodeKind) => void;
  tooltipSide: "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={`添加 ${item.label}节点`}
          className="workflow-node-picker-item flex h-[26px] min-w-0 items-center gap-[7px] rounded-[7px] border-0 bg-transparent px-1.5 text-left text-foreground transition-colors hover:bg-[var(--workflow-panel-section)]"
          onClick={(event) => {
            event.stopPropagation();
            onAddNode(item.id);
          }}
          role={itemRole}
          type="button"
        >
          <span
            className={cn(
              "workflow-node-picker-item-icon flex size-5 shrink-0 items-center justify-center rounded-md",
              item.accentClassName,
            )}
          >
            <HugeiconsIcon icon={item.icon} size={14} strokeWidth={1.8} />
          </span>
          <span className="workflow-node-picker-item-label min-w-0 truncate text-[13px] font-medium leading-4">{item.label}</span>
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
