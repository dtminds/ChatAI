import type { WorkbenchSmartReplySuggestionDto } from "@chatai/contracts";
import type { ChatMessage, Message, MessageContent } from "@/pages/chat/chat-types";
import {
  isSmartReplyBusy,
  type SmartReplySuggestion,
} from "@/pages/chat/components/smart-reply-card";

const DEFAULT_SMART_REPLY_ASSISTANT_NAME = "智能助手";

/** 语音/图片消息先展示媒体处理文案，再切到生成话术的提示 */
export const SMART_REPLY_MEDIA_PROCESSING_HINT_MS = 2000;

/** 智能回复轮询最小间隔（毫秒），与工作台主 poll 解耦 */
export const SMART_REPLY_POLL_INTERVAL_MS = 5000;

/** 智能回复繁忙超时时间（毫秒） */
export const SMART_REPLY_BUSY_TIMEOUT_MS = 30000;

export function getSmartReplyProcessingLabel(
  contentType: MessageContent["type"],
  status?: SmartReplySuggestion["status"],
) {
  if (status === "thinking") {
    return "AI正在生成话术...";
  }

  if (contentType === "voice") {
    return "正在处理语音消息...";
  }

  if (contentType === "image") {
    return "正在处理图片消息...";
  }

  return "AI正在生成话术...";
}

export function resolveSmartReplyProcessingLabel(
  contentType: MessageContent["type"],
  status: SmartReplySuggestion["status"] | undefined,
  mediaHintExpired: boolean,
) {
  if (status === "thinking" || mediaHintExpired) {
    return "AI正在生成话术...";
  }

  return getSmartReplyProcessingLabel(contentType, status);
}

export function collectQuestionImgs(message: ChatMessage) {
  if (message.content.type === "image" && message.content.imageUrl.trim()) {
    return [message.content.imageUrl.trim()];
  }

  return [];
}

export function isSmartReplyMediaContentType(contentType: MessageContent["type"]) {
  return contentType === "voice" || contentType === "image";
}

export function createTriggeredSmartReplySuggestion(
  message: ChatMessage,
  suggestion?: SmartReplySuggestion | null,
): SmartReplySuggestion {
  if (suggestion) {
    return suggestion;
  }

  const pending = createPendingSmartReplySuggestion();

  if (isSmartReplyMediaContentType(message.content.type)) {
    return pending;
  }

  return {
    ...pending,
    status: "thinking",
  };
}

export function isSmartReplyEligibleMessage(message: ChatMessage) {
  return (
    message.role === "customer" &&
    !message.isOwnMessage &&
    !message.isRevoked &&
    message.content.type !== "quote"
  );
}

export function createPendingSmartReplySuggestion(
  assistantName = DEFAULT_SMART_REPLY_ASSISTANT_NAME,
): SmartReplySuggestion {
  return {
    assistantName,
    content: "",
    status: "processing",
  };
}

export function shouldShowSmartReplyCard(suggestion?: SmartReplySuggestion | null) {
  if (!suggestion) {
    return false;
  }

  return isSmartReplyBusy(suggestion) || isSmartReplyReady(suggestion);
}

export function shouldShowSmartReplyTriggerIcon(
  message: ChatMessage,
  suggestion?: SmartReplySuggestion | null,
) {
  if (!isSmartReplyEligibleMessage(message)) {
    return false;
  }

  return !shouldShowSmartReplyCard(suggestion);
}

export function mergeSmartReplySuggestionsWithPending(
  suggestions: Record<string, SmartReplySuggestion>,
  pendingKeys: Record<string, true>,
): Record<string, SmartReplySuggestion> {
  const merged = { ...suggestions };

  for (const messageId of Object.keys(pendingKeys)) {
    const existing = merged[messageId];

    if (existing && (isSmartReplyReady(existing) || isSmartReplyBusy(existing))) {
      continue;
    }

    merged[messageId] = createPendingSmartReplySuggestion(
      existing?.assistantName,
    );
  }

  return merged;
}

export function collectNewSmartReplyPendingKeys(
  previousMessages: Message[],
  incomingMessages: Message[],
) {
  if (previousMessages.length === 0) {
    return [];
  }

  const previousKeys = new Set(
    previousMessages.map((message) => getSmartReplyLookupKey(message)),
  );
  const maxPreviousSeq = Math.max(
    0,
    ...previousMessages
      .map((message) => message.seq)
      .filter(
        (seq): seq is number =>
          typeof seq === "number" && Number.isSafeInteger(seq) && seq > 0,
      ),
  );
  const pendingKeys: string[] = [];

  for (const message of incomingMessages) {
    if (message.role === "system" || !isSmartReplyEligibleMessage(message)) {
      continue;
    }

    const lookupKey = getSmartReplyLookupKey(message);

    if (previousKeys.has(lookupKey)) {
      continue;
    }

    const seq = message.seq;

    if (seq != null && Number.isSafeInteger(seq) && seq > 0 && seq <= maxPreviousSeq) {
      continue;
    }

    pendingKeys.push(lookupKey);
  }

  return pendingKeys;
}

export function isSmartReplyReady(suggestion?: SmartReplySuggestion | null) {
  if (!suggestion) {
    return false;
  }

  if (suggestion.status === "thinking" || suggestion.status === "processing") {
    return false;
  }

  if (suggestion.status === "ready") {
    return true;
  }

  return suggestion.content.trim().length > 0;
}

export function adaptSmartReplySuggestions(
  suggestions: WorkbenchSmartReplySuggestionDto[],
): Record<string, SmartReplySuggestion> {
  return Object.fromEntries(
    suggestions.map((suggestion) => [
      suggestion.messageId,
      {
        assistantName: suggestion.assistantName,
        content: suggestion.content,
        refAttachIds: suggestion.refAttachIds,
        status: suggestion.status,
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
