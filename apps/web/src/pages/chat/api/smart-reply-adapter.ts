import type {
  WorkbenchAttachmentDto,
  WorkbenchSmartReplySuggestionDto,
} from "@chatai/contracts";
import {
  SMART_REPLY_FAIL_REASON_KNOWLEDGE_MISS,
  SMART_REPLY_TERMINAL_GENERATE_STATUSES,
} from "@chatai/contracts";
import type { ChatMessage, Conversation, Message, MessageContent } from "@/pages/chat/chat-types";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import type { SmartReplySuggestion } from "@/pages/chat/components/smart-reply-card";
import type { SmartReplyRecommendedAttachment } from "@/pages/chat/components/smart-reply-edit-dialog";
import type { SmartReplyViolationResult } from "@/pages/chat/components/smart-reply-edit-dialog";
import type { WorkbenchSmartReplyTextModerationResponse } from "@chatai/contracts";

const DEFAULT_SMART_REPLY_ASSISTANT_NAME = "智能助手";
export const SMART_REPLY_THINKING_LABEL = "思考中..";

const SMART_REPLY_TRIGGER_CONTENT_TYPES = new Set<MessageContent["type"]>([
  "text",
  "image",
  "voice",
]);

/** 语音/图片消息先展示媒体处理文案，再切到生成话术的提示 */
export const SMART_REPLY_MEDIA_PROCESSING_HINT_MS = 2000;

/** 智能回复轮询最小间隔（毫秒），与工作台主 poll 解耦 */
export const SMART_REPLY_POLL_INTERVAL_MS = 1000;

/** 智能回复繁忙超时时间（毫秒） */
export const SMART_REPLY_BUSY_TIMEOUT_MS = 30000;

export const SMART_REPLY_INITIAL_CANDIDATE_LIMIT = 5;

export function getSmartReplyProcessingLabel(
  contentType: MessageContent["type"],
  status?: SmartReplySuggestion["status"],
) {
  if (status === "thinking") {
    return SMART_REPLY_THINKING_LABEL;
  }

  if (contentType === "voice") {
    return "正在处理语音消息...";
  }

  if (contentType === "image") {
    return "正在处理图片消息...";
  }

  return SMART_REPLY_THINKING_LABEL;
}

export function resolveSmartReplyProcessingLabel(
  contentType: MessageContent["type"],
  status: SmartReplySuggestion["status"] | undefined,
  mediaHintExpired: boolean,
) {
  if (status === "thinking" || mediaHintExpired) {
    return SMART_REPLY_THINKING_LABEL;
  }

  return getSmartReplyProcessingLabel(contentType, status);
}

export function collectQuestionImgs(message: ChatMessage) {
  if (message.content.type === "image" && message.content.imageUrl.trim()) {
    return [message.content.imageUrl.trim()];
  }

  return [];
}

/** FAQ「问题」默认取触发智能回复的客户消息，而非回复话术首行 */
export function getSmartReplyCustomerQuestion(message: ChatMessage) {
  switch (message.content.type) {
    case "text":
      return message.content.text.trim();
    case "quote":
      return message.content.text.trim();
    case "voice":
      return message.content.durationLabel
        ? `[语音 ${message.content.durationLabel}]`
        : "[语音]";
    case "image":
      return "[图片]";
    case "video":
      return message.content.alt?.trim() || "[视频]";
    case "file":
      return message.content.fileName?.trim() || "[文件]";
    case "h5":
      return message.content.title?.trim() || message.content.url?.trim() || "[链接]";
    case "mini-program":
      return message.content.title?.trim() || message.content.appName?.trim() || "[小程序]";
    default:
      return "";
  }
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

export function isSmartReplySupportedConversation(
  conversation?: Pick<Conversation, "mode"> | null,
) {
  return conversation?.mode === "single";
}

export function isSmartReplyEligibleMessage(message: ChatMessage) {
  return (
    message.role === "customer" &&
    !message.isOwnMessage &&
    !message.isRevoked &&
    !message.isGroupConversation &&
    SMART_REPLY_TRIGGER_CONTENT_TYPES.has(message.content.type)
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

export function isSmartReplyPollActiveGenerateStatus(
  rawStatus: SmartReplySuggestion["generateStatus"],
) {
  const numericStatus = readNonNegativeInteger(rawStatus);

  return numericStatus === 0 || numericStatus === 1;
}

export function isSmartReplyBusy(
  suggestion?: SmartReplySuggestion | null,
): boolean {
  return (
    suggestion?.status === "thinking" || suggestion?.status === "processing"
  );
}

export function isSmartReplyKnowledgeMiss(
  suggestion?: SmartReplySuggestion | null,
) {
  return (
    suggestion?.failReason?.trim().toLowerCase() ===
    SMART_REPLY_FAIL_REASON_KNOWLEDGE_MISS
  );
}

export function isSmartReplyGenerationFailed(
  suggestion?: SmartReplySuggestion | null,
) {
  if (!suggestion || isSmartReplyKnowledgeMiss(suggestion)) {
    return false;
  }

  if (isSmartReplyBusy(suggestion) || isSmartReplyReady(suggestion)) {
    return false;
  }

  const failReason = suggestion.failReason?.trim();

  if (failReason) {
    return true;
  }

  return readNonNegativeInteger(suggestion.generateStatus) === 3;
}

export function shouldShowSmartReplyCard(suggestion?: SmartReplySuggestion | null) {
  if (!suggestion) {
    return false;
  }

  if (
    isSmartReplyKnowledgeMiss(suggestion) ||
    isSmartReplyGenerationFailed(suggestion)
  ) {
    return true;
  }

  if (isSmartReplyReady(suggestion)) {
    return true;
  }

  if (!isSmartReplyBusy(suggestion)) {
    return false;
  }

  return true;
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
  const unansweredKeys = new Set(
    collectUnansweredSmartReplyPendingKeys([
      ...previousMessages,
      ...incomingMessages,
    ], Number.POSITIVE_INFINITY),
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

    if (!unansweredKeys.has(lookupKey)) {
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

export function collectUnansweredSmartReplyPendingKeys(
  messages: Message[],
  limit = SMART_REPLY_INITIAL_CANDIDATE_LIMIT,
) {
  const unansweredMessages = collectUnansweredSmartReplyMessages(messages);
  const limitedMessages = Number.isFinite(limit)
    ? unansweredMessages.slice(-Math.max(0, Math.floor(limit)))
    : unansweredMessages;

  return limitedMessages.map((message) => getSmartReplyLookupKey(message));
}

function collectUnansweredSmartReplyMessages(messages: Message[]) {
  let lastAgentMessageIndex = -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "agent") {
      lastAgentMessageIndex = index;
      break;
    }
  }

  return messages
    .slice(lastAgentMessageIndex + 1)
    .filter(
      (message): message is ChatMessage =>
        message.role !== "system" && isSmartReplyEligibleMessage(message),
    );
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

export function canRequestSmartReplyMakeShorter(
  suggestion?: SmartReplySuggestion | null,
) {
  if (!suggestion) {
    return false;
  }

  if (
    suggestion.status === "thinking" ||
    suggestion.status === "processing"
  ) {
    return false;
  }

  if (isSmartReplyKnowledgeMiss(suggestion)) {
    return false;
  }

  return suggestion.content.trim().length > 0;
}

export function createMakeShorterSmartReplySuggestion(
  previous: SmartReplySuggestion,
  content: string,
): SmartReplySuggestion {
  return {
    ...previous,
    busyRequestId: undefined,
    content: content.trim(),
    pollComplete: true,
    status: "ready",
  };
}

export function isSmartReplySent(suggestion?: SmartReplySuggestion | null) {
  return readNonNegativeInteger(suggestion?.generateStatus) === 4;
}

export function createSentSmartReplySuggestion(
  previous: SmartReplySuggestion,
  content: string,
): SmartReplySuggestion {
  return {
    ...previous,
    busyRequestId: undefined,
    content: content.trim(),
    generateStatus: 4,
    pollComplete: true,
    status: "ready",
  };
}

export function isSmartReplyPollComplete(suggestion?: SmartReplySuggestion | null) {
  if (!suggestion) {
    return false;
  }

  if (suggestion.pollComplete) {
    return true;
  }

  return isSmartReplyTerminalGenerateStatus(suggestion.generateStatus);
}

export function isSmartReplyTerminalGenerateStatus(
  rawStatus: SmartReplySuggestion["generateStatus"],
) {
  const numericStatus = readNonNegativeInteger(rawStatus);

  if (numericStatus == null) {
    return false;
  }

  return (SMART_REPLY_TERMINAL_GENERATE_STATUSES as readonly number[]).includes(
    numericStatus,
  );
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
        failReason: suggestion.failReason,
        generateStatus: suggestion.generateStatus,
        pollComplete: suggestion.pollComplete,
        refAttachIds: suggestion.refAttachIds,
        status: suggestion.status,
        recordId: suggestion.recordId,
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

export function collectSmartReplyPollMsgIds(
  messages: Array<{ id: string; seq?: number }>,
  suggestions: Record<string, SmartReplySuggestion>,
  limit = 100,
) {
  return collectSmartReplyMsgIds(messages, limit).filter((seq) => {
    const suggestion = suggestions[String(seq)];

    return !isSmartReplyPollComplete(suggestion);
  });
}

export function collectPendingSmartReplyPollMsgIds(
  messages: Message[],
  suggestions: Record<string, SmartReplySuggestion>,
  pending: Record<string, true>,
  limit = 100,
  options?: { allowKeys?: Set<string> },
) {
  const unansweredKeys = new Set(
    collectUnansweredSmartReplyPendingKeys(messages, Number.POSITIVE_INFINITY),
  );
  const seen = new Set<number>();
  const msgIds: number[] = [];

  for (const message of messages) {
    const lookupKey = getSmartReplyLookupKey(message);

    if (
      !pending[lookupKey] ||
      (!unansweredKeys.has(lookupKey) && !options?.allowKeys?.has(lookupKey))
    ) {
      continue;
    }

    const seq = message.seq;

    if (!Number.isSafeInteger(seq) || seq == null || seq <= 0 || seen.has(seq)) {
      continue;
    }

    if (isSmartReplyPollComplete(suggestions[String(seq)])) {
      continue;
    }

    seen.add(seq);
    msgIds.push(seq);

    if (msgIds.length >= limit) {
      break;
    }
  }

  return msgIds;
}

export function collectSmartReplyPendingKeysFromSuggestions(
  suggestions: Record<string, SmartReplySuggestion>,
) {
  return Object.entries(suggestions)
    .filter(([, suggestion]) => !isSmartReplyPollComplete(suggestion))
    .map(([messageId]) => messageId);
}

function readNonNegativeInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  return undefined;
}

export function getSmartReplyLookupKey(message: { id: string; seq?: number }) {
  return message.seq != null ? String(message.seq) : message.id;
}

const SMART_REPLY_ATTACHMENT_MEDIA_CDN_PREFIX = "https://b1.dtminds.com";

function joinSmartReplyMediaCdnUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return SMART_REPLY_ATTACHMENT_MEDIA_CDN_PREFIX + normalizedPath;
}

export type SmartReplySendPayload = {
  content: string;
  recommendedAttachments: SmartReplyRecommendedAttachment[];
  selectedAttachmentIds: string[];
};

export function buildSmartReplyRealAttachIds(selectedAttachmentIds: string[]) {
  return selectedAttachmentIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function adaptKnowledgeSetOptions(
  items: Array<{ id: string; name: string }>,
) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
  }));
}

export function adaptKnowledgeDocOptions(
  list: Array<{ id: string; name: string }>,
) {
  return adaptKnowledgeSetOptions(list);
}

export function buildSmartReplyKnowledgeFaqAddRequest(input: {
  conversationId: string;
  docId: string;
  question: string;
  answer: string;
  similarQuestions: string[];
  attachIds: string[];
}) {
  return {
    conversationId: input.conversationId,
    docId: input.docId,
    list: [
      {
        answer: input.answer,
        attachIds: input.attachIds.length > 0 ? input.attachIds.join(",") : "",
        question: input.question,
        similarQuestion: input.similarQuestions.join("\n"),
      },
    ],
  };
}

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

  return joinSmartReplyMediaCdnUrl(trimmed);
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
  const mapped: SmartReplyRecommendedAttachment[] = [];

  for (const attachment of attachments) {
    const item = mapSmartReplyAttachment(attachment, mapped.length === 0);

    if (item) {
      mapped.push(item);
    }
  }

  return mapped;
}

function mapSmartReplyAttachment(
  attachment: WorkbenchAttachmentDto,
  defaultSelected = false,
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
    defaultSelected,
    fileName,
    fileType:
      attachment.fileType != null ? String(attachment.fileType) : "",
    id,
    localPath: attachment.localPath?.trim(),
    slocalPath: attachment.slocalPath?.trim(),
  };
}
