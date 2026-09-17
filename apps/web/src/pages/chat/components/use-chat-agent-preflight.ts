import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatAgentDirection,
  ChatAgentPreflightResponse,
} from "@chatai/contracts";
import {
  requestChatAgentPreflight,
} from "@/pages/chat/api/chat-agent-preflight";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";

type PreflightPhase = "idle" | "analyzing" | "confirmation";

type PreflightState = {
  phase: PreflightPhase;
  response?: ChatAgentPreflightResponse;
  triggerMessage?: ChatMessage;
};

const INITIAL_STATE: PreflightState = { phase: "idle" };
const PREFLIGHT_DEBOUNCE_MS = 1_500;

export function useChatAgentPreflight({
  blocked,
  conversationId,
  enabled,
  messages,
  onAccept,
}: {
  blocked: boolean;
  conversationId?: string;
  enabled: boolean;
  messages: Message[];
  onAccept: (input: {
    direction: ChatAgentDirection;
    message: ChatMessage;
  }) => void | Promise<void>;
}) {
  const [state, setState] = useState<PreflightState>(INITIAL_STATE);
  const generationRef = useRef(0);
  const handledMessageIdsRef = useRef(new Set<string>());
  const onAcceptRef = useRef(onAccept);
  onAcceptRef.current = onAccept;
  const latestCustomerMessage = useMemo(
    () => getLatestUnansweredCustomerMessage(messages),
    [messages],
  );
  const latestCustomerMessageRef = useRef<ChatMessage | undefined>(undefined);
  latestCustomerMessageRef.current = latestCustomerMessage;
  const triggerMessageId = latestCustomerMessage?.seq
    ? String(latestCustomerMessage.seq)
    : undefined;
  const active = enabled;

  useEffect(() => {
    generationRef.current += 1;
    handledMessageIdsRef.current = new Set();
    setState(INITIAL_STATE);
  }, [conversationId]);

  useEffect(() => {
    if (!active && state.phase === "idle") {
      return;
    }

    if (!active || blocked) {
      generationRef.current += 1;
      setState((current) =>
        current.phase === "idle" ? current : INITIAL_STATE,
      );
    }
  }, [active, blocked, state.phase]);

  useEffect(() => {
    const displayedMessageId = state.triggerMessage?.seq
      ? String(state.triggerMessage.seq)
      : undefined;

    if (
      state.phase !== "idle" &&
      displayedMessageId !== triggerMessageId
    ) {
      generationRef.current += 1;
      setState(INITIAL_STATE);
    }
  }, [state.phase, state.triggerMessage?.seq, triggerMessageId]);

  useEffect(() => {
    if (
      !active ||
      blocked ||
      !conversationId ||
      !latestCustomerMessage ||
      !triggerMessageId ||
      handledMessageIdsRef.current.has(triggerMessageId)
    ) {
      return;
    }

    const triggerMessage = latestCustomerMessageRef.current;
    if (!triggerMessage) return;

    const generation = ++generationRef.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setState({
        phase: "analyzing",
        triggerMessage,
      });

      void requestChatAgentPreflight(
        { conversationId, triggerMessageId },
        controller.signal,
      )
        .then((response) => {
          if (generationRef.current !== generation) return;
          handledMessageIdsRef.current.add(triggerMessageId);

          if (response.assessment.outcome === "no_response_needed") {
            setState(INITIAL_STATE);
            return;
          }

          setState({
            phase: "confirmation",
            response,
            triggerMessage,
          });
        })
        .catch((error) => {
          if (generationRef.current !== generation || controller.signal.aborted) {
            return;
          }

          if (isClientRejectedPreflight(error)) {
            handledMessageIdsRef.current.add(triggerMessageId);
            setState(INITIAL_STATE);
            return;
          }

          handledMessageIdsRef.current.add(triggerMessageId);
          setState({
            phase: "confirmation",
            response: {
              assessment: {
                direction: "handle_request",
                reasoningSummary: "客户发来新消息，尚未形成明确处理结论",
                outcome: "response_needed",
              },
              conversationId,
              evaluatedThroughMessageId: triggerMessageId,
              nextAction: "confirm",
              source: "fallback",
            },
            triggerMessage,
          });
        });
    }, PREFLIGHT_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    active,
    blocked,
    conversationId,
    triggerMessageId,
  ]);

  const dismiss = useCallback(() => {
    const messageId = state.response?.evaluatedThroughMessageId;
    if (messageId) handledMessageIdsRef.current.add(messageId);
    generationRef.current += 1;
    setState(INITIAL_STATE);
  }, [state.response?.evaluatedThroughMessageId]);

  const accept = useCallback(() => {
    if (
      state.response?.assessment.outcome !== "response_needed" ||
      !state.triggerMessage ||
      !conversationId
    ) {
      return;
    }

    const { direction } = state.response.assessment;
    const message = state.triggerMessage;
    handledMessageIdsRef.current.add(state.response.evaluatedThroughMessageId);
    generationRef.current += 1;
    setState(INITIAL_STATE);
    void Promise.resolve(onAcceptRef.current({ direction, message })).catch(
      () => undefined,
    );
  }, [conversationId, state.response, state.triggerMessage]);

  return {
    accept,
    dismiss,
    direction:
      state.response?.assessment.outcome === "response_needed"
        ? state.response.assessment.direction
        : undefined,
    isActive: state.phase !== "idle",
    label:
      state.phase === "analyzing"
        ? "正在理解客户诉求"
        : state.response?.assessment.outcome === "response_needed"
          ? state.response.assessment.reasoningSummary
          : undefined,
    phase: state.phase,
  };
}

function isClientRejectedPreflight(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return false;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status < 500;
}

function getLatestUnansweredCustomerMessage(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (!message || message.role === "system") continue;
    if (message.role !== "customer" || message.isRevoked || !message.seq) {
      return undefined;
    }

    return message;
  }

  return undefined;
}
