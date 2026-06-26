import { forwardRef } from "react";
import { ImagePreviewDialog } from "@/pages/chat/components/message/image";
import { cn } from "@/lib/utils";
import { IMAGE_CHUNK_COLUMN, IMAGE_CHUNK_COLUMN_PADDING } from "./image-chunk-layout";

export const ImageDocSourcePanel = forwardRef<
  HTMLElement,
  {
    className?: string;
    docName: string;
    imageUrl: string;
  }
>(function ImageDocSourcePanel({ className, docName, imageUrl }, ref) {
  return (
    <aside
      aria-label="原文预览"
      className={cn(IMAGE_CHUNK_COLUMN, IMAGE_CHUNK_COLUMN_PADDING, className)}
      ref={ref}
    >
      <ImagePreviewDialog
        alt={docName}
        imageUrl={imageUrl}
        ocrEnabled={false}
        triggerClassName="block w-full"
      >
        <img
          alt={docName}
          className="mx-auto block h-auto w-full max-w-full cursor-zoom-in object-contain transition-opacity hover:opacity-90"
          src={imageUrl}
        />
      </ImagePreviewDialog>
    </aside>
  );
});
