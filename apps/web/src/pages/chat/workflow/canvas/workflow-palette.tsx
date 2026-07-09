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
      className={cn("workflow-node-picker nodrag nopan", className)}
      onClick={(event) => event.stopPropagation()}
      role={role}
      style={style}
    >
      <TooltipProvider delayDuration={300}>
        <div className="workflow-node-picker-search">
          <HugeiconsIcon
            className="workflow-node-picker-search-icon"
            icon={Search01Icon}
            size={16}
            strokeWidth={1.8}
          />
          <Input
            aria-label="搜索节点"
            className="workflow-node-picker-search-input"
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
    return <div className="workflow-node-picker-empty">未找到匹配节点</div>;
  }

  return (
    <div className="workflow-node-picker-groups">
      {groups.map((group) => (
        <div className="workflow-node-picker-group" key={group.id}>
          <div className="workflow-node-picker-group-title">{group.label}</div>
          <div
            className="workflow-node-picker-grid"
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
          className="workflow-node-picker-item"
          onClick={(event) => {
            event.stopPropagation();
            onAddNode(item.id);
          }}
          role={itemRole}
          type="button"
        >
          <span className="workflow-node-picker-item-icon">
            <HugeiconsIcon icon={item.icon} size={14} strokeWidth={1.8} />
          </span>
          <span className="workflow-node-picker-item-label">{item.label}</span>
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
