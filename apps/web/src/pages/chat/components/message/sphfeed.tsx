import type { SphFeedMessageContent } from "@/pages/chat/chat-types";

type SphFeedMessageCardProps = {
  content: SphFeedMessageContent;
};

export function SphFeedMessageCard({ content }: SphFeedMessageCardProps) {
  const safeUrl = getSafeSphFeedUrl(content.url);
  const card = <SphFeedCardBody content={content} />;

  if (!safeUrl) {
    return (
      <div
        className="overflow-hidden rounded-[8px] border border-border bg-surface"
        style={{ maxWidth: 217, width: "min(217px, calc(100vw - 7rem))" }}
      >
        {card}
      </div>
    );
  }

  return (
    <a
      className="block overflow-hidden rounded-[8px] border border-border bg-surface outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
      href={safeUrl}
      rel="noopener noreferrer"
      style={{ maxWidth: 217, width: "min(217px, calc(100vw - 7rem))" }}
      target="_blank"
    >
      {card}
    </a>
  );
}

function SphFeedCardBody({ content }: { content: SphFeedMessageContent }) {
  return (
    <>
      <div className="relative aspect-[3/4] overflow-hidden bg-surface-muted">
        {content.imageUrl ? (
          <img
            alt={content.title}
            className="block h-full w-full object-cover"
            loading="lazy"
            src={content.imageUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-mini-program-brand/20">
            <SphFeedMark className="h-14 w-14" />
          </div>
        )}

        <div
          className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/65 via-black/35 to-transparent px-3 pb-2.5 pt-8 text-[12px] leading-5 text-white"
          data-testid="sphfeed-overlay"
        >
          <SphFeedMark className="h-[18px] w-[18px] shrink-0 text-warning" />
          <span className="line-clamp-1 font-medium">
            {content.title || content.sourceLabel || "视频号"}
          </span>
        </div>
      </div>
    </>
  );
}

function SphFeedMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 1024 1024"
    >
      <path
        d="M196.032 195.136c70.144-20.48 154.368 58.688 288.064 271.04 15.04 23.808 27.904 43.328 28.608 43.328 0.704 0 14.272-20.608 30.08-45.888 132.992-212.096 217.216-290.048 288.768-267.2 45.44 14.464 64.64 57.152 64.448 143.424-0.32 167.872-83.328 430.976-151.04 478.848-55.808 39.424-139.2-10.24-216.896-129.152-7.68-11.84-14.72-21.504-15.616-21.568-0.832 0-7.68 9.6-15.168 21.44-40.96 64.384-91.2 114.24-134.272 133.376-20.928 9.28-57.344 10.56-72.704 2.56-41.856-21.888-88.96-116.864-125.44-252.928-58.368-217.472-46.976-354.432 31.168-377.28z m586.24 86.4c-44.416 33.6-101.632 108.352-185.472 242.176l-39.552 63.168 13.504 23.616c34.048 59.328 73.344 109.184 105.088 133.248 21.504 16.448 28.608 12.992 47.36-23.04 59.136-112.896 109.44-344.32 93.056-427.456-4.992-25.088-12.672-27.712-33.984-11.648z m-566.208-7.04c-15.808 15.168-11.712 113.92 8.832 212.48 24.832 118.848 77.12 257.216 100.032 264.96 22.4 7.552 83.84-60.8 132.096-146.88l10.56-18.88-33.856-54.016C343.04 387.392 283.776 310.016 240.192 279.232c-13.376-9.408-18.24-10.368-24.128-4.8v0.064z"
        fill="currentColor"
      />
    </svg>
  );
}

function getSafeSphFeedUrl(url: string | undefined) {
  if (!url) {
    return undefined;
  }

  if (url.startsWith("/")) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
