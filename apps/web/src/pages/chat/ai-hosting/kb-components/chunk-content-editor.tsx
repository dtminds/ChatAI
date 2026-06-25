import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChunkImagePreview, type ChunkImageGalleryItem } from "./chunk-image-preview";

export function ChunkContentEditor({
  className,
  content,
  imageAlt,
  imageUrls,
  onContentChange,
}: {
  className?: string;
  content: string;
  imageAlt: string;
  imageUrls?: string[];
  onContentChange: (value: string) => void;
}) {
  const hasImages = Boolean(imageUrls?.length);
  const galleryItems: ChunkImageGalleryItem[] =
    imageUrls?.map((imageUrl) => ({
      alt: imageAlt,
      imageUrl,
    })) ?? [];

  if (!hasImages) {
    return (
      <Textarea
        className={cn("min-h-[280px] flex-1 resize-none", className)}
        id="edit-chunk-content"
        onChange={(event) => onContentChange(event.target.value)}
        placeholder="请输入"
        value={content}
      />
    );
  }

  return (
    <div className={cn("flex overflow-hidden rounded-[8px] border bg-background", className)}>
      <div
        aria-label="切片图片"
        className="flex shrink-0 flex-col gap-2 border-r bg-muted/20 p-3"
      >
        {imageUrls?.map((imageUrl, index) => (
          <ChunkImagePreview
            key={`${imageUrl}-${index}`}
            alt={imageAlt}
            galleryIndex={index}
            galleryItems={galleryItems}
            imageUrl={imageUrl}
            previewable
          />
        ))}
      </div>
      <Textarea
        className={cn(
          "min-h-full flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-3 shadow-none",
          "focus-visible:border-0 focus-visible:ring-0",
        )}
        id="edit-chunk-content"
        onChange={(event) => onContentChange(event.target.value)}
        placeholder="请输入"
        value={content}
      />
    </div>
  );
}
