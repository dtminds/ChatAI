import type { H5CardMessageContent } from "@/pages/chat/chat-types";
import {
  LoadableMessageImage,
  MessageMediaFallback,
} from "@/pages/chat/components/message/media-fallback";
import { getSafeMessageUrl } from "@/pages/chat/components/message/url";

type LinkMessageCardProps = {
  content: H5CardMessageContent;
};

export function LinkMessageCard({ content }: LinkMessageCardProps) {
  const safeUrl = getSafeMessageUrl(content.url);
  const previewImageUrl = content.previewImageUrl?.trim();
  const card = (
    <div
      className="flex flex-col gap-2"
      data-testid="link-card-content"
    >
      <p className="line-clamp-1 text-[14px] font-semibold leading-5 text-foreground">
        {content.title}
      </p>
      <div
        className="grid grid-cols-[minmax(0,1fr)_48px] items-start gap-2.5"
        data-testid="link-card-body"
      >
        <p className="line-clamp-2 text-[12px] leading-5 text-muted-foreground">
          {content.description}
        </p>
        {previewImageUrl ? (
          <LoadableMessageImage
            alt={content.title}
            className="size-12 rounded-[8px] object-cover"
            fallback={<LinkPreviewFallback title={content.title} />}
            loading="lazy"
            src={previewImageUrl}
          />
        ) : (
          <LinkPreviewFallback title={content.title} />
        )}
      </div>
    </div>
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

function LinkPreviewFallback({ title }: { title: string }) {
  return (
    <MessageMediaFallback
      className="flex size-12 items-center justify-center rounded-[8px] bg-muted-foreground/5 text-muted-foreground/30"
      iconTestId="link-preview-fallback-icon"
      iconSize={18}
      label={`链接封面不可用：${title}`}
    />
  );
}
