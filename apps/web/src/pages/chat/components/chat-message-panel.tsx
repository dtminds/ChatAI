import { startTransition, type RefObject } from "react";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { ChatMessageList } from "@/pages/chat/components/message-feed";
import type { Message } from "@/pages/chat/chat-types";

type ChatMessagePanelProps = {
  activeHistoryStatus: "idle" | "loading" | "error";
  hasMoreHistory: boolean;
  isConversationLoading: boolean;
  messages: Message[];
  onLoadOlderMessages: () => void;
  onMessageViewportScroll: () => void;
  onRetryMessage: (messageId: string) => void | Promise<void>;
  messageViewportRef: RefObject<HTMLDivElement | null>;
};

export function ChatMessagePanel({
  activeHistoryStatus,
  hasMoreHistory,
  isConversationLoading,
  messages,
  onLoadOlderMessages,
  onMessageViewportScroll,
  onRetryMessage,
  messageViewportRef,
}: ChatMessagePanelProps) {
  return (
    <section className="relative min-h-0 flex-1 bg-surface">
      <div
        className="h-full min-h-0 overflow-hidden"
        data-testid="message-scroll-area"
      >
        <div
          className="chat-message-viewport-scrollbar flex h-full min-h-0 flex-col-reverse overflow-y-auto"
          data-testid="message-viewport"
          onScroll={onMessageViewportScroll}
          ref={messageViewportRef}
          style={{ overflowAnchor: "none" }}
        >
          <div className="px-5 py-5">
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
                      : "加载更早的对话"}
                  </button>
                </div>
              ) : null}
              <ChatMessageList
                messages={messages}
                onRetryMessage={(messageId) => {
                  startTransition(() => {
                    void onRetryMessage(messageId);
                  });
                }}
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
    </section>
  );
}
