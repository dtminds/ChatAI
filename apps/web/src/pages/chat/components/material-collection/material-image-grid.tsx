import { useState } from "react";
import { MoreHorizontalIcon, ZoomInAreaIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { MaterialActionsMenu } from "@/pages/chat/components/material-collection/material-actions-menu";
import { MaterialLibraryFooter } from "@/pages/chat/components/material-collection/material-library-footer";
import { MaterialSelectionIndicator } from "@/pages/chat/components/material-collection/material-selection-indicator";
import { ImagePreviewDialog } from "@/pages/chat/components/message/image";
import { getOptimizedMessageImageUrl } from "@/pages/chat/components/message/url";
import type {
  MaterialCollectionGroup,
  MaterialCollectionItem,
} from "@/pages/chat/components/material-collection/material-types";
import { useNullableMaterialSelection } from "@/pages/chat/components/material-collection/use-nullable-material-selection";

type MaterialImageGridProps = {
  actionLabel?: string;
  groups: MaterialCollectionGroup[];
  hasMoreItems: boolean;
  isBusy: boolean;
  isLoadingMoreItems: boolean;
  isMobileLayout?: boolean;
  isSending?: boolean;
  items: MaterialCollectionItem[];
  onCancel: () => void;
  onDeleteMaterial?: (item: MaterialCollectionItem) => void;
  onLoadMoreItems?: () => void;
  onMoveMaterial?: (item: MaterialCollectionItem, groupId: string) => void;
  onSendMaterial: (item: MaterialCollectionItem) => void;
  onTopMaterial?: (item: MaterialCollectionItem) => void;
};

export function MaterialImageGrid({
  actionLabel,
  groups,
  hasMoreItems,
  isBusy,
  isLoadingMoreItems,
  isMobileLayout = false,
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
        <div className={cn("mx-auto w-full max-w-[43rem]", isMobileLayout ? "p-4" : "p-8")}>
          <div
            aria-label="收录图片列表"
            className={cn(
              "grid gap-4",
              isMobileLayout
                ? "grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]"
                : "grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]",
            )}
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
                isMobileLayout={isMobileLayout}
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
        actionLabel={actionLabel}
        canSend={selectedItem != null}
        isBusy={isBusy}
        isMobileLayout={isMobileLayout}
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
  isMobileLayout,
  item,
  onDelete,
  onMove,
  onPreview,
  onToggleSelect,
  onTop,
  selected,
}: {
  groups: MaterialCollectionGroup[];
  isMobileLayout: boolean;
  item: MaterialCollectionItem;
  onDelete?: (item: MaterialCollectionItem) => void;
  onMove?: (item: MaterialCollectionItem, groupId: string) => void;
  onPreview: () => void;
  onToggleSelect: () => void;
  onTop?: (item: MaterialCollectionItem) => void;
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
            src={getOptimizedMessageImageUrl(image.imageUrl)}
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
      {isMobileLayout ? (
        <Button
          aria-label={`打开 ${image.alt} 操作菜单`}
          className="absolute bottom-2 right-11 size-7 rounded-[8px] bg-background/90 p-0 text-foreground shadow-sm backdrop-blur hover:bg-background"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setContextMenu({
              x: rect.left,
              y: rect.bottom + 4,
            });
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.8} />
        </Button>
      ) : null}
      <Button
        aria-label={`查看大图 ${image.alt}`}
        className={cn(
          "absolute bottom-2 right-2 size-7 rounded-[8px] bg-background/90 p-0 text-foreground shadow-sm backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 group-hover/image:opacity-100",
          isMobileLayout ? "opacity-100" : "opacity-0",
        )}
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

  if (!image?.imageUrl) {
    return null;
  }

  return (
    <ImagePreviewDialog
      alt={image.alt}
      imageUrl={image.imageUrl}
      onOpenChange={onOpenChange}
      open={item != null}
    />
  );
}

function getImageMaterialContent(item: MaterialCollectionItem) {
  const imageUrl = readString(item.content.fileUrl);

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
