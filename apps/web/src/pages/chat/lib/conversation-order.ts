import type { ChatMode, Conversation } from "@/pages/chat/chat-types";

export type ConversationPromotion = {
  accountId: string;
  baselineUpdatedAtMs: number;
  conversationId: string;
  mode: ChatMode;
};

export function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort(compareConversations);
}

export function sortConversationsForDisplay(
  conversations: Conversation[],
  promotion?: ConversationPromotion,
) {
  const naturallySorted = sortConversations(conversations);

  if (!promotion) {
    return naturallySorted;
  }

  const promotedConversation = naturallySorted.find(
    (conversation) =>
      conversation.id === promotion.conversationId &&
      conversation.accountId === promotion.accountId &&
      conversation.mode === promotion.mode,
  );

  if (!promotedConversation) {
    return naturallySorted;
  }

  const newlyActiveConversations: Conversation[] = [];
  const remainingConversations: Conversation[] = [];

  for (const conversation of naturallySorted) {
    if (conversation.id === promotedConversation.id) {
      continue;
    }

    if (
      conversation.accountId === promotion.accountId &&
      conversation.mode === promotion.mode &&
      (conversation.updatedAtMs ?? 0) > promotion.baselineUpdatedAtMs
    ) {
      newlyActiveConversations.push(conversation);
      continue;
    }

    remainingConversations.push(conversation);
  }

  return [
    ...newlyActiveConversations,
    promotedConversation,
    ...remainingConversations,
  ];
}

function compareConversations(left: Conversation, right: Conversation) {
  const pinnedComparison = Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned));

  if (pinnedComparison !== 0) {
    return pinnedComparison;
  }

  return (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0);
}
