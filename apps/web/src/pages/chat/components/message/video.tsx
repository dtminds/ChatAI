import { Download04Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@/components/ui/spinner";
import { useEffect, useState, type CSSProperties, type SyntheticEvent } from "react";
import type { VideoMessageContent } from "@/pages/chat/chat-types";
import {
  LoadableMessageImage,
  MessageMediaFallback,
} from "@/pages/chat/components/message/media-fallback";
import { getOptimizedMessageImageUrl } from "@/pages/chat/components/message/url";
import { canUseExpiringUrl, isExpiringUrlExpired } from "@/pages/chat/lib/message-url-expiry";

const DEFAULT_VIDEO_WIDTH = 320;
const DEFAULT_VIDEO_HEIGHT = 240;
const MAX_VIDEO_WIDTH = 300;
const MAX_VIDEO_HEIGHT = 360;
const MIN_VIDEO_WIDTH = 120;

type VideoMessageCardProps = {
  content: VideoMessageContent;
  onDownloadClick?: () => void;
  onPlayClick?: () => void;
  showDownloadAction?: boolean;
  showPlayAction?: boolean;
};

export function VideoMessageCard({
  content,
  onDownloadClick,
  onPlayClick,
  showDownloadAction = true,
  showPlayAction = true,
}: VideoMessageCardProps) {
  const coverImageUrl = content.coverImageUrl?.trim() ?? "";
  const [loadedCoverSize, setLoadedCoverSize] = useState<VideoSize | null>(null);
  const mediaSize = loadedCoverSize ?? getValidVideoSize(content);
  const frameStyle = getVideoFrameStyle(mediaSize);
  const isDownloading = content.downloadStatus === "ing";
  const needsTransfer = Boolean(
    content.fileSerialNo &&
      (isExpiringUrlExpired(content.fileUrlExpireTime) ||
        (content.downloadStatus !== "finished" &&
          !canUseExpiringUrl(content.videoUrl, content.fileUrlExpireTime))),
  );
  const canPlay = Boolean(
    showPlayAction &&
      (onPlayClick || canUseExpiringUrl(content.videoUrl, content.fileUrlExpireTime)),
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
  const handleCoverLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalHeight, naturalWidth } = event.currentTarget;

    if (!isPositiveFiniteNumber(naturalWidth) || !isPositiveFiniteNumber(naturalHeight)) {
      return;
    }

    setLoadedCoverSize({
      height: naturalHeight,
      width: naturalWidth,
    });
  };

  useEffect(() => {
    setLoadedCoverSize(null);
  }, [coverImageUrl]);

  if (isDownloading && !coverImageUrl) {
    return (
      <VideoMessageLoading style={frameStyle} />
    );
  }

  return (
    <div
      className="relative isolate inline-block overflow-hidden rounded-[8px] bg-muted-foreground/10 shadow-sm"
      style={frameStyle}
    >
      {coverImageUrl ? (
        <LoadableMessageImage
          alt={content.alt}
          className="block h-full w-full object-cover"
          fallback={<VideoCoverFallback alt={content.alt} />}
          loading="lazy"
          onLoad={handleCoverLoad}
          src={getOptimizedMessageImageUrl(coverImageUrl)}
          width={mediaSize.width}
          height={mediaSize.height}
        />
      ) : (
        <VideoCoverFallback alt={content.alt} />
      )}
      <div className="absolute inset-0 bg-black/5" />

      {isDownloading ? (
        <VideoDownloadOverlay />
      ) : showDownloadAction && needsTransfer ? (
        <button
          aria-label={`下载视频：${content.alt}`}
          className="absolute left-1/2 top-1/2 z-1 inline-flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-black/10 text-white shadow-[0_2px_12px_var(--shadow-medium)] outline-none backdrop-blur-[1px] transition-colors hover:bg-black/20 focus-visible:ring-4 focus-visible:ring-white/35"
          onClick={onDownloadClick}
          type="button"
        >
          <HugeiconsIcon icon={Download04Icon} size={24} strokeWidth={2.2} />
        </button>
      ) : canPlay ? (
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
      ) : null}

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

function VideoDownloadOverlay() {
  return (
    <span
      aria-label="视频下载中"
      className="absolute left-1/2 top-1/2 z-1 inline-flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-black/20 text-white shadow-[0_2px_12px_var(--shadow-medium)] backdrop-blur-[1px]"
      role="status"
    >
      <Spinner size={22} strokeWidth={2.2} className="text-white" />
    </span>
  );
}

function VideoMessageLoading({ style }: { style: CSSProperties }) {
  return (
    <div
      aria-label="视频下载中"
      className="inline-flex flex-col items-center justify-center gap-2 rounded-[8px] border border-border/40 bg-muted-foreground/5 text-muted-foreground"
      data-testid="video-message-loading"
      role="status"
      style={style}
    >
      <Spinner size={22} strokeWidth={2.2} />
      <span className="text-xs">视频下载中</span>
    </div>
  );
}

function VideoCoverFallback({ alt }: { alt: string }) {
  return (
    <MessageMediaFallback
      className="flex h-full w-full items-center justify-center bg-muted-foreground/5 text-muted-foreground/30"
      label={`视频封面不可用：${alt}`}
      testId="video-cover-fallback"
    />
  );
}

type VideoSize = {
  height: number;
  width: number;
};

function getVideoFrameStyle(size: VideoSize) {
  const frameSize = getConstrainedVideoFrameSize(size);

  return {
    aspectRatio: `${frameSize.width} / ${frameSize.height}`,
    maxWidth: "100%",
    width: `${frameSize.width}px`,
  } satisfies CSSProperties;
}

function getConstrainedVideoFrameSize(size: VideoSize) {
  const width = isPositiveFiniteNumber(size.width) ? size.width : DEFAULT_VIDEO_WIDTH;
  const height = isPositiveFiniteNumber(size.height) ? size.height : DEFAULT_VIDEO_HEIGHT;
  const aspectRatio = width / height;
  const scale = Math.min(MAX_VIDEO_WIDTH / width, MAX_VIDEO_HEIGHT / height, 1);
  const scaledWidth = width * scale;
  const frameWidth = Math.max(MIN_VIDEO_WIDTH, scaledWidth);
  const frameHeight = Math.min(MAX_VIDEO_HEIGHT, frameWidth / aspectRatio);

  return {
    height: roundVideoFrameDimension(frameHeight),
    width: roundVideoFrameDimension(frameWidth),
  };
}

function roundVideoFrameDimension(value: number) {
  return Math.round(value * 100) / 100;
}

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
