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
      className="min-h-0 flex-1 bg-white"
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
              className="inline-flex h-8 min-w-36 items-center justify-center rounded-lg border border-dashed border-[#DEE5EE] bg-[#FAFBFC] px-4 text-xs font-medium text-[#728093] transition-colors hover:border-[#C9D4E2] hover:bg-white hover:text-[#4D5B6C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-[#FAFBFC] disabled:text-[#9AA4B2]"
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
          <div className="mb-4 rounded-xl border border-dashed border-[#DEE5EE] px-4 py-3 text-sm text-[#728093]">
            正在刷新当前会话...
          </div>
        ) : null}
        {scopeTransitionError ? (
          <div className="mb-4 rounded-xl border border-[#F2D1D4] bg-[#FFF7F7] px-4 py-3 text-sm text-[#B34757]">
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
