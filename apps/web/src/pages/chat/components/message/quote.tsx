import {
  FileEmpty01Icon,
  Image01Icon,
  IdentityCardIcon,
  Link04Icon,
  Location01Icon,
  PlayCircle02Icon,
  VolumeHighIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type {
  QuoteMessageContent,
  QuotedMessagePreviewContent,
} from "@/pages/chat/chat-types";
import { MiniProgramMark } from "@/pages/chat/components/message/miniapp";
import { SphFeedMark } from "@/pages/chat/components/message/sphfeed";
import { TextMessageBubble } from "@/pages/chat/components/message/text";

type QuoteMessageCardProps = {
  content: QuoteMessageContent;
  isAgent: boolean;
  isOwnMessage?: boolean;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
};

export function QuoteMessageCard({
  content,
  isAgent,
  isOwnMessage,
  onOpenQuotedMessage,
}: QuoteMessageCardProps) {
  return (
    <div className={cn("flex max-w-full flex-col gap-1.5", isAgent ? "items-end" : "items-start")}>
      <TextMessageBubble
        isAgent={isAgent}
        isOwnMessage={isOwnMessage}
        text={content.text}
      />
      <QuoteMessagePreview
        onOpenQuotedMessage={onOpenQuotedMessage}
        quoteMsgId={content.quoteMsgId}
        quotedMessage={content.quotedMessage}
      />
    </div>
  );
}

function QuoteMessagePreview({
  onOpenQuotedMessage,
  quoteMsgId,
  quotedMessage,
}: {
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  quoteMsgId: string;
  quotedMessage?: QuotedMessagePreviewContent;
}) {
  const handleClick = () => {
    onOpenQuotedMessage?.(quoteMsgId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onOpenQuotedMessage?.(quoteMsgId);
  };

  const openProps = onOpenQuotedMessage
    ? {
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      role: "button",
      tabIndex: 0,
    }
    : {};

  if (!quotedMessage) {
    return (
      <div
        className="max-w-[min(20rem,calc(100vw-7rem))] border-l-2 border-divider py-1 pl-3 text-[12px] leading-5 text-muted-foreground"
        {...openProps}
      >
        引用消息不可用
      </div>
    );
  }

  if (quotedMessage.contentType === "text") {
    return (
      <div
        className="max-w-[min(20rem,calc(100vw-7rem))] border-l-2 border-divider py-1 pl-3 text-[12px] leading-5 text-muted-foreground"
        data-testid="quote-text-preview"
        {...openProps}
      >
        <span className="whitespace-pre-wrap break-words">
          {formatSenderPrefix(quotedMessage.senderName)}
          {quotedMessage.text || quotedMessage.fallbackText || "引用消息不可用"}
        </span>
      </div>
    );
  }

  if (quotedMessage.contentType === "image") {
    return (
      <div
        className="flex max-w-[min(20rem,calc(100vw-7rem))] items-start gap-2 border-l-2 border-divider py-1 pl-3 text-[12px] leading-5 text-muted-foreground"
        data-testid="quote-image-preview"
        {...openProps}
      >
        <span
          className="min-w-0 shrink truncate"
          data-testid="quote-image-sender"
        >
          {formatSenderPrefix(quotedMessage.senderName)}
        </span>
        {quotedMessage.imageUrl ? (
          <img
            alt={`引用图片：${quotedMessage.senderName}`}
            className="aspect-square size-10 shrink-0 rounded-[4px] object-cover"
            loading="lazy"
            src={quotedMessage.imageUrl}
          />
        ) : null}
      </div>
    );
  }

  const title = quotedMessage.title || quotedMessage.fallbackText || getContentTypeLabel(
    quotedMessage.contentType,
  );

  return (
    <div
      className="flex max-w-[min(22rem,calc(100vw-7rem))] items-start gap-2 border-l-2 border-divider py-1 pl-3 text-[12px] leading-5 text-muted-foreground"
      data-testid="quote-generic-preview"
      {...openProps}
    >
      <div
        className="flex min-w-0 items-center gap-1"
        data-testid="quote-generic-text-row"
      >
        <span
          className="min-w-0 shrink truncate"
          data-testid="quote-generic-sender"
        >
          {formatSenderPrefix(quotedMessage.senderName)}
        </span>
        <QuotePreviewIcon contentType={quotedMessage.contentType} />
        <span className="min-w-0 truncate">{title}</span>
      </div>
      {quotedMessage.imageUrl ? (
        <img
          alt={`引用预览：${title}`}
          className="aspect-square size-10 shrink-0 rounded-[4px] object-cover"
          loading="lazy"
          src={quotedMessage.imageUrl}
        />
      ) : null}
    </div>
  );
}

function formatSenderPrefix(senderName: string) {
  return senderName ? `${senderName}：` : "";
}

function QuotePreviewIcon({
  contentType,
}: {
  contentType: QuotedMessagePreviewContent["contentType"];
}) {
  if (contentType === "mini-program") {
    return (
      <MiniProgramMark
        className="size-[15px] shrink-0 text-mini-program-brand"
        data-testid="quote-mini-program-mark"
      />
    );
  }

  if (contentType === "sphfeed") {
    return (
      <SphFeedMark
        className="size-[15px] shrink-0 text-warning"
        data-testid="quote-sphfeed-mark"
      />
    );
  }

  return (
    <HugeiconsIcon
      aria-hidden="true"
      className="shrink-0 text-muted-foreground"
      data-icon-name={getQuoteIconName(contentType)}
      data-testid={getQuoteIconTestId(contentType)}
      icon={getQuoteTypeIcon(contentType)}
      size={14}
      strokeWidth={1.7}
    />
  );
}

function getQuoteTypeIcon(contentType: QuotedMessagePreviewContent["contentType"]) {
  switch (contentType) {
    case "image":
      return Image01Icon;
    case "voice":
      return VolumeHighIcon;
    case "video":
      return PlayCircle02Icon;
    case "file":
      return FileEmpty01Icon;
    case "h5":
      return Link04Icon;
    case "mini-program":
    case "sphfeed":
      return Link04Icon;
    case "contact-card":
      return IdentityCardIcon;
    case "location":
      return Location01Icon;
    default:
      return FileEmpty01Icon;
  }
}

function getQuoteIconTestId(contentType: QuotedMessagePreviewContent["contentType"]) {
  switch (contentType) {
    case "h5":
      return "quote-h5-link-icon";
    case "file":
      return "quote-file-attachment-icon";
    case "contact-card":
      return "quote-contact-card-icon";
    case "video":
      return "quote-video-icon";
    case "voice":
      return "quote-voice-volume-icon";
    default:
      return undefined;
  }
}

function getQuoteIconName(contentType: QuotedMessagePreviewContent["contentType"]) {
  switch (contentType) {
    case "h5":
      return "link-04";
    case "file":
      return "file-empty-01";
    case "contact-card":
      return "identity-card";
    case "video":
      return "play-circle-02";
    case "voice":
      return "volume-high";
    default:
      return undefined;
  }
}

function getContentTypeLabel(contentType: QuotedMessagePreviewContent["contentType"]) {
  switch (contentType) {
    case "system":
      return "[系统消息]";
    case "voice":
      return "[语音]";
    case "video":
      return "[视频]";
    case "file":
      return "[文件]";
    case "h5":
      return "[链接]";
    case "mini-program":
      return "[小程序]";
    case "contact-card":
      return "[名片]";
    case "location":
      return "[位置]";
    case "solitaire":
      return "[群接龙]";
    case "sphfeed":
      return "[视频号]";
    case "quote":
      return "[引用消息]";
    default:
      return "不支持的消息，可在手机上查看";
  }
}
