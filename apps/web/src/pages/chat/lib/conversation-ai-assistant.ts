import type { Account, Conversation } from "@/pages/chat/chat-types";
import {
  isConversationAIFeatureSupported,
  resolveConversationAIHostingPolicy,
} from "@/pages/chat/lib/conversation-ai-hosting";

export type ConversationAIAssistantEligibility = {
  canDisplay: boolean;
  canUse: boolean;
  hasCapability: boolean;
};

export function isConversationAIAssistantSupported(
  conversation:
    | Pick<Conversation, "customerBindType" | "mode">
    | undefined
    | null,
) {
  return (
    conversation?.mode === "group" ||
    isConversationAIFeatureSupported(conversation)
  );
}

export function resolveConversationAIAssistantEligibility({
  account,
  canUseConversationActions,
  conversation,
}: {
  account:
    | Pick<
        Account,
        | "seatAIAssistantEnabled"
        | "seatAIHostingEnabled"
        | "seatGroupAIAssistantEnabled"
        | "seatGroupAIHostingEnabled"
      >
    | undefined;
  canUseConversationActions: boolean;
  conversation:
    | Pick<
        Conversation,
        | "bizStatus"
        | "conversationAIHostingSwitch"
        | "customerBindType"
        | "mode"
      >
    | undefined;
}): ConversationAIAssistantEligibility {
  const isSupported = isConversationAIAssistantSupported(conversation);
  const hasCapability =
    isSupported &&
    (conversation?.mode === "group"
      ? account?.seatGroupAIAssistantEnabled === true
      : account?.seatAIAssistantEnabled === true);
  const isBlockedByAIHosting =
    conversation?.mode === "single" &&
    resolveConversationAIHostingPolicy({
      account,
      canUseConversationActions: false,
      conversation,
    }).isEffective;
  const canDisplay =
    hasCapability &&
    conversation?.bizStatus === 1 &&
    !isBlockedByAIHosting;

  return {
    canDisplay,
    canUse: canDisplay && canUseConversationActions,
    hasCapability,
  };
}
