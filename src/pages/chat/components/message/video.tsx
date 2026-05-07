import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import type { VideoMessageContent } from "@/pages/chat/chat-types";

type VideoMessageCardProps = {
  content: VideoMessageContent;
};

export function VideoMessageCard({ content }: VideoMessageCardProps) {
  const frameStyle = getVideoFrameStyle(content);

  return (
    <div
      className="relative isolate overflow-hidden rounded-[8px] bg-muted-foreground/10 shadow-sm"
      style={frameStyle}
    >
      <img
        alt={content.alt}
        className="absolute inset-0 h-full w-full object-cover"
        height={content.height}
        loading="lazy"
        src={content.coverImageUrl}
        width={content.width}
      />
      <div className="absolute inset-0 bg-black/5" />

      <button
        aria-label={`播放视频：${content.alt}`}
        className="absolute left-1/2 top-1/2 z-1 inline-flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-black/10 text-white shadow-[0_2px_12px_var(--shadow-medium)] outline-none backdrop-blur-[1px] transition-colors hover:bg-black/20 focus-visible:ring-4 focus-visible:ring-white/35"
        type="button"
      >
        <HugeiconsIcon
          className="translate-x-[1px]"
          icon={PlayIcon}
          size={25}
          strokeWidth={2.2}
        />
      </button>

      <span className="absolute bottom-1.5 right-1.5 z-1 rounded-[4px] bg-black/45 px-1.5 py-0.5 text-[12px] font-semibold leading-4 text-white shadow-sm">
        {content.durationLabel}
      </span>
    </div>
  );
}

function getVideoFrameStyle(content: VideoMessageContent): CSSProperties {
  const rawWidth = content.width ?? 320;
  const rawHeight = content.height ?? 240;
  const maxWidth = 360;
  const maxHeight = 320;
  const scale = Math.min(maxWidth / rawWidth, maxHeight / rawHeight, 1);

  return {
    width: `${Math.max(Math.round(rawWidth * scale), 140)}px`,
    height: `${Math.max(Math.round(rawHeight * scale), 140)}px`,
    maxWidth: "min(22rem, calc(100vw - 7rem))",
  };
}
