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
): boolean {
  return (
    seatAIHostingEnabled === true &&
    isConversationAIFeatureSupported(conversation) &&
    conversation?.conversationAIHostingSwitch === true
  );
}
