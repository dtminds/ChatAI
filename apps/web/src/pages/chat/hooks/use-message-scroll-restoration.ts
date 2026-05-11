import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import {
  captureViewportAnchor,
  findViewportAnchor,
} from "@/pages/chat/lib/scroll-anchor";

type HistoryStatus = "idle" | "loading" | "error";

const BOTTOM_PIN_THRESHOLD_PX = 48;
const VISUAL_TOP_LOAD_THRESHOLD_PX = 48;

type UseMessageScrollRestorationOptions = {
  activeConversationId?: string;
  activeHistoryStatus: HistoryStatus;
  hasMoreHistory: boolean;
  isHistoryLoading: boolean;
  loadOlderMessages: () => Promise<void>;
  messageCount: number;
  messageViewportRef: RefObject<HTMLDivElement | null>;
};

export function useMessageScrollRestoration({
  activeConversationId,
  activeHistoryStatus,
  hasMoreHistory,
  isHistoryLoading,
  loadOlderMessages,
  messageCount,
  messageViewportRef,
}: UseMessageScrollRestorationOptions) {
  const historyLoadInFlightRef = useRef(false);
  const isPinnedToBottomRef = useRef(true);
  const pendingHistoryRestoreRef = useRef<{
    anchorId?: string;
    anchorOffsetTop?: number;
    conversationId: string;
    previousScrollHeight: number;
    previousScrollTop: number;
  } | null>(null);
  const previousConversationIdRef = useRef<string | undefined>(undefined);
  const previousMessageCountRef = useRef(0);

  const scrollViewportToBottom = useCallback(() => {
    const viewport = messageViewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTop = 0;
  }, [messageViewportRef]);

  const updatePinnedToBottomFromViewport = useCallback(() => {
    const viewport = messageViewportRef.current;

    if (!viewport) {
      return;
    }

    isPinnedToBottomRef.current =
      Math.abs(viewport.scrollTop) <= BOTTOM_PIN_THRESHOLD_PX;
  }, [messageViewportRef]);

  const handleLoadOlderMessages = useCallback(async () => {
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

    isPinnedToBottomRef.current = false;
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
  }, [
    activeConversationId,
    hasMoreHistory,
    isHistoryLoading,
    loadOlderMessages,
    messageViewportRef,
  ]);

  const handleMessageViewportScroll = useCallback(() => {
    const viewport = messageViewportRef.current;

    updatePinnedToBottomFromViewport();

    if (!viewport) {
      return;
    }

    const distanceToVisualTop =
      viewport.scrollHeight - viewport.clientHeight + viewport.scrollTop;

    if (distanceToVisualTop <= VISUAL_TOP_LOAD_THRESHOLD_PX) {
      void handleLoadOlderMessages();
    }
  }, [
    handleLoadOlderMessages,
    messageViewportRef,
    updatePinnedToBottomFromViewport,
  ]);

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
          viewport.scrollTop = pendingRestore.previousScrollTop;
        }

        pendingHistoryRestoreRef.current = null;
        updatePinnedToBottomFromViewport();
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

    const isConversationChanged = activeConversationId !== previousConversationId;
    const hasNewMessages =
      activeConversationId === previousConversationId &&
      messageCount > previousMessageCount;
    const shouldScrollToBottom = isConversationChanged || hasNewMessages;

    if (!shouldScrollToBottom) {
      previousConversationIdRef.current = activeConversationId;
      previousMessageCountRef.current = messageCount;
      return;
    }

    previousConversationIdRef.current = activeConversationId;
    previousMessageCountRef.current = messageCount;

    if (!activeConversationId || messageCount === 0) {
      return;
    }

    if (hasNewMessages) {
      if (isPinnedToBottomRef.current) {
        scrollViewportToBottom();
        isPinnedToBottomRef.current = true;
      }
      return;
    }

    scrollViewportToBottom();
    isPinnedToBottomRef.current = true;
  }, [
    activeConversationId,
    messageCount,
    activeHistoryStatus,
    scrollViewportToBottom,
  ]);

  return {
    handleLoadOlderMessages,
    handleMessageViewportScroll,
  };
}
