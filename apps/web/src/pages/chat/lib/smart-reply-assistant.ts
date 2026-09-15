import type { ChatMessage, Message } from "@/pages/chat/chat-types";
import {
  getSmartReplyInlineState,
  getSmartReplyLookupKey,
  isSmartReplyBusy,
  isSmartReplyContentIncompleteSkip,
  isSmartReplyEligibleMessage,
  isSmartReplyGenerationFailed,
  isSmartReplyKnowledgeMiss,
  isSmartReplyReady,
  isSmartReplySemanticWait,
  isSmartReplySemanticWaitExpired,
  isSmartReplySent,
  SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT,
  SMART_REPLY_HANDOFF_HINT,
  SMART_REPLY_INLINE_LOADING_HINT,
  SMART_REPLY_SEMANTIC_WAIT_HINT,
  SMART_REPLY_SEMANTIC_WAIT_TIMEOUT_HINT,
} from "@/pages/chat/api/smart-reply-adapter";
import type { SmartReplySuggestion } from "@/pages/chat/lib/smart-reply-types";

export type SmartReplyAssistantPhase =
  | "thinking"
  | "waiting_for_customer"
  | "confirmation"
  | "skipped"
  | "failed";

export type SmartReplyAssistantTurn = {
  isComposerEditable: boolean;
  label: string;
  lookupKey: string;
  message: ChatMessage;
  phase: SmartReplyAssistantPhase;
  reason?: string;
  showComposer: boolean;
  suggestion?: SmartReplySuggestion;
};

type SmartReplyAssistantInput = {
  activeMessageKey?: string;
  autoPending?: Record<string, true>;
  hidden?: Record<string, true>;
  messages: Message[];
  now?: number;
  pending?: Record<string, true>;
  suggestions?: Record<string, SmartReplySuggestion>;
};

export function resolveSmartReplyAssistantTurn({
  activeMessageKey,
  autoPending = {},
  hidden = {},
  messages,
  now = Date.now(),
  pending = {},
  suggestions = {},
}: SmartReplyAssistantInput): SmartReplyAssistantTurn | undefined {
  if (!activeMessageKey || hidden[activeMessageKey]) {
    return undefined;
  }

  const message = messages.find(
    (item): item is ChatMessage =>
      Boolean(
        item &&
          item.role !== "system" &&
          isSmartReplyEligibleMessage(item) &&
          getSmartReplyLookupKey(item) === activeMessageKey,
      ),
  );

  if (!message) {
    return undefined;
  }

  return resolveCandidateTurn({
    isLatestEligible:
      activeMessageKey === getLatestEligibleMessageKey(messages),
    isPending: Boolean(
      autoPending[activeMessageKey] || pending[activeMessageKey],
    ),
    lookupKey: activeMessageKey,
    message,
    now,
    suggestion: suggestions[activeMessageKey],
  });
}

export function hasBlockingSmartReplyAssistantTurn(
  input: SmartReplyAssistantInput,
  targetLookupKey?: string,
) {
  const activeTurn = resolveSmartReplyAssistantTurn(input);

  if (!activeTurn || activeTurn.lookupKey === targetLookupKey) {
    return false;
  }

  return isSmartReplyAssistantTurnBlocking(activeTurn);
}

export function isSmartReplyAssistantTurnBlocking(
  turn?: Pick<SmartReplyAssistantTurn, "phase">,
) {
  return Boolean(
    turn &&
      turn.phase !== "waiting_for_customer" &&
      turn.phase !== "skipped",
  );
}

function resolveCandidateTurn({
  isLatestEligible,
  isPending,
  lookupKey,
  message,
  now,
  suggestion,
}: {
  isLatestEligible: boolean;
  isPending: boolean;
  lookupKey: string;
  message: ChatMessage;
  now: number;
  suggestion?: SmartReplySuggestion;
}): SmartReplyAssistantTurn | undefined {
  if (isSmartReplySent(suggestion)) {
    return undefined;
  }

  if (isSmartReplySemanticWait(suggestion)) {
    if (!isLatestEligible || isSmartReplySemanticWaitExpired(suggestion, now)) {
      return isLatestEligible
        ? createTurn({
            label: SMART_REPLY_SEMANTIC_WAIT_TIMEOUT_HINT,
            lookupKey,
            message,
            phase: "skipped",
            suggestion,
          })
        : undefined;
    }

    return createTurn({
      label: SMART_REPLY_SEMANTIC_WAIT_HINT,
      lookupKey,
      message,
      phase: "waiting_for_customer",
      suggestion,
    });
  }

  const hasContent = Boolean(suggestion?.content.trim());

  if (isPending || isSmartReplyBusy(suggestion)) {
    return createTurn({
      isComposerEditable: false,
      label: SMART_REPLY_INLINE_LOADING_HINT,
      lookupKey,
      message,
      phase: "thinking",
      showComposer: hasContent,
      suggestion,
    });
  }

  if (isSmartReplyReady(suggestion)) {
    return createTurn({
      isComposerEditable: true,
      label: "已为你起草回复",
      lookupKey,
      message,
      phase: "confirmation",
      showComposer: true,
      suggestion,
    });
  }

  if (isSmartReplyContentIncompleteSkip(suggestion)) {
    return createTurn({
      label: SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT,
      lookupKey,
      message,
      phase: "skipped",
      suggestion,
    });
  }

  if (isSmartReplyKnowledgeMiss(suggestion)) {
    return createTurn({
      label: "未找到合适的话术，已跳过推荐",
      lookupKey,
      message,
      phase: "skipped",
      suggestion,
    });
  }

  const inlineState = getSmartReplyInlineState(suggestion);

  if (inlineState && !inlineState.isLoading && !inlineState.canRegenerate) {
    const isSkippedWithReason = Number(suggestion?.generateStatus) === 4;
    const reason = isSkippedWithReason ? suggestion?.failReason?.trim() : undefined;

    return createTurn({
      label: isSkippedWithReason
        ? SMART_REPLY_HANDOFF_HINT
        : inlineState.label || SMART_REPLY_HANDOFF_HINT,
      lookupKey,
      message,
      phase: "skipped",
      reason,
      suggestion,
    });
  }

  if (isSmartReplyGenerationFailed(suggestion) || inlineState?.canRegenerate) {
    return createTurn({
      label: inlineState?.label ?? "话术推荐生成失败",
      lookupKey,
      message,
      phase: "failed",
      suggestion,
    });
  }

  return undefined;
}

function createTurn(
  input: Omit<SmartReplyAssistantTurn, "isComposerEditable" | "showComposer"> &
    Partial<Pick<SmartReplyAssistantTurn, "isComposerEditable" | "showComposer">>,
): SmartReplyAssistantTurn {
  return {
    isComposerEditable: false,
    showComposer: false,
    ...input,
  };
}

function getLatestEligibleMessageKey(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message && message.role !== "system" && isSmartReplyEligibleMessage(message)) {
      return getSmartReplyLookupKey(message);
    }
  }

  return undefined;
}
