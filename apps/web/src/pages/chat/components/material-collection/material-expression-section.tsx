import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Delete02Icon,
  PinIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { MaterialCollectionItem } from "@/pages/chat/components/material-collection/material-types";

type MaterialExpressionSectionProps = {
  hasMore?: boolean;
  isLoadingMore?: boolean;
  items: MaterialCollectionItem[];
  onDelete?: (item: MaterialCollectionItem) => void;
  onLoadMore?: () => void;
  onSelect: (item: MaterialCollectionItem) => void;
  sendingItemId?: string | null;
  onTop?: (item: MaterialCollectionItem) => void;
};

export function MaterialExpressionSection({
  hasMore = false,
  isLoadingMore = false,
  items,
  onDelete,
  onLoadMore,
  onSelect,
  sendingItemId,
  onTop,
}: MaterialExpressionSectionProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    item: MaterialCollectionItem;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && menuRef.current?.contains(target)) {
        return;
      }

      setContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="p-4">
      <div className="grid grid-cols-[repeat(auto-fill,5rem)] gap-3">
        {items.map((item) => {
          const imageUrl = readString(item.content.fileUrl);
          const isSending = sendingItemId === item.id;

          return (
            <button
              aria-label={`发送收藏表情 ${item.title}`}
              className="group relative flex aspect-square items-center justify-center rounded-[8px] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={Boolean(sendingItemId)}
              key={item.id}
              onClick={() => onSelect(item)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setContextMenu({
                  item,
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              type="button"
            >
              {imageUrl ? (
                <img
                  alt={item.title}
                  className="size-18 object-contain"
                  draggable={false}
                  loading="lazy"
                  src={imageUrl}
                />
              ) : (
                <span className="flex size-18 items-center justify-center rounded-[8px] bg-surface-muted text-[12px] text-muted-foreground">
                  表情
                </span>
              )}
              {isSending ? (
                <span
                  aria-label="发送中"
                  className="absolute inset-0 flex items-center justify-center rounded-[8px] bg-background/70"
                  role="status"
                >
                  <Spinner className="text-primary" size={18} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button
            className="h-8 gap-2 px-3 text-[13px]"
            disabled={isLoadingMore}
            onClick={onLoadMore}
            type="button"
            variant="ghost"
          >
            {isLoadingMore ? (
              <Spinner className="text-current" size={14} />
            ) : null}
            加载更多
          </Button>
        </div>
      ) : null}

      {contextMenu
        ? createPortal(
            <div
              className="fixed z-50 min-w-[7.5rem] rounded-[10px] border border-border bg-popover p-1 text-popover-foreground shadow-[0_10px_28px_var(--shadow-soft)]"
              data-emoji-picker-portal="true"
              ref={menuRef}
              role="menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-45"
                disabled={!onTop}
                onClick={() => {
                  onTop?.(contextMenu.item);
                  setContextMenu(null);
                }}
                role="menuitem"
                type="button"
              >
                <HugeiconsIcon icon={PinIcon} size={16} strokeWidth={1.8} />
                移到最前
              </button>
              <button
                className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10 disabled:pointer-events-none disabled:opacity-45"
                disabled={!onDelete}
                onClick={() => {
                  onDelete?.(contextMenu.item);
                  setContextMenu(null);
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
    </section>
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
