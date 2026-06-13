import { useState } from "react";
import {
  Add01Icon,
  Delete02Icon,
  Edit02Icon,
  Folder01Icon,
  MoreHorizontalIcon,
  PinIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchMaterialCollectionGroupCreateRequest,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MaterialCard } from "@/pages/chat/components/material-collection/material-card";
import { MaterialGroupFormDialog } from "@/pages/chat/components/material-collection/material-group-form-dialog";
import type {
  MaterialCollectionGroup,
  MaterialCollectionItem,
} from "@/pages/chat/components/material-collection/material-types";
import { isMaterialCollectionGroupLimitReached } from "@/pages/chat/components/material-collection/material-types";

type MaterialLibraryDialogProps = {
  activeGroupId: string | null;
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"];
  groups: MaterialCollectionGroup[];
  hasMoreItems?: boolean;
  isBusy?: boolean;
  isGroupsLoading?: boolean;
  isItemsLoading?: boolean;
  isLoadingMoreItems?: boolean;
  items: MaterialCollectionItem[];
  onCreateGroup: (title: string) => void;
  onDeleteGroup: (group: MaterialCollectionGroup) => void;
  onDeleteMaterial: (item: MaterialCollectionItem) => void;
  onLoadMoreItems?: () => void;
  onMoveMaterial: (item: MaterialCollectionItem, groupId: string) => void;
  onOpenChange: (open: boolean) => void;
  onRenameGroup: (group: MaterialCollectionGroup, title: string) => void;
  onSelectGroup: (groupId: string) => void;
  onSelectMaterial: (item: MaterialCollectionItem) => void;
  onTopGroup: (group: MaterialCollectionGroup) => void;
  onTopMaterial: (item: MaterialCollectionItem) => void;
  open: boolean;
};

export function MaterialLibraryDialog({
  activeGroupId,
  bizType,
  groups,
  hasMoreItems = false,
  isBusy = false,
  isGroupsLoading = false,
  isItemsLoading = false,
  isLoadingMoreItems = false,
  items,
  onCreateGroup,
  onDeleteGroup,
  onDeleteMaterial,
  onLoadMoreItems,
  onMoveMaterial,
  onOpenChange,
  onRenameGroup,
  onSelectGroup,
  onSelectMaterial,
  onTopGroup,
  onTopMaterial,
  open,
}: MaterialLibraryDialogProps) {
  const [groupDialogState, setGroupDialogState] = useState<
    | { mode: "create" }
    | { group: MaterialCollectionGroup; mode: "edit" }
    | null
  >(null);
  const libraryTitle = getBizTypeLabel(bizType);
  const isGroupLimitReached = isMaterialCollectionGroupLimitReached(groups.length);

  function handleSubmitGroupTitle(title: string) {
    if (groupDialogState?.mode === "edit") {
      onRenameGroup(groupDialogState.group, title);
    } else {
      onCreateGroup(title);
    }

    setGroupDialogState(null);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="h-[min(44rem,calc(100vh-3rem))] max-h-[calc(100vh-3rem)] max-w-none gap-0 overflow-visible p-0"
        closeButtonClassName="right-0 -top-10 bg-transparent text-white opacity-100 shadow-none hover:bg-transparent hover:text-white focus:ring-0 data-[state=open]:bg-transparent data-[state=open]:text-white"
        style={getLibraryDialogStyle(bizType)}
      >
        <DialogTitle className="sr-only">{libraryTitle}</DialogTitle>
        <DialogDescription className="sr-only">
          从分组中选择已收录内容
        </DialogDescription>
        {items.length > 0 ? (
          <p className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[13px] leading-5 text-white/90">
            点击素材发送，右键菜单可调整排序或删除素材
          </p>
        ) : null}

        <div className="grid h-full min-h-0 grid-cols-[15rem_minmax(0,1fr)] overflow-hidden rounded-xl bg-sidebar">
          <aside className="flex h-full min-h-0 flex-col py-5 text-sidebar-foreground">
            <div className="mb-5 px-6">
              <div className="truncate text-sm font-semibold leading-6 text-foreground">
                {libraryTitle}
              </div>
            </div>

            <ScrollArea
              aria-label="素材分组列表"
              className="h-full min-h-0 flex-1"
              role="region"
            >
              {isGroupsLoading ? (
                <LoadingState label="正在加载分组" />
              ) : groups.length > 0 ? (
                <div className="space-y-1 px-4 pb-3">
                  {groups.map((group) => (
                    <GroupButton
                      active={activeGroupId === group.id}
                      disabled={isBusy}
                      group={group}
                      key={group.id}
                      onDelete={onDeleteGroup}
                      onClick={() => onSelectGroup(group.id)}
                      onEdit={(groupToEdit) =>
                        setGroupDialogState({ group: groupToEdit, mode: "edit" })}
                      onTop={onTopGroup}
                    />
                  ))}
                </div>
              ) : (
                <div className="px-6 py-2 text-[13px] text-muted-foreground">
                  暂无分组
                </div>
              )}
            </ScrollArea>

            <div className="px-4 pt-3">
              {isGroupLimitReached ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex w-full">
                        <Button
                          aria-label="新建分组"
                          className="h-9 w-full justify-start gap-2 rounded-[8px] px-3 text-[14px] font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          disabled
                          type="button"
                          variant="ghost"
                        >
                          <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.8} />
                          新建分组
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      分组数量已达上限
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button
                  aria-label="新建分组"
                  className="h-9 w-full justify-start gap-2 rounded-[8px] px-3 text-[14px] font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  disabled={isBusy}
                  onClick={() => setGroupDialogState({ mode: "create" })}
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.8} />
                  新建分组
                </Button>
              )}
            </div>
          </aside>

          <section className="flex h-full min-h-0 min-w-0 flex-col rounded-[14px_0_0_14px] bg-background shadow">
            <ScrollArea
              aria-label="素材内容列表"
              className="h-full min-h-0 flex-1"
              role="region"
            >
              {isItemsLoading ? (
                <LoadingState label="正在加载素材" />
              ) : items.length > 0 ? (
                <div className="mx-auto p-8" style={getLibraryBodyStyle(bizType)}>
                  <div
                    aria-label="收录内容列表"
                    className="grid items-start gap-4"
                    style={getLibraryGridStyle(bizType)}
                  >
                    {items.map((item) => (
                      <div className="max-w-full" key={item.id}>
                        <MaterialCard
                          className={
                            bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM
                              ? "w-[210px]"
                              : undefined
                          }
                          groups={groups}
                          item={item}
                          onDelete={onDeleteMaterial}
                          onMove={onMoveMaterial}
                          onSelect={onSelectMaterial}
                          onTop={onTopMaterial}
                        />
                      </div>
                    ))}
                  </div>
                  {hasMoreItems ? (
                    <div className="mt-5 flex justify-center">
                      <Button
                        className="h-8 gap-2 px-3 text-[13px]"
                        disabled={isBusy || isLoadingMoreItems}
                        onClick={onLoadMoreItems}
                        type="button"
                        variant="ghost"
                      >
                        {isLoadingMoreItems ? (
                          <Spinner className="text-current" size={14} />
                        ) : null}
                        加载更多
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-[28rem] items-center justify-center text-sm text-muted-foreground">
                  暂无数据
                </div>
              )}
            </ScrollArea>
          </section>
        </div>
        <MaterialGroupFormDialog
          initialTitle={
            groupDialogState?.mode === "edit" ? groupDialogState.group.title : ""
          }
          isSubmitting={isBusy}
          mode={groupDialogState?.mode ?? "create"}
          onOpenChange={(open) => {
            if (!open) {
              setGroupDialogState(null);
            }
          }}
          onSubmit={handleSubmitGroupTitle}
          open={groupDialogState !== null}
        />
      </DialogContent>
    </Dialog>
  );
}

function GroupButton({
  active,
  disabled,
  group,
  onDelete,
  onClick,
  onEdit,
  onTop,
}: {
  active: boolean;
  disabled: boolean;
  group: MaterialCollectionGroup;
  onDelete: (group: MaterialCollectionGroup) => void;
  onClick: () => void;
  onEdit: (group: MaterialCollectionGroup) => void;
  onTop: (group: MaterialCollectionGroup) => void;
}) {
  return (
    <div
      className={cn(
        "group flex h-9 w-full items-center gap-1 rounded-[8px] px-1 text-left text-[14px] outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-within:bg-sidebar-accent focus-within:text-sidebar-accent-foreground",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground",
      )}
    >
      <button
        className="flex h-8 min-w-0 flex-1 items-center justify-start gap-2 rounded-[7px] px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
        onClick={onClick}
        type="button"
      >
        <HugeiconsIcon
          className="shrink-0"
          icon={Folder01Icon}
          size={15}
          strokeWidth={1.8}
        />
        <span className="min-w-0 flex-1 truncate text-left">{group.title}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`打开 ${group.title} 操作菜单`}
            className="size-8 shrink-0 rounded-[8px] p-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            disabled={disabled}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              icon={MoreHorizontalIcon}
              size={16}
              strokeWidth={1.8}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[116px]">
          <DropdownMenuItem onSelect={() => onTop(group)}>
            <HugeiconsIcon icon={PinIcon} size={15} strokeWidth={1.8} />
            移到最前
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit(group)}>
            <HugeiconsIcon icon={Edit02Icon} size={15} strokeWidth={1.8} />
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive data-[highlighted]:text-destructive"
            onSelect={() => onDelete(group)}
          >
            <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-[12rem] items-center justify-center gap-2 text-[13px] text-muted-foreground"
      role="status"
    >
      <Spinner size={16} />
      {label}
    </div>
  );
}

function getBizTypeLabel(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    return "收录的文件";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    return "收录的小程序";
  }

  return "收录的H5";
}

function getLibraryDialogStyle(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    return {
      maxWidth: "calc(100vw - 2rem)",
      width: "74.5rem",
    };
  }

  return {
    maxWidth: "calc(100vw - 2rem)",
    width: "60rem",
  };
}

function getLibraryGridStyle(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    return {
      gap: "16px",
      gridTemplateColumns: "repeat(4, 210px)",
      maxWidth: "100%",
      width: "888px",
    };
  }

  return {
    gridTemplateColumns: "repeat(2, 20rem)",
    maxWidth: "100%",
    width: "41rem",
  };
}

function getLibraryBodyStyle(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    return {
      maxWidth: "100%",
      width: "59.5rem",
    };
  }

  return {
    maxWidth: "100%",
    width: "45rem",
  };
}
