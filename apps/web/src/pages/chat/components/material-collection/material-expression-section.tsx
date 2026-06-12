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
    <section className="border-b border-divider px-4 py-3">
      <div className="mb-2 text-[13px] font-medium text-foreground">
        收藏的表情
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9 md:grid-cols-11 lg:grid-cols-13">
        {items.map((item) => {
          const imageUrl =
            readString(item.content.imageUrl) ||
            readString(item.content.url) ||
            readString(item.content.fileUrl);

          return (
            <button
              aria-label={`发送收藏表情 ${item.title}`}
              className="group flex aspect-square items-center justify-center rounded-[14px] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              key={item.id}
              onClick={() => onSelect(item)}
              title={item.title}
              type="button"
            >
              {imageUrl ? (
                <img
                  alt={item.title}
                  className="size-7 object-contain transition-transform group-hover:scale-105"
                  draggable={false}
                  loading="lazy"
                  src={imageUrl}
                />
              ) : (
                <span className="text-[12px] text-muted-foreground">表情</span>
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
