import type { Message } from "@/pages/chat/chat-types";

export function getMessageFeedItemKey(message: Message) {
  return message.optNo ?? message.uiMessageKey;
}
