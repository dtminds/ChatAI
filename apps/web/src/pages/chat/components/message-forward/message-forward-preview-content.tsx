import type { ChatMessage, ImageMessageContent } from "@/pages/chat/chat-types";
import { FileMessageCard } from "@/pages/chat/components/message/file";
import { LinkMessageCard } from "@/pages/chat/components/message/link";
import { MiniAppMessageCard } from "@/pages/chat/components/message/miniapp";
import { QuoteMessagePreview } from "@/pages/chat/components/message/quote";
import { MessageContentRenderer } from "@/pages/chat/components/message/renderer";
import { getOptimizedMessageImageUrl } from "@/pages/chat/components/message/url";
import { cn } from "@/lib/utils";
import { getMessageForwardPreview } from "@/pages/chat/lib/message-forward";

const COMPACT_CARD_CLASS_NAME = "w-[min(16rem,calc(100vw-4rem))]";

type MessageForwardPreviewContentProps = {
  message: ChatMessage;
};

export function MessageForwardPreviewContent({
  message,
}: MessageForwardPreviewContentProps) {
  const content = message.content;

  if (content.type === "text") {
    return (
      <p className="max-w-[min(20rem,calc(100vw-4rem))] whitespace-pre-wrap break-words text-sm text-foreground">
        {content.text}
      </p>
    );
  }

  if (content.type === "quote") {
    return (
      <div className="flex w-fit max-w-[min(20rem,calc(100vw-4rem))] min-w-0 flex-col items-start gap-1.5">
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">
          {content.text}
        </p>
        <QuoteMessagePreview
          quoteMsgId={content.quoteMsgId}
          quotedMessage={content.quotedMessage}
        />
      </div>
    );
  }

  if (content.type === "image") {
    return <ForwardCompactImagePreview content={content} message={message} />;
  }

  if (content.type === "file") {
    return (
      <FileMessageCard
        className={COMPACT_CARD_CLASS_NAME}
        content={content}
        showDownloadAction={false}
      />
    );
  }

  if (content.type === "h5") {
    return (
      <LinkMessageCard
        className={COMPACT_CARD_CLASS_NAME}
        content={content}
        disableLink
      />
    );
  }

  if (content.type === "mini-program") {
    return (
      <MiniAppMessageCard
        className={COMPACT_CARD_CLASS_NAME}
        content={content}
        titleLines={1}
      />
    );
  }

  return (
    <div className="pointer-events-none inline-flex w-fit max-w-full flex-col items-start [&_*]:pointer-events-none">
      <MessageContentRenderer
        isAgent={message.role === "agent"}
        message={message}
      />
    </div>
  );
}

function ForwardCompactImagePreview({
  content,
  message,
}: {
  content: ImageMessageContent;
  message: ChatMessage;
}) {
  const imageUrl = content.imageUrl.trim();
  const isEmotion = content.variant === "emotion";

  if (content.downloadStatus !== "finished" || !imageUrl) {
    return (
      <p className="text-sm text-muted-foreground">
        {getMessageForwardPreview(message)}
      </p>
    );
  }

  return (
    <img
      alt={content.alt}
      className={cn(
        "block rounded-[6px] border border-border/40 object-contain",
        isEmotion ? "max-h-20 max-w-20" : "max-h-36 max-w-[min(16rem,calc(100vw-4rem))]",
      )}
      loading="lazy"
      src={getOptimizedMessageImageUrl(imageUrl)}
    />
  );
}
