import { useCallback, useRef, type RefObject } from "react";
import { toast } from "sonner";
import type { SmartReplySendPayload } from "@/pages/chat/api/smart-reply-adapter";
import type { ChatMessage, Conversation } from "@/pages/chat/chat-types";

type SendSmartReplyResult =
  | {
      didConsumeQuote?: boolean;
      ok: true;
    }
  | {
      errorCode: string;
      errorMessage?: string;
      reason: "file-upload" | "image-upload" | "send" | "unavailable";
      ok: false;
    };

type UseSmartReplyStateOptions = {
  activeConversation?: Conversation;
  canSendMessage: boolean;
  dismissSmartReply: (message: ChatMessage) => void;
  isMountedRef: RefObject<boolean>;
  isSendingDraftRef: RefObject<boolean>;
  onSendFailure: (failure: {
    errorCode: string;
    errorMessage?: string;
    reason: "file-upload" | "image-upload" | "send" | "unavailable";
  }) => void;
  onSendingChange: (isSending: boolean) => void;
  onSent: () => void;
  requestSmartReplyGeneralAnswer: (
    message: ChatMessage,
    options?: { confirmedComposerOverwrite?: boolean; force?: boolean },
  ) => Promise<void>;
  sendSmartReply: (
    message: ChatMessage,
    payload: SmartReplySendPayload,
  ) => Promise<SendSmartReplyResult>;
};

export function useSmartReplyState({
  activeConversation,
  canSendMessage,
  dismissSmartReply,
  isMountedRef,
  isSendingDraftRef,
  onSendFailure,
  onSendingChange,
  onSent,
  requestSmartReplyGeneralAnswer,
  sendSmartReply,
}: UseSmartReplyStateOptions) {
  const activeConversationId = activeConversation?.id;
  const activeSendTokenRef = useRef<symbol | null>(null);
  const activeConversationVersionRef = useRef(0);
  const prevConversationIdRef = useRef(activeConversationId);

  if (prevConversationIdRef.current !== activeConversationId) {
    prevConversationIdRef.current = activeConversationId;
    activeConversationVersionRef.current += 1;
  }

  const handleSendSmartReply = useCallback(
    async (message: ChatMessage, payload: SmartReplySendPayload) => {
      if (!canSendMessage) {
        return undefined;
      }

      if (isSendingDraftRef.current) {
        return undefined;
      }

      const token = Symbol();
      const sendConversationVersion = activeConversationVersionRef.current;
      activeSendTokenRef.current = token;
      isSendingDraftRef.current = true;
      onSendingChange(true);

      try {
        const result = await sendSmartReply(message, payload);

        if (
          !isMountedRef.current ||
          activeSendTokenRef.current !== token ||
          activeConversationVersionRef.current !== sendConversationVersion
        ) {
          return result;
        }

        if (!result.ok) {
          onSendFailure({
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            reason: result.reason,
          });
        } else {
          onSent();
        }

        return result;
      } finally {
        if (activeSendTokenRef.current === token) {
          activeSendTokenRef.current = null;
          isSendingDraftRef.current = false;
          if (isMountedRef.current) {
            onSendingChange(false);
          }
        }
      }
    },
    [
      canSendMessage,
      isMountedRef,
      isSendingDraftRef,
      onSendFailure,
      onSendingChange,
      onSent,
      sendSmartReply,
    ],
  );

  const handleTriggerSmartReply = useCallback(
    (
      message: ChatMessage,
      options?: { confirmedComposerOverwrite?: boolean; force?: boolean },
    ) => {
      void requestSmartReplyGeneralAnswer(message, options).catch(() => {
        toast.error("操作失败，请稍后重试");
      });
    },
    [requestSmartReplyGeneralAnswer],
  );

  const handleDismissSmartReply = useCallback(
    (message: ChatMessage) => {
      dismissSmartReply(message);
    },
    [dismissSmartReply],
  );

  return {
    handleDismissSmartReply,
    handleSendSmartReply,
    handleTriggerSmartReply,
  };
}
