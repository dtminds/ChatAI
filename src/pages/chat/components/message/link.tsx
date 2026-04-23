import { AnalysisTextLinkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { H5CardMessageContent } from "@/pages/chat/chat-types";

type LinkMessageCardProps = {
  content: H5CardMessageContent;
};

export function LinkMessageCard({ content }: LinkMessageCardProps) {
  return (
    <div className="w-[min(19rem,calc(100vw-7rem))] rounded-[8px] border border-[#e6ebf1] bg-white p-3">
      <p className="line-clamp-1 text-[14px] font-semibold leading-5 text-[#18212f]">
        {content.title}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2.5">
        <p className="line-clamp-2 text-[12px] leading-5 text-[#6f7b8b]">
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
          <div className="flex size-12 items-center justify-center rounded-[8px] bg-[linear-gradient(135deg,rgba(224,235,252,0.95),rgba(248,233,244,0.95))] text-[#6986c7]">
            <HugeiconsIcon icon={AnalysisTextLinkIcon} size={18} strokeWidth={1.8} />
          </div>
        )}
      </div>
    </div>
  );
}
