import { startTransition, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { ChatMessageList } from "@/pages/chat/components/message-feed";
import type { SmartReplySuggestion } from "@/pages/chat/components/smart-reply-card";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";

type ChatMessagePanelProps = {
  activeHistoryStatus: "idle" | "loading" | "error";
  bottomOverlay?: ReactNode;
  canUseMessageActions?: boolean;
  hasBottomOverlay?: boolean;
  hasMoreHistory: boolean;
  historyLoadLabel?: string;
  isConversationLoading: boolean;
  messages: Message[];
  onDownloadMessageFile?: (message: ChatMessage) => void;
  onMentionMessage?: (message: ChatMessage) => void;
  onLoadOlderMessages: () => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onMessageViewportScroll: () => void;
  onRetryMessage: (messageId: string) => void | Promise<void>;
  onTriggerSmartReply?: (message: ChatMessage) => void;
  retryingMessageIds?: ReadonlySet<string>;
  smartReplyByMessageId?: Record<string, SmartReplySuggestion>;
  messageViewportRef: RefObject<HTMLDivElement | null>;
};

export function ChatMessagePanel({
  activeHistoryStatus,
  bottomOverlay,
  canUseMessageActions = true,
  hasBottomOverlay = false,
  hasMoreHistory,
  historyLoadLabel,
  isConversationLoading,
  messages,
  onDownloadMessageFile,
  onMentionMessage,
  onLoadOlderMessages,
  onOpenQuotedMessage,
  onQuoteMessage,
  onMessageViewportScroll,
  onRetryMessage,
  onTriggerSmartReply,
  retryingMessageIds,
  smartReplyByMessageId,
  messageViewportRef,
}: ChatMessagePanelProps) {
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
                canUseMessageActions={canUseMessageActions}
                messages={messages}
                onDownloadMessageFile={onDownloadMessageFile}
                onMentionMessage={onMentionMessage}
                onOpenQuotedMessage={onOpenQuotedMessage}
                onQuoteMessage={onQuoteMessage}
                onTriggerSmartReply={onTriggerSmartReply}
                onRetryMessage={(messageId) => {
                  startTransition(() => {
                    void onRetryMessage(messageId);
                  });
                }}
                retryingMessageIds={retryingMessageIds}
                smartReplyByMessageId={smartReplyByMessageId}
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
