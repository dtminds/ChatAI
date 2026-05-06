import { startTransition, type RefObject } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  scopeTransitionError?: string;
  messageListBottomRef: RefObject<HTMLDivElement | null>;
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
  scopeTransitionError,
  messageListBottomRef,
  messageViewportRef,
}: ChatMessagePanelProps) {
  return (
    <ScrollArea
      className="min-h-0 flex-1 bg-surface"
      viewportTestId="message-viewport"
      viewportProps={{
        onScroll: onMessageViewportScroll,
        style: {
          overflowAnchor: "none",
        },
      }}
      viewportRef={messageViewportRef}
    >
      <div className="relative px-5 py-5">
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
        {isConversationLoading ? (
          <div className="mb-4 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            正在刷新当前会话...
          </div>
        ) : null}
        {scopeTransitionError ? (
          <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive-muted px-4 py-3 text-sm text-destructive">
            {scopeTransitionError}
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
        <div aria-hidden="true" ref={messageListBottomRef} />
      </div>
    </ScrollArea>
  );
}
