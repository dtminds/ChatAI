import type { Conversation } from "@/pages/chat/chat-types";

export const CUSTOMER_BIND_TYPE_NORMAL = 1;

export function isConversationAIFeatureSupported(
  conversation: Pick<Conversation, "customerBindType" | "mode"> | undefined | null,
): boolean {
  return (
    conversation?.mode === "single" &&
    conversation.customerBindType === CUSTOMER_BIND_TYPE_NORMAL
  );
}

export function isConversationAIHostingEnabled(
  conversation: Conversation | undefined,
  seatAIHostingEnabled: boolean,
  groupFullAutoAuth = false,
): boolean {
  if (conversation?.conversationAIHostingSwitch !== true) {
    return false;
  }

  if (conversation.mode === "group") {
    return groupFullAutoAuth === true;
  }

  return (
    seatAIHostingEnabled === true &&
    isConversationAIFeatureSupported(conversation)
  );
}
