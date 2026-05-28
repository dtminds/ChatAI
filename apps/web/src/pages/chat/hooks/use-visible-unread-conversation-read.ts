import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import type { Message } from "@/pages/chat/chat-types";

const ACTIVE_CONVERSATION_READ_THROTTLE_MS = 800;

export function getFirstUnreadCustomerMessageId(
  messages: Message[],
  unreadCount: number,
) {
  if (unreadCount <= 0) {
    return undefined;
  }

  const firstUnreadMessageIndex = Math.max(0, messages.length - unreadCount);

  // Message lists are kept in chronological order, with the newest message
  // at the end. Walk only the unread tail to avoid observing read history.
  for (let index = firstUnreadMessageIndex; index < messages.length; index += 1) {
    const message = messages[index];

    if (message.role === "customer" && !message.isOwnMessage) {
      return message.id;
    }
  }

  return undefined;
}

function escapeCssAttributeValue(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}

export function useVisibleUnreadConversationRead({
  activeConversationId,
  activeView,
  canUseConversationActions,
  firstUnreadMessageId,
  isConversationLoading,
  markConversationRead,
  messageViewportRef,
  unreadCount,
}: {
  activeConversationId?: string;
  activeView: "chat" | "customers";
  canUseConversationActions: boolean;
  firstUnreadMessageId?: string;
  isConversationLoading: boolean;
  markConversationRead: (conversationId: string) => Promise<void>;
  messageViewportRef: RefObject<HTMLDivElement | null>;
  unreadCount: number;
}) {
  const inFlightReadConversationIdsRef = useRef(new Set<string>());
  const lastReadRequestedAtByConversationIdRef = useRef<Record<string, number>>({});
  const readContextRef = useRef({
    activeConversationId,
    activeView,
    canUseConversationActions,
    isConversationLoading,
    unreadCount,
  });

  readContextRef.current = {
    activeConversationId,
    activeView,
    canUseConversationActions,
    isConversationLoading,
    unreadCount,
  };

  const requestActiveConversationRead = useCallback(
    async () => {
      const context = readContextRef.current;
      const conversationId = context.activeConversationId;

      if (
        !conversationId ||
        context.activeView !== "chat" ||
        !context.canUseConversationActions ||
        context.isConversationLoading ||
        context.unreadCount <= 0 ||
        inFlightReadConversationIdsRef.current.has(conversationId)
      ) {
        return;
      }

      const now = Date.now();
      const lastRequestedAt =
        lastReadRequestedAtByConversationIdRef.current[conversationId] ?? 0;

      if (now - lastRequestedAt < ACTIVE_CONVERSATION_READ_THROTTLE_MS) {
        return;
      }

      lastReadRequestedAtByConversationIdRef.current[conversationId] = now;
      inFlightReadConversationIdsRef.current.add(conversationId);

      try {
        await markConversationRead(conversationId);
      } catch {
        // Store-backed callers already surface read errors. This only prevents
        // unexpected rejects from detached observer/send-triggered calls.
      } finally {
        inFlightReadConversationIdsRef.current.delete(conversationId);
      }
    },
    [markConversationRead],
  );

  useEffect(() => {
    if (
      activeView !== "chat" ||
      !activeConversationId ||
      !canUseConversationActions ||
      isConversationLoading ||
      unreadCount <= 0 ||
      !firstUnreadMessageId ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const viewport = messageViewportRef.current;
    const firstUnreadMessageElement = viewport?.querySelector(
      `[data-message-id="${escapeCssAttributeValue(firstUnreadMessageId)}"]`,
    );

    if (!viewport || !firstUnreadMessageElement) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void requestActiveConversationRead();
        }
      },
      {
        root: viewport,
        threshold: 0.1,
      },
    );

    observer.observe(firstUnreadMessageElement);

    return () => {
      observer.disconnect();
    };
  }, [
    activeConversationId,
    activeView,
    canUseConversationActions,
    firstUnreadMessageId,
    isConversationLoading,
    messageViewportRef,
    requestActiveConversationRead,
    unreadCount,
  ]);

  return requestActiveConversationRead;
}
