import {
  type RefObject,
  useEffectEvent,
  useLayoutEffect,
  useRef,
} from "react";
import {
  captureViewportAnchor,
  findViewportAnchor,
} from "@/pages/chat/lib/scroll-anchor";

type HistoryStatus = "idle" | "loading" | "error";

type UseMessageScrollRestorationOptions = {
  activeConversationId?: string;
  activeHistoryStatus: HistoryStatus;
  hasMoreHistory: boolean;
  isHistoryLoading: boolean;
  loadOlderMessages: () => Promise<void>;
  messageCount: number;
  messageListBottomRef: RefObject<HTMLDivElement | null>;
  messageViewportRef: RefObject<HTMLDivElement | null>;
};

export function useMessageScrollRestoration({
  activeConversationId,
  activeHistoryStatus,
  hasMoreHistory,
  isHistoryLoading,
  loadOlderMessages,
  messageCount,
  messageListBottomRef,
  messageViewportRef,
}: UseMessageScrollRestorationOptions) {
  const historyLoadInFlightRef = useRef(false);
  const pendingHistoryRestoreRef = useRef<{
    anchorId?: string;
    anchorOffsetTop?: number;
    conversationId: string;
    previousScrollHeight: number;
    previousScrollTop: number;
  } | null>(null);
  const previousConversationIdRef = useRef<string | undefined>(undefined);
  const previousMessageCountRef = useRef(0);

  const triggerOlderMessagesLoad = useEffectEvent(async () => {
    if (
      historyLoadInFlightRef.current ||
      isHistoryLoading ||
      !activeConversationId ||
      !hasMoreHistory
    ) {
      return;
    }

    const viewport = messageViewportRef.current;

    if (!viewport) {
      return;
    }

    const anchorSnapshot = captureViewportAnchor(viewport);

    historyLoadInFlightRef.current = true;
    pendingHistoryRestoreRef.current = {
      anchorId: anchorSnapshot?.id,
      anchorOffsetTop: anchorSnapshot?.offsetTop,
      conversationId: activeConversationId,
      previousScrollHeight: viewport.scrollHeight,
      previousScrollTop: viewport.scrollTop,
    };

    try {
      await loadOlderMessages();
    } finally {
      historyLoadInFlightRef.current = false;
    }
  });

  const handleMessageViewportScroll = useEffectEvent(() => {
    const viewport = messageViewportRef.current;

    if (!viewport || viewport.scrollTop > 48) {
      return;
    }

    void triggerOlderMessagesLoad();
  });

  useLayoutEffect(() => {
    const previousConversationId = previousConversationIdRef.current;
    const previousMessageCount = previousMessageCountRef.current;
    const viewport = messageViewportRef.current;
    const pendingRestore = pendingHistoryRestoreRef.current;

    if (pendingRestore && viewport && activeConversationId === pendingRestore.conversationId) {
      if (messageCount > previousMessageCount) {
        const matchedAnchor =
          pendingRestore.anchorId != null
            ? findViewportAnchor(viewport, pendingRestore.anchorId)
            : null;

        if (
          matchedAnchor &&
          pendingRestore.anchorOffsetTop != null
        ) {
          const viewportTop = viewport.getBoundingClientRect().top;
          const currentOffsetTop =
            matchedAnchor.getBoundingClientRect().top - viewportTop;

          viewport.scrollTop += currentOffsetTop - pendingRestore.anchorOffsetTop;
        } else {
          viewport.scrollTop =
            viewport.scrollHeight -
            pendingRestore.previousScrollHeight +
            pendingRestore.previousScrollTop;
        }

        pendingHistoryRestoreRef.current = null;
        previousConversationIdRef.current = activeConversationId;
        previousMessageCountRef.current = messageCount;
        return;
      }

      if (activeHistoryStatus === "idle") {
        pendingHistoryRestoreRef.current = null;
      }
    } else {
      pendingHistoryRestoreRef.current = null;
    }

    const shouldScrollToBottom =
      activeConversationId !== previousConversationId ||
      (activeConversationId === previousConversationId &&
        messageCount > previousMessageCount);

    if (!shouldScrollToBottom) {
      previousConversationIdRef.current = activeConversationId;
      previousMessageCountRef.current = messageCount;
      return;
    }

    messageListBottomRef.current?.scrollIntoView({
      block: "end",
    });
  }, [activeConversationId, messageCount, activeHistoryStatus, messageListBottomRef, messageViewportRef]);

  return {
    handleMessageViewportScroll,
  };
}
