import type { CSSProperties } from "react";
import type { ImageMessageContent } from "@/pages/chat/chat-types";

type ImageMessageCardProps = {
  content: ImageMessageContent;
};

export function ImageMessageCard({ content }: ImageMessageCardProps) {
  const frameStyle = getImageFrameStyle(content);

  return (
    <div
      className="relative isolate overflow-hidden rounded-[8px]"
      style={frameStyle}
    >
      <img
        alt={content.alt}
        className="absolute inset-0 h-full w-full object-cover"
        height={content.height}
        loading="lazy"
        src={content.imageUrl}
        width={content.width}
      />
    </div>
  );
}

function getImageFrameStyle(content: ImageMessageContent): CSSProperties {
  const rawWidth = content.width ?? 320;
  const rawHeight = content.height ?? 320;
  const maxWidth = 360;
  const maxHeight = 320;
  const scale = Math.min(maxWidth / rawWidth, maxHeight / rawHeight, 1);

  return {
    width: `${Math.max(Math.round(rawWidth * scale), 160)}px`,
    height: `${Math.max(Math.round(rawHeight * scale), 120)}px`,
    maxWidth: "min(22rem, calc(100vw - 7rem))",
  };
}
