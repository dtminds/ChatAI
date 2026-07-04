import { useState } from "react";
import { FileEmpty01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
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
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { MaterialActionsMenu } from "@/pages/chat/components/material-collection/material-actions-menu";
import { MaterialLibraryFooter } from "@/pages/chat/components/material-collection/material-library-footer";
import { MaterialSelectionIndicator } from "@/pages/chat/components/material-collection/material-selection-indicator";
import type {
  MaterialCollectionGroup,
  MaterialCollectionItem,
} from "@/pages/chat/components/material-collection/material-types";
import { useNullableMaterialSelection } from "@/pages/chat/components/material-collection/use-nullable-material-selection";

type MaterialFileTableProps = {
  groups: MaterialCollectionGroup[];
  hasMoreItems: boolean;
  isBusy: boolean;
  isLoadingMoreItems: boolean;
  isMobileLayout?: boolean;
  isSending?: boolean;
  items: MaterialCollectionItem[];
  onCancel: () => void;
  onDelete: (item: MaterialCollectionItem) => void;
  onEdit?: (item: MaterialCollectionItem) => void;
  onLoadMoreItems?: () => void;
  onMove: (item: MaterialCollectionItem, groupId: string) => void;
  onSelect: (item: MaterialCollectionItem) => void;
  onTop: (item: MaterialCollectionItem) => void;
};

export function MaterialFileTable({
  groups,
  hasMoreItems,
  isBusy,
  isLoadingMoreItems,
  isMobileLayout = false,
  isSending = false,
  items,
  onCancel,
  onDelete,
  onEdit,
  onLoadMoreItems,
  onMove,
  onSelect,
  onTop,
}: MaterialFileTableProps) {
  const { selectedItem, selectedItemId, toggleItemSelection } =
    useNullableMaterialSelection(items);
  const [contextMenuState, setContextMenuState] = useState<{
    item: MaterialCollectionItem;
    position: { x: number; y: number } | null;
  } | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isMobileLayout ? (
        <div
          aria-label="收录文件列表区域"
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
          role="region"
        >
          <div className="min-w-0 max-w-full space-y-2 overflow-hidden p-4">
            {items.map((item) => {
              const file = getFileTableContent(item);
              const selected = selectedItemId === item.id;

              return (
                <div
                  className={cn(
                    "flex w-full max-w-full min-w-0 items-center gap-3 overflow-hidden rounded-[10px] border border-border bg-surface px-3 py-3 transition-colors",
                    selected && "border-primary bg-accent/45",
                  )}
                  key={item.id}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setContextMenuState({
                      item,
                      position: {
                        x: event.clientX,
                        y: event.clientY,
                      },
                    });
                  }}
                >
                  <button
                    aria-label={`选择 ${file.fileName}`}
                    aria-pressed={selected}
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    onClick={() => toggleItemSelection(item.id)}
                    type="button"
                  >
                    <MaterialSelectionIndicator selected={selected} size="sm" />
                  </button>
                  {file.extension ? (
                    <FileExtensionBadge
                      className="size-9 shrink-0"
                      extension={file.extension}
                    />
                  ) : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[6px] bg-muted text-muted-foreground">
                      <HugeiconsIcon
                        icon={FileEmpty01Icon}
                        size={18}
                        strokeWidth={1.8}
                      />
                    </span>
                  )}
                  <button
                    className="min-w-0 flex-1 overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    onClick={() => toggleItemSelection(item.id)}
                    type="button"
                  >
                    <span
                      className="block truncate text-[14px] font-medium text-foreground"
                      title={file.fileName}
                    >
                      {file.fileName}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {formatMaterialDate(item.createdAt)}
                      {file.fileSizeLabel ? ` · ${file.fileSizeLabel}` : ""}
                    </span>
                  </button>
                  <Button
                    aria-label={`打开 ${file.fileName} 操作菜单`}
                    className="size-8 shrink-0 rounded-[8px] p-0"
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setContextMenuState({
                        item,
                        position: {
                          x: rect.left,
                          y: rect.bottom + 4,
                        },
                      });
                    }}
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
                </div>
              );
            })}
            {hasMoreItems ? (
              <LoadMoreButton
                isBusy={isBusy}
                isLoadingMoreItems={isLoadingMoreItems}
                onLoadMoreItems={onLoadMoreItems}
              />
            ) : null}
          </div>
        </div>
      ) : (
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
                      className={cn(
                        "group cursor-pointer border-b-0 hover:bg-transparent data-[state=selected]:bg-transparent",
                      )}
                      data-state={selected ? "selected" : undefined}
                      key={item.id}
                      onClick={() => toggleItemSelection(item.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenuState({
                          item,
                          position: {
                            x: event.clientX,
                            y: event.clientY,
                          },
                        });
                      }}
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
                            toggleItemSelection(item.id);
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
              <LoadMoreButton
                isBusy={isBusy}
                isLoadingMoreItems={isLoadingMoreItems}
                onLoadMoreItems={onLoadMoreItems}
              />
            ) : null}
          </div>
        </ScrollArea>
      )}

      <MaterialLibraryFooter
        canSend={selectedItem != null}
        isBusy={isBusy}
        isMobileLayout={isMobileLayout}
        isSending={isSending}
        onCancel={onCancel}
        onSend={() => {
          if (selectedItem) {
            onSelect(selectedItem);
          }
        }}
      />

      {contextMenuState ? (
        <MaterialActionsMenu
          groups={groups}
          item={contextMenuState.item}
          onDelete={onDelete}
          onEdit={onEdit}
          onMove={onMove}
          onOpenChange={(position) => {
            setContextMenuState(
              position ? { item: contextMenuState.item, position } : {
                item: contextMenuState.item,
                position: null,
              },
            );
          }}
          onTop={onTop}
          position={contextMenuState.position}
        />
      ) : null}
    </div>
  );
}

function LoadMoreButton({
  isBusy,
  isLoadingMoreItems,
  onLoadMoreItems,
}: {
  isBusy: boolean;
  isLoadingMoreItems: boolean;
  onLoadMoreItems?: () => void;
}) {
  return (
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
  );
}

function getFileTableContent(item: MaterialCollectionItem) {
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
