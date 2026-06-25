import { parseWorkbenchDate } from "@/pages/chat/lib/chat-time";
import type { Message } from "@/pages/chat/chat-types";

type SortableMessage = Pick<Message, "sentAt" | "seq">;

export function sortMessagesBySentAt<T extends SortableMessage>(messages: T[]) {
  return messages
    .map((message, index) => {
      const timestamp = parseSortableSentAt(message.sentAt);

      return {
        index,
        message,
        timestamp,
        timestampValid: Number.isFinite(timestamp),
      };
    })
    .sort((left, right) => {
      if (left.timestampValid && right.timestampValid) {
        if (left.timestamp !== right.timestamp) {
          return left.timestamp - right.timestamp;
        }
      } else if (left.timestampValid !== right.timestampValid) {
        return left.timestampValid ? -1 : 1;
      }

      const leftSeq = left.message.seq;
      const rightSeq = right.message.seq;

      if (leftSeq != null && rightSeq != null && leftSeq !== rightSeq) {
        return leftSeq - rightSeq;
      }

      return left.index - right.index;
    })
    .map(({ message }) => message);
}

function parseSortableSentAt(value: unknown) {
  if (typeof value !== "string") {
    return Number.NaN;
  }

  return parseWorkbenchDate(value)?.getTime() ?? Number.NaN;
}
