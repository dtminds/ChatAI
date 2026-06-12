import { useEffect, useMemo, useState } from "react";
import {
  Add01Icon,
  Delete02Icon,
  Edit02Icon,
  Folder01Icon,
  PinIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { WorkbenchMaterialCollectionGroupCreateRequest } from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MaterialCard } from "@/pages/chat/components/material-collection/material-card";
import type {
  MaterialCollectionGroup,
  MaterialCollectionItem,
  MaterialCollectionMode,
} from "@/pages/chat/components/material-collection/material-types";

type MaterialLibraryDialogProps = {
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"];
  groups: MaterialCollectionGroup[];
  isBusy?: boolean;
  items: MaterialCollectionItem[];
  onCreateGroup: (title: string) => void;
  onDeleteGroup: (group: MaterialCollectionGroup) => void;
  onDeleteMaterial: (item: MaterialCollectionItem) => void;
  onMoveMaterial: (item: MaterialCollectionItem, groupId: string) => void;
  onOpenChange: (open: boolean) => void;
  onRenameGroup: (group: MaterialCollectionGroup, title: string) => void;
  onSelectMaterial: (item: MaterialCollectionItem) => void;
  onTopGroup: (group: MaterialCollectionGroup) => void;
  onTopMaterial: (item: MaterialCollectionItem) => void;
  open: boolean;
};

export function MaterialLibraryDialog({
  bizType,
  groups,
  isBusy = false,
  items,
  onCreateGroup,
  onDeleteGroup,
  onDeleteMaterial,
  onMoveMaterial,
  onOpenChange,
  onRenameGroup,
  onSelectMaterial,
  onTopGroup,
  onTopMaterial,
  open,
}: MaterialLibraryDialogProps) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [mode, setMode] = useState<MaterialCollectionMode>("browse");
  const [newGroupTitle, setNewGroupTitle] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    if (groups.length === 0) {
      setActiveGroupId(null);
      return;
    }

    if (!activeGroupId || !groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? null);
    }
  }, [activeGroupId, groups, open]);

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) => activeGroupId !== null && item.groupId === activeGroupId,
      ),
    [activeGroupId, items],
  );
  const activeGroup = groups.find((group) => group.id === activeGroupId);

  function handleCreateGroup() {
    const title = newGroupTitle.trim();

    if (!title) {
      return;
    }

    onCreateGroup(title);
    setNewGroupTitle("");
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[min(42rem,calc(100vh-3rem))] max-w-[min(56rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-divider px-5 py-4">
          <DialogTitle>{getBizTypeLabel(bizType)}</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-[28rem] grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="border-r border-divider bg-surface-muted/55 p-3">
            <div className="space-y-1">
              {groups.map((group) => (
                <GroupButton
                  active={activeGroupId === group.id}
                  key={group.id}
                  label={group.title}
                  onClick={() => setActiveGroupId(group.id)}
                />
              ))}
            </div>

            <div className="mt-4 flex gap-1.5">
              <Input
                aria-label="新建分组名称"
                className="h-8 rounded-[8px] px-2.5 text-[13px]"
                onChange={(event) => setNewGroupTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleCreateGroup();
                  }
                }}
                placeholder="新建分组"
                value={newGroupTitle}
              />
              <Button
                aria-label="新建分组"
                className="size-8 shrink-0 p-0"
                disabled={isBusy || !newGroupTitle.trim()}
                onClick={handleCreateGroup}
                type="button"
                variant="outline"
              >
                <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.8} />
              </Button>
            </div>
          </aside>

          <section className="min-w-0 bg-background">
            <div className="flex items-center justify-between border-b border-divider px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={1.8} />
                <span className="truncate">{activeGroup?.title ?? "暂无分组"}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {activeGroup ? (
                  <>
                    <Button
                      aria-label={`置顶分组 ${activeGroup.title}`}
                      className="size-8 p-0"
                      disabled={isBusy}
                      onClick={() => onTopGroup(activeGroup)}
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon icon={PinIcon} size={15} strokeWidth={1.8} />
                    </Button>
                    <Button
                      aria-label={`重命名分组 ${activeGroup.title}`}
                      className="size-8 p-0"
                      disabled={isBusy}
                      onClick={() => {
                        const title = window.prompt("分组名称", activeGroup.title)?.trim();

                        if (title) {
                          onRenameGroup(activeGroup, title);
                        }
                      }}
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon icon={Edit02Icon} size={15} strokeWidth={1.8} />
                    </Button>
                    <Button
                      aria-label={`删除分组 ${activeGroup.title}`}
                      className="size-8 p-0 text-destructive hover:text-destructive"
                      disabled={isBusy}
                      onClick={() => onDeleteGroup(activeGroup)}
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} />
                    </Button>
                  </>
                ) : null}
                <Button
                  aria-pressed={mode === "manage"}
                  className="h-8 px-3 text-[13px]"
                  onClick={() => setMode(mode === "manage" ? "browse" : "manage")}
                  type="button"
                  variant={mode === "manage" ? "secondary" : "outline"}
                >
                  {mode === "manage" ? "完成" : "管理"}
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[30rem]">
              {visibleItems.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 p-3 xl:grid-cols-2">
                  {visibleItems.map((item) => (
                    <div key={item.id}>
                      <MaterialCard
                        item={item}
                        mode={mode}
                        onDelete={onDeleteMaterial}
                        onSelect={onSelectMaterial}
                        onTop={onTopMaterial}
                      />
                      {mode === "manage" ? (
                        <MoveMaterialBar
                          groups={groups}
                          item={item}
                          onMove={onMoveMaterial}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-[24rem] items-center justify-center text-sm text-muted-foreground">
                  暂无数据
                </div>
              )}
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GroupButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring/25",
        active ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      <HugeiconsIcon icon={Folder01Icon} size={15} strokeWidth={1.8} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function MoveMaterialBar({
  groups,
  item,
  onMove,
}: {
  groups: MaterialCollectionGroup[];
  item: MaterialCollectionItem;
  onMove: (item: MaterialCollectionItem, groupId: string) => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap justify-end gap-1 px-1">
      {groups.map((group) => (
        <Button
          className="h-7 px-2 text-[12px]"
          disabled={item.groupId === group.id}
          key={group.id}
          onClick={() => onMove(item, group.id)}
          type="button"
          variant="ghost"
        >
          移至{group.title}
        </Button>
      ))}
    </div>
  );
}

function getBizTypeLabel(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (bizType === 2) {
    return "收录的文件";
  }

  if (bizType === 3) {
    return "收录的小程序";
  }

  return "收录的H5";
}
