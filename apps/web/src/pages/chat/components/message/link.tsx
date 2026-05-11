import { AnalysisTextLinkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { H5CardMessageContent } from "@/pages/chat/chat-types";
import { getSafeMessageUrl } from "@/pages/chat/components/message/url";

type LinkMessageCardProps = {
  content: H5CardMessageContent;
};

export function LinkMessageCard({ content }: LinkMessageCardProps) {
  const safeUrl = getSafeMessageUrl(content.url);
  const card = (
    <>
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
          <div className="flex size-12 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
            <HugeiconsIcon icon={AnalysisTextLinkIcon} size={18} strokeWidth={1.8} />
          </div>
        )}
      </div>
    </>
  );

  if (safeUrl) {
    return (
      <a
        className="block w-[min(19rem,calc(100vw-7rem))] rounded-[8px] border border-border bg-surface p-3 outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
        href={safeUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        {card}
      </a>
    );
  }

  return (
    <div className="w-[min(19rem,calc(100vw-7rem))] rounded-[8px] border border-border bg-surface p-3">
      {card}
    </div>
  );
}
