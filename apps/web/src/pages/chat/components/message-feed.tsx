import {
  AtIcon,
  AiChat02Icon,
  ArrowTurnBackwardIcon,
  ArrowTurnForwardIcon,
  Bug02Icon,
  ChatFavouriteIcon,
  CheckListIcon,
  ExclamationMarkIcon,
  Male02Icon,
  MoreHorizontalIcon,
  QuoteUpSquareIcon,
  UserIdVerificationIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { AIHostingAvatarBadge } from "@/pages/chat/components/ai-hosting-avatar-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MessageContentRenderer } from "@/pages/chat/components/message";
import { ConversationImageGalleryProvider } from "@/pages/chat/components/message/conversation-image-gallery";
import { QuoteMessagePreview } from "@/pages/chat/components/message/quote";
import { TextMessageBubble } from "@/pages/chat/components/message/text";
import {
  getSmartReplyLookupKey,
  getSmartReplyInlineState,
  shouldShowSmartReplyCard,
  shouldShowSmartReplyTriggerIcon,
  SMART_REPLY_INLINE_LOADING_HINT,
  type SmartReplySendPayload,
} from "@/pages/chat/api/smart-reply-adapter";
import {
  SmartReplyInlineProcessingHint,
  SmartReplyMessageAnchor,
  type SmartReplySuggestion,
} from "@/pages/chat/components/smart-reply-card";
import {
  MESSAGE_REVOKE_WINDOW_MS,
} from "@/pages/chat/chat-constants";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";
import {
  isSameCalendarDay,
  formatTextMessageSentAt,
  parseWorkbenchDate,
} from "@/pages/chat/lib/chat-time";
import { isValidMessageSeq } from "@/pages/chat/lib/message-seq";
import { canCollectMaterial } from "@/pages/chat/lib/message-collect-material";
import { canForwardMessage } from "@/pages/chat/lib/message-forward";
import { getMessageFeedItemKey } from "@/pages/chat/lib/message-feed-key";

const TIMESTAMP_BREAK_MS = 5 * 60 * 1000;
export const MESSAGE_SENT_AT_HOVER_DELAY_MS = 400;

type ChatMessageListProps = {
  canCollectMaterialActions?: boolean;
  canUseMessageActions?: boolean;
  canUseMessageForward?: boolean;
  conversationId: string;
  messages: Message[];
  multiSelectMode?: boolean;
  selectedMessageKeys?: ReadonlySet<string>;
  showTimeDividers?: boolean;
  showTimestamps?: boolean;
  onCollectMaterial?: (message: ChatMessage) => void;
  onDownloadMessageFile?: (message: ChatMessage) => void;
  onEnterMultiSelectMode?: (message?: ChatMessage) => void;
  onForwardMessage?: (message: ChatMessage) => void;
  onMentionMessage?: (message: ChatMessage) => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRevokeMessage?: (message: ChatMessage) => void;
  onRetryMessage?: (uiMessageKey: string) => void;
  onSendSmartReply?: (message: ChatMessage, payload: SmartReplySendPayload) => void;
  onFillSmartReplyComposer?: (message: ChatMessage, content: string) => void;
  onDismissSmartReply?: (message: ChatMessage) => void;
  onMakeShorterSmartReply?: (message: ChatMessage) => void;
  onTriggerSmartReply?: (
    message: ChatMessage,
    options?: { force?: boolean },
  ) => void;
  onToggleMessageSelection?: (message: ChatMessage) => void;
  onVoicePlaybackReady?: (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => void;
  onTranscribeVoice?: (message: ChatMessage) => Promise<string>;
  retryingMessageIds?: ReadonlySet<string>;
  smartReplyAutoPendingByMessageId?: Record<string, true>;
  smartReplyByMessageId?: Record<string, SmartReplySuggestion>;
  smartReplyPendingByMessageId?: Record<string, true>;
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
  canCollectMaterialActions = true,
  canUseMessageActions = true,
  canUseMessageForward = false,
  conversationId,
  messages,
  multiSelectMode = false,
  selectedMessageKeys,
  showTimeDividers = true,
  showTimestamps = false,
  onDownloadMessageFile,
  onCollectMaterial,
  onEnterMultiSelectMode,
  onForwardMessage,
  onMentionMessage,
  onOpenQuotedMessage,
  onQuoteMessage,
  onRevokeMessage,
  onRetryMessage,
  onSendSmartReply,
  onFillSmartReplyComposer,
  onDismissSmartReply,
  onMakeShorterSmartReply,
  onTriggerSmartReply,
  onToggleMessageSelection,
  onVoicePlaybackReady,
  onTranscribeVoice,
  retryingMessageIds,
  smartReplyAutoPendingByMessageId,
  smartReplyByMessageId,
  smartReplyPendingByMessageId,
}: ChatMessageListProps) {
  const renderableMessages = useMemo(
    () => messages.filter((message): message is Message => Boolean(message)),
    [messages],
  );
  const items = useMemo(
    () => buildFeedItems(renderableMessages, showTimeDividers),
    [renderableMessages, showTimeDividers],
  );
  const previousConversationIdRef = useRef<string | null>(null);
  const previousTailMessageKeyRef = useRef<string | null>(null);
  const activeAppendAnimationRef = useRef<{
    conversationId: string;
    startIndex: number;
  } | null>(null);
  const clearAppendAnimationTimerRef = useRef<number | null>(null);
  const previousConversationId = previousConversationIdRef.current;
  const previousTailMessageKey = previousTailMessageKeyRef.current;
  const isSameConversation = previousConversationId === conversationId;
  const appendStartIndex = getAppendStartIndex(
    renderableMessages,
    isSameConversation ? previousTailMessageKey : null,
  );
  const hasAppendedMessages =
    isSameConversation &&
    appendStartIndex >= 0 &&
    appendStartIndex < renderableMessages.length;
  const activeAppendAnimation = activeAppendAnimationRef.current;
  const shouldAnimateMessageByKey = new Map<string, boolean>();

  renderableMessages.forEach((message, index) => {
    shouldAnimateMessageByKey.set(
      getMessageFeedItemKey(message),
      Boolean(message.isNew) &&
        (
          (hasAppendedMessages && index >= appendStartIndex) ||
          (
            activeAppendAnimation?.conversationId === conversationId &&
            index >= activeAppendAnimation.startIndex
          )
        ),
    );
  });

  useLayoutEffect(() => {
    if (hasAppendedMessages) {
      activeAppendAnimationRef.current = {
        conversationId,
        startIndex: appendStartIndex,
      };

      if (clearAppendAnimationTimerRef.current !== null) {
        window.clearTimeout(clearAppendAnimationTimerRef.current);
      }

      clearAppendAnimationTimerRef.current = window.setTimeout(() => {
        const activeAppendAnimation = activeAppendAnimationRef.current;

        if (
          activeAppendAnimation?.conversationId === conversationId &&
          activeAppendAnimation.startIndex === appendStartIndex
        ) {
          activeAppendAnimationRef.current = null;
        }

        clearAppendAnimationTimerRef.current = null;
      }, 500);
    } else if (!isSameConversation) {
      activeAppendAnimationRef.current = null;
      if (clearAppendAnimationTimerRef.current !== null) {
        window.clearTimeout(clearAppendAnimationTimerRef.current);
        clearAppendAnimationTimerRef.current = null;
      }
    }

    previousConversationIdRef.current = conversationId;
    previousTailMessageKeyRef.current =
      renderableMessages.length > 0
        ? getMessageFeedItemKey(renderableMessages[renderableMessages.length - 1])
        : null;
  }, [
    appendStartIndex,
    conversationId,
    hasAppendedMessages,
    isSameConversation,
    renderableMessages,
  ]);

  useEffect(() => {
    return () => {
      if (clearAppendAnimationTimerRef.current !== null) {
        window.clearTimeout(clearAppendAnimationTimerRef.current);
      }
    };
  }, []);

  return (
    <ConversationImageGalleryProvider
      conversationId={conversationId}
      messages={messages}
    >
      <div className="space-y-3">
        {items.map((item) =>
          item.type === "divider" ? (
            <div data-scroll-anchor={item.id} key={item.id}>
              <MessageTimeDivider label={item.label} />
            </div>
          ) : (
            <div
              data-ui-message-key={item.message.uiMessageKey}
              data-scroll-anchor={item.message.uiMessageKey}
              key={getMessageFeedItemKey(item.message)}
            >
              <MessageRow
                conversationId={conversationId}
                message={item.message}
                canCollectMaterialActions={canCollectMaterialActions}
                canUseMessageActions={canUseMessageActions}
                canUseMessageForward={canUseMessageForward}
                isMessageSelected={
                  selectedMessageKeys?.has(getMessageFeedItemKey(item.message)) ?? false
                }
                multiSelectMode={multiSelectMode}
                shouldAnimate={
                  shouldAnimateMessageByKey.get(getMessageFeedItemKey(item.message)) ?? false
                }
                showTimestamp={showTimestamps}
                onDownloadMessageFile={onDownloadMessageFile}
                onCollectMaterial={onCollectMaterial}
                onEnterMultiSelectMode={onEnterMultiSelectMode}
                onForwardMessage={onForwardMessage}
                onMentionMessage={onMentionMessage}
                onOpenQuotedMessage={onOpenQuotedMessage}
                onQuoteMessage={onQuoteMessage}
                onRevokeMessage={onRevokeMessage}
                onRetryMessage={onRetryMessage}
                onSendSmartReply={onSendSmartReply}
                onFillSmartReplyComposer={onFillSmartReplyComposer}
                onDismissSmartReply={onDismissSmartReply}
                onMakeShorterSmartReply={onMakeShorterSmartReply}
                onTriggerSmartReply={onTriggerSmartReply}
                onToggleMessageSelection={onToggleMessageSelection}
                onTranscribeVoice={onTranscribeVoice}
                onVoicePlaybackReady={onVoicePlaybackReady}
                isRetryingMessage={retryingMessageIds?.has(item.message.uiMessageKey) ?? false}
                isSmartReplyAutoPending={
                  Boolean(
                    smartReplyAutoPendingByMessageId?.[
                      getSmartReplyLookupKey(item.message)
                    ],
                  )
                }
                isSmartReplyPending={
                  Boolean(
                    smartReplyPendingByMessageId?.[
                      getSmartReplyLookupKey(item.message)
                    ],
                  )
                }
                smartReply={smartReplyByMessageId?.[getSmartReplyLookupKey(item.message)]}
              />
            </div>
          ),
        )}
      </div>
    </ConversationImageGalleryProvider>
  );
}

function getAppendStartIndex(
  messages: Message[],
  previousTailMessageKey: string | null,
) {
  if (!previousTailMessageKey) {
    return -1;
  }

  const previousTailIndex = messages.findIndex(
    (message) => getMessageFeedItemKey(message) === previousTailMessageKey,
  );

  return previousTailIndex >= 0 ? previousTailIndex + 1 : -1;
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
  canCollectMaterialActions = true,
  canUseMessageActions = true,
  canUseMessageForward = false,
  isMessageSelected = false,
  multiSelectMode = false,
  showTimestamp = false,
  shouldAnimate = false,
  onDownloadMessageFile,
  onCollectMaterial,
  onEnterMultiSelectMode,
  onForwardMessage,
  onMentionMessage,
  onOpenQuotedMessage,
  onQuoteMessage,
  onRevokeMessage,
  onRetryMessage,
  onSendSmartReply,
  onFillSmartReplyComposer,
  onDismissSmartReply,
  onMakeShorterSmartReply,
  onTriggerSmartReply,
  onToggleMessageSelection,
  onVoicePlaybackReady,
  onTranscribeVoice,
  isRetryingMessage = false,
  isSmartReplyAutoPending = false,
  isSmartReplyPending = false,
  smartReply,
}: {
  conversationId?: string;
  message: Message;
  canUseMessageActions?: boolean;
  canCollectMaterialActions?: boolean;
  canUseMessageForward?: boolean;
  isMessageSelected?: boolean;
  isRetryingMessage?: boolean;
  isSmartReplyAutoPending?: boolean;
  isSmartReplyPending?: boolean;
  multiSelectMode?: boolean;
  shouldAnimate?: boolean;
  showTimestamp?: boolean;
  onDownloadMessageFile?: (message: ChatMessage) => void;
  onCollectMaterial?: (message: ChatMessage) => void;
  onEnterMultiSelectMode?: (message?: ChatMessage) => void;
  onForwardMessage?: (message: ChatMessage) => void;
  onMentionMessage?: (message: ChatMessage) => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRevokeMessage?: (message: ChatMessage) => void;
  onRetryMessage?: (uiMessageKey: string) => void;
  onSendSmartReply?: (message: ChatMessage, payload: SmartReplySendPayload) => void;
  onFillSmartReplyComposer?: (message: ChatMessage, content: string) => void;
  onDismissSmartReply?: (message: ChatMessage) => void;
  onMakeShorterSmartReply?: (message: ChatMessage) => void;
  onTriggerSmartReply?: (
    message: ChatMessage,
    options?: { force?: boolean },
  ) => void;
  onToggleMessageSelection?: (message: ChatMessage) => void;
  onVoicePlaybackReady?: (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => void;
  onTranscribeVoice?: (message: ChatMessage) => Promise<string>;
  smartReply?: SmartReplySuggestion;
}) {
  const [isSentAtPreviewVisible, setIsSentAtPreviewVisible] = useState(false);
  const sentAtHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSentAtHoverTimer = () => {
    if (sentAtHoverTimerRef.current !== null) {
      clearTimeout(sentAtHoverTimerRef.current);
      sentAtHoverTimerRef.current = null;
    }
  };

  const handleSentAtPreviewMouseEnter = () => {
    clearSentAtHoverTimer();
    sentAtHoverTimerRef.current = setTimeout(() => {
      setIsSentAtPreviewVisible(true);
    }, MESSAGE_SENT_AT_HOVER_DELAY_MS);
  };

  const handleSentAtPreviewMouseLeave = () => {
    clearSentAtHoverTimer();
    setIsSentAtPreviewVisible(false);
  };

  useEffect(() => {
    return () => {
      if (sentAtHoverTimerRef.current !== null) {
        clearTimeout(sentAtHoverTimerRef.current);
      }
    };
  }, []);

  if (message.role === "system") {
    return <SystemMessageNotice text={message.content.text} />;
  }

  const isAgent = message.role === "agent";
  const isGroupConversation = Boolean(message.isGroupConversation);
  const formattedSentAt = showTimestamp ? "" : formatTextMessageSentAt(message.sentAt);
  const showSenderName = isGroupConversation && !message.isOwnMessage && !!message.senderDisplayName;
  const showSentAtAfterSenderName =
    !isAgent && showSenderName && Boolean(formattedSentAt);
  const showSentAtHoverSlot = Boolean(formattedSentAt) && !showSentAtAfterSenderName;
  const inlineDeliveryState = getInlineDeliveryState(message);
  const showSmartReplyCard = shouldShowSmartReplyCard(smartReply);
  const smartReplyInlineState =
    !showSmartReplyCard && smartReply
      ? getSmartReplyInlineState(smartReply)
      : undefined;
  const showSmartReplyInlineProcessing =
    !showSmartReplyCard &&
    (isSmartReplyAutoPending || isSmartReplyPending || smartReplyInlineState != null);
  const showSmartReplyTriggerIcon =
    !showSmartReplyInlineProcessing &&
    shouldShowSmartReplyTriggerIcon(message, smartReply);
  const animationClassName = getMessageEntranceAnimationClassName(
    isAgent ? "right" : "left",
    shouldAnimate,
  );
  const dismissTargetRef = useRef<HTMLButtonElement | null>(null);
  const canSelectForwardMessage =
    canUseMessageForward && canForwardMessage(message) && !message.isRevoked;
  const messageActions = multiSelectMode ? null : (
    <MessageActionAvatar
      message={message}
      canCollectMaterialActions={canCollectMaterialActions}
      canUseMessageActions={canUseMessageActions}
      canUseMessageForward={canUseMessageForward}
      triggerRef={dismissTargetRef}
      onCollectMaterial={onCollectMaterial}
      onEnterMultiSelectMode={onEnterMultiSelectMode}
      onForwardMessage={onForwardMessage}
      onMentionMessage={onMentionMessage}
      onQuoteMessage={onQuoteMessage}
      onRevokeMessage={onRevokeMessage}
      onTriggerSmartReply={onTriggerSmartReply}
      showSmartReplyRecommendation={showSmartReplyTriggerIcon}
    />
  );
  const selectionCheckbox = multiSelectMode ? (
    <div className="mt-4 flex h-8 shrink-0 items-center">
      <Checkbox
        aria-label="选择消息"
        checked={isMessageSelected}
        disabled={!canSelectForwardMessage}
        onCheckedChange={() => onToggleMessageSelection?.(message)}
      />
    </div>
  ) : null;

  return (
    <div
      className={cn(
        "group/message flex gap-2",
        multiSelectMode
          ? "w-full min-w-0 max-w-full items-start overflow-hidden"
          : cn("items-start", isAgent ? "justify-end" : "justify-start"),
      )}
      data-testid="message-row"
      onMouseEnter={handleSentAtPreviewMouseEnter}
      onMouseLeave={handleSentAtPreviewMouseLeave}
    >
      {multiSelectMode ? selectionCheckbox : null}
      <div
        className={cn(
          "flex min-w-0 flex-col",
          multiSelectMode ? "min-w-0 flex-1 overflow-hidden" : "max-w-[90%]",
          isAgent ? "items-end" : "items-start",
        )}
        data-testid="message-row-group"
      >
        {showSentAtHoverSlot ? (
          <div
            className={cn(
              "flex h-4 w-full shrink-0 items-center",
              isAgent
                ? multiSelectMode
                  ? "justify-end"
                  : "mr-10 justify-end"
                : multiSelectMode
                  ? "justify-start"
                  : "ml-10 justify-start",
            )}
            data-testid="text-message-sent-at-slot"
          >
            <p
              aria-hidden={!isSentAtPreviewVisible}
              className={cn(
                "px-1 text-[11px] leading-4 text-muted-foreground/80 transition-opacity duration-200",
                isSentAtPreviewVisible ? "opacity-100" : "opacity-0 pointer-events-none",
              )}
              data-testid="text-message-sent-at"
            >
              {formattedSentAt}
            </p>
          </div>
        ) : null}
        <div
          className={cn(
            "flex min-w-0 items-start gap-2",
            multiSelectMode ? "flex-1" : "w-full",
            isAgent ? "justify-end" : "justify-start",
          )}
          data-testid="message-row-body"
        >
          {!isAgent ? messageActions : null}

          <div className={cn("flex min-w-0 flex-col", isAgent ? "items-end" : "items-start")}>
            <div
              className={cn(
                "flex min-w-0 max-w-full items-end gap-2",
                multiSelectMode ? "w-full" : "w-fit",
                isAgent ? "flex-row" : "flex-row-reverse",
              )}
              data-testid="message-inline-content-row"
            >
              {isAgent && message.content.type !== "quote" && !multiSelectMode ? (
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
                  animationClassName,
                )}
                data-testid="message-content-stack"
              >
                {showSenderName ? (
                  <div className="flex items-center gap-1.5 px-1">
                    <p className="text-[12px] leading-5 text-muted-foreground">
                      {message.senderDisplayName}
                    </p>
                    {showSentAtAfterSenderName ? (
                      <p
                        aria-hidden={!isSentAtPreviewVisible}
                        className={cn(
                          "text-[11px] leading-4 text-muted-foreground/80 transition-opacity duration-200",
                          isSentAtPreviewVisible ? "opacity-100" : "opacity-0 pointer-events-none",
                        )}
                        data-testid="text-message-sent-at"
                      >
                        {formattedSentAt}
                      </p>
                    ) : null}
                  </div>
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
                  </div>
                )}
                {message.isRevoked ? <MessageRevokedState /> : null}
                {showSmartReplyCard ? (
                  <SmartReplyMessageAnchor
                    canSendMessage={canUseMessageActions}
                    conversationId={conversationId}
                    dismissTargetRef={dismissTargetRef}
                    message={message}
                    onDismiss={onDismissSmartReply}
                    onFillComposer={onFillSmartReplyComposer}
                    onMakeShorter={onMakeShorterSmartReply}
                    onRegenerate={(regenerateMessage) => {
                      onTriggerSmartReply?.(regenerateMessage, { force: true });
                    }}
                    suggestion={smartReply}
                    onSend={onSendSmartReply}
                  />
                ) : null}
                {showSmartReplyInlineProcessing ? (
                  <SmartReplyInlineProcessingHint
                    animated={smartReplyInlineState?.isLoading ?? true}
                    label={smartReplyInlineState?.label ?? SMART_REPLY_INLINE_LOADING_HINT}
                    onDismiss={
                      smartReplyInlineState?.canDismiss && onDismissSmartReply
                        ? () => onDismissSmartReply(message)
                        : undefined
                    }
                    onRegenerate={
                      smartReplyInlineState?.canRegenerate && onTriggerSmartReply
                        ? () => onTriggerSmartReply(message, { force: true })
                        : undefined
                    }
                  />
                ) : null}
                {showTimestamp ? (
                  <p className="px-1 text-[11px] leading-4 text-muted-foreground/80">
                    {message.sentAt}
                  </p>
                ) : null}
              </div>
            </div>
            {isAgent && !inlineDeliveryState && !multiSelectMode ? (
              <MessageDeliveryState message={message}/>
            ) : null}
          </div>

          {isAgent ? messageActions : null}
        </div>
      </div>
    </div>
  );
}

function getMessageEntranceAnimationClassName(
  direction: "left" | "right",
  shouldAnimate?: boolean,
) {
  if (!shouldAnimate) {
    return undefined;
  }

  return direction === "right" ? "anim-pop-right" : "anim-pop-left";
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
  onRetryMessage?: (uiMessageKey: string) => void;
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
  canCollectMaterialActions,
  canUseMessageActions,
  canUseMessageForward,
  triggerRef,
  onMentionMessage,
  onCollectMaterial,
  onEnterMultiSelectMode,
  onForwardMessage,
  onQuoteMessage,
  onRevokeMessage,
  onTriggerSmartReply,
  showSmartReplyRecommendation,
}: {
  message: ChatMessage;
  canCollectMaterialActions: boolean;
  canUseMessageActions: boolean;
  canUseMessageForward: boolean;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onMentionMessage?: (message: ChatMessage) => void;
  onCollectMaterial?: (message: ChatMessage) => void;
  onEnterMultiSelectMode?: (message?: ChatMessage) => void;
  onForwardMessage?: (message: ChatMessage) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRevokeMessage?: (message: ChatMessage) => void;
  onTriggerSmartReply?: (
    message: ChatMessage,
    options?: { force?: boolean },
  ) => void;
  showSmartReplyRecommendation: boolean;
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
    isValidMessageSeq(message.seq) &&
    message.content.type !== "contact-card";
  const canCollectMessage = Boolean(onCollectMaterial) && canCollectMaterial(message);
  const canSelectCollectMessage = canCollectMaterialActions && !message.isRevoked;
  const canForwardMessageAction =
    canUseMessageForward && Boolean(onForwardMessage) && canForwardMessage(message);
  const canSelectForwardMessage =
    canUseMessageForward && canForwardMessage(message) && !message.isRevoked;
  const canMultiSelectMessage =
    canUseMessageForward && Boolean(onEnterMultiSelectMode) && canForwardMessage(message);
  const canSelectMultiSelectMessage = canMultiSelectMessage;
  const canRevokeMessage =
    canUseMessageActions &&
    Boolean(onRevokeMessage) &&
    canShowRevokeMessageAction(message);
  const canSelectSmartReplyRecommendation =
    canUseMessageActions && Boolean(onTriggerSmartReply);
  const messageSeqForCopy = isValidMessageSeq(message.seq) ? String(message.seq) : "";
  const senderUserIdForCopy = message.sender.userId?.trim() ?? "";

  return (
    <>
      <div className="relative shrink-0">
        <MessageAvatar message={message} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="消息操作"
              className="absolute inset-0 z-10 size-8 rounded-[6px] bg-neutral-950/70 p-0 text-white opacity-0 shadow-sm transition-opacity hover:bg-neutral-950/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white/45 group-hover/message:opacity-100 data-[state=open]:opacity-100"
              ref={triggerRef}
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
            {showSmartReplyRecommendation ? (
              <DropdownMenuItem
                disabled={!canSelectSmartReplyRecommendation}
                onSelect={(event) => {
                  if (!canSelectSmartReplyRecommendation) {
                    event.preventDefault();
                    return;
                  }

                  onTriggerSmartReply?.(message);
                }}
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={AiChat02Icon}
                  size={15}
                  strokeWidth={2}
                />
                话术推荐
              </DropdownMenuItem>
            ) : null}
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
            {canCollectMessage ? (
              <DropdownMenuItem
                disabled={!canSelectCollectMessage}
                onSelect={(event) => {
                  if (!canSelectCollectMessage) {
                    event.preventDefault();
                    return;
                  }

                  onCollectMaterial?.(message);
                }}
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={ChatFavouriteIcon}
                  size={15}
                  strokeWidth={2}
                />
                收录
              </DropdownMenuItem>
            ) : null}
            {canForwardMessageAction ? (
              <DropdownMenuItem
                disabled={!canSelectForwardMessage}
                onSelect={(event) => {
                  if (!canSelectForwardMessage) {
                    event.preventDefault();
                    return;
                  }

                  onForwardMessage?.(message);
                }}
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={ArrowTurnForwardIcon}
                  size={15}
                  strokeWidth={2}
                />
                转发
              </DropdownMenuItem>
            ) : null}
            {canMultiSelectMessage ? (
              <DropdownMenuItem
                disabled={!canSelectMultiSelectMessage}
                onSelect={(event) => {
                  if (!canSelectMultiSelectMessage) {
                    event.preventDefault();
                    return;
                  }

                  onEnterMultiSelectMode?.(message);
                }}
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={CheckListIcon}
                  size={15}
                  strokeWidth={2}
                />
                多选
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
              disabled={!messageSeqForCopy}
              onSelect={(event) => {
                if (!messageSeqForCopy) {
                  event.preventDefault();
                  return;
                }
                void copyMessageId(messageSeqForCopy);
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
            {senderUserIdForCopy ? (
              <DropdownMenuItem
                onSelect={() => {
                  void copyUserId(senderUserIdForCopy);
                }}
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={UserIdVerificationIcon}
                  size={15}
                  strokeWidth={2}
                />
                复制用户ID
              </DropdownMenuItem>
            ) : null}
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

async function copyMessageId(messageSeq: string) {
  if (!messageSeq || !navigator.clipboard) {
    toast.warning("复制失败，请稍后重试");
    return;
  }

  try {
    await navigator.clipboard.writeText(messageSeq);
    toast.success("已复制消息ID");
  } catch {
    toast.warning("复制失败，请稍后重试");
  }
}

async function copyUserId(userId: string) {
  if (!userId || !navigator.clipboard) {
    toast.warning("复制失败，请稍后重试");
    return;
  }

  try {
    await navigator.clipboard.writeText(userId);
    toast.success("已复制用户ID");
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
  onRetryMessage?: (uiMessageKey: string) => void;
  state: InlineDeliveryState | null;
}) {
  if (!state) {
    return null;
  }

  if (state === "failed") {
    const canRetry =
      canRetryMessage &&
      Boolean(onRetryMessage) &&
      !isRetryingMessage;

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

            onRetryMessage?.(message.uiMessageKey);
          }}
          title={isRetryingMessage ? "正在重试发送" : "重试发送"}
          type="button"
        >
          {isRetryingMessage ? (
            <Spinner variant="classic" size={10} strokeWidth={2.4} className="text-current" />
          ) : (
            <HugeiconsIcon
              icon={ExclamationMarkIcon}
              size={10}
              strokeWidth={2.4}
            />
          )}
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
    message.seq == null
  );
}

function canShowRevokeMessageAction(message: ChatMessage, now = Date.now()) {
  if (
    message.role !== "agent" ||
    !message.isOwnMessage ||
    message.isRevoked ||
    message.revokePending ||
    message.status !== "sent" ||
    !isValidMessageSeq(message.seq)
  ) {
    return false;
  }

  const sentAt = parseWorkbenchDate(message.sentAt);

  return sentAt != null && now - sentAt.getTime() < MESSAGE_REVOKE_WINDOW_MS;
}

export { canCollectMaterial } from "@/pages/chat/lib/message-collect-material";

export function MessageAvatar({ message }: { message: ChatMessage }) {
  return (
    <div className="relative">
      <Avatar className="size-8 rounded-[6px] bg-surface">
        {message.sender.avatarUrl ? (
          <AvatarImage alt={message.sender.name} src={message.sender.avatarUrl} />
        ) : null}
        <AvatarFallback className="rounded-[6px] text-sm">
          <HugeiconsIcon
            aria-hidden="true"
            color="currentColor"
            icon={Male02Icon}
            size={16}
            strokeWidth={1.8}
          />
        </AvatarFallback>
      </Avatar>
      {message.isAgentMessage ? <AIHostingAvatarBadge /> : null}
    </div>
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
        id: `divider-${message.uiMessageKey}`,
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
