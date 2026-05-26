import type {
  WorkbenchAttachmentDto,
  WorkbenchSmartReplySuggestionDto,
} from "@chatai/contracts";
import type { ChatMessage, Message, MessageContent } from "@/pages/chat/chat-types";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import {
  isSmartReplyBusy,
  type SmartReplySuggestion,
} from "@/pages/chat/components/smart-reply-card";
import type { SmartReplyRecommendedAttachment } from "@/pages/chat/components/smart-reply-edit-dialog";
import type { SmartReplyViolationResult } from "@/pages/chat/components/smart-reply-edit-dialog";
import type { WorkbenchSmartReplyTextModerationResponse } from "@chatai/contracts";

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

const SMART_REPLY_ATTACHMENT_MEDIA_CDN_PREFIX = "https://b1.dtminds.com";

export type SmartReplySendPayload = {
  content: string;
  recommendedAttachments: SmartReplyRecommendedAttachment[];
  selectedAttachmentIds: string[];
};

export function adaptSmartReplyViolationResult(
  response: WorkbenchSmartReplyTextModerationResponse,
): SmartReplyViolationResult | null {
  return response.result;
}

export function buildSmartReplySendSegments({
  content,
  recommendedAttachments,
  selectedAttachmentIds,
}: SmartReplySendPayload): ComposerSegment[] {
  const segments: ComposerSegment[] = [];
  const trimmedContent = content.trim();

  if (trimmedContent) {
    segments.push({
      text: trimmedContent,
      type: "text",
    });
  }

  const selectedIdSet = new Set(selectedAttachmentIds);

  for (const attachment of recommendedAttachments) {
    if (!selectedIdSet.has(attachment.id)) {
      continue;
    }

    const segment = mapSmartReplyAttachmentToComposerSegment(attachment);

    if (segment) {
      segments.push(segment);
    }
  }

  return segments;
}

function mapSmartReplyAttachmentToComposerSegment(
  attachment: SmartReplyRecommendedAttachment,
): ComposerSegment | null {
  const fileType = parseSmartReplyAttachmentFileType(attachment.fileType);

  if (fileType === 1) {
    const imageUrl = resolveSmartReplyAttachmentImageUrl(attachment);

    if (!imageUrl) {
      return null;
    }

    return {
      alt: attachment.fileName,
      type: "image",
      url: imageUrl,
    };
  }

  if (fileType === 6) {
    const text = attachment.content?.trim();

    if (!text) {
      return null;
    }

    return {
      text,
      type: "text",
    };
  }

  const fileUrl = resolveSmartReplyAttachmentSendUrl(attachment);

  if (!fileUrl) {
    return null;
  }

  return {
    extension: getSmartReplyAttachmentExtension(attachment.fileName),
    fileName: attachment.fileName,
    fileSizeLabel: "",
    type: "file",
    url: fileUrl,
  };
}

function parseSmartReplyAttachmentFileType(fileType: string) {
  const parsed = Number.parseInt(fileType, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveSmartReplyMediaUrl(path?: string) {
  const trimmed = path?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return SMART_REPLY_ATTACHMENT_MEDIA_CDN_PREFIX + trimmed;
}

function resolveSmartReplyAttachmentImageUrl(
  attachment: SmartReplyRecommendedAttachment,
) {
  return (
    resolveSmartReplyMediaUrl(attachment.coverUrl) ??
    resolveSmartReplyMediaUrl(attachment.localPath) ??
    resolveSmartReplyMediaUrl(attachment.slocalPath)
  );
}

function resolveSmartReplyAttachmentSendUrl(
  attachment: SmartReplyRecommendedAttachment,
) {
  for (const candidate of [
    attachment.localPath,
    attachment.slocalPath,
    attachment.coverUrl,
    attachment.content,
  ]) {
    const url = resolveSmartReplyMediaUrl(candidate);

    if (url) {
      return url;
    }
  }

  return undefined;
}

function getSmartReplyAttachmentExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function adaptSmartReplyAttachments(
  attachments: WorkbenchAttachmentDto[],
): SmartReplyRecommendedAttachment[] {
  return attachments.flatMap((attachment) => {
    const mapped = mapSmartReplyAttachment(attachment);

    return mapped ? [mapped] : [];
  });
}

function mapSmartReplyAttachment(
  attachment: WorkbenchAttachmentDto,
): SmartReplyRecommendedAttachment | null {
  const id = String(attachment.id);
  const fileName =
    attachment.fileName?.trim() ||
    attachment.textContent?.trim() ||
    attachment.content?.trim() ||
    attachment.appInfo?.nickName?.trim() ||
    `素材 ${id}`;

  return {
    content: attachment.content?.trim(),
    coverUrl: attachment.coverUrl?.trim(),
    defaultSelected: true,
    fileName,
    fileType:
      attachment.fileType != null ? String(attachment.fileType) : "",
    id,
    localPath: attachment.localPath?.trim(),
    slocalPath: attachment.slocalPath?.trim(),
  };
}
