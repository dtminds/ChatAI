import { AnalysisTextLinkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { H5CardMessageContent } from "@/pages/chat/chat-types";

type LinkMessageCardProps = {
  content: H5CardMessageContent;
};

export function LinkMessageCard({ content }: LinkMessageCardProps) {
  return (
    <div className="w-[min(19rem,calc(100vw-7rem))] rounded-[8px] border border-border bg-surface p-3">
      <p className="line-clamp-1 text-[14px] font-semibold leading-5 text-foreground">
        {content.title}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2.5">
        <p className="line-clamp-2 text-[12px] leading-5 text-muted-foreground">
          {content.description}
        </p>
        {content.previewImageUrl ? (
          <img
            alt={content.title}
            className="size-12 rounded-[8px] object-cover"
            loading="lazy"
            src={content.previewImageUrl}
          />
        ) : (
          <div className="flex size-12 items-center justify-center rounded-[8px] bg-info-muted text-info">
            <HugeiconsIcon icon={AnalysisTextLinkIcon} size={18} strokeWidth={1.8} />
          </div>
        )}
      </div>
    </div>
  );
}
