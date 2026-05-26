import {
  AtIcon,
  ExclamationMarkIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  QuoteUpIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MessageContentRenderer } from "@/pages/chat/components/message";
import { QuoteMessagePreview } from "@/pages/chat/components/message/quote";
import { TextMessageBubble } from "@/pages/chat/components/message/text";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";
import {
  isSameCalendarDay,
  parseWorkbenchDate,
} from "@/pages/chat/lib/chat-time";

const TIMESTAMP_BREAK_MS = 5 * 60 * 1000;

type ChatMessageListProps = {
  canUseMessageActions?: boolean;
  messages: Message[];
  showTimeDividers?: boolean;
  showTimestamps?: boolean;
  onDownloadMessageFile?: (message: ChatMessage) => void;
  onMentionMessage?: (message: ChatMessage) => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRetryMessage?: (messageId: string) => void;
  onVoicePlaybackReady?: (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => void;
  retryingMessageIds?: ReadonlySet<string>;
};

type FeedItem =
  | {
      id: string;
      label: string;
      type: "divider";
    }
  | {
      message: Message;
      type: "message";
    };

export function ChatMessageList({
  canUseMessageActions = true,
  messages,
  showTimeDividers = true,
  showTimestamps = false,
  onDownloadMessageFile,
  onMentionMessage,
  onOpenQuotedMessage,
  onQuoteMessage,
  onRetryMessage,
  onVoicePlaybackReady,
  retryingMessageIds,
}: ChatMessageListProps) {
  const items = useMemo(
    () => buildFeedItems(messages, showTimeDividers),
    [messages, showTimeDividers],
  );

  return (
    <div className="space-y-3">
      {items.map((item) =>
        item.type === "divider" ? (
          <div data-scroll-anchor={item.id} key={item.id}>
            <MessageTimeDivider label={item.label} />
          </div>
        ) : (
          <div
            data-scroll-anchor={item.message.id}
            key={getMessageFeedItemKey(item.message)}
          >
            <MessageRow
              message={item.message}
              canUseMessageActions={canUseMessageActions}
              showTimestamp={showTimestamps}
              onDownloadMessageFile={onDownloadMessageFile}
              onMentionMessage={onMentionMessage}
              onOpenQuotedMessage={onOpenQuotedMessage}
              onQuoteMessage={onQuoteMessage}
              onRetryMessage={onRetryMessage}
              onVoicePlaybackReady={onVoicePlaybackReady}
              isRetryingMessage={retryingMessageIds?.has(item.message.id) ?? false}
            />
          </div>
        ),
      )}
    </div>
  );
}

export function getMessageFeedItemKey(message: Message) {
  return message.clientMessageId ?? message.optNo ?? message.id;
}

export function MessageTimeDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-0.5">
      <span className="text-[12px] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function SystemMessageNotice({ text }: { text: string }) {
  return (
    <div
      className="my-5 flex items-center justify-center px-6 py-0.5"
      data-testid="system-message-notice"
    >
      <span className="max-w-[min(640px,calc(100%-48px))] text-center text-[12px] leading-5 text-muted-foreground">
        {text}
      </span>
    </div>
  );
}

export function MessageRow({
  message,
  canUseMessageActions = true,
  showTimestamp = false,
  onDownloadMessageFile,
  onMentionMessage,
  onOpenQuotedMessage,
  onQuoteMessage,
  onRetryMessage,
  onVoicePlaybackReady,
  isRetryingMessage = false,
}: {
  message: Message;
  canUseMessageActions?: boolean;
  isRetryingMessage?: boolean;
  showTimestamp?: boolean;
  onDownloadMessageFile?: (message: ChatMessage) => void;
  onMentionMessage?: (message: ChatMessage) => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRetryMessage?: (messageId: string) => void;
  onVoicePlaybackReady?: (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => void;
}) {
  if (message.role === "system") {
    return <SystemMessageNotice text={message.content.text} />;
  }

  const isAgent = message.role === "agent";
  const isGroupConversation = Boolean(message.isGroupConversation);
  const showSenderName = isGroupConversation && !message.isOwnMessage && !!message.senderDisplayName;
  const inlineDeliveryState = getInlineDeliveryState(message);
  const messageActions = (
    <MessageActionAvatar
      message={message}
      canUseMessageActions={canUseMessageActions}
      onMentionMessage={onMentionMessage}
      onQuoteMessage={onQuoteMessage}
    />
  );

  return (
    <div
      className={cn("group/message flex items-start", isAgent ? "justify-end" : "justify-start")}
      data-testid="message-row"
    >
      <div
        className={cn(
          "flex min-w-0 max-w-[90%] items-start gap-2",
          isAgent ? "justify-end" : "justify-start",
        )}
        data-testid="message-row-group"
      >
        {!isAgent ? messageActions : null}

        <div className={cn("flex min-w-0 flex-col", isAgent ? "items-end" : "items-start")}>
          <div
            className={cn(
              "flex min-w-0 max-w-full items-end gap-2",
              isAgent ? "flex-row" : "flex-row-reverse",
            )}
          >
            {isAgent && message.content.type !== "quote" ? (
              <MessageInlineStatusSlot
                canRetryMessage={canUseMessageActions}
                isRetryingMessage={isRetryingMessage}
                message={message}
                onRetryMessage={onRetryMessage}
                state={inlineDeliveryState}
              />
            ) : null}
            <div
              className={cn(
                "flex min-w-0 max-w-full flex-col gap-1.5",
                isAgent ? "items-end" : "items-start",
              )}
              data-testid="message-content-stack"
            >
              {showSenderName ? (
                <p className="px-1 text-[12px] leading-5 text-muted-foreground">
                  {message.senderDisplayName}
                </p>
              ) : null}
              {message.content.type === "quote" ? (
                <QuoteMessageContentWithDelivery
                  canRetryMessage={canUseMessageActions}
                  content={message.content}
                  inlineDeliveryState={inlineDeliveryState}
                  isRetryingMessage={isRetryingMessage}
                  isAgent={isAgent}
                  message={message}
                  onOpenQuotedMessage={onOpenQuotedMessage}
                  onRetryMessage={onRetryMessage}
                />
              ) : (
                <MessageContentRenderer
                  isAgent={isAgent}
                  message={message}
                  onDownloadMessageFile={onDownloadMessageFile}
                  onOpenQuotedMessage={onOpenQuotedMessage}
                  onVoicePlaybackReady={onVoicePlaybackReady}
                />
              )}
              {message.isRevoked ? <MessageRevokedState /> : null}
              {showTimestamp ? (
                <p className="px-1 text-[11px] leading-4 text-muted-foreground/80">
                  {message.sentAt}
                </p>
              ) : null}
            </div>
          </div>
          {isAgent && !inlineDeliveryState ? (
            <MessageDeliveryState message={message} />
          ) : null}
        </div>

        {isAgent ? messageActions : null}
      </div>
    </div>
  );
}

function QuoteMessageContentWithDelivery({
  canRetryMessage,
  content,
  inlineDeliveryState,
  isRetryingMessage,
  isAgent,
  message,
  onOpenQuotedMessage,
  onRetryMessage,
}: {
  canRetryMessage: boolean;
  content: Extract<ChatMessage["content"], { type: "quote" }>;
  inlineDeliveryState: InlineDeliveryState | null;
  isRetryingMessage: boolean;
  isAgent: boolean;
  message: ChatMessage;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onRetryMessage?: (messageId: string) => void;
}) {
  return (
    <div className={cn("flex max-w-full flex-col gap-1.5", isAgent ? "items-end" : "items-start")}>
      <div
        className={cn(
          "flex max-w-full items-end gap-2",
          isAgent ? "flex-row" : "flex-row-reverse",
        )}
      >
        {isAgent ? (
          <MessageInlineStatusSlot
            canRetryMessage={canRetryMessage}
            isRetryingMessage={isRetryingMessage}
            message={message}
            onRetryMessage={onRetryMessage}
            state={inlineDeliveryState}
          />
        ) : null}
        <TextMessageBubble
          isAgent={isAgent}
          isOwnMessage={message.isOwnMessage}
          text={content.text}
        />
      </div>
      <QuoteMessagePreview
        onOpenQuotedMessage={onOpenQuotedMessage}
        quoteMsgId={content.quoteMsgId}
        quotedMessage={content.quotedMessage}
      />
    </div>
  );
}

function MessageActionAvatar({
  message,
  canUseMessageActions,
  onMentionMessage,
  onQuoteMessage,
}: {
  message: ChatMessage;
  canUseMessageActions: boolean;
  onMentionMessage?: (message: ChatMessage) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
}) {
  const canMentionMessage = Boolean(
    onMentionMessage &&
    message.isGroupConversation &&
    !message.isOwnMessage &&
    message.sender.groupMemberId,
  );
  const canSelectMentionMessage = canUseMessageActions;
  const canQuoteMessage = Boolean(onQuoteMessage);
  const canSelectQuoteMessage =
    canUseMessageActions &&
    !message.isRevoked &&
    message.content.type !== "contact-card";

  return (
    <div className="relative shrink-0">
      <MessageAvatar message={message} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="消息操作"
            className="absolute inset-0 z-10 size-8 rounded-[6px] bg-neutral-950/70 p-0 text-white opacity-0 shadow-sm transition-opacity hover:bg-neutral-950/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white/45 group-hover/message:opacity-100 data-[state=open]:opacity-100"
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={MoreHorizontalIcon}
              size={16}
              strokeWidth={2}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="bottom">
          {canMentionMessage ? (
            <DropdownMenuItem
              disabled={!canSelectMentionMessage}
              onSelect={(event) => {
                if (!canSelectMentionMessage) {
                  event.preventDefault();
                  return;
                }

                onMentionMessage?.(message);
              }}
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={AtIcon}
                size={15}
                strokeWidth={2}
              />
              @Ta
            </DropdownMenuItem>
          ) : null}
          {canQuoteMessage ? (
            <DropdownMenuItem
              disabled={!canSelectQuoteMessage}
              onSelect={(event) => {
                if (!canSelectQuoteMessage) {
                  event.preventDefault();
                  return;
                }

                onQuoteMessage?.(message);
              }}
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={QuoteUpIcon}
                size={15}
                strokeWidth={2}
              />
              引用消息
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MessageInlineStatusSlot({
  canRetryMessage,
  isRetryingMessage,
  message,
  onRetryMessage,
  state,
}: {
  canRetryMessage: boolean;
  isRetryingMessage: boolean;
  message: ChatMessage;
  onRetryMessage?: (messageId: string) => void;
  state: InlineDeliveryState | null;
}) {
  if (!state) {
    return null;
  }

  if (state === "failed") {
    const canRetry = canRetryMessage && Boolean(onRetryMessage) && !isRetryingMessage;

    return (
      <div
        className="mb-1 flex h-4 shrink-0 items-center"
        data-testid="message-inline-status-slot"
      >
        <button
          aria-busy={isRetryingMessage}
          aria-label={isRetryingMessage ? "正在重试发送" : "重试发送"}
          className={cn(
            "inline-flex size-4 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-55",
            isRetryingMessage
              ? "bg-transparent text-muted-foreground"
              : "bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:hover:bg-destructive",
          )}
          disabled={!canRetry}
          onClick={() => {
            if (!canRetry) {
              return;
            }

            onRetryMessage?.(message.id);
          }}
          title={isRetryingMessage ? "正在重试发送" : "重试发送"}
          type="button"
        >
          <HugeiconsIcon
            className={cn(isRetryingMessage && "animate-spin")}
            icon={isRetryingMessage ? Loading03Icon : ExclamationMarkIcon}
            size={10}
            strokeWidth={2.4}
          />
        </button>
      </div>
    );
  }

  if (state === "accepted") {
    return (
      <div
        className="mb-1 flex h-4 shrink-0 items-center"
        data-testid="message-inline-status-slot"
      >
        <span
          aria-label="发送中"
          className="text-[11px] leading-4 text-muted-foreground"
          role="status"
        >
          发送中
        </span>
      </div>
    );
  }

  return null;
}

function MessageRevokedState() {
  return (
    <p className="px-1 text-[12px] leading-5 text-muted-foreground">
      已撤回
    </p>
  );
}

type InlineDeliveryState = "accepted" | "failed";

function getInlineDeliveryState(message: ChatMessage): InlineDeliveryState | null {
  if (message.status === "failed") {
    return "failed";
  }

  return isOptimisticAcceptedMessage(message) ? "accepted" : null;
}

function MessageDeliveryState({ message }: { message: ChatMessage }) {
  if (
    message.status === "accepted" ||
    message.status === "sent"
  ) {
    return null;
  }

  if (message.status === "failed") {
    return null;
  }

  const label = message.status === "pending" ? "等待提交..." : "发送中...";

  return (
    <p
      className={cn(
        "mt-1 px-1 text-[11px]",
        "text-muted-foreground",
      )}
    >
      {label}
    </p>
  );
}

function isOptimisticAcceptedMessage(message: ChatMessage) {
  return (
    message.status === "accepted" &&
    Boolean(message.optNo) &&
    message.remoteMessageId === message.optNo
  );
}

export function MessageAvatar({ message }: { message: ChatMessage }) {
  return (
    <Avatar className="size-8 rounded-[6px] bg-surface">
      {message.sender.avatarUrl ? (
        <AvatarImage alt={message.sender.name} src={message.sender.avatarUrl} />
      ) : null}
      <AvatarFallback className="rounded-[6px] text-sm" />
    </Avatar>
  );
}

function buildFeedItems(messages: Message[], showTimeDividers: boolean): FeedItem[] {
  const items: FeedItem[] = [];
  let previousTimestampedMessage: Message | undefined;

  messages.forEach((message) => {
    const hasValidTimestamp = parseWorkbenchDate(message.sentAt) !== null;

    if (
      showTimeDividers &&
      hasValidTimestamp &&
      shouldInsertDivider(previousTimestampedMessage, message)
    ) {
      items.push({
        id: `divider-${message.id}`,
        label: formatMessageDividerLabel(message.sentAt),
        type: "divider",
      });
    }

    items.push({
      message,
      type: "message",
    });

    if (hasValidTimestamp) {
      previousTimestampedMessage = message;
    }
  });

  return items;
}

function shouldInsertDivider(previous: Message | undefined, current: Message) {
  if (!previous) {
    return true;
  }

  const previousDate = parseWorkbenchDate(previous.sentAt);
  const currentDate = parseWorkbenchDate(current.sentAt);

  if (!previousDate || !currentDate) {
    return previous.sentAt !== current.sentAt;
  }

  return (
    !isSameCalendarDay(previousDate, currentDate) ||
    currentDate.getTime() - previousDate.getTime() >= TIMESTAMP_BREAK_MS
  );
}

export function formatMessageDividerLabel(value: string) {
  const date = parseWorkbenchDate(value);

  if (!date) {
    return value;
  }

  const now = new Date();
  const time = formatTimePart(date);

  if (isSameCalendarDay(date, now)) {
    return time;
  }

  if (isSameCalendarDay(date, addDays(now, -1))) {
    return `昨天 ${time}`;
  }

  if (isSameWeekMondayToSunday(date, now)) {
    return `${formatWeekdayPart(date)} ${time}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function isSameWeekMondayToSunday(a: Date, b: Date) {
  const weekStart = getMondayStartOfDay(b);
  const nextWeekStart = addDays(weekStart, 7);

  return a.getTime() >= weekStart.getTime() && a.getTime() < nextWeekStart.getTime();
}

function getMondayStartOfDay(value: Date) {
  const date = startOfDay(value);
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  return addDays(date, -daysSinceMonday);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);

  return date;
}

function formatTimePart(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatWeekdayPart(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
  }).format(date);
}
