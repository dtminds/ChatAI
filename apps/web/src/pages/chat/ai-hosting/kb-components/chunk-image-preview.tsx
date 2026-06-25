import { ImagePreviewDialog } from "@/pages/chat/components/message/image";
import { cn } from "@/lib/utils";

export type ChunkImageGalleryItem = {
  alt: string;
  imageUrl: string;
};

export function ChunkImagePreview({
  alt,
  className,
  galleryIndex = 0,
  galleryItems,
  imageUrl,
  previewable = false,
  size = "md",
}: {
  alt?: string;
  className?: string;
  galleryIndex?: number;
  galleryItems?: ChunkImageGalleryItem[];
  imageUrl: string;
  previewable?: boolean;
  size?: "md" | "sm";
}) {
  const resolvedAlt = alt ?? "切片图片";
  const preview = (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-[6px] border bg-muted/30",
        size === "sm" ? "size-11" : "size-20",
        previewable && "cursor-zoom-in transition-opacity hover:opacity-90",
        className,
      )}
    >
      <img
        alt={resolvedAlt}
        className="size-full object-cover"
        src={imageUrl}
      />
    </div>
  );

  if (!previewable) {
    return preview;
  }

  return (
    <ImagePreviewDialog
      alt={resolvedAlt}
      galleryIndex={galleryIndex}
      galleryItems={galleryItems}
      imageUrl={imageUrl}
      ocrEnabled={false}
      triggerClassName="block"
    >
      {preview}
    </ImagePreviewDialog>
  );
}
