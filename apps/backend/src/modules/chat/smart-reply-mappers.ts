import {
  SMART_REPLY_MSG_IDS_LIMIT,
  SMART_REPLY_TERMINAL_GENERATE_STATUSES,
} from "@chatai/contracts";
import type {
  WorkbenchSmartReplyPollResponse,
  WorkbenchSmartReplyStatus,
  WorkbenchSmartReplySuggestionDto,
} from "@chatai/contracts";

const SMART_REPLY_TERMINAL_GENERATE_STATUS_SET = new Set<number>(
  SMART_REPLY_TERMINAL_GENERATE_STATUSES,
);

export function isSmartReplyPollTerminalGenerateStatus(
  rawStatus: number | string | undefined,
) {
  const numericStatus = readNonNegativeInteger(rawStatus);

  return (
    numericStatus != null &&
    SMART_REPLY_TERMINAL_GENERATE_STATUS_SET.has(numericStatus)
  );
}

export function normalizeSmartReplyMsgIds(
  msgIds: number[],
  limit = SMART_REPLY_MSG_IDS_LIMIT,
) {
  const seen = new Set<number>();
  const normalized: number[] = [];

  for (const msgId of msgIds) {
    if (!Number.isSafeInteger(msgId) || msgId <= 0 || seen.has(msgId)) {
      continue;
    }

    seen.add(msgId);
    normalized.push(msgId);

    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}

/** 解析 Java genAnswer：可能是纯文本，也可能是消息段 JSON 数组 */
export function parseJavaGenAnswerContent(raw: unknown): string {
  if (raw == null) {
    return "";
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();

    if (!trimmed) {
      return "";
    }

    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return parseJavaGenAnswerPayload(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }

  return parseJavaGenAnswerPayload(raw);
}

function parseJavaGenAnswerPayload(payload: unknown): string {
  if (Array.isArray(payload)) {
    const parts: string[] = [];

    for (const segment of payload) {
      const part = parseJavaGenAnswerTextSegment(segment);

      if (part) {
        parts.push(part);
      }
    }

    return parts.join("\n");
  }

  return parseJavaGenAnswerTextSegment(payload) ?? "";
}

function parseJavaGenAnswerTextSegment(segment: unknown): string | undefined {
  if (!isRecord(segment)) {
    return undefined;
  }

  const msgtype = readString(segment.msgtype)?.toLowerCase();

  if (msgtype === "text") {
    return readString(segment.text);
  }

  if (msgtype === "image" || msgtype === "file" || msgtype === "video") {
    return undefined;
  }

  return readString(segment.text) ?? readString(segment.content);
}

type JavaSmartReplyAnswerItem = {
  analyseMsgId?: number | string;
  msgId?: number | string;
  questionMsgId?: number | string;
  answerType?: number | string;
  assistantId?: number | string;
  assistantName?: string;
  createTime?: string;
  failReason?: string;
  genAnswer?: unknown;
  genFailReason?: string;
  genStatus?: number | string;
  id?: number | string;
  questionIntent?: string;
  realAnswer?: string;
  recommendAnswer?: string;
  refAttachIds?: unknown;
  refAttachIdList?: unknown;
  attachIds?: unknown;
  status?: number | string;
  totalToken?: number | string;
};

export function mapJavaGeneralAnswer(
  data: unknown,
): WorkbenchSmartReplySuggestionDto | null {
  const mapped = mapJavaUserHistoryAnswerList(data);

  if (mapped.suggestions.length > 0) {
    return mapped.suggestions[0] ?? null;
  }

  if (isJavaAnswerItem(data)) {
    return mapJavaUserHistoryAnswerList([data]).suggestions[0] ?? null;
  }

  return null;
}

export function mapJavaUserHistoryAnswerList(
  data: unknown,
): WorkbenchSmartReplyPollResponse {
  const items = extractJavaAnswerItems(data);
  const suggestions: WorkbenchSmartReplySuggestionDto[] = [];

  for (const item of items) {
    const mapped = mapJavaAnswerItem(item);

    if (mapped) {
      suggestions.push(mapped);
    }
  }

  return { suggestions };
}

function extractJavaAnswerItems(data: unknown): JavaSmartReplyAnswerItem[] {
  if (Array.isArray(data)) {
    return data.filter(isJavaAnswerItem);
  }

  if (!isRecord(data)) {
    return [];
  }

  const listCandidates = [
    data.list,
    data.items,
    data.records,
    data.answerList,
    data.userHistoryAnswerList,
  ];

  for (const candidate of listCandidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isJavaAnswerItem);
    }
  }

  return [];
}

function mapJavaAnswerItem(
  item: JavaSmartReplyAnswerItem,
): WorkbenchSmartReplySuggestionDto | undefined {
  const msgId = readJavaAnswerMessageId(item);

  if (!msgId) {
    return undefined;
  }

  const generateStatus = readJavaGenerateStatus(item);
  const content = readJavaAnswerContent(item);
  const pollComplete = isSmartReplyPollTerminalGenerateStatus(generateStatus);

  if (!content.trim() && !pollComplete) {
    const status = mapSmartReplyStatus(generateStatus);

    if (status !== "thinking" && status !== "processing") {
      return undefined;
    }
  }

  const rawGenAnswer = readJavaRawGenAnswer(item);

  return {
    assistantName: readString(item.assistantName) ?? "智能助手",
    content: content.trim(),
    failReason: readJavaAnswerFailReason(item),
    ...(rawGenAnswer ? { genAnswer: rawGenAnswer } : {}),
    generateStatus,
    messageId: msgId,
    pollComplete: pollComplete ? true : undefined,
    refAttachIds: readJavaRefAttachIds(item),
    status: mapSmartReplyStatus(generateStatus),
    recordId: readMessageId(item.id),
  };
}

function readJavaGenerateStatus(item: JavaSmartReplyAnswerItem) {
  return item.genStatus ?? item.status;
}

function readJavaAnswerContent(item: JavaSmartReplyAnswerItem) {
  if (item.genAnswer != null && item.genAnswer !== "") {
    const parsed = parseJavaGenAnswerContent(item.genAnswer);

    if (parsed.trim()) {
      return parsed;
    }
  }

  return (
    parseJavaGenAnswerContent(item.recommendAnswer) ||
    parseJavaGenAnswerContent(item.realAnswer) ||
    ""
  );
}

function readJavaRawGenAnswer(item: JavaSmartReplyAnswerItem) {
  if (item.genAnswer != null && item.genAnswer !== "") {
    return normalizeJavaRawGenAnswer(item.genAnswer);
  }

  const legacy =
    readString(item.recommendAnswer) ?? readString(item.realAnswer) ?? undefined;

  if (!legacy) {
    return undefined;
  }

  if (legacy.startsWith("[") || legacy.startsWith("{")) {
    return legacy;
  }

  return buildJavaGenAnswerFromText(legacy);
}

function normalizeJavaRawGenAnswer(raw: unknown) {
  if (typeof raw === "string") {
    const trimmed = raw.trim();

    return trimmed || undefined;
  }

  try {
    return JSON.stringify(raw);
  } catch {
    return undefined;
  }
}

export function buildJavaGenAnswerFromText(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return "";
  }

  return JSON.stringify([{ msgtype: "text", text: trimmed }]);
}

function readJavaAnswerFailReason(item: JavaSmartReplyAnswerItem) {
  return readString(item.genFailReason) ?? readString(item.failReason);
}

function readJavaAnswerMessageId(item: JavaSmartReplyAnswerItem) {
  return (
    readMessageId(item.analyseMsgId) ??
    readMessageId(item.msgId) ??
    readMessageId(item.questionMsgId)
  );
}

function mapSmartReplyStatus(
  rawStatus: number | string | undefined,
): WorkbenchSmartReplyStatus | undefined {
  if (typeof rawStatus === "string") {
    const normalized = rawStatus.trim().toLowerCase();

    if (
      normalized.includes("think") ||
      normalized.includes("generat") ||
      normalized === "pending" ||
      normalized === "waiting"
    ) {
      return "thinking";
    }

    if (
      normalized.includes("process") ||
      normalized.includes("running") ||
      normalized === "doing"
    ) {
      return "processing";
    }

    if (
      normalized.includes("ready") ||
      normalized.includes("success") ||
      normalized.includes("finish") ||
      normalized === "done"
    ) {
      return "ready";
    }
  }

  const numericStatus = readNonNegativeInteger(rawStatus);

  if (numericStatus == null) {
    return undefined;
  }

  if (numericStatus <= 0) {
    return "thinking";
  }

  if (numericStatus === 1) {
    return "processing";
  }

  if (numericStatus === 3 || numericStatus === 4) {
    return undefined;
  }

  return "ready";
}

function readJavaRefAttachIds(item: JavaSmartReplyAnswerItem) {
  const merged = mergeRefAttachIds(
    parseJavaRefAttachIds(item.refAttachIds),
    parseJavaRefAttachIds(item.refAttachIdList),
    parseJavaRefAttachIds(item.attachIds),
    extractJavaGenAnswerAttachmentIds(item.genAnswer),
  );

  return merged.length > 0 ? merged : undefined;
}

// Keep Java genAnswer attachment field handling in sync with web smart-reply-adapter.ts.
function mergeRefAttachIds(...groups: Array<string[] | undefined>) {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    if (!group) {
      continue;
    }

    for (const id of group) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }

  return ids;
}

function extractJavaGenAnswerAttachmentIds(raw: unknown): string[] | undefined {
  const payload = parseJavaGenAnswerJsonPayload(raw);

  if (payload === undefined) {
    return undefined;
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

    const attachmentId = readJavaGenAnswerSegmentAttachmentId(segment);

    if (attachmentId && !seen.has(attachmentId)) {
      seen.add(attachmentId);
      ids.push(attachmentId);
    }
  }

  return ids.length > 0 ? ids : undefined;
}

function readJavaGenAnswerSegmentAttachmentId(segment: Record<string, unknown>) {
  for (const key of [
    "id",
    "attachId",
    "refAttachId",
    "transMsgInfoId",
    "msgInfoId",
  ]) {
    const normalized = normalizeJavaAttachmentId(segment[key]);

    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function parseJavaGenAnswerJsonPayload(raw: unknown): unknown | undefined {
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

function normalizeJavaAttachmentId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return /^\d+$/.test(trimmed) ? trimmed : undefined;
}

function parseJavaRefAttachIds(value: unknown): string[] | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return [String(value)];
  }

  if (typeof value === "string") {
    return parseRefAttachIds(value);
  }

  if (Array.isArray(value)) {
    const ids = mergeRefAttachIds(
      ...value.map((item) => parseJavaRefAttachIds(item)),
    );

    return ids.length > 0 ? ids : undefined;
  }

  return undefined;
}

function parseRefAttachIds(value: string | undefined) {
  const raw = readString(value);

  if (!raw) {
    return undefined;
  }

  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return ids.length > 0 ? ids : undefined;
}

function isJavaAnswerItem(value: unknown): value is JavaSmartReplyAnswerItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.analyseMsgId != null ||
    value.msgId != null ||
    value.questionMsgId != null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readMessageId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  return readString(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
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
