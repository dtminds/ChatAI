import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import type { VideoMessageContent } from "@/pages/chat/chat-types";
import { getOptimizedMessageImageUrl } from "@/pages/chat/components/message/url";

const DEFAULT_VIDEO_WIDTH = 320;
const DEFAULT_VIDEO_HEIGHT = 240;

type VideoMessageCardProps = {
  content: VideoMessageContent;
  onPlayClick?: () => void;
};

export function VideoMessageCard({
  content,
  onPlayClick,
}: VideoMessageCardProps) {
  const mediaSize = getValidVideoSize(content);
  const handlePlayClick = () => {
    if (onPlayClick) {
      onPlayClick();
      return;
    }

    if (isSafeVideoUrl(content.videoUrl)) {
      window.open(content.videoUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      className="relative isolate inline-block overflow-hidden rounded-[8px] bg-muted-foreground/10 shadow-sm"
      style={videoConstraintStyle}
    >
      <img
        alt={content.alt}
        className="block h-auto max-h-[360px] w-auto max-w-full object-cover"
        loading="lazy"
        src={getOptimizedMessageImageUrl(content.coverImageUrl)}
        width={mediaSize.width}
        height={mediaSize.height}
      />
      <div className="absolute inset-0 bg-black/5" />

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

function isSafeVideoUrl(url: string) {
  if (url.startsWith("/")) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}
