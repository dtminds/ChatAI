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
  messageIds: number[],
  limit = SMART_REPLY_MSG_IDS_LIMIT,
) {
  const seen = new Set<number>();
  const normalized: number[] = [];

  for (const messageId of messageIds) {
    if (!Number.isSafeInteger(messageId) || messageId <= 0 || seen.has(messageId)) {
      continue;
    }

    seen.add(messageId);
    normalized.push(messageId);

    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}

type JavaSmartReplyAnswerItem = {
  analyseMsgId?: number | string;
  answerType?: number | string;
  assistantId?: number | string;
  assistantName?: string;
  createTime?: string;
  failReason?: string;
  id?: number | string;
  questionIntent?: string;
  realAnswer?: string;
  recommendAnswer?: string;
  refAttachIds?: string;
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
  const messageId = readMessageId(item.analyseMsgId);

  if (!messageId) {
    return undefined;
  }

  const content = readString(item.recommendAnswer) ?? readString(item.realAnswer) ?? "";
  const pollComplete = isSmartReplyPollTerminalGenerateStatus(item.status);

  if (!content.trim() && !pollComplete) {
    const status = mapSmartReplyStatus(item.status);

    if (status !== "thinking" && status !== "processing") {
      return undefined;
    }
  }

  return {
    assistantName: readString(item.assistantName) ?? "智能助手",
    content: content.trim(),
    failReason: readString(item.failReason),
    generateStatus: item.status,
    messageId,
    pollComplete: pollComplete ? true : undefined,
    refAttachIds: parseRefAttachIds(item.refAttachIds),
    status: mapSmartReplyStatus(item.status),
    recordId: readMessageId(item.id),
  };
}

function mapSmartReplyStatus(
  rawStatus: JavaSmartReplyAnswerItem["status"],
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

  if (numericStatus === 3) {
    return undefined;
  }

  return "ready";
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
  return isRecord(value) && value.analyseMsgId != null;
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
