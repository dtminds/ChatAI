import { startTransition, type RefObject } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessageList } from "@/pages/chat/components/message-feed";
import type { Message } from "@/pages/chat/chat-types";

type ChatMessagePanelProps = {
  activeHistoryStatus: "idle" | "loading" | "error";
  isConversationLoading: boolean;
  messages: Message[];
  onMessageViewportScroll: () => void;
  onRetryMessage: (messageId: string) => void | Promise<void>;
  scopeTransitionError?: string;
  messageListBottomRef: RefObject<HTMLDivElement | null>;
  messageViewportRef: RefObject<HTMLDivElement | null>;
};

export function ChatMessagePanel({
  activeHistoryStatus,
  isConversationLoading,
  messages,
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
        {activeHistoryStatus === "loading" ? (
          <div className="pointer-events-none absolute left-5 right-5 top-5 z-10 rounded-xl border border-dashed border-[#DEE5EE] bg-white/95 px-4 py-2 text-center text-xs text-[#728093] backdrop-blur-[1px]">
            加载更早消息中...
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
