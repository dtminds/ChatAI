import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileEmpty01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type MaterialCollectionBizType,
  type WorkbenchMaterialCollectionGroupDto,
  type WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { MaterialCard } from "@/pages/chat/components/material-collection/material-card";
import { MaterialSelectionIndicator } from "@/pages/chat/components/material-collection/material-selection-indicator";
import type { MaterialCollectionItem } from "@/pages/chat/components/material-collection/material-types";

type QuickReplyMaterialPickerDialogProps = {
  bizType: QuickReplyAttachmentMaterialBizType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: WorkbenchMaterialCollectionItemDto) => void;
};

export type QuickReplyAttachmentMaterialBizType =
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.FILE
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.H5
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.IMAGE
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.VIDEO;

export function QuickReplyMaterialPickerDialog({
  bizType,
  open,
  onOpenChange,
  onSelect,
}: QuickReplyMaterialPickerDialogProps) {
  const [groups, setGroups] = useState<WorkbenchMaterialCollectionGroupDto[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [items, setItems] = useState<WorkbenchMaterialCollectionItemDto[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);
  const [isItemsLoading, setIsItemsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const requestSeqRef = useRef(0);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );
  const libraryTitle = getLibraryTitle(bizType);
  const isFileLibrary = bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE;
  const isBusy = isGroupsLoading || isItemsLoading || isLoadingMore;

  const loadItems = useCallback(
    async ({
      groupId,
      mode,
      nextPage,
      requestSeq,
      type,
    }: {
      groupId: string;
      mode: "append" | "replace";
      nextPage: number;
      requestSeq: number;
      type: QuickReplyAttachmentMaterialBizType;
    }) => {
      const response = await getWorkbenchService().listMaterialCollections({
        bizType: type,
        groupId,
        page: nextPage,
        pageSize: 100,
      });

      if (requestSeqRef.current !== requestSeq) {
        return;
      }

      setItems((currentItems) =>
        mode === "append"
          ? [...currentItems, ...response.items]
          : response.items,
      );
      setPage(response.pagination.page);
      setHasMore(response.pagination.hasMore);
    },
    [],
  );

  useEffect(() => {
    if (!open || !bizType) {
      return;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setGroups([]);
    setItems([]);
    setActiveGroupId(null);
    setSelectedItemId(null);
    setHasMore(false);
    setPage(1);
    setIsGroupsLoading(true);
    setIsItemsLoading(false);

    void (async () => {
      try {
        const groupResponse = await getWorkbenchService().listMaterialGroups({
          bizType,
        });

        if (requestSeqRef.current !== requestSeq) {
          return;
        }

        setGroups(groupResponse.groups);
        const firstGroupId = groupResponse.groups[0]?.id ?? null;
        setActiveGroupId(firstGroupId);

        if (firstGroupId) {
          setIsItemsLoading(true);
          await loadItems({
            groupId: firstGroupId,
            mode: "replace",
            nextPage: 1,
            requestSeq,
            type: bizType,
          });
        }
      } finally {
        if (requestSeqRef.current === requestSeq) {
          setIsGroupsLoading(false);
          setIsItemsLoading(false);
        }
      }
    })();
  }, [bizType, loadItems, open]);

  const handleSelectGroup = (groupId: string) => {
    if (!bizType || groupId === activeGroupId) {
      return;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setActiveGroupId(groupId);
    setSelectedItemId(null);
    setItems([]);
    setIsItemsLoading(true);

    void loadItems({
      groupId,
      mode: "replace",
      nextPage: 1,
      requestSeq,
      type: bizType,
    }).finally(() => {
      if (requestSeqRef.current === requestSeq) {
        setIsItemsLoading(false);
      }
    });
  };

  const handleLoadMore = () => {
    if (!bizType || !activeGroupId || isLoadingMore || !hasMore) {
      return;
    }

    const requestSeq = requestSeqRef.current;
    setIsLoadingMore(true);

    void loadItems({
      groupId: activeGroupId,
      mode: "append",
      nextPage: page + 1,
      requestSeq,
      type: bizType,
    }).finally(() => {
      setIsLoadingMore(false);
    });
  };

  const handleConfirm = () => {
    if (!selectedItem) {
      return;
    }

    onSelect(selectedItem);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="h-[min(44rem,calc(100vh-3rem))] max-h-[calc(100vh-3rem)] max-w-none gap-0 overflow-visible p-0"
        closeButtonClassName="right-0 -top-10 bg-transparent text-white opacity-100 shadow-none hover:bg-transparent hover:text-white focus:ring-0 data-[state=open]:bg-transparent data-[state=open]:text-white"
        style={getLibraryDialogStyle(bizType)}
      >
        <DialogTitle className="sr-only">{libraryTitle}</DialogTitle>
        <DialogDescription className="sr-only">从已收录素材中选择附件</DialogDescription>

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
                      group={group}
                      key={group.id}
                      onClick={() => handleSelectGroup(group.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="px-6 py-2 text-[13px] text-muted-foreground">
                  暂无分组
                </div>
              )}
            </ScrollArea>
          </aside>

          <section className="flex h-full min-h-0 min-w-0 flex-col rounded-[14px_0_0_14px] bg-background shadow">
            {isItemsLoading ? (
              <LoadingState label="正在加载素材" />
            ) : items.length > 0 ? (
              isFileLibrary ? (
                <QuickReplyFilePickerTable
                  hasMoreItems={hasMore}
                  isBusy={isBusy}
                  isLoadingMoreItems={isLoadingMore}
                  items={items}
                  onCancel={() => onOpenChange(false)}
                  onConfirm={handleConfirm}
                  onLoadMoreItems={handleLoadMore}
                  selectedItem={selectedItem}
                  selectedItemId={selectedItemId}
                  onToggleSelect={(itemId) =>
                    setSelectedItemId((currentId) =>
                      currentId === itemId ? null : itemId,
                    )
                  }
                />
              ) : (
                <QuickReplyCardPickerGrid
                  bizType={bizType}
                  hasMoreItems={hasMore}
                  isBusy={isBusy}
                  isLoadingMoreItems={isLoadingMore}
                  items={items}
                  onCancel={() => onOpenChange(false)}
                  onConfirm={handleConfirm}
                  onLoadMoreItems={handleLoadMore}
                  selectedItem={selectedItem}
                  selectedItemId={selectedItemId}
                  onToggleSelect={(itemId) =>
                    setSelectedItemId((currentId) =>
                      currentId === itemId ? null : itemId,
                    )
                  }
                />
              )
            ) : (
              <div className="flex min-h-[28rem] items-center justify-center text-sm text-muted-foreground">
                暂无数据
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GroupButton({
  active,
  group,
  onClick,
}: {
  active: boolean;
  group: WorkbenchMaterialCollectionGroupDto;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex h-9 w-full min-w-0 items-center justify-start gap-2 rounded-[8px] px-3 text-left text-[14px] outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/25",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground",
      )}
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
  );
}

function QuickReplyFilePickerTable({
  hasMoreItems,
  isBusy,
  isLoadingMoreItems,
  items,
  onCancel,
  onConfirm,
  onLoadMoreItems,
  onToggleSelect,
  selectedItem,
  selectedItemId,
}: {
  hasMoreItems: boolean;
  isBusy: boolean;
  isLoadingMoreItems: boolean;
  items: WorkbenchMaterialCollectionItemDto[];
  onCancel: () => void;
  onConfirm: () => void;
  onLoadMoreItems: () => void;
  onToggleSelect: (itemId: string) => void;
  selectedItem: WorkbenchMaterialCollectionItemDto | null;
  selectedItemId: string | null;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea
        aria-label="收录文件列表区域"
        className="min-h-0 flex-1"
        role="region"
      >
        <div className="px-6 pb-5 pt-5">
          <Table
            aria-label="收录文件列表"
            className="table-fixed border-separate border-spacing-y-1"
          >
            <colgroup>
              <col className="w-14" />
              <col />
              <col className="w-40" />
              <col className="w-32" />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14 px-4">
                  <span className="sr-only">选择</span>
                </TableHead>
                <TableHead className="px-0 pr-6 text-[14px] font-medium text-muted-foreground">
                  名称
                </TableHead>
                <TableHead className="px-4 text-[14px] font-medium text-muted-foreground">
                  收录时间
                </TableHead>
                <TableHead className="px-4 text-right text-[14px] font-medium text-muted-foreground">
                  文件大小
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const file = getFileTableContent(item);
                const selected = selectedItemId === item.id;

                return (
                  <TableRow
                    aria-label={item.title}
                    aria-selected={selected}
                    className="group cursor-pointer border-b-0 hover:bg-transparent data-[state=selected]:bg-transparent"
                    data-state={selected ? "selected" : undefined}
                    key={item.id}
                    onClick={() => onToggleSelect(item.id)}
                  >
                    <TableCell
                      className={cn(
                        "h-14 w-14 rounded-l-[10px] px-4 py-1.5 transition-colors group-hover:bg-accent/50",
                        selected && "bg-accent/50",
                      )}
                    >
                      <button
                        aria-label={`选择 ${file.fileName}`}
                        aria-pressed={selected}
                        className="inline-flex size-4 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleSelect(item.id);
                        }}
                        type="button"
                      >
                        <MaterialSelectionIndicator selected={selected} size="sm" />
                      </button>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "min-w-0 overflow-hidden px-0 py-1.5 pr-6 transition-colors group-hover:bg-accent/50",
                        selected && "bg-accent/50",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {file.extension ? (
                          <FileExtensionBadge
                            className="size-8"
                            extension={file.extension}
                          />
                        ) : (
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-muted text-muted-foreground">
                            <HugeiconsIcon
                              icon={FileEmpty01Icon}
                              size={18}
                              strokeWidth={1.8}
                            />
                          </span>
                        )}
                        <span
                          className="min-w-0 truncate text-[14px] font-medium text-foreground"
                          title={file.fileName}
                        >
                          {file.fileName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "whitespace-nowrap px-4 py-1.5 text-[13px] text-muted-foreground transition-colors group-hover:bg-accent/50",
                        selected && "bg-accent/50",
                      )}
                    >
                      {formatMaterialDate(item.createdAt)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "whitespace-nowrap rounded-r-[10px] px-4 py-1.5 text-right text-[13px] text-muted-foreground transition-colors group-hover:bg-accent/50",
                        selected && "bg-accent/50",
                      )}
                    >
                      {file.fileSizeLabel || "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {hasMoreItems ? (
            <div className="mt-3 flex justify-center">
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
      </ScrollArea>

      <QuickReplyPickerFooter
        canConfirm={selectedItem != null}
        isBusy={isBusy}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </div>
  );
}

function QuickReplyCardPickerGrid({
  bizType,
  hasMoreItems,
  isBusy,
  isLoadingMoreItems,
  items,
  onCancel,
  onConfirm,
  onLoadMoreItems,
  onToggleSelect,
  selectedItem,
  selectedItemId,
}: {
  bizType: QuickReplyAttachmentMaterialBizType | null;
  hasMoreItems: boolean;
  isBusy: boolean;
  isLoadingMoreItems: boolean;
  items: WorkbenchMaterialCollectionItemDto[];
  onCancel: () => void;
  onConfirm: () => void;
  onLoadMoreItems: () => void;
  onToggleSelect: (itemId: string) => void;
  selectedItem: WorkbenchMaterialCollectionItemDto | null;
  selectedItemId: string | null;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea
        aria-label="素材内容列表"
        className="min-h-0 flex-1 h-full"
        role="region"
      >
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
                    isCardLibraryBizType(bizType)
                      ? getCardLibraryItemClassName(bizType)
                      : undefined
                  }
                  item={item as MaterialCollectionItem}
                  onToggleSelect={() => onToggleSelect(item.id)}
                  selected={selectedItemId === item.id}
                  selectionMode="toggle"
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
      </ScrollArea>

      <QuickReplyPickerFooter
        canConfirm={selectedItem != null}
        isBusy={isBusy}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </div>
  );
}

function QuickReplyPickerFooter({
  canConfirm,
  isBusy,
  onCancel,
  onConfirm,
}: {
  canConfirm: boolean;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex shrink-0 justify-end gap-3 border-t border-divider px-8 py-4">
      <Button
        className="min-w-28"
        disabled={isBusy}
        onClick={onCancel}
        type="button"
        variant="outline"
      >
        取消
      </Button>
      <Button
        className="min-w-28"
        disabled={isBusy || !canConfirm}
        onClick={onConfirm}
        type="button"
      >
        确定
      </Button>
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

function getLibraryTitle(bizType: MaterialCollectionBizType | null) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    return "收录的文件";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.IMAGE) {
    return "收录的图片";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    return "收录的视频";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    return "收录的小程序";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED) {
    return "收录的视频号";
  }

  return "收录的H5";
}

function getLibraryDialogStyle(bizType: MaterialCollectionBizType | null) {
  if (
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.IMAGE ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED
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

function isCardLibraryBizType(bizType: MaterialCollectionBizType | null) {
  return (
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.IMAGE ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED
  );
}

function getCardLibraryItemClassName(bizType: MaterialCollectionBizType | null) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED) {
    return "w-[217px]";
  }

  return "w-[210px]";
}

function getLibraryBodyStyle(bizType: MaterialCollectionBizType | null) {
  if (isCardLibraryBizType(bizType)) {
    return {
      maxWidth: "100%",
      width: "59.5rem",
    } as const;
  }

  return {
    maxWidth: "100%",
    width: "45rem",
  } as const;
}

function getLibraryGridStyle(bizType: MaterialCollectionBizType | null) {
  if (isCardLibraryBizType(bizType)) {
    return {
      gap: "16px",
      gridTemplateColumns: "repeat(4, 210px)",
      width: "888px",
    } as const;
  }

  return {
    gap: "16px",
    gridTemplateColumns: "repeat(2, 20rem)",
    maxWidth: "100%",
    width: "41rem",
  } as const;
}

function getFileTableContent(item: WorkbenchMaterialCollectionItemDto) {
  const fileName = readString(item.content.fileName) || item.title || "文件";

  return {
    extension: readString(item.content.extension) || getFileExtension(fileName),
    fileName,
    fileSizeLabel: readString(item.content.fileSizeLabel),
  };
}

function formatMaterialDate(timestamp: number | undefined) {
  if (!timestamp || timestamp <= 0) {
    return "-";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");

  return index >= 0 ? fileName.slice(index + 1).trim().toLowerCase() : "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
