import type { ChatMessage } from "@/pages/chat/chat-types";
import { canCollectMaterial } from "@/pages/chat/lib/message-collect-material";

export const MESSAGE_FORWARD_MAX_MESSAGES = 20;
export const MESSAGE_FORWARD_MAX_RECIPIENTS = 9;

export type MessageForwardMode = "single" | "batch";

export function canForwardMessage(message: ChatMessage) {
  if (message.isRevoked) {
    return false;
  }

  if (message.content.type === "text") {
    return message.content.text.trim().length > 0;
  }

  if (message.content.type === "quote") {
    return message.content.text.trim().length > 0;
  }

  return canCollectMaterial(message);
}
