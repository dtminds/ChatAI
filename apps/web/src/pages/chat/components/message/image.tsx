import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ImageMessageContent } from "@/pages/chat/chat-types";
import {
  LoadableMessageImage,
  MessageMediaFallback,
} from "@/pages/chat/components/message/media-fallback";
import { getOptimizedMessageImageUrl } from "@/pages/chat/components/message/url";

type ImageMessageCardProps = {
  content: ImageMessageContent;
};

export function ImageMessageCard({ content }: ImageMessageCardProps) {
  const mediaSize = getValidImageSize(content);
  const imageUrl = content.imageUrl.trim();

  if (!imageUrl) {
    return (
      <ImageMessageFallback alt={content.alt} />
    );
  }

  return (
    <ImagePreviewDialog
      alt={content.alt}
      imageUrl={imageUrl}
      triggerClassName="relative isolate inline-block overflow-hidden rounded-[8px] border border-border/40 bg-muted-foreground/10 p-0 outline-none transition-[border-color,filter] hover:brightness-[0.98] focus-visible:ring-4 focus-visible:ring-ring/25"
      triggerStyle={imageConstraintStyle}
    >
      <LoadableMessageImage
        alt={content.alt}
        className="block h-auto max-h-[360px] w-auto max-w-full object-cover"
        fallback={<ImageMessageFallback alt={content.alt} />}
        height={mediaSize?.height}
        loading="lazy"
        src={getOptimizedMessageImageUrl(imageUrl)}
        width={mediaSize?.width}
      />
    </ImagePreviewDialog>
  );
}

function ImageMessageFallback({ alt }: { alt: string }) {
  return (
    <MessageMediaFallback
      className="inline-flex h-[120px] w-[120px] items-center justify-center rounded-[8px] border border-border/40 bg-muted-foreground/5 text-muted-foreground/30"
      label={`图片不可用：${alt}`}
      testId="image-message-fallback"
    />
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

const imageConstraintStyle = {
  maxWidth: "min(300px, 60%)",
  maxHeight: "360px",
  minWidth: "120px",
} satisfies CSSProperties;

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
