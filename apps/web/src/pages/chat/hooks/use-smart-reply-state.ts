import { useCallback, useMemo, useRef, type RefObject } from "react";
import type { LexicalEditor } from "lexical";
import {
  CLEAR_COMPOSER_COMMAND,
  INSERT_COMPOSER_TEXT_COMMAND,
} from "@/pages/chat/components/composer/lexical-commands";
import type { SmartReplySendPayload } from "@/pages/chat/api/smart-reply-adapter";
import type { SmartReplySuggestion } from "@/pages/chat/components/smart-reply-card";
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
  composerRef: RefObject<LexicalEditor | null>;
  dismissSmartReply: (message: ChatMessage) => void;
  isMountedRef: RefObject<boolean>;
  isSendingDraftRef: RefObject<boolean>;
  onDraftChange: (draft: string) => void;
  onSendFailure: (failure: {
    errorCode: string;
    errorMessage?: string;
    reason: "file-upload" | "image-upload" | "send" | "unavailable";
  }) => void;
  onSendingChange: (isSending: boolean) => void;
  onSent: () => void;
  requestSmartReplyGeneralAnswer: (
    message: ChatMessage,
    options?: { force?: boolean },
  ) => Promise<void>;
  requestSmartReplyMakeShorter: (message: ChatMessage) => Promise<void>;
  sendSmartReply: (
    message: ChatMessage,
    payload: SmartReplySendPayload,
  ) => Promise<SendSmartReplyResult>;
  smartReplyByMessageIdByConversationId: Record<
    string,
    Record<string, SmartReplySuggestion>
  >;
  smartReplyHiddenMessageKeysByConversationId: Record<
    string,
    Record<string, true>
  >;
};

export function useSmartReplyState({
  activeConversation,
  canSendMessage,
  composerRef,
  dismissSmartReply,
  isMountedRef,
  isSendingDraftRef,
  onDraftChange,
  onSendFailure,
  onSendingChange,
  onSent,
  requestSmartReplyGeneralAnswer,
  requestSmartReplyMakeShorter,
  sendSmartReply,
  smartReplyByMessageIdByConversationId,
  smartReplyHiddenMessageKeysByConversationId,
}: UseSmartReplyStateOptions) {
  const activeConversationId = activeConversation?.id;
  const activeConversationMode = activeConversation?.mode;
  const activeSendTokenRef = useRef<symbol | null>(null);
  const activeConversationVersionRef = useRef(0);
  const prevConversationIdRef = useRef(activeConversationId);

  if (prevConversationIdRef.current !== activeConversationId) {
    prevConversationIdRef.current = activeConversationId;
    activeConversationVersionRef.current += 1;
  }

  const suggestions = activeConversationId
    ? smartReplyByMessageIdByConversationId[activeConversationId]
    : undefined;
  const hidden = activeConversationId
    ? smartReplyHiddenMessageKeysByConversationId[activeConversationId]
    : undefined;

  const activeSmartReplyByMessageId = useMemo(() => {
    if (!activeConversationId || activeConversationMode !== "single" || !suggestions) {
      return {};
    }

    const activeHidden = hidden ?? {};

    return Object.fromEntries(
      Object.entries(suggestions).filter(
        ([lookupKey]) => !activeHidden[lookupKey],
      ),
    );
  }, [activeConversationId, activeConversationMode, suggestions, hidden]);

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

  const handleFillSmartReplyComposer = useCallback(
    (_message: ChatMessage, content: string) => {
      const text = content.trim();

      if (!text || !canSendMessage) {
        return;
      }

      composerRef.current?.dispatchCommand(CLEAR_COMPOSER_COMMAND, undefined);
      composerRef.current?.dispatchCommand(INSERT_COMPOSER_TEXT_COMMAND, text);
      onDraftChange(text);
      composerRef.current?.focus();
    },
    [canSendMessage, composerRef, onDraftChange],
  );

  const handleTriggerSmartReply = useCallback(
    (message: ChatMessage, options?: { force?: boolean }) => {
      void requestSmartReplyGeneralAnswer(message, options);
    },
    [requestSmartReplyGeneralAnswer],
  );

  const handleDismissSmartReply = useCallback(
    (message: ChatMessage) => {
      dismissSmartReply(message);
    },
    [dismissSmartReply],
  );

  const handleMakeShorterSmartReply = useCallback(
    (message: ChatMessage) => {
      void requestSmartReplyMakeShorter(message);
    },
    [requestSmartReplyMakeShorter],
  );

  return {
    activeSmartReplyByMessageId,
    handleDismissSmartReply,
    handleFillSmartReplyComposer,
    handleMakeShorterSmartReply,
    handleSendSmartReply,
    handleTriggerSmartReply,
  };
}
