import { SMART_REPLY_MSG_IDS_LIMIT } from "@chatai/contracts";
import type {
  WorkbenchSmartReplyPollResponse,
  WorkbenchSmartReplyStatus,
  WorkbenchSmartReplySuggestionDto,
} from "@chatai/contracts";
import { parseMySqlId } from "./workbench-repository.js";

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

/** @deprecated 仅兼容旧调用；BFF 请求体应直接传 number[] */
export function parseSmartReplyJavaMsgIds(
  messageIds: string[],
  limit = SMART_REPLY_MSG_IDS_LIMIT,
) {
  const seen = new Set<number>();
  const parsed: number[] = [];

  for (const rawMessageId of messageIds) {
    const numericMessageId = parseMySqlId(rawMessageId.trim());

    if (numericMessageId == null || seen.has(numericMessageId)) {
      continue;
    }

    seen.add(numericMessageId);
    parsed.push(numericMessageId);

    if (parsed.length >= limit) {
      break;
    }
  }

  return parsed;
}

type JavaSmartReplyAnswerVersion = {
  answerContent?: string;
  answer?: string;
  content?: string;
  recommendAnswer?: string;
  versionIndex?: number;
  versionNo?: number;
};

type JavaSmartReplyAnswerItem = {
  analyseMsgId?: number | string;
  answerContent?: string;
  answer?: string;
  answerList?: JavaSmartReplyAnswerVersion[];
  answerStatus?: number | string;
  assistantAvatar?: string;
  assistantAvatarUrl?: string;
  assistantName?: string;
  botAvatar?: string;
  botAvatarUrl?: string;
  botName?: string;
  content?: string;
  currentVersion?: number;
  generateStatus?: number | string;
  msgId?: number | string;
  msgid?: number | string;
  recommendAnswer?: string;
  status?: number | string;
  totalVersion?: number;
  versionCount?: number;
  versionIndex?: number;
  versionNum?: number;
};

export function summarizeJavaUserHistoryAnswerRawData(data: unknown) {
  const items = extractJavaAnswerItems(data);

  return {
    dataType: Array.isArray(data) ? "array" : data == null ? "null" : typeof data,
    itemCount: items.length,
    objectKeys: isRecord(data) ? Object.keys(data) : undefined,
    preview: items.length > 0 ? items.slice(0, 3) : data,
  };
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

  return Object.values(data).filter(isJavaAnswerItem);
}

function mapJavaAnswerItem(
  item: JavaSmartReplyAnswerItem,
): WorkbenchSmartReplySuggestionDto | undefined {
  const messageId =
    readMessageId(item.msgId) ??
    readMessageId(item.msgid) ??
    readMessageId(item.analyseMsgId);

  if (!messageId) {
    return undefined;
  }

  const versions = Array.isArray(item.answerList) ? item.answerList : [];
  const latestVersion =
    versions.length > 0 ? versions[versions.length - 1] : undefined;
  const content =
    readAnswerContent(latestVersion) ??
    readAnswerContent(item) ??
    "";

  if (!content.trim()) {
    const status = mapSmartReplyStatus(item);

    if (status !== "thinking" && status !== "processing") {
      return undefined;
    }
  }

  const versionCount = Math.max(
    1,
    readPositiveInteger(item.versionCount) ??
      readPositiveInteger(item.versionNum) ??
      readPositiveInteger(item.totalVersion) ??
      (versions.length > 0 ? versions.length : 1),
  );
  const versionIndex = Math.min(
    Math.max(versionCount - 1, 0),
    readNonNegativeInteger(item.versionIndex) ??
      readNonNegativeInteger(item.currentVersion) ??
      readNonNegativeInteger(latestVersion?.versionIndex) ??
      readNonNegativeInteger(latestVersion?.versionNo) ??
      0,
  );

  return {
    assistantAvatarUrl:
      readString(item.assistantAvatarUrl) ??
      readString(item.assistantAvatar) ??
      readString(item.botAvatarUrl) ??
      readString(item.botAvatar),
    assistantName:
      readString(item.assistantName) ??
      readString(item.botName) ??
      "智能助手",
    content: content.trim(),
    // Java msgId 与请求体 msgIds 一致，均为消息 seq
    messageId,
    status: mapSmartReplyStatus(item),
    versionCount,
    versionIndex,
  };
}

function readAnswerContent(
  value: JavaSmartReplyAnswerItem | JavaSmartReplyAnswerVersion | undefined,
) {
  if (!value) {
    return undefined;
  }

  return (
    readString(value.answerContent) ??
    readString(value.recommendAnswer) ??
    readString(value.answer) ??
    readString(value.content)
  );
}

function mapSmartReplyStatus(
  item: JavaSmartReplyAnswerItem,
): WorkbenchSmartReplyStatus | undefined {
  const rawStatus = item.answerStatus ?? item.generateStatus ?? item.status;

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

  return "ready";
}

function isJavaAnswerItem(value: unknown): value is JavaSmartReplyAnswerItem {
  return (
    isRecord(value) &&
    (value.msgId != null ||
      value.msgid != null ||
      value.analyseMsgId != null)
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

function readPositiveInteger(value: unknown) {
  const parsed = readNonNegativeInteger(value);

  return parsed != null && parsed > 0 ? parsed : undefined;
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
