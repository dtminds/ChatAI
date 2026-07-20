import type { AiHostingAgentTestReplyItem, AiHostingAgentTestResponse } from "@chatai/contracts";

export function mapJavaAgentTestResponse(data: unknown): AiHostingAgentTestResponse {
  return extractAgentTestResponse(unwrapAgentTestPayload(data)) ?? {
    action: "reply",
    reply: [],
  };
}

function unwrapAgentTestPayload(data: unknown): unknown {
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) {
      return data;
    }

    const parsed = tryParseJson(trimmed);
    return parsed === undefined ? data : unwrapAgentTestPayload(parsed);
  }

  if (!isRecord(data)) {
    return data;
  }

  if (typeof data.data === "string") {
    const parsed = tryParseJson(data.data.trim());
    if (parsed !== undefined) {
      return unwrapAgentTestPayload(parsed);
    }
  }

  return data;
}

function extractAgentTestResponse(data: unknown): AiHostingAgentTestResponse | null {
  if (typeof data === "string" && data.trim()) {
    return {
      action: "reply",
      reply: [{ type: "text", content: data.trim() }],
    };
  }

  if (!isRecord(data)) {
    return null;
  }

  const action = readString(data.action);
  const directReply = readReplyItems(data.reply);
  if (directReply.length > 0) {
    return {
      action: action || "reply",
      reply: directReply,
    };
  }

  if (action === "handoff") {
    return {
      action,
      reply: [{ type: "text", content: "已触发转人工" }],
    };
  }

  const nestedData = isRecord(data.data) ? data.data : null;
  const nestedReply = nestedData ? readReplyItems(nestedData.reply) : [];
  if (nestedReply.length > 0) {
    return {
      action: readString(nestedData?.action) || "reply",
      reply: nestedReply,
    };
  }

  const legacyContents = readLegacyContents(data.contents);
  if (legacyContents.length > 0) {
    return {
      action: "reply",
      reply: legacyContents,
    };
  }

  const nestedMessage = isRecord(data.message) ? data.message : null;
  const nestedMessageReply = nestedMessage ? readReplyItems(nestedMessage.reply) : [];
  if (nestedMessageReply.length > 0) {
    return {
      action: readString(nestedMessage?.action) || "reply",
      reply: nestedMessageReply,
    };
  }

  const nestedMessageContents = nestedMessage ? readLegacyContents(nestedMessage.contents) : [];
  if (nestedMessageContents.length > 0) {
    return {
      action: "reply",
      reply: nestedMessageContents,
    };
  }

  const replyText = readString(data.text) || readString(data.content);
  if (replyText) {
    const embeddedResponse = extractAgentTestResponse(unwrapAgentTestPayload(replyText));
    if (embeddedResponse) {
      return embeddedResponse;
    }

    return {
      action: "reply",
      reply: [{ type: "text", content: replyText }],
    };
  }

  const messages = Array.isArray(data.messages) ? data.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isRecord(message) || readString(message.role) !== "assistant") {
      continue;
    }

    const messageReply = readReplyItems(message.reply);
    if (messageReply.length > 0) {
      return {
        action: readString(message.action) || "reply",
        reply: messageReply,
      };
    }

    const messageContents = readLegacyContents(message.contents);
    if (messageContents.length > 0) {
      return {
        action: "reply",
        reply: messageContents,
      };
    }
  }

  return null;
}

function readReplyItems(value: unknown): AiHostingAgentTestReplyItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const reply: AiHostingAgentTestReplyItem[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const type = readString(item.type);

    if (type === "attachment") {
      const chunkId = readChunkId(item.chunkId ?? item.chunk_id);
      if (!chunkId) {
        continue;
      }

      reply.push({
        type: "attachment",
        chunkId,
        attachments: [],
      });
      continue;
    }

    const content = readString(item.content) || readString(item.text) || readString(item.url);

    if (!content) {
      continue;
    }

    if (type === "text") {
      reply.push(...expandTextReplyContent(content));
      continue;
    }

    if (type === "image") {
      reply.push({ type: "image", content });
      continue;
    }

    if (type === "audio") {
      reply.push({ type: "audio", content });
    }
  }

  return reply;
}

function expandTextReplyContent(content: string): AiHostingAgentTestReplyItem[] {
  const embedded = extractAgentTestResponse(unwrapAgentTestPayload(content));
  if (embedded?.reply.length) {
    return embedded.reply;
  }

  return [{ type: "text", content }];
}

function readLegacyContents(value: unknown): AiHostingAgentTestReplyItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const reply: AiHostingAgentTestReplyItem[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const type = readString(item.type);
    if (type === "text") {
      const content = readString(item.text) || readString(item.content);
      if (content) {
        reply.push(...expandTextReplyContent(content));
      }
      continue;
    }

    if (type === "image") {
      const content = readString(item.url) || readString(item.content);
      if (content) {
        reply.push({ type: "image", content });
      }
      continue;
    }

    if (type === "audio") {
      const content = readString(item.url) || readString(item.content);
      if (content) {
        reply.push({ type: "audio", content });
      }
    }
  }

  return reply;
}

function tryParseJson(value: string) {
  if (!value.startsWith("{") && !value.startsWith("[")) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readChunkId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed) && Number(trimmed) > 0) {
      return trimmed;
    }
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
