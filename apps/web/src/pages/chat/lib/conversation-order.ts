import type { Conversation } from "@/pages/chat/chat-types";

export function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort(compareConversations);
}

function compareConversations(left: Conversation, right: Conversation) {
  const pinnedComparison = Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned));

  if (pinnedComparison !== 0) {
    return pinnedComparison;
  }

  return (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0);
}
