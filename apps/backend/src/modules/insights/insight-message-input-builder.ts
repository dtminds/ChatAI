import {
  isRecord,
  readRecordNumber,
  readRecordString,
} from "../chat/workbench-content-utils.js";
import type {
  AiMessageInput,
  InsightMessageSenderRole,
  InsightMessageSourceRow,
  InsightMessageType,
} from "./insights.types.js";

export function buildInsightMessageInput(row: InsightMessageSourceRow): AiMessageInput {
  const parsed = parseInsightMessageContent(row.content);
  const messageType = mapInsightMessageType(row.msgtype);
  const senderRole = mapInsightSenderRole(row.from_type, messageType);
  const content = buildAiText(messageType, parsed);
  const includedForAi = messageType !== "system"
    && (content.contentStatus === "ready" || content.contentStatus === "pending_transcription");
  const meaningfulForBoundary = includedForAi && content.contentStatus === "ready";

  return {
    aiText: content.aiText,
    contentStatus: content.contentStatus,
    conversationId: String(row.conversation_id),
    evidenceLabel: `[${row.id}]`,
    includedForAi,
    meaningfulForBoundary,
    messageType,
    occurredAt: toTimestamp(row.msgtime),
    senderRole,
    sourceMessageId: String(row.id),
  };
}

function buildAiText(
  messageType: InsightMessageType,
  parsed: InsightParsedMessageContent,
) {
  switch (messageType) {
    case "text": {
      const text =
        readPlainContent(parsed) ||
        readString(parsed, "content") ||
        readString(parsed, "text") ||
        readString(parsed, "title");

      return {
        aiText: text || "[文本消息]",
        contentStatus: "ready" as const,
      };
    }
    case "voice": {
      const transVoiceText = readString(parsed, "transVoiceText");

      if (transVoiceText) {
        return {
          aiText: transVoiceText,
          contentStatus: "ready" as const,
        };
      }

      return {
        aiText: "[语音消息，转写中]",
        contentStatus: "pending_transcription" as const,
      };
    }
    case "file": {
      const fileName = readString(parsed, "fileName") || "未知文件";

      return {
        aiText: `[文件] ${fileName}`,
        contentStatus: "ready" as const,
      };
    }
    case "link": {
      return {
        aiText: compactText([
          "[链接]",
          readString(parsed, "title"),
          readString(parsed, "description"),
          readString(parsed, "url") || readString(parsed, "href") || readString(parsed, "linkUrl"),
        ]),
        contentStatus: "ready" as const,
      };
    }
    case "miniapp": {
      return {
        aiText: compactText([
          "[小程序]",
          readString(parsed, "appName"),
          readString(parsed, "title"),
          readString(parsed, "description"),
        ]),
        contentStatus: "ready" as const,
      };
    }
    case "image":
      return {
        aiText: readString(parsed, "alt") || "[图片]",
        contentStatus: "unsupported" as const,
      };
    case "system":
      return {
        aiText: readString(parsed, "text") || readString(parsed, "content") || "[系统消息]",
        contentStatus: "unsupported" as const,
      };
    case "unsupported":
      return {
        aiText: "[暂不支持的消息]",
        contentStatus: "unsupported" as const,
      };
  }
}

function mapInsightMessageType(msgtype: string): InsightMessageType {
  switch (msgtype) {
    case "text":
    case "markdown":
    case "mixed":
      return "text";
    case "voice":
      return "voice";
    case "file":
      return "file";
    case "link":
    case "news":
      return "link";
    case "weapp":
      return "miniapp";
    case "image":
      return "image";
    case "revoke":
    case "agree":
    case "disagree":
      return "system";
    default:
      return "unsupported";
  }
}

function mapInsightSenderRole(
  fromType: number | null,
  messageType: InsightMessageType,
): InsightMessageSenderRole {
  if (messageType === "system") {
    return "system";
  }

  if (fromType === 1) {
    return "agent";
  }

  if (fromType === 2) {
    return "customer";
  }

  if (fromType === 3) {
    return "bot";
  }

  return "unknown";
}

export function readInsightContentString(value: InsightParsedMessageContent, key: string) {
  if (!value || !isRecord(value)) {
    return "";
  }

  return readRecordString(value, key).trim();
}

export type InsightParsedMessageContent = Record<string, unknown> | string | undefined;

export function parseInsightMessageContent(value: string | null): InsightParsedMessageContent {
  if (!value) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (typeof parsed === "string") {
      return parsed;
    }

    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return value;
  }
}

const readString = readInsightContentString;

function readPlainContent(value: InsightParsedMessageContent) {
  return typeof value === "string" ? value.trim() : "";
}

function compactText(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function toTimestamp(value: Date | number | string) {
  if (value instanceof Date) {
    return value.getTime();
  }

  const numeric = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numeric) ? numeric : 0;
}

export function readVoiceDurationSeconds(content: string | null) {
  const parsed = parseInsightMessageContent(content);

  return isRecord(parsed) ? readRecordNumber(parsed, "duration") : undefined;
}
