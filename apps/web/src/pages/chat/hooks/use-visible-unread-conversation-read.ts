import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import type { ChatMessage } from "@/pages/chat/chat-types";

const ACTIVE_CONVERSATION_READ_THROTTLE_MS = 800;

export function getFirstUnreadCustomerMessageId(
  messages: ChatMessage[],
  unreadCount: number,
) {
  if (unreadCount <= 0) {
    return undefined;
  }

  const unreadCustomerMessages: ChatMessage[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role !== "customer" || message.isOwnMessage) {
      continue;
    }

    unreadCustomerMessages.unshift(message);

    if (unreadCustomerMessages.length >= unreadCount) {
      break;
    }
  }

  return unreadCustomerMessages[0]?.id;
}

function escapeCssAttributeValue(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}

export function useVisibleUnreadConversationRead({
  activeConversationId,
  activeView,
  canUseConversationActions,
  firstUnreadMessageId,
  markConversationRead,
  messageViewportRef,
  unreadCount,
}: {
  activeConversationId?: string;
  activeView: "chat" | "customers";
  canUseConversationActions: boolean;
  firstUnreadMessageId?: string;
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
    unreadCount,
  });

  useEffect(() => {
    readContextRef.current = {
      activeConversationId,
      activeView,
      canUseConversationActions,
      unreadCount,
    };
  }, [
    activeConversationId,
    activeView,
    canUseConversationActions,
    unreadCount,
  ]);

  const requestActiveConversationRead = useCallback(
    async () => {
      const context = readContextRef.current;
      const conversationId = context.activeConversationId;

      if (
        !conversationId ||
        context.activeView !== "chat" ||
        !context.canUseConversationActions ||
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
    messageViewportRef,
    requestActiveConversationRead,
    unreadCount,
  ]);

  return requestActiveConversationRead;
}
