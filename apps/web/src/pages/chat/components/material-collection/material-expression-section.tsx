import type { MaterialCollectionItem } from "@/pages/chat/components/material-collection/material-types";

type MaterialExpressionSectionProps = {
  items: MaterialCollectionItem[];
  onSelect: (item: MaterialCollectionItem) => void;
};

export function MaterialExpressionSection({
  items,
  onSelect,
}: MaterialExpressionSectionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="p-5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-x-6 gap-y-5">
        {items.map((item) => {
          const imageUrl =
            readString(item.content.imageUrl) ||
            readString(item.content.url) ||
            readString(item.content.fileUrl);

          return (
            <button
              aria-label={`发送收藏表情 ${item.title}`}
              className="group flex aspect-square items-center justify-center rounded-[8px] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              key={item.id}
              onClick={() => onSelect(item)}
              title={item.title}
              type="button"
            >
              {imageUrl ? (
                <img
                  alt={item.title}
                  className="size-18 object-contain transition-transform group-hover:scale-105"
                  draggable={false}
                  loading="lazy"
                  src={imageUrl}
                />
              ) : (
                <span className="flex size-18 items-center justify-center rounded-[8px] bg-surface-muted text-[12px] text-muted-foreground">
                  表情
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
