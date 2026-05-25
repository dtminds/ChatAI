import type { WorkbenchSmartReplySuggestionDto } from "@chatai/contracts";
import type { SmartReplySuggestion } from "@/pages/chat/components/smart-reply-card";

export function adaptSmartReplySuggestions(
  suggestions: WorkbenchSmartReplySuggestionDto[],
): Record<string, SmartReplySuggestion> {
  return Object.fromEntries(
    suggestions.map((suggestion) => [
      suggestion.messageId,
      {
        assistantAvatarUrl: suggestion.assistantAvatarUrl,
        assistantName: suggestion.assistantName,
        content: suggestion.content,
        status: suggestion.status,
        versionCount: suggestion.versionCount,
        versionIndex: suggestion.versionIndex,
      },
    ]),
  );
}

/** Java user-history-answer-list 的 msgIds 参数取消息 seq */
export function collectSmartReplyMsgIds(
  messages: Array<{ seq?: number }>,
  limit = 100,
) {
  const seen = new Set<number>();
  const msgIds: number[] = [];

  for (const message of messages.slice(-limit)) {
    const seq = message.seq;

    if (!Number.isSafeInteger(seq) || seq == null || seq <= 0 || seen.has(seq)) {
      continue;
    }

    seen.add(seq);
    msgIds.push(seq);
  }

  return msgIds;
}

export function getSmartReplyLookupKey(message: { id: string; seq?: number }) {
  return message.seq != null ? String(message.seq) : message.id;
}
