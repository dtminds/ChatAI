import { useEffect, useMemo, useState } from "react";
import { FileEmpty01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import type {
  MaterialCollectionGroup,
  MaterialCollectionItem,
} from "@/pages/chat/components/material-collection/material-types";

type MaterialFileTableProps = {
  groups: MaterialCollectionGroup[];
  hasMoreItems: boolean;
  isBusy: boolean;
  isLoadingMoreItems: boolean;
  items: MaterialCollectionItem[];
  onCancel: () => void;
  onDelete: (item: MaterialCollectionItem) => void;
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
  items,
  onCancel,
  onDelete,
  onLoadMoreItems,
  onMove,
  onSelect,
  onTop,
}: MaterialFileTableProps) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [contextMenuState, setContextMenuState] = useState<{
    item: MaterialCollectionItem;
    position: { x: number; y: number } | null;
  } | null>(null);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId),
    [items, selectedItemId],
  );

  useEffect(() => {
    if (selectedItemId && !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId("");
    }
  }, [items, selectedItemId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea
        aria-label="收录文件列表区域"
        className="min-h-0 flex-1"
        role="region"
      >
        <div className="px-6 pb-5 pt-5">
          <RadioGroup
            aria-label="选择收录文件"
            className="block"
            onValueChange={setSelectedItemId}
            value={selectedItemId}
          >
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
                      className={cn(
                        "group cursor-pointer border-b-0 hover:bg-transparent data-[state=selected]:bg-transparent",
                      )}
                      data-state={selected ? "selected" : undefined}
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
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
                        <RadioGroupItem
                          aria-label={`选择 ${file.fileName}`}
                          onClick={(event) => event.stopPropagation()}
                          value={item.id}
                        />
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
          </RadioGroup>
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
          disabled={isBusy || !selectedItem}
          onClick={() => {
            if (selectedItem) {
              onSelect(selectedItem);
            }
          }}
          type="button"
        >
          发送
        </Button>
      </div>

      {contextMenuState ? (
        <MaterialActionsMenu
          groups={groups}
          item={contextMenuState.item}
          onDelete={onDelete}
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
