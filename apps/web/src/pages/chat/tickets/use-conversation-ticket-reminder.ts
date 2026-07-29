import { useEffect, useRef, useState } from "react";
import { getConversationTicketActiveCount } from "./api/tickets-service";

const conversationTicketReminderDelayMs = 6_000;

type ConversationTicketReminderOptions = {
  conversationId?: string;
  enabled: boolean;
  isPanelOpen: boolean;
};

type ReminderScope = {
  conversationId?: string;
  enabled: boolean;
  isPanelOpen: boolean;
};

export function useConversationTicketReminder({
  conversationId,
  enabled,
  isPanelOpen,
}: ConversationTicketReminderOptions) {
  const [result, setResult] = useState<{
    activeCount: number;
    conversationId: string;
  }>();
  const previousScopeRef = useRef<ReminderScope | undefined>(undefined);
  const generationRef = useRef(0);

  useEffect(() => {
    const previousScope = previousScopeRef.current;
    const conversationChanged =
      previousScope?.conversationId !== conversationId;
    const currentScope = {
      conversationId,
      enabled,
      isPanelOpen: conversationChanged ? false : isPanelOpen,
    };
    previousScopeRef.current = currentScope;
    const generation = ++generationRef.current;
    setResult(undefined);

    if (!conversationId || !enabled || isPanelOpen) {
      return;
    }

    const closedCurrentConversationPanel =
      previousScope?.conversationId === conversationId
      && previousScope.enabled
      && previousScope.isPanelOpen
      && !isPanelOpen;

    let timeoutId: number | undefined;
    const load = async () => {
      try {
        const next = await getConversationTicketActiveCount(conversationId);
        if (generation === generationRef.current) {
          setResult({ activeCount: next.activeCount, conversationId });
        }
      } catch {
        // The reminder is supplemental and should not interrupt the chat workflow.
      }
    };

    if (closedCurrentConversationPanel) {
      void load();
    } else {
      timeoutId = window.setTimeout(() => void load(), conversationTicketReminderDelayMs);
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [conversationId, enabled, isPanelOpen]);

  if (!enabled || isPanelOpen) {
    return undefined;
  }

  return result && result.conversationId === conversationId
    ? result.activeCount
    : undefined;
}
