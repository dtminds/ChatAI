import {
  startTransition,
  useMemo,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { ChatMessageList } from "@/pages/chat/components/message-feed";
import type { SmartReplySendPayload } from "@/pages/chat/api/smart-reply-adapter";
import type { SmartReplySuggestion } from "@/pages/chat/components/smart-reply-card";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";
import type { ChatMode } from "@/pages/chat/chat-types";
import {
  canDisplaySmartReplyForConversation,
  useWorkbenchStore,
} from "@/store/workbench-store";
import { useShallow } from "zustand/react/shallow";

type ChatMessagePanelProps = {
  activeHistoryStatus: "idle" | "loading" | "error";
  bottomOverlay?: ReactNode;
  canCollectMaterialActions?: boolean;
  canUseMessageActions?: boolean;
  hasBottomOverlay?: boolean;
  hasMoreHistory: boolean;
  historyLoadLabel?: string;
  isConversationLoading: boolean;
  conversationId: string;
  conversationMode: ChatMode;
  messages: Message[];
  onCollectMaterial?: (message: ChatMessage) => void;
  onDownloadMessageFile?: (message: ChatMessage) => void;
  onMentionMessage?: (message: ChatMessage) => void;
  onLoadOlderMessages: () => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRevokeMessage?: (message: ChatMessage) => void;
  onMessageViewportScroll: () => void;
  onRetryMessage: (uiMessageKey: string) => void | Promise<void>;
  onSendSmartReply?: (message: ChatMessage, payload: SmartReplySendPayload) => void;
  onFillSmartReplyComposer?: (message: ChatMessage, content: string) => void;
  onDismissSmartReply?: (message: ChatMessage) => void;
  onMakeShorterSmartReply?: (message: ChatMessage) => void;
  onTriggerSmartReply?: (
    message: ChatMessage,
    options?: { force?: boolean },
  ) => void;
  onVoicePlaybackReady?: (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => void;
  onTranscribeVoice?: (message: ChatMessage) => Promise<string>;
  retryingMessageIds?: ReadonlySet<string>;
  messageViewportRef: RefObject<HTMLDivElement | null>;
};

export function ChatMessagePanel({
  activeHistoryStatus,
  bottomOverlay,
  canCollectMaterialActions = true,
  canUseMessageActions = true,
  hasBottomOverlay = false,
  hasMoreHistory,
  historyLoadLabel,
  isConversationLoading,
  conversationId,
  conversationMode,
  messages,
  onCollectMaterial,
  onDownloadMessageFile,
  onMentionMessage,
  onLoadOlderMessages,
  onOpenQuotedMessage,
  onQuoteMessage,
  onRevokeMessage,
  onMessageViewportScroll,
  onRetryMessage,
  onSendSmartReply,
  onFillSmartReplyComposer,
  onDismissSmartReply,
  onMakeShorterSmartReply,
  onTriggerSmartReply,
  onVoicePlaybackReady,
  onTranscribeVoice,
  retryingMessageIds,
  messageViewportRef,
}: ChatMessagePanelProps) {
  const {
    smartReplyAutoPendingByMessageId,
    smartReplyCanDisplay,
    smartReplyHiddenMessageKeys,
    smartReplyPendingByMessageId,
    smartReplySuggestionsByMessageId,
  } = useWorkbenchStore(
    useShallow((state) => ({
      smartReplyAutoPendingByMessageId:
        state.smartReplyAutoPendingMessageKeysByConversationId[conversationId],
      smartReplyCanDisplay: canDisplaySmartReplyForConversation(
        state,
        conversationId,
      ),
      smartReplyHiddenMessageKeys:
        state.smartReplyHiddenMessageKeysByConversationId[conversationId],
      smartReplyPendingByMessageId:
        state.smartReplyPendingMessageKeysByConversationId[conversationId],
      smartReplySuggestionsByMessageId:
        state.smartReplyByMessageIdByConversationId[conversationId],
    })),
  );
  const smartReplyByMessageId = useMemo(() => {
    if (
      conversationMode !== "single" ||
      !smartReplyCanDisplay ||
      !smartReplySuggestionsByMessageId
    ) {
      return {};
    }

    const hidden = smartReplyHiddenMessageKeys ?? {};

    return Object.fromEntries(
      Object.entries(smartReplySuggestionsByMessageId).filter(
        ([lookupKey]) => !hidden[lookupKey],
      ),
    );
  }, [
    conversationMode,
    smartReplyCanDisplay,
    smartReplyHiddenMessageKeys,
    smartReplySuggestionsByMessageId,
  ]) satisfies Record<string, SmartReplySuggestion>;
  const canUseSmartReplyActions =
    conversationMode === "single" && smartReplyCanDisplay;

  return (
    <section className="relative min-h-0 flex-1 bg-surface">
      <div
        className="h-full min-h-0 overflow-hidden"
        data-scrollbar-visibility="scroll"
        data-testid="message-scroll-area"
      >
        <div
          className="chat-message-viewport-scrollbar flex h-full min-h-0 flex-col-reverse overflow-y-auto"
          data-testid="message-viewport"
          onScroll={onMessageViewportScroll}
          ref={messageViewportRef}
          style={{ overflowAnchor: "none" }}
        >
          <div className={cn("px-5 py-5", hasBottomOverlay && "pb-12")}>
            <div
              aria-hidden={isConversationLoading ? "true" : undefined}
              className={
                isConversationLoading
                  ? "pointer-events-none opacity-0"
                  : undefined
              }
              data-testid="message-content"
            >
              {hasMoreHistory ? (
                <div className="mb-4 flex justify-center">
                  <button
                    className="inline-flex h-8 min-w-36 items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-input hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground"
                    disabled={activeHistoryStatus === "loading"}
                    onClick={onLoadOlderMessages}
                    type="button"
                  >
                    {activeHistoryStatus === "loading"
                      ? "正在加载更早对话..."
                      : historyLoadLabel ?? "加载更早的对话"}
                  </button>
                </div>
              ) : null}
              <ChatMessageList
                canCollectMaterialActions={canCollectMaterialActions}
                canUseMessageActions={canUseMessageActions}
                conversationId={conversationId}
                messages={messages}
                onCollectMaterial={onCollectMaterial}
                onDownloadMessageFile={onDownloadMessageFile}
                onMentionMessage={onMentionMessage}
                onOpenQuotedMessage={onOpenQuotedMessage}
                onQuoteMessage={onQuoteMessage}
                onSendSmartReply={onSendSmartReply}
                onFillSmartReplyComposer={onFillSmartReplyComposer}
                onDismissSmartReply={onDismissSmartReply}
                onMakeShorterSmartReply={onMakeShorterSmartReply}
                onTriggerSmartReply={
                  canUseSmartReplyActions ? onTriggerSmartReply : undefined
                }
                onRevokeMessage={onRevokeMessage}
                onTranscribeVoice={onTranscribeVoice}
                onVoicePlaybackReady={onVoicePlaybackReady}
                onRetryMessage={(uiMessageKey) => {
                  startTransition(() => {
                    void onRetryMessage(uiMessageKey);
                  });
                }}
                retryingMessageIds={retryingMessageIds}
                smartReplyAutoPendingByMessageId={
                  smartReplyCanDisplay
                    ? smartReplyAutoPendingByMessageId
                    : undefined
                }
                smartReplyByMessageId={smartReplyByMessageId}
                smartReplyPendingByMessageId={
                  smartReplyCanDisplay ? smartReplyPendingByMessageId : undefined
                }
              />
            </div>
          </div>
        </div>
      </div>
      {isConversationLoading ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground"
          data-testid="message-loading-overlay"
        >
          <div className="flex items-center justify-center gap-2">
            <DotMatrixLoader
              ariaLabel="正在加载会话"
              className="text-foreground"
              dotSize={3}
              size={22}
            />
            <span>正在加载会话</span>
          </div>
        </div>
      ) : null}
      {bottomOverlay ? (
        <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-10 bg-surface">
          {bottomOverlay}
        </div>
      ) : null}
    </section>
  );
}
