import { Buffer } from "node:buffer";
import type { UserMemoryInputMessage } from "./user-memory-provider.js";

export const USER_MEMORY_MESSAGE_LIMIT = 100;
export const USER_MEMORY_MESSAGE_TOKEN_BUDGET = 8_000;

type UserMemoryMessageOwnership = {
  sender_role: string;
  session_id: number;
  source_message_id: number;
  source_message_time: number;
};

type UserMemoryMessageDetail = {
  content: string | null;
  id: number;
  msgtype: string;
};

export function countSerializedUserMemoryMessageTokensConservatively(messages: UserMemoryInputMessage[]) {
  return Buffer.byteLength(JSON.stringify(messages), "utf8");
}

export function trimUserMemoryMessagesToTokenBudget(
  newestFirstMessages: UserMemoryInputMessage[],
  tokenBudget = USER_MEMORY_MESSAGE_TOKEN_BUDGET,
) {
  if (!Number.isSafeInteger(tokenBudget) || tokenBudget <= 0) return [];

  const selectedNewestFirst: UserMemoryInputMessage[] = [];
  for (const message of newestFirstMessages) {
    const candidate = [...selectedNewestFirst, message].reverse();
    if (countSerializedUserMemoryMessageTokensConservatively(candidate) <= tokenBudget) {
      selectedNewestFirst.push(message);
      continue;
    }

    if (selectedNewestFirst.length === 0) {
      const truncated = truncateMessageTextToTokenBudget(message, tokenBudget);
      if (truncated) selectedNewestFirst.push(truncated);
    }
    break;
  }

  return selectedNewestFirst.reverse();
}

export function resolveUserMemoryEvidenceSessionIds(messages: UserMemoryInputMessage[]) {
  return [...new Set(messages.map((message) => message.sessionId))];
}

export function buildUserMemoryMessageWindow(
  ownershipRows: UserMemoryMessageOwnership[],
  detailRows: UserMemoryMessageDetail[],
) {
  const detailsById = new Map(detailRows.map((row) => [row.id, row]));
  const newestFirstMessages = ownershipRows.flatMap((row) => {
    const detail = detailsById.get(row.source_message_id);
    const text = detail ? readableUserMemoryMessageText(detail.msgtype, detail.content) : "";
    return text ? [{
      sourceMessageId: row.source_message_id,
      sessionId: row.session_id,
      senderRole: row.sender_role,
      occurredAt: row.source_message_time,
      text,
    }] : [];
  });
  return trimUserMemoryMessagesToTokenBudget(newestFirstMessages);
}

function truncateMessageTextToTokenBudget(message: UserMemoryInputMessage, tokenBudget: number) {
  const characters = Array.from(message.text);
  let low = 0;
  let high = characters.length;
  let best: UserMemoryInputMessage | undefined;

  while (low <= high) {
    const length = Math.floor((low + high) / 2);
    const candidate = { ...message, text: characters.slice(0, length).join("") };
    if (countSerializedUserMemoryMessageTokensConservatively([candidate]) <= tokenBudget) {
      if (candidate.text) best = candidate;
      low = length + 1;
    } else {
      high = length - 1;
    }
  }

  return best;
}

function readableUserMemoryMessageText(type: string, content: string | null) {
  if (!content || !["text", "markdown", "mixed", "voice", "file", "link", "weapp"].includes(type)) return "";
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "string") return parsed.trim();
    if (parsed && typeof parsed === "object") {
      for (const key of ["content", "text", "title", "transVoiceText", "description", "fileName"]) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    }
  } catch {
    return content.trim();
  }
  return "";
}
