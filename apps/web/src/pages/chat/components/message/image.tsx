import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ImageMessageContent } from "@/pages/chat/chat-types";

type ImageMessageCardProps = {
  content: ImageMessageContent;
};

export function ImageMessageCard({ content }: ImageMessageCardProps) {
  const frameStyle = getImageFrameStyle(content);
  const mediaSize = getValidImageSize(content);
  const isIntrinsicSizeKnown = Boolean(mediaSize);

  return (
    <ImagePreviewDialog
      alt={content.alt}
      imageUrl={content.imageUrl}
      triggerClassName="relative isolate overflow-hidden rounded-[8px] border border-border/40 bg-muted-foreground/10 outline-none transition-[border-color,filter] hover:brightness-[0.98] focus-visible:ring-4 focus-visible:ring-ring/25"
      triggerStyle={frameStyle}
    >
      <img
        alt={content.alt}
        className={
          isIntrinsicSizeKnown
            ? "absolute inset-0 h-full w-full object-cover"
            : "block h-auto max-h-80 w-auto max-w-full object-contain"
        }
        height={mediaSize?.height}
        loading="lazy"
        src={content.imageUrl}
        width={mediaSize?.width}
      />
    </ImagePreviewDialog>
  );
}

type ImagePreviewDialogProps = {
  alt: string;
  children: ReactNode;
  imageUrl: string;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
};

export function ImagePreviewDialog({
  alt,
  children,
  imageUrl,
  triggerClassName,
  triggerStyle,
}: ImagePreviewDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        aria-label={`查看大图：${alt}`}
        className={triggerClassName}
        style={triggerStyle}
        type="button"
      >
        {children}
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] border-0 bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-2rem)]"
        showCloseButton={true}
      >
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        <button
          aria-label="关闭图片预览"
          className="flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] items-center justify-center"
          data-testid="image-preview-backdrop"
          onClick={() => setIsOpen(false)}
          type="button"
        >
          <img
            alt={alt}
            className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] rounded-[8px] object-contain shadow-[0_18px_60px_var(--shadow-strong)]"
            data-testid="image-preview-full"
            onClick={(event) => event.stopPropagation()}
            src={imageUrl}
          />
        </button>
      </DialogContent>
    </Dialog>
  );
}

function getImageFrameStyle(content: ImageMessageContent): CSSProperties {
  const imageSize = getValidImageSize(content);

  if (!imageSize) {
    return {
      maxWidth: "min(22rem, calc(100vw - 7rem))",
      maxHeight: "20rem",
    };
  }

  const { height: rawHeight, width: rawWidth } = imageSize;
  const maxWidth = 360;
  const maxHeight = 320;
  const scale = Math.min(maxWidth / rawWidth, maxHeight / rawHeight, 1);

  return {
    width: `${Math.max(Math.round(rawWidth * scale), 160)}px`,
    height: `${Math.max(Math.round(rawHeight * scale), 120)}px`,
    maxWidth: "min(22rem, calc(100vw - 7rem))",
  };
}

function getValidImageSize(content: ImageMessageContent) {
  if (
    !isPositiveFiniteNumber(content.width) ||
    !isPositiveFiniteNumber(content.height)
  ) {
    return undefined;
  }

  return {
    width: content.width,
    height: content.height,
  };
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
