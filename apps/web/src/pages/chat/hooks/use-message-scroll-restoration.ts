import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  captureViewportAnchor,
  findViewportAnchor,
} from "@/pages/chat/lib/scroll-anchor";

type HistoryStatus = "idle" | "loading" | "error";

const BOTTOM_PIN_THRESHOLD_PX = 48;
const CONVERSATION_SETTLE_DELAY_MS = 1000;

type UseMessageScrollRestorationOptions = {
  activeConversationId?: string;
  activeHistoryStatus: HistoryStatus;
  hasMoreHistory: boolean;
  isConversationLoading: boolean;
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
  isConversationLoading,
  isHistoryLoading,
  loadOlderMessages,
  messageCount,
  messageListBottomRef,
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
  const settlingTimerRef = useRef<number | undefined>(undefined);
  const previousConversationLoadingRef = useRef(false);
  const previousConversationIdRef = useRef<string | undefined>(undefined);
  const previousMessageCountRef = useRef(0);
  const [isConversationSettling, setIsConversationSettling] = useState(false);

  const scrollViewportToBottom = useCallback(() => {
    const viewport = messageViewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [messageViewportRef]);

  const clearSettlingTimer = useCallback(() => {
    if (settlingTimerRef.current == null) {
      return;
    }

    window.clearTimeout(settlingTimerRef.current);
    settlingTimerRef.current = undefined;
  }, []);

  const updatePinnedToBottomFromViewport = useCallback(() => {
    const viewport = messageViewportRef.current;

    if (!viewport) {
      return;
    }

    const distanceToBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

    isPinnedToBottomRef.current = distanceToBottom <= BOTTOM_PIN_THRESHOLD_PX;
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

    if (!isPinnedToBottomRef.current) {
      clearSettlingTimer();
      setIsConversationSettling(false);
    }

    if (!viewport || viewport.scrollTop > 48) {
      return;
    }

    void handleLoadOlderMessages();
  }, [
    clearSettlingTimer,
    handleLoadOlderMessages,
    messageViewportRef,
    updatePinnedToBottomFromViewport,
  ]);

  useEffect(() => {
    return () => {
      clearSettlingTimer();
    };
  }, [clearSettlingTimer]);

  useEffect(() => {
    const wasConversationLoading = previousConversationLoadingRef.current;
    previousConversationLoadingRef.current = isConversationLoading;

    if (isConversationLoading) {
      clearSettlingTimer();
      setIsConversationSettling(true);
      return;
    }

    if (!wasConversationLoading) {
      return;
    }

    clearSettlingTimer();
    settlingTimerRef.current = window.setTimeout(() => {
      settlingTimerRef.current = undefined;
      messageListBottomRef.current?.scrollIntoView({
        block: "end",
      });
      scrollViewportToBottom();
      setIsConversationSettling(false);
    }, CONVERSATION_SETTLE_DELAY_MS);
  }, [
    clearSettlingTimer,
    isConversationLoading,
    messageListBottomRef,
    scrollViewportToBottom,
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

    if (
      isConversationLoading ||
      previousConversationLoadingRef.current ||
      isConversationSettling
    ) {
      previousConversationIdRef.current = activeConversationId;
      previousMessageCountRef.current = messageCount;
      return;
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
      messageListBottomRef.current?.scrollIntoView({
        block: "end",
      });
      scrollViewportToBottom();
      isPinnedToBottomRef.current = true;
      return;
    }

    messageListBottomRef.current?.scrollIntoView({
      block: "end",
    });
    scrollViewportToBottom();
    isPinnedToBottomRef.current = true;
  }, [
    activeConversationId,
    messageCount,
    messageListBottomRef,
    activeHistoryStatus,
    isConversationLoading,
    isConversationSettling,
    scrollViewportToBottom,
  ]);

  return {
    handleLoadOlderMessages,
    handleMessageViewportScroll,
    isConversationSettling,
  };
}
