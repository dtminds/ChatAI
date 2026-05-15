import { Download01Icon, Loading03Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import type { VideoMessageContent } from "@/pages/chat/chat-types";
import {
  LoadableMessageImage,
  MessageMediaFallback,
} from "@/pages/chat/components/message/media-fallback";
import { getOptimizedMessageImageUrl } from "@/pages/chat/components/message/url";
import { canUseExpiringUrl, isExpiringUrlExpired } from "@/pages/chat/lib/message-url-expiry";

const DEFAULT_VIDEO_WIDTH = 320;
const DEFAULT_VIDEO_HEIGHT = 240;

type VideoMessageCardProps = {
  content: VideoMessageContent;
  onDownloadClick?: () => void;
  onPlayClick?: () => void;
  transferState?: "idle" | "transferring";
};

export function VideoMessageCard({
  content,
  onDownloadClick,
  onPlayClick,
  transferState = "idle",
}: VideoMessageCardProps) {
  const mediaSize = getValidVideoSize(content);
  const coverImageUrl = content.coverImageUrl?.trim() ?? "";
  const needsTransfer = Boolean(
    content.fileSerialNo &&
      (isExpiringUrlExpired(content.fileUrlExpireTime) ||
        (content.downloadStatus !== "finished" &&
          !canUseExpiringUrl(content.videoUrl, content.fileUrlExpireTime))),
  );
  const handlePlayClick = () => {
    if (onPlayClick) {
      onPlayClick();
      return;
    }

    if (canUseExpiringUrl(content.videoUrl, content.fileUrlExpireTime)) {
      window.open(content.videoUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      className="relative isolate inline-block overflow-hidden rounded-[8px] bg-muted-foreground/10 shadow-sm"
      style={videoConstraintStyle}
    >
      {coverImageUrl ? (
        <LoadableMessageImage
          alt={content.alt}
          className="block h-auto max-h-[360px] w-auto max-w-full object-cover"
          fallback={<VideoCoverFallback alt={content.alt} />}
          loading="lazy"
          src={getOptimizedMessageImageUrl(coverImageUrl)}
          width={mediaSize.width}
          height={mediaSize.height}
        />
      ) : (
        <VideoCoverFallback alt={content.alt} />
      )}
      <div className="absolute inset-0 bg-black/5" />

      {transferState === "transferring" ? (
        <span
          aria-label="视频下载中"
          className="absolute left-1/2 top-1/2 z-1 inline-flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-black/15 text-white shadow-[0_2px_12px_var(--shadow-medium)] backdrop-blur-[1px]"
          role="status"
        >
          <HugeiconsIcon
            className="animate-spin"
            icon={Loading03Icon}
            size={24}
            strokeWidth={2.2}
          />
        </span>
      ) : needsTransfer ? (
        <button
          aria-label={`下载视频：${content.alt}`}
          className="absolute left-1/2 top-1/2 z-1 inline-flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-black/10 text-white shadow-[0_2px_12px_var(--shadow-medium)] outline-none backdrop-blur-[1px] transition-colors hover:bg-black/20 focus-visible:ring-4 focus-visible:ring-white/35"
          onClick={onDownloadClick}
          type="button"
        >
          <HugeiconsIcon icon={Download01Icon} size={24} strokeWidth={2.2} />
        </button>
      ) : (
        <button
          aria-label={`播放视频：${content.alt}`}
          className="absolute left-1/2 top-1/2 z-1 inline-flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-black/10 text-white shadow-[0_2px_12px_var(--shadow-medium)] outline-none backdrop-blur-[1px] transition-colors hover:bg-black/20 focus-visible:ring-4 focus-visible:ring-white/35"
          onClick={handlePlayClick}
          type="button"
        >
          <HugeiconsIcon
            className="translate-x-[1px]"
            icon={PlayIcon}
            size={25}
            strokeWidth={2.2}
          />
        </button>
      )}

      {content.durationLabel ? (
        <span
          className="absolute bottom-1.5 right-1.5 z-1 rounded-[4px] bg-black/45 px-1.5 py-0.5 text-[12px] font-semibold leading-4 text-white shadow-sm"
          data-testid="video-duration"
        >
          {content.durationLabel}
        </span>
      ) : null}
    </div>
  );
}

function VideoCoverFallback({ alt }: { alt: string }) {
  return (
    <MessageMediaFallback
      className="flex h-[120px] w-[120px] items-center justify-center bg-muted-foreground/5 text-muted-foreground/30"
      label={`视频封面不可用：${alt}`}
      testId="video-cover-fallback"
    />
  );
}

const videoConstraintStyle = {
  maxWidth: "min(300px, 60%)",
  maxHeight: "360px",
  minWidth: "120px",
} satisfies CSSProperties;

function getValidVideoSize(content: VideoMessageContent) {
  return {
    width: isPositiveFiniteNumber(content.width)
      ? content.width
      : DEFAULT_VIDEO_WIDTH,
    height: isPositiveFiniteNumber(content.height)
      ? content.height
      : DEFAULT_VIDEO_HEIGHT,
  };
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
