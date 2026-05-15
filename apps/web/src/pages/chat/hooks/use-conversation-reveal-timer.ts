import { useEffect, useRef, useState } from "react";
import { UNVERIFIED_CONVERSATION_HIDE_DELAY_MS } from "@/pages/chat/api/workbench-gateway";
import type { Conversation } from "@/pages/chat/chat-types";

function getNextConversationRevealAt(conversations: Conversation[], now = Date.now()) {
  return conversations.reduce<number | undefined>((next, conversation) => {
    if (conversation.isVerified !== false || !conversation.createdAtMs) {
      return next;
    }

    const revealAt = conversation.createdAtMs + UNVERIFIED_CONVERSATION_HIDE_DELAY_MS;

    if (revealAt <= now) {
      return next;
    }

    return next == null ? revealAt : Math.min(next, revealAt);
  }, undefined);
}

export function useConversationRevealTimer(conversations: Conversation[]) {
  const [tick, setTick] = useState(0);
  const timerRef = useRef<number | undefined>(undefined);
  const revealAtRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    void tick;
    const nextRevealAt = getNextConversationRevealAt(conversations);

    if (nextRevealAt === revealAtRef.current) {
      return;
    }

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }

    revealAtRef.current = nextRevealAt;

    if (nextRevealAt == null) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      revealAtRef.current = undefined;
      setTick((currentTick) => currentTick + 1);
    }, Math.max(0, nextRevealAt - Date.now()));
  }, [conversations, tick]);

  useEffect(
    () => () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );
}
