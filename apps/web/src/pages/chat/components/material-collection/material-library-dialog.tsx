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
import { MaterialCardGrid } from "@/pages/chat/components/material-collection/material-card-grid";
import { MaterialFileTable } from "@/pages/chat/components/material-collection/material-file-table";
import { MaterialImageGrid } from "@/pages/chat/components/material-collection/material-image-grid";
import { MaterialGroupFormDialog } from "@/pages/chat/components/material-collection/material-group-form-dialog";
import type {
  MaterialCollectionGroup,
  MaterialCollectionItem,
} from "@/pages/chat/components/material-collection/material-types";
import {
  getMaterialContentFormValues,
  isMaterialCollectionGroupLimitReached,
} from "@/pages/chat/components/material-collection/material-types";
import { MaterialItemFormDialog } from "@/pages/chat/components/material-collection/material-item-form-dialog";
import type { MaterialContentFormValues } from "@/pages/chat/components/material-collection/material-content-form-fields";

type MaterialLibraryDialogProps = {
  activeGroupId: string | null;
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"];
  groups: MaterialCollectionGroup[];
  hasMoreItems?: boolean;
  isBusy?: boolean;
  isGroupsLoading?: boolean;
  isItemsLoading?: boolean;
  isLoadingMoreItems?: boolean;
  isMobileLayout?: boolean;
  isSending?: boolean;
  items: MaterialCollectionItem[];
  onCreateGroup: (title: string) => void;
  onDeleteGroup: (group: MaterialCollectionGroup) => void;
  onDeleteMaterial: (item: MaterialCollectionItem) => void;
  onEditMaterial: (
    item: MaterialCollectionItem,
    values: MaterialContentFormValues,
  ) => void;
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
  isMobileLayout = false,
  isSending = false,
  items,
  onCreateGroup,
  onDeleteGroup,
  onDeleteMaterial,
  onEditMaterial,
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
  const [editingMaterialItem, setEditingMaterialItem] =
    useState<MaterialCollectionItem | null>(null);
  const libraryTitle = getBizTypeLabel(bizType);
  const isGroupLimitReached = isMaterialCollectionGroupLimitReached(groups.length);
  const isFileLibrary = bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE;
  const isImageLibrary = bizType === MATERIAL_COLLECTION_BIZ_TYPE.IMAGE;
  const libraryHint = isMobileLayout
    ? "选择素材后发送，更多菜单可管理素材"
    : isFileLibrary
      ? "选择文件后发送，右键菜单可调整排序或删除素材"
      : "选择素材后发送，右键菜单可调整排序或删除素材";

  function handleSubmitGroupTitle(title: string) {
    if (groupDialogState?.mode === "edit") {
      onRenameGroup(groupDialogState.group, title);
    } else {
      onCreateGroup(title);
    }

    setGroupDialogState(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isSending) {
      return;
    }

    onOpenChange(nextOpen);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className={cn(
          "gap-0 p-0",
          isMobileLayout
            ? "left-0 top-0 flex h-svh max-h-svh w-screen max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-0"
            : "h-[min(44rem,calc(100vh-3rem))] max-h-[calc(100vh-3rem)] max-w-none overflow-visible",
        )}
        closeButtonDisabled={isSending}
        closeButtonClassName={
          isMobileLayout
            ? "right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] opacity-100"
            : "right-0 -top-10 bg-transparent text-white opacity-100 shadow-none hover:bg-transparent hover:text-white focus:ring-0 data-[state=open]:bg-transparent data-[state=open]:text-white"
        }
        style={isMobileLayout ? undefined : getLibraryDialogStyle(bizType)}
      >
        <div
          className={cn(
            isMobileLayout
              ? "shrink-0 border-b border-divider bg-background px-4 pb-3 pr-12 pt-[calc(env(safe-area-inset-top)+1rem)]"
              : "contents",
          )}
        >
          <DialogTitle
            className={cn(
              isMobileLayout
                ? "truncate text-[17px] font-semibold leading-6 text-foreground"
                : "sr-only",
            )}
          >
            {libraryTitle}
          </DialogTitle>
          <DialogDescription
            className={cn(
              isMobileLayout
                ? "mt-1 truncate text-[12px] leading-5 text-muted-foreground"
                : "sr-only",
            )}
          >
            {isMobileLayout ? libraryHint : "从分组中选择已收录内容"}
          </DialogDescription>
        </div>
        {items.length > 0 && !isMobileLayout ? (
          <p className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[13px] leading-5 text-white/90">
            {libraryHint}
          </p>
        ) : null}

        <div
          className={cn(
            "h-full min-h-0 overflow-hidden bg-sidebar",
            isMobileLayout
              ? "flex flex-1 flex-col rounded-none"
              : "grid grid-cols-[15rem_minmax(0,1fr)] rounded-xl",
          )}
        >
          {isMobileLayout ? (
            <div
              aria-label="素材分组列表"
              className="shrink-0 overflow-x-auto border-b border-divider bg-sidebar px-4 py-3 text-sidebar-foreground"
              role="region"
            >
              {isGroupsLoading ? (
                <div
                  className="flex h-10 items-center gap-2 text-[13px] text-muted-foreground"
                  role="status"
                >
                  <Spinner size={16} />
                  正在加载分组
                </div>
              ) : (
                <div className="flex min-w-max items-center gap-2">
                  {groups.length > 0 ? (
                    groups.map((group) => (
                      <MobileGroupButton
                        active={activeGroupId === group.id}
                        disabled={isBusy}
                        group={group}
                        key={group.id}
                        onClick={() => onSelectGroup(group.id)}
                      />
                    ))
                  ) : (
                    <span className="inline-flex h-10 items-center text-[13px] text-muted-foreground">
                      暂无分组
                    </span>
                  )}
                  <Button
                    aria-label="新建分组"
                    className="h-10 shrink-0 gap-2 rounded-[10px] px-3 text-[13px]"
                    disabled={isBusy || isGroupLimitReached}
                    onClick={() => setGroupDialogState({ mode: "create" })}
                    type="button"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.8} />
                    新建分组
                  </Button>
                </div>
              )}
            </div>
          ) : (
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
                            <HugeiconsIcon
                              icon={Add01Icon}
                              size={15}
                              strokeWidth={1.8}
                            />
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
          )}

          <section
            className={cn(
              "flex h-full min-h-0 min-w-0 flex-col bg-background shadow",
              isMobileLayout ? "flex-1 rounded-none" : "rounded-[14px_0_0_14px]",
            )}
          >
            {isItemsLoading ? (
              <LoadingState label="正在加载素材" />
            ) : items.length > 0 ? (
              isFileLibrary ? (
                <MaterialFileTable
                  groups={groups}
                  hasMoreItems={hasMoreItems}
                  isBusy={isBusy}
                  isLoadingMoreItems={isLoadingMoreItems}
                  isMobileLayout={isMobileLayout}
                  isSending={isSending}
                  items={items}
                  onCancel={() => onOpenChange(false)}
                  onDelete={onDeleteMaterial}
                  onEdit={setEditingMaterialItem}
                  onLoadMoreItems={onLoadMoreItems}
                  onMove={onMoveMaterial}
                  onSelect={onSelectMaterial}
                  onTop={onTopMaterial}
                />
              ) : isImageLibrary ? (
                <MaterialImageGrid
                  groups={groups}
                  hasMoreItems={hasMoreItems}
                  isBusy={isBusy}
                  isLoadingMoreItems={isLoadingMoreItems}
                  isMobileLayout={isMobileLayout}
                  isSending={isSending}
                  items={items}
                  onCancel={() => onOpenChange(false)}
                  onDeleteMaterial={onDeleteMaterial}
                  onLoadMoreItems={onLoadMoreItems}
                  onMoveMaterial={onMoveMaterial}
                  onSendMaterial={onSelectMaterial}
                  onTopMaterial={onTopMaterial}
                />
              ) : (
                <MaterialCardGrid
                  bizType={bizType}
                  groups={groups}
                  hasMoreItems={hasMoreItems}
                  isBusy={isBusy}
                  isLoadingMoreItems={isLoadingMoreItems}
                  isMobileLayout={isMobileLayout}
                  isSending={isSending}
                  items={items}
                  onCancel={() => onOpenChange(false)}
                  onDeleteMaterial={onDeleteMaterial}
                  onEditMaterial={setEditingMaterialItem}
                  onLoadMoreItems={onLoadMoreItems}
                  onMoveMaterial={onMoveMaterial}
                  onSendMaterial={onSelectMaterial}
                  onTopMaterial={onTopMaterial}
                />
              )
            ) : (
              <div className="flex min-h-[28rem] items-center justify-center text-sm text-muted-foreground">
                暂无数据
              </div>
            )}
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
        {editingMaterialItem ? (
          <MaterialItemFormDialog
            bizType={
              editingMaterialItem.bizType as WorkbenchMaterialCollectionGroupCreateRequest["bizType"]
            }
            initialValues={getMaterialContentFormValues(editingMaterialItem)}
            isSubmitting={isBusy}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                setEditingMaterialItem(null);
              }
            }}
            onSubmit={(values) => {
              onEditMaterial(editingMaterialItem, values);
              setEditingMaterialItem(null);
            }}
            open
          />
        ) : null}
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
        className="flex h-8 min-w-0 flex-1 items-center justify-start gap-2 rounded-[7px] px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
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

function MobileGroupButton({
  active,
  disabled,
  group,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  group: MaterialCollectionGroup;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-10 max-w-[11rem] shrink-0 items-center gap-2 rounded-[10px] px-3 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <HugeiconsIcon
        className="shrink-0"
        icon={Folder01Icon}
        size={15}
        strokeWidth={1.8}
      />
      <span className="min-w-0 truncate">{group.title}</span>
    </button>
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

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED) {
    return "收录的视频号";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    return "收录的视频";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.IMAGE) {
    return "收录的图片";
  }

  return "收录的H5";
}

function getLibraryDialogStyle(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO
  ) {
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
