import { useState } from "react";
import { ZoomInAreaIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { MaterialActionsMenu } from "@/pages/chat/components/material-collection/material-actions-menu";
import { MaterialLibraryFooter } from "@/pages/chat/components/material-collection/material-library-footer";
import { MaterialSelectionIndicator } from "@/pages/chat/components/material-collection/material-selection-indicator";
import type {
  MaterialCollectionGroup,
  MaterialCollectionItem,
} from "@/pages/chat/components/material-collection/material-types";
import { useNullableMaterialSelection } from "@/pages/chat/components/material-collection/use-nullable-material-selection";

type MaterialImageGridProps = {
  groups: MaterialCollectionGroup[];
  hasMoreItems: boolean;
  isBusy: boolean;
  isLoadingMoreItems: boolean;
  isSending?: boolean;
  items: MaterialCollectionItem[];
  onCancel: () => void;
  onDeleteMaterial: (item: MaterialCollectionItem) => void;
  onLoadMoreItems?: () => void;
  onMoveMaterial: (item: MaterialCollectionItem, groupId: string) => void;
  onSendMaterial: (item: MaterialCollectionItem) => void;
  onTopMaterial: (item: MaterialCollectionItem) => void;
};

export function MaterialImageGrid({
  groups,
  hasMoreItems,
  isBusy,
  isLoadingMoreItems,
  isSending = false,
  items,
  onCancel,
  onDeleteMaterial,
  onLoadMoreItems,
  onMoveMaterial,
  onSendMaterial,
  onTopMaterial,
}: MaterialImageGridProps) {
  const { selectedItem, selectedItemId, toggleItemSelection } =
    useNullableMaterialSelection(items);
  const [previewItem, setPreviewItem] = useState<MaterialCollectionItem | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea
        aria-label="收录图片列表区域"
        className="min-h-0 flex-1"
        role="region"
      >
        <div className="mx-auto w-full max-w-[43rem] p-8">
          <div
            aria-label="收录图片列表"
            className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4"
          >
            {items.map((item) => (
              <MaterialImageTile
                groups={groups}
                item={item}
                key={item.id}
                onDelete={onDeleteMaterial}
                onMove={onMoveMaterial}
                onPreview={() => setPreviewItem(item)}
                onToggleSelect={() => toggleItemSelection(item.id)}
                onTop={onTopMaterial}
                selected={selectedItemId === item.id}
              />
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

      <MaterialLibraryFooter
        canSend={selectedItem != null}
        isBusy={isBusy}
        isSending={isSending}
        onCancel={onCancel}
        onSend={() => {
          if (selectedItem) {
            onSendMaterial(selectedItem);
          }
        }}
      />

      <MaterialImagePreviewDialog
        item={previewItem}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewItem(null);
          }
        }}
      />
    </div>
  );
}

function MaterialImageTile({
  groups,
  item,
  onDelete,
  onMove,
  onPreview,
  onToggleSelect,
  onTop,
  selected,
}: {
  groups: MaterialCollectionGroup[];
  item: MaterialCollectionItem;
  onDelete: (item: MaterialCollectionItem) => void;
  onMove: (item: MaterialCollectionItem, groupId: string) => void;
  onPreview: () => void;
  onToggleSelect: () => void;
  onTop: (item: MaterialCollectionItem) => void;
  selected: boolean;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const image = getImageMaterialContent(item);

  return (
    <div className="group/image relative">
      <button
        aria-label={`选择图片 ${image.alt}`}
        aria-pressed={selected}
        className={cn(
          "relative block aspect-square w-full overflow-hidden rounded-[8px] border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
          selected ? "border-primary" : "border-border hover:border-ring/40",
        )}
        onClick={onToggleSelect}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
          });
        }}
        type="button"
      >
        {image.imageUrl ? (
          <img
            alt={image.alt}
            className="size-full object-contain"
            loading="lazy"
            src={image.imageUrl}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-[13px] text-muted-foreground">
            图片不可用
          </span>
        )}
        <MaterialSelectionIndicator
          className="absolute right-2 top-2"
          selected={selected}
        />
      </button>
      <Button
        aria-label={`查看大图 ${image.alt}`}
        className="absolute bottom-2 right-2 size-7 rounded-[8px] bg-background/90 p-0 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 group-hover/image:opacity-100"
        disabled={!image.imageUrl}
        onClick={(event) => {
          event.stopPropagation();
          onPreview();
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={ZoomInAreaIcon} size={15} strokeWidth={1.8} />
      </Button>

      <MaterialActionsMenu
        groups={groups}
        item={item}
        onDelete={onDelete}
        onMove={onMove}
        onOpenChange={setContextMenu}
        onTop={onTop}
        position={contextMenu}
      />
    </div>
  );
}

function MaterialImagePreviewDialog({
  item,
  onOpenChange,
}: {
  item: MaterialCollectionItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const image = item ? getImageMaterialContent(item) : null;

  return (
    <Dialog onOpenChange={onOpenChange} open={item != null}>
      <DialogContent className="h-[min(42rem,calc(100vh-3rem))] max-w-[min(70rem,calc(100vw-2rem))] gap-0 overflow-hidden border-0 bg-neutral-950 p-0">
        <DialogTitle className="sr-only">查看大图</DialogTitle>
        <DialogDescription className="sr-only">
          查看已收录图片的大图
        </DialogDescription>
        <div className="flex size-full items-center justify-center p-6">
          {image?.imageUrl ? (
            <img
              alt={image.alt}
              className="max-h-full max-w-full object-contain"
              src={image.imageUrl}
            />
          ) : (
            <div className="text-sm text-white/70">图片加载失败</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getImageMaterialContent(item: MaterialCollectionItem) {
  const imageUrl =
    readString(item.content.imageUrl) ||
    readString(item.content.fileUrl) ||
    readString(item.content.url) ||
    readString(item.content.localUrl);

  return {
    alt:
      readString(item.content.alt) ||
      readString(item.content.title) ||
      item.title ||
      "图片",
    imageUrl,
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
