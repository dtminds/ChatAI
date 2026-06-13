import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Delete02Icon,
  Edit02Icon,
  FolderTransferIcon,
  PinIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  MaterialCollectionGroup,
  MaterialCollectionItem,
} from "@/pages/chat/components/material-collection/material-types";
import { canEditMaterialItem } from "@/pages/chat/components/material-collection/material-types";

type MaterialContextMenuPosition = {
  x: number;
  y: number;
};

type MaterialActionsMenuProps = {
  groups: MaterialCollectionGroup[];
  item: MaterialCollectionItem;
  onDelete?: (item: MaterialCollectionItem) => void;
  onEdit?: (item: MaterialCollectionItem) => void;
  onMove?: (item: MaterialCollectionItem, groupId: string) => void;
  onOpenChange: (position: MaterialContextMenuPosition | null) => void;
  onTop?: (item: MaterialCollectionItem) => void;
  position: MaterialContextMenuPosition | null;
};

export function MaterialActionsMenu({
  groups,
  item,
  onDelete,
  onEdit,
  onMove,
  onOpenChange,
  onTop,
  position,
}: MaterialActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const targetGroups = groups.filter((group) => group.id !== item.groupId);
  const canEdit = canEditMaterialItem(item);

  useEffect(() => {
    if (!position) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && menuRef.current?.contains(target)) {
        return;
      }

      onOpenChange(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, position]);

  return (
    <>
      {position
        ? createPortal(
            <div
              className="pointer-events-auto fixed z-50 min-w-[7.5rem] rounded-[10px] border border-border bg-popover p-1 text-popover-foreground shadow-[0_10px_28px_var(--shadow-soft)]"
              ref={menuRef}
              role="menu"
              style={{ left: position.x, pointerEvents: "auto", top: position.y }}
            >
              <button
                className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-45"
                disabled={!onTop}
                onClick={() => {
                  onTop?.(item);
                  onOpenChange(null);
                }}
                role="menuitem"
                type="button"
              >
                <HugeiconsIcon icon={PinIcon} size={16} strokeWidth={1.8} />
                移到最前
              </button>
              <button
                className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-45"
                disabled={targetGroups.length === 0}
                onClick={() => {
                  onOpenChange(null);
                  setIsMoveDialogOpen(true);
                }}
                role="menuitem"
                type="button"
              >
                <HugeiconsIcon icon={FolderTransferIcon} size={16} strokeWidth={1.8} />
                移动分组
              </button>
              {canEdit ? (
                <button
                  className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-45"
                  disabled={!onEdit}
                  onClick={() => {
                    onEdit?.(item);
                    onOpenChange(null);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.8} />
                  编辑
                </button>
              ) : null}
              <button
                className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10 disabled:pointer-events-none disabled:opacity-45"
                disabled={!onDelete}
                onClick={() => {
                  onDelete?.(item);
                  onOpenChange(null);
                }}
                role="menuitem"
                type="button"
              >
                <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
                删除
              </button>
            </div>,
            document.body,
          )
        : null}
      <MaterialMoveGroupDialog
        groups={targetGroups}
        item={item}
        onMove={(groupId) => onMove?.(item, groupId)}
        onOpenChange={setIsMoveDialogOpen}
        open={isMoveDialogOpen}
      />
    </>
  );
}

function MaterialMoveGroupDialog({
  groups,
  item,
  onMove,
  onOpenChange,
  open,
}: {
  groups: MaterialCollectionGroup[];
  item: MaterialCollectionItem;
  onMove: (groupId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedGroupId("");
    }
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>移动分组</DialogTitle>
          <DialogDescription>{item.title}</DialogDescription>
        </DialogHeader>

        <Select onValueChange={setSelectedGroupId} value={selectedGroupId}>
          <SelectTrigger aria-label="选择目标分组" className="w-full">
            <SelectValue placeholder="选择目标分组" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button
            disabled={!selectedGroupId}
            onClick={() => {
              onMove(selectedGroupId);
              onOpenChange(false);
            }}
            type="button"
          >
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
