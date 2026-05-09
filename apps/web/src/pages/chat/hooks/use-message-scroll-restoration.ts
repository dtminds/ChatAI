import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  captureViewportAnchor,
  findViewportAnchor,
} from "@/pages/chat/lib/scroll-anchor";

type HistoryStatus = "idle" | "loading" | "error";

const BOTTOM_PIN_THRESHOLD_PX = 48;

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
  const isPinnedToBottomRef = useRef(true);
  const pendingScrollFrameRef = useRef<number | undefined>(undefined);
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

    viewport.scrollTop = viewport.scrollHeight;
  }, [messageViewportRef]);

  const schedulePinnedBottomScroll = useCallback(() => {
    if (!isPinnedToBottomRef.current || pendingHistoryRestoreRef.current) {
      return;
    }

    if (pendingScrollFrameRef.current != null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
    }

    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = undefined;

      if (!isPinnedToBottomRef.current || pendingHistoryRestoreRef.current) {
        return;
      }

      scrollViewportToBottom();
    });
  }, [scrollViewportToBottom]);

  const updatePinnedToBottomFromViewport = useCallback(() => {
    const viewport = messageViewportRef.current;

    if (!viewport) {
      return;
    }

    const distanceToBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

    isPinnedToBottomRef.current = distanceToBottom <= BOTTOM_PIN_THRESHOLD_PX;

    if (!isPinnedToBottomRef.current && pendingScrollFrameRef.current != null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
      pendingScrollFrameRef.current = undefined;
    }
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

    if (!viewport || viewport.scrollTop > 48) {
      return;
    }

    void handleLoadOlderMessages();
  }, [handleLoadOlderMessages, messageViewportRef, updatePinnedToBottomFromViewport]);

  useEffect(() => {
    return () => {
      if (pendingScrollFrameRef.current != null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const viewport = messageViewportRef.current;

    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }

    const observedElement = viewport.firstElementChild ?? viewport;
    const observer = new ResizeObserver(() => {
      schedulePinnedBottomScroll();
    });

    observer.observe(observedElement);

    return () => {
      observer.disconnect();
    };
  }, [messageViewportRef, schedulePinnedBottomScroll]);

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
    isPinnedToBottomRef.current = true;
    schedulePinnedBottomScroll();
  }, [activeConversationId, messageCount, activeHistoryStatus]);

  return {
    handleLoadOlderMessages,
    handleMessageViewportScroll,
  };
}
