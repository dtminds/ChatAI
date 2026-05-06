import { AiBrowserIcon, AiFileIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { MiniProgramMessageContent } from "@/pages/chat/chat-types";

type MiniAppMessageCardProps = {
  content: MiniProgramMessageContent;
};

export function MiniAppMessageCard({ content }: MiniAppMessageCardProps) {
  return (
    <div className="w-[min(17rem,calc(100vw-7rem))] rounded-[8px] border border-border bg-surface p-2.5 pb-1.5">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <div className="flex size-7 items-center justify-center rounded-full bg-info-muted text-info">
          <HugeiconsIcon icon={AiBrowserIcon} size={14} strokeWidth={1.9} />
        </div>
        <span className="font-medium">{content.appName}</span>
      </div>

      <div className="mt-2.5">
        <p className="line-clamp-2 text-[14px] font-medium leading-5 text-foreground">
          {content.title}
        </p>
      </div>

      <div className="mt-2.5 aspect-[5/4] overflow-hidden rounded-[8px] bg-surface-muted">
        {content.coverImageUrl ? (
          <img
            alt={content.title}
            className="block h-full w-full object-cover"
            loading="lazy"
            src={content.coverImageUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/45">
            <HugeiconsIcon icon={AiFileIcon} size={36} strokeWidth={1.6} />
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1 border-t border-divider pt-2 text-[11px] text-muted-foreground">
        <MiniProgramMark className="shrink-0 text-foreground" />
        <span>{content.sourceLabel ?? "小程序"}</span>
      </div>
    </div>
  );
}

function MiniProgramMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-4 w-4", className)}
      viewBox="0 0 1024 1024"
    >
      <path
        d="M800 384a160.384 160.384 0 0 1-128.64 156.928 32 32 0 0 1-12.48-62.72A96 96 0 1 0 544 384v256a160 160 0 1 1-191.36-156.928 32 32 0 1 1 12.48 62.72A96 96 0 1 0 480 640V384a160 160 0 0 1 320 0z"
        fill="currentColor"
      />
    </svg>
  );
}
