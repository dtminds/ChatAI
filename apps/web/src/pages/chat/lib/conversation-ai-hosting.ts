import type { Conversation } from "@/pages/chat/chat-types";

export function isConversationAIHostingEnabled(
  conversation: Conversation | undefined,
  seatAIHostingEnabled: boolean,
): boolean {
  return (
    seatAIHostingEnabled === true &&
    conversation?.conversationAIHostingSwitch === true
  );
}
