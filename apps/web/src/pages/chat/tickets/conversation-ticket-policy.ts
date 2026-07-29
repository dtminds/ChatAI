import type { Conversation } from "@/pages/chat/chat-types";

export function isConversationTicketSupported(
  conversation:
    | Pick<Conversation, "customerBindType" | "mode">
    | null
    | undefined,
) {
  return (
    conversation?.mode === "single" && conversation.customerBindType === 1
  );
}
