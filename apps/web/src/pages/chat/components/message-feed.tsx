import {
  AtIcon,
  ArrowTurnBackwardIcon,
  Bug02Icon,
  ExclamationMarkIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  QuoteUpSquareIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MessageContentRenderer } from "@/pages/chat/components/message";
import { QuoteMessagePreview } from "@/pages/chat/components/message/quote";
import { TextMessageBubble } from "@/pages/chat/components/message/text";
import {
  getSmartReplyLookupKey,
  shouldShowSmartReplyCard,
  shouldShowSmartReplyTriggerIcon,
  type SmartReplySendPayload,
} from "@/pages/chat/api/smart-reply-adapter";
import {
  SmartReplyMessageAnchor,
  SmartReplyTriggerIcon,
  type SmartReplySuggestion,
} from "@/pages/chat/components/smart-reply-card";
import { MESSAGE_REVOKE_WINDOW_MS } from "@/pages/chat/chat-constants";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";
import {
  isSameCalendarDay,
  parseWorkbenchDate,
} from "@/pages/chat/lib/chat-time";

const TIMESTAMP_BREAK_MS = 5 * 60 * 1000;

type ChatMessageListProps = {
  canUseMessageActions?: boolean;
  conversationId?: string;
  messages: Message[];
  showTimeDividers?: boolean;
  showTimestamps?: boolean;
  onDownloadMessageFile?: (message: ChatMessage) => void;
  onMentionMessage?: (message: ChatMessage) => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRevokeMessage?: (message: ChatMessage) => void;
  onRetryMessage?: (messageId: string) => void;
  onSendSmartReply?: (message: ChatMessage, payload: SmartReplySendPayload) => void;
  onMakeShorterSmartReply?: (message: ChatMessage) => void;
  onTriggerSmartReply?: (message: ChatMessage) => void;
  onVoicePlaybackReady?: (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => void;
  onTranscribeVoice?: (message: ChatMessage) => Promise<string>;
  retryingMessageIds?: ReadonlySet<string>;
  smartReplyByMessageId?: Record<string, SmartReplySuggestion>;
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
  conversationId,
  messages,
  showTimeDividers = true,
  showTimestamps = false,
  onDownloadMessageFile,
  onMentionMessage,
  onOpenQuotedMessage,
  onQuoteMessage,
  onRevokeMessage,
  onRetryMessage,
  onSendSmartReply,
  onMakeShorterSmartReply,
  onTriggerSmartReply,
  onVoicePlaybackReady,
  onTranscribeVoice,
  retryingMessageIds,
  smartReplyByMessageId,
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
              conversationId={conversationId}
              message={item.message}
              canUseMessageActions={canUseMessageActions}
              showTimestamp={showTimestamps}
              onDownloadMessageFile={onDownloadMessageFile}
              onMentionMessage={onMentionMessage}
              onOpenQuotedMessage={onOpenQuotedMessage}
              onQuoteMessage={onQuoteMessage}
              onRevokeMessage={onRevokeMessage}
              onRetryMessage={onRetryMessage}
              onSendSmartReply={onSendSmartReply}
              onMakeShorterSmartReply={onMakeShorterSmartReply}
              onTriggerSmartReply={onTriggerSmartReply}
              onTranscribeVoice={onTranscribeVoice}
              onVoicePlaybackReady={onVoicePlaybackReady}
              isRetryingMessage={retryingMessageIds?.has(item.message.id) ?? false}
              smartReply={smartReplyByMessageId?.[getSmartReplyLookupKey(item.message)]}
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
  conversationId,
  message,
  canUseMessageActions = true,
  showTimestamp = false,
  onDownloadMessageFile,
  onMentionMessage,
  onOpenQuotedMessage,
  onQuoteMessage,
  onRevokeMessage,
  onRetryMessage,
  onSendSmartReply,
  onMakeShorterSmartReply,
  onTriggerSmartReply,
  onVoicePlaybackReady,
  onTranscribeVoice,
  isRetryingMessage = false,
  smartReply,
}: {
  conversationId?: string;
  message: Message;
  canUseMessageActions?: boolean;
  isRetryingMessage?: boolean;
  showTimestamp?: boolean;
  onDownloadMessageFile?: (message: ChatMessage) => void;
  onMentionMessage?: (message: ChatMessage) => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRevokeMessage?: (message: ChatMessage) => void;
  onRetryMessage?: (messageId: string) => void;
  onSendSmartReply?: (message: ChatMessage, payload: SmartReplySendPayload) => void;
  onMakeShorterSmartReply?: (message: ChatMessage) => void;
  onTriggerSmartReply?: (message: ChatMessage) => void;
  onVoicePlaybackReady?: (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => void;
  onTranscribeVoice?: (message: ChatMessage) => Promise<string>;
  smartReply?: SmartReplySuggestion;
}) {
  if (message.role === "system") {
    return <SystemMessageNotice text={message.content.text} />;
  }

  const isAgent = message.role === "agent";
  const isGroupConversation = Boolean(message.isGroupConversation);
  const showSenderName = isGroupConversation && !message.isOwnMessage && !!message.senderDisplayName;
  const inlineDeliveryState = getInlineDeliveryState(message);
  const showSmartReplyCard = shouldShowSmartReplyCard(smartReply);
  const showSmartReplyTriggerIcon = shouldShowSmartReplyTriggerIcon(message, smartReply);
  const messageActions = (
    <MessageActionAvatar
      message={message}
      canUseMessageActions={canUseMessageActions}
      onMentionMessage={onMentionMessage}
      onQuoteMessage={onQuoteMessage}
      onRevokeMessage={onRevokeMessage}
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
              "flex min-w-0 w-fit max-w-full items-end gap-2",
              isAgent ? "flex-row" : "flex-row-reverse",
            )}
            data-testid="message-inline-content-row"
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
                "flex min-w-0 w-fit max-w-full flex-col gap-1.5",
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
                <div className="flex items-center gap-1">
                  <MessageContentRenderer
                    isAgent={isAgent}
                    message={message}
                    onDownloadMessageFile={onDownloadMessageFile}
                    onOpenQuotedMessage={onOpenQuotedMessage}
                    onTranscribeVoice={onTranscribeVoice}
                    onVoicePlaybackReady={onVoicePlaybackReady}
                  />
                  {showSmartReplyTriggerIcon ? (
                    <div className="ml-[16px] cursor-pointer">
                      <SmartReplyTriggerIcon
                        onClick={() => onTriggerSmartReply?.(message)}
                      />
                    </div>
                  ) : null}
                </div>
              )}
              {message.isRevoked ? <MessageRevokedState /> : null}
              {showSmartReplyCard ? (
                <SmartReplyMessageAnchor
                  canSendMessage={canUseMessageActions}
                  conversationId={conversationId}
                  message={message}
                  onMakeShorter={onMakeShorterSmartReply}
                  onRegenerate={onTriggerSmartReply}
                  suggestion={smartReply}
                  onSend={onSendSmartReply}
                />
              ) : null}
              {showTimestamp ? (
                <p className="px-1 text-[11px] leading-4 text-muted-foreground/80">
                  {message.sentAt}
                </p>
              ) : null}
            </div>
          </div>
          {isAgent && !inlineDeliveryState ? (
            <MessageDeliveryState message={message}/>
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
  onRevokeMessage,
}: {
  message: ChatMessage;
  canUseMessageActions: boolean;
  onMentionMessage?: (message: ChatMessage) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRevokeMessage?: (message: ChatMessage) => void;
}) {
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
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
  const canRevokeMessage =
    canUseMessageActions &&
    Boolean(onRevokeMessage) &&
    canShowRevokeMessageAction(message);
  const messageIdForCopy = (message.remoteMessageId ?? message.id).trim();

  return (
    <>
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
                  icon={QuoteUpSquareIcon}
                  size={15}
                  strokeWidth={2}
                />
                引用
              </DropdownMenuItem>
            ) : null}
            {canRevokeMessage ? (
              <DropdownMenuItem
                onSelect={() => {
                  setIsRevokeDialogOpen(true);
                }}
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={ArrowTurnBackwardIcon}
                  size={15}
                  strokeWidth={2}
                />
                撤回消息
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void copyMessageId(messageIdForCopy);
              }}
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={Bug02Icon}
                size={15}
                strokeWidth={2}
              />
              复制消息ID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isRevokeDialogOpen && canRevokeMessage ? (
        <AlertDialog
          open={isRevokeDialogOpen}
          onOpenChange={setIsRevokeDialogOpen}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>确认要撤回该消息吗</AlertDialogTitle>
              <AlertDialogDescription>
                客户将在微信中看到撤回提示
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  onRevokeMessage?.(message);
                }}
              >
                确认撤回
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}

async function copyMessageId(messageId: string) {
  if (!messageId || !navigator.clipboard) {
    toast.warning("复制失败，请稍后重试");
    return;
  }

  try {
    await navigator.clipboard.writeText(messageId);
    toast.success("已复制消息ID");
  } catch {
    toast.warning("复制失败，请稍后重试");
  }
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

  if (state === "accepted" || state === "revoke-pending") {
    const label = state === "accepted" ? "发送中" : "撤回中";

    return (
      <div
        className="mb-1 flex h-4 shrink-0 items-center"
        data-testid="message-inline-status-slot"
      >
        <span
          aria-label={label}
          className="text-[11px] leading-4 text-muted-foreground"
          role="status"
        >
          {label}
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

type InlineDeliveryState = "accepted" | "failed" | "revoke-pending";

function getInlineDeliveryState(message: ChatMessage): InlineDeliveryState | null {
  if (message.revokePending) {
    return "revoke-pending";
  }

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

function canShowRevokeMessageAction(message: ChatMessage, now = Date.now()) {
  if (
    message.role !== "agent" ||
    !message.isOwnMessage ||
    message.isRevoked ||
    message.revokePending ||
    message.status !== "sent" ||
    message.seq == null
  ) {
    return false;
  }

  const sentAt = parseWorkbenchDate(message.sentAt);

  return sentAt != null && now - sentAt.getTime() < MESSAGE_REVOKE_WINDOW_MS;
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
