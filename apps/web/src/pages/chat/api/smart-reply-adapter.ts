import type {
  WorkbenchAttachmentDto,
  WorkbenchSmartReplySuggestionDto,
} from "@chatai/contracts";
import {
  SMART_REPLY_FAIL_REASON_KNOWLEDGE_MISS,
  SMART_REPLY_TERMINAL_GENERATE_STATUSES,
} from "@chatai/contracts";
import type { ChatMessage, Conversation, Message, MessageContent } from "@/pages/chat/chat-types";
import { isConversationAIFeatureSupported } from "@/pages/chat/lib/conversation-ai-hosting";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import type { SmartReplySuggestion } from "@/pages/chat/components/smart-reply-card";
import type { SmartReplyRecommendedAttachment } from "@/pages/chat/components/smart-reply-edit-dialog";
import type { SmartReplyViolationResult } from "@/pages/chat/components/smart-reply-edit-dialog";
import type { WorkbenchSmartReplyTextModerationResponse } from "@chatai/contracts";

const DEFAULT_SMART_REPLY_ASSISTANT_NAME = "智能助手";
export const SMART_REPLY_THINKING_LABEL = "思考中..";
export const SMART_REPLY_CONTENT_INCOMPLETE_SKIP_MESSAGE = "content_incomplete_skip";
export const SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT =
  "这条消息信息不足，已跳过话术推荐";
export const SMART_REPLY_HANDOFF_HINT = "已跳过话术推荐";
export const SMART_REPLY_INLINE_LOADING_HINT = "正在生成话术推荐";

const SMART_REPLY_TRIGGER_RAW_MSGTYPES = new Set(["text", "image", "voice"]);

/** 语音/图片消息先展示媒体处理文案，再切到生成话术的提示 */
export const SMART_REPLY_MEDIA_PROCESSING_HINT_MS = 2000;

/** 智能回复轮询最小间隔（毫秒），与工作台主 poll 解耦 */
export const SMART_REPLY_POLL_INTERVAL_MS = 1000;

/** 智能回复繁忙超时时间（毫秒） */
export const SMART_REPLY_BUSY_TIMEOUT_MS = 30000;

export const SMART_REPLY_INITIAL_CANDIDATE_LIMIT = 5;

function isSmartReplyQuestionImageContent(
  content: MessageContent,
): content is Extract<MessageContent, { type: "image" }> {
  return content.type === "image" && content.variant !== "emotion";
}

function readSmartReplyGenerateStatus(suggestion?: SmartReplySuggestion | null) {
  return readNonNegativeInteger(suggestion?.generateStatus);
}

export function hasSmartReplyTriggerRawMsgtype(message: Pick<ChatMessage, "rawMsgtype">) {
  const rawMsgtype = message.rawMsgtype?.trim();

  return rawMsgtype ? SMART_REPLY_TRIGGER_RAW_MSGTYPES.has(rawMsgtype) : false;
}

function hasSmartReplyImageRawMsgtype(message: ChatMessage) {
  return message.rawMsgtype?.trim() === "image";
}

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
  if (
    hasSmartReplyImageRawMsgtype(message) &&
    isSmartReplyQuestionImageContent(message.content) &&
    message.content.imageUrl.trim()
  ) {
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
      if (message.content.transVoiceText?.trim()) {
        return message.content.transVoiceText.trim();
      }

      return message.content.durationLabel
        ? `[语音 ${message.content.durationLabel}]`
        : "[语音]";
    case "image":
      return message.content.alt?.trim() || "[图片]";
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
  conversation?: Pick<Conversation, "customerBindType" | "mode"> | null,
) {
  return isConversationAIFeatureSupported(conversation);
}

export function isSmartReplyEligibleMessage(message: ChatMessage) {
  if (
    message.role !== "customer" ||
    message.isOwnMessage ||
    message.isRevoked ||
    message.isGroupConversation
  ) {
    return false;
  }

  if (!hasSmartReplyTriggerRawMsgtype(message)) {
    return false;
  }

  switch (message.rawMsgtype?.trim()) {
    case "voice":
      if (message.content.type !== "voice") {
        return false;
      }

      return Boolean(message.content.transVoiceText?.trim());
    case "image":
      if (message.content.type !== "image") {
        return false;
      }

      if (!isSmartReplyQuestionImageContent(message.content)) {
        return false;
      }

      if (
        message.content.downloadStatus !== undefined &&
        message.content.downloadStatus !== "finished"
      ) {
        return false;
      }

      return Boolean(message.content.imageUrl?.trim());
    case "text":
      return message.content.type === "text";
    default:
      return false;
  }
}

export function createPendingSmartReplySuggestion(
  assistantName = DEFAULT_SMART_REPLY_ASSISTANT_NAME,
): SmartReplySuggestion {
  return {
    assistantName,
    busyRequestId: Date.now(),
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

  if (isSmartReplyContentIncompleteSkip(suggestion)) {
    return false;
  }

  if (isSmartReplyBusy(suggestion) || isSmartReplyReady(suggestion)) {
    return false;
  }

  const failReason = suggestion.failReason?.trim();

  if (failReason) {
    return true;
  }

  return readSmartReplyGenerateStatus(suggestion) === 3;
}

export function isSmartReplyContentIncompleteSkip(
  suggestion?: SmartReplySuggestion | null,
) {
  const failReason = suggestion?.failReason?.trim();

  return (
    failReason === SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT ||
    failReason === SMART_REPLY_CONTENT_INCOMPLETE_SKIP_MESSAGE
  );
}

export function shouldShowSmartReplyCard(suggestion?: SmartReplySuggestion | null) {
  if (!suggestion) {
    return false;
  }

  if (isSmartReplySent(suggestion)) {
    return true;
  }

  if (readSmartReplyGenerateStatus(suggestion) !== 2) {
    return false;
  }

  if (!isSmartReplyReady(suggestion)) {
    return false;
  }

  return suggestion.content.trim().length > 0;
}

export function shouldShowSmartReplyTriggerIcon(
  message: ChatMessage,
  suggestion?: SmartReplySuggestion | null,
) {
  if (!isSmartReplyEligibleMessage(message)) {
    return false;
  }

  return !shouldShowSmartReplyCard(suggestion) && !getSmartReplyInlineState(suggestion);
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
  let maxPreviousSeq = 0;
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const seq = previousMessages[index]?.seq;

    if (typeof seq === "number" && Number.isSafeInteger(seq) && seq > 0) {
      maxPreviousSeq = seq;
      break;
    }
  }
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

  const generateStatus = readSmartReplyGenerateStatus(suggestion);

  if (generateStatus != null) {
    return generateStatus === 2 && suggestion.content.trim().length > 0;
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

  if (!isSmartReplySent(suggestion) && readSmartReplyGenerateStatus(suggestion) !== 2) {
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
  return suggestion?.sent === true;
}

export function createSentSmartReplySuggestion(
  previous: SmartReplySuggestion,
  content: string,
): SmartReplySuggestion {
  return {
    ...previous,
    busyRequestId: undefined,
    content: content.trim(),
    pollComplete: true,
    sent: true,
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

export type SmartReplyInlineState = {
  canDismiss: boolean;
  canRegenerate: boolean;
  isLoading: boolean;
  label: string;
};

export function getSmartReplyInlineState(
  suggestion?: SmartReplySuggestion | null,
): SmartReplyInlineState | undefined {
  if (!suggestion) {
    return undefined;
  }

  const generateStatus = readSmartReplyGenerateStatus(suggestion);

  if (generateStatus === 0 || generateStatus === 1 || isSmartReplyBusy(suggestion)) {
    return {
      canDismiss: false,
      canRegenerate: false,
      isLoading: true,
      label: SMART_REPLY_INLINE_LOADING_HINT,
    };
  }

  if (generateStatus === 3) {
    const failReason = suggestion.failReason?.trim();

    return {
      canDismiss: true,
      canRegenerate: true,
      isLoading: false,
      label: failReason ? `生成失败：${failReason}` : "生成失败",
    };
  }

  if (generateStatus === 4) {
    const failReason = suggestion.failReason?.trim();

    return {
      canDismiss: true,
      canRegenerate: false,
      isLoading: false,
      label: failReason
        ? `${SMART_REPLY_HANDOFF_HINT}：${failReason}`
        : SMART_REPLY_HANDOFF_HINT,
    };
  }

  return undefined;
}

const SMART_REPLY_MEDIA_PLACEHOLDER_PATTERN = /^\[(图片|文件|视频)\]$/;

function parseSmartReplyJsonPayload(raw: unknown): unknown | undefined {
  if (raw == null) {
    return undefined;
  }

  if (typeof raw !== "string") {
    return raw;
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    return undefined;
  }

  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function parseSmartReplyGenAnswerTextParts(raw: unknown): string[] | null {
  const payload = parseSmartReplyJsonPayload(raw);

  if (payload === undefined) {
    return null;
  }

  if (Array.isArray(payload)) {
    const textParts: string[] = [];

    for (const segment of payload) {
      const parsed = classifySmartReplyGenAnswerSegment(segment);

      if (parsed.type === "text" && parsed.text) {
        textParts.push(parsed.text);
      }
    }

    return textParts;
  }

  const parsed = classifySmartReplyGenAnswerSegment(payload);

  if (parsed.type === "text" && parsed.text) {
    return [parsed.text];
  }

  return [];
}

function classifySmartReplyGenAnswerSegment(
  segment: unknown,
): { type: "text"; text: string } | { type: "media" } | { type: "unknown" } {
  if (!isRecord(segment)) {
    return { type: "unknown" };
  }

  const msgtype = readString(segment.msgtype)?.toLowerCase();

  if (msgtype === "text") {
    return { type: "text", text: readString(segment.text) ?? "" };
  }

  if (msgtype === "image" || msgtype === "file" || msgtype === "video") {
    return { type: "media" };
  }

  const fallbackText = readString(segment.text) ?? readString(segment.content);

  if (fallbackText) {
    return { type: "text", text: fallbackText };
  }

  return { type: "unknown" };
}

export function parseSmartReplyTextContent(raw: unknown): string {
  const parsed = parseSmartReplyGenAnswerTextParts(raw);

  if (parsed) {
    return parsed.join("\n");
  }

  if (typeof raw !== "string") {
    return "";
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed
    .split("\n")
    .filter((line) => !SMART_REPLY_MEDIA_PLACEHOLDER_PATTERN.test(line.trim()))
    .join("\n")
    .trim();
}

function normalizeSmartReplyAttachmentId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

function readSmartReplyGenAnswerSegmentAttachmentId(
  segment: Record<string, unknown>,
): string | undefined {
  for (const key of [
    "id",
    "attachId",
    "refAttachId",
    "transMsgInfoId",
    "msgInfoId",
  ]) {
    const normalized = normalizeSmartReplyAttachmentId(segment[key]);

    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function readSmartReplyGenAnswerSegmentPreviewPath(
  segment: Record<string, unknown>,
): string | undefined {
  for (const key of [
    "fileUrl",
    "url",
    "coverUrl",
    "localPath",
    "slocalPath",
    "content",
  ]) {
    const value = readString(segment[key]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function readSmartReplyGenAnswerSegmentFileType(
  msgtype: string | undefined,
): string {
  if (msgtype === "file") {
    return "5";
  }

  if (msgtype === "video") {
    return "3";
  }

  return "1";
}

export function extractSmartReplyGenAnswerAttachmentIds(
  genAnswer?: string,
): string[] {
  // Keep Java genAnswer attachment field handling in sync with backend smart-reply-mappers.ts.
  const payload = parseSmartReplyJsonPayload(genAnswer);

  if (payload === undefined) {
    return [];
  }

  const segments = Array.isArray(payload) ? payload : [payload];
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    if (!isRecord(segment)) {
      continue;
    }

    const msgtype = readString(segment.msgtype)?.toLowerCase();

    if (
      msgtype !== "image" &&
      msgtype !== "file" &&
      msgtype !== "video" &&
      msgtype !== "link" &&
      msgtype !== "weapp" &&
      msgtype !== "sphfeed"
    ) {
      continue;
    }

    const attachmentId = readSmartReplyGenAnswerSegmentAttachmentId(segment);

    if (attachmentId && !seen.has(attachmentId)) {
      seen.add(attachmentId);
      ids.push(attachmentId);
    }
  }

  return ids;
}

export function extractSmartReplyGenAnswerInlineAttachments(
  genAnswer?: string,
): SmartReplyRecommendedAttachment[] {
  const payload = parseSmartReplyJsonPayload(genAnswer);

  if (payload === undefined) {
    return [];
  }

  const segments = Array.isArray(payload) ? payload : [payload];
  const attachments: SmartReplyRecommendedAttachment[] = [];

  segments.forEach((segment, index) => {
    if (!isRecord(segment)) {
      return;
    }

    const msgtype = readString(segment.msgtype)?.toLowerCase();

    if (
      msgtype !== "image" &&
      msgtype !== "file" &&
      msgtype !== "video" &&
      msgtype !== "link" &&
      msgtype !== "weapp" &&
      msgtype !== "sphfeed"
    ) {
      return;
    }

    const attachmentId =
      readSmartReplyGenAnswerSegmentAttachmentId(segment) ??
      `genanswer-${msgtype}-${index}`;
    const previewPath = readSmartReplyGenAnswerSegmentPreviewPath(segment);

    if (!previewPath && readSmartReplyGenAnswerSegmentAttachmentId(segment) == null) {
      return;
    }

    attachments.push({
      content: readString(segment.content),
      coverUrl: readString(segment.coverUrl) ?? previewPath,
      defaultSelected: attachments.length === 0,
      fileName:
        readString(segment.fileName) ??
        readString(segment.title) ??
        readString(segment.alt) ??
        (msgtype === "image" ? "图片" : msgtype === "file" ? "文件" : "附件"),
      fileType: readSmartReplyGenAnswerSegmentFileType(msgtype),
      id: attachmentId,
      localPath: readString(segment.localPath) ?? readString(segment.fileUrl),
      slocalPath: readString(segment.slocalPath),
    });
  });

  return attachments;
}

function enrichSmartReplyRecommendedAttachment(
  primary: SmartReplyRecommendedAttachment,
  fallback: SmartReplyRecommendedAttachment,
): SmartReplyRecommendedAttachment {
  return {
    ...primary,
    content: primary.content ?? fallback.content,
    coverUrl: primary.coverUrl ?? fallback.coverUrl,
    fileName: primary.fileName || fallback.fileName,
    localPath: primary.localPath ?? fallback.localPath,
    slocalPath: primary.slocalPath ?? fallback.slocalPath,
  };
}

export function mergeSmartReplyRecommendedAttachments(
  fetched: SmartReplyRecommendedAttachment[],
  inline: SmartReplyRecommendedAttachment[],
): SmartReplyRecommendedAttachment[] {
  if (fetched.length === 0) {
    return normalizeSmartReplyRecommendedAttachments(inline);
  }

  const merged = fetched.map((attachment) => {
    const inlineMatch = inline.find((item) => item.id === attachment.id);

    return inlineMatch
      ? enrichSmartReplyRecommendedAttachment(attachment, inlineMatch)
      : attachment;
  });
  const mergedIds = new Set(merged.map((attachment) => attachment.id));

  for (const attachment of inline) {
    if (!mergedIds.has(attachment.id)) {
      merged.push(attachment);
    }
  }

  return normalizeSmartReplyRecommendedAttachments(
    merged.map(({ defaultSelected: _defaultSelected, ...attachment }) => attachment),
  );
}

function normalizeSmartReplyRecommendedAttachments(
  attachments: SmartReplyRecommendedAttachment[],
): SmartReplyRecommendedAttachment[] {
  if (attachments.length === 0) {
    return [];
  }

  if (attachments.some((attachment) => attachment.defaultSelected)) {
    return attachments;
  }

  return attachments.map((attachment, index) => ({
    ...attachment,
    defaultSelected: index === 0,
  }));
}

export function resolveSmartReplyAttachmentIds(
  suggestion: Pick<SmartReplySuggestion, "genAnswer" | "refAttachIds">,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const id of suggestion.refAttachIds ?? []) {
    const normalized = normalizeSmartReplyAttachmentId(id);

    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      ids.push(normalized);
    }
  }

  for (const id of extractSmartReplyGenAnswerAttachmentIds(suggestion.genAnswer)) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

export function resolveSmartReplyRecommendedAttachmentsSource(
  suggestion: Pick<SmartReplySuggestion, "genAnswer" | "refAttachIds">,
) {
  const attachmentIds = resolveSmartReplyAttachmentIds(suggestion);
  const inlineAttachments = extractSmartReplyGenAnswerInlineAttachments(
    suggestion.genAnswer,
  );

  return {
    attachmentIds,
    inlineAttachments,
  };
}

export function resolveSmartReplyAttachmentCount(
  suggestion: Pick<SmartReplySuggestion, "genAnswer" | "refAttachIds">,
) {
  const { attachmentIds, inlineAttachments } =
    resolveSmartReplyRecommendedAttachmentsSource(suggestion);

  return Math.max(attachmentIds.length, inlineAttachments.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function resolveSmartReplyDisplayContent(
  suggestion: WorkbenchSmartReplySuggestionDto,
) {
  return (
    parseSmartReplyTextContent(suggestion.genAnswer) ||
    parseSmartReplyTextContent(suggestion.content)
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
        content: resolveSmartReplyDisplayContent(suggestion),
        failReason: suggestion.failReason,
        genAnswer: suggestion.genAnswer,
        generateStatus: suggestion.generateStatus,
        pollComplete: suggestion.pollComplete,
        ...((): { refAttachIds?: string[] } => {
          const refAttachIds = resolveSmartReplyAttachmentIds({
            genAnswer: suggestion.genAnswer,
            refAttachIds: suggestion.refAttachIds,
          });

          return refAttachIds.length > 0 ? { refAttachIds } : {};
        })(),
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
  messages: Array<{ seq?: number }>,
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

export function getSmartReplyLookupKey(message: { uiMessageKey?: string; seq?: number }) {
  return message.seq != null ? String(message.seq) : (message.uiMessageKey ?? "");
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

  if (fileType !== 5 && fileType !== 3) {
    return null;
  }

  const fileUrl = resolveSmartReplyAttachmentSendUrl(attachment);

  if (!fileUrl) {
    return null;
  }

  return {
    extension: getSmartReplyAttachmentExtension(attachment.fileName),
    fileName: attachment.fileName,
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
