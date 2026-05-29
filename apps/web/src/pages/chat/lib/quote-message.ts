import type {
  ChatMessage,
  Message,
  QuoteMessageContent,
  QuotedMessagePreviewContent,
} from "@/pages/chat/chat-types";

const UNAVAILABLE_QUOTE_PREVIEW_TEXT = "引用消息不可用";

export function isUnavailableQuotedMessagePreview(
  preview?: QuotedMessagePreviewContent,
) {
  if (!preview) {
    return true;
  }

  const text = preview.text?.trim() ?? "";
  const fallback = preview.fallbackText?.trim() ?? "";

  return (
    text === UNAVAILABLE_QUOTE_PREVIEW_TEXT
    || fallback === UNAVAILABLE_QUOTE_PREVIEW_TEXT
    || (preview.contentType === "text" && text === "" && fallback === "")
  );
}

export function buildQuotedMessagePreview(
  message: ChatMessage,
): QuotedMessagePreviewContent {
  const senderName =
    message.senderDisplayName || message.sender.name || message.author;
  const quoteMsgId = getQuoteReferenceId(message);
  const basePreview = {
    contentType: message.content.type,
    ...(quoteMsgId ? { quoteMsgId } : {}),
    quotedMessageId: message.remoteMessageId ?? message.id,
    senderName,
  } satisfies Pick<
    QuotedMessagePreviewContent,
    "contentType" | "quoteMsgId" | "quotedMessageId" | "senderName"
  >;

  switch (message.content.type) {
    case "text":
      return {
        ...basePreview,
        text: message.content.text,
      };
    case "image":
      return {
        ...basePreview,
        fallbackText: "[图片]",
        imageUrl: message.content.imageUrl,
      };
    case "video":
      return {
        ...basePreview,
        fallbackText: "[视频]",
        imageUrl: message.content.coverImageUrl,
        title: message.content.alt || message.content.durationLabel,
      };
    case "voice":
      return {
        ...basePreview,
        fallbackText: "[语音]",
        title: message.content.durationLabel,
      };
    case "file":
      return {
        ...basePreview,
        fallbackText: "[文件]",
        title: message.content.fileName,
      };
    case "h5":
      return {
        ...basePreview,
        fallbackText: "[链接]",
        imageUrl: message.content.previewImageUrl,
        title: message.content.title,
      };
    case "mini-program":
      return {
        ...basePreview,
        fallbackText: "[小程序]",
        imageUrl: message.content.coverImageUrl,
        title: message.content.title,
      };
    case "contact-card":
      return {
        ...basePreview,
        fallbackText: "[名片]",
        imageUrl: message.content.avatarUrl,
        title: message.content.name,
      };
    case "location":
      return {
        ...basePreview,
        fallbackText: "[位置]",
        title: message.content.title || message.content.address,
      };
    case "sphfeed":
      return {
        ...basePreview,
        fallbackText: "[视频号]",
        imageUrl: message.content.imageUrl,
        title: message.content.title,
      };
    case "solitaire":
      return {
        ...basePreview,
        fallbackText: "[接龙]",
        title: message.content.title,
      };
    case "redpacket":
      return {
        ...basePreview,
        fallbackText: "[红包]",
        title: message.content.title,
      };
    case "quote":
      return {
        ...basePreview,
        fallbackText: "[引用消息]",
        title: message.content.text,
      };
  }
}

function matchesQuoteMessageId(message: ChatMessage, quoteMsgId: string) {
  const normalizedQuoteMsgId = quoteMsgId.trim();

  if (!normalizedQuoteMsgId) {
    return false;
  }

  return (
    message.remoteMessageId === normalizedQuoteMsgId
    || message.id === normalizedQuoteMsgId
    || message.clientMessageId === normalizedQuoteMsgId
    || (message.seq != null && String(message.seq) === normalizedQuoteMsgId)
  );
}

function matchesQuoteSeq(message: ChatMessage, quoteMsgId: string) {
  const quoteSeq = Number(quoteMsgId);

  if (!Number.isSafeInteger(quoteSeq) || quoteSeq <= 0) {
    return false;
  }

  const messageSeq = Number(message.seq);

  return Number.isSafeInteger(messageSeq) && messageSeq === quoteSeq;
}

export function findQuotedSourceMessage(
  quoteMsgId: string,
  quotedMessageId: string | undefined,
  messages: readonly Message[],
) {
  const normalizedQuoteMsgId = quoteMsgId.trim();

  if (normalizedQuoteMsgId) {
    const matchedBySeq = messages.find(
      (message): message is ChatMessage =>
        message.role !== "system" && matchesQuoteSeq(message, normalizedQuoteMsgId),
    );

    if (matchedBySeq) {
      return matchedBySeq;
    }

    const matchedByMessageId = messages.find(
      (message): message is ChatMessage =>
        message.role !== "system" && matchesQuoteMessageId(message, normalizedQuoteMsgId),
    );

    if (matchedByMessageId) {
      return matchedByMessageId;
    }
  }

  if (!quotedMessageId) {
    return undefined;
  }

  return messages.find(
    (message): message is ChatMessage =>
      message.role !== "system"
      && (message.remoteMessageId === quotedMessageId || message.id === quotedMessageId),
  );
}

export function mergeQuoteMessageContent(
  current: QuoteMessageContent,
  next: QuoteMessageContent,
) {
  if (!isUnavailableQuotedMessagePreview(next.quotedMessage)) {
    return next;
  }

  if (!isUnavailableQuotedMessagePreview(current.quotedMessage)) {
    return {
      ...next,
      quoteMsgId: current.quoteMsgId || next.quoteMsgId,
      quotedMessage: current.quotedMessage,
      quotedMessageId: next.quotedMessageId ?? current.quotedMessageId,
    };
  }

  return next;
}

export function resolveQuoteMessageContent(
  content: QuoteMessageContent,
  messages: readonly Message[],
) {
  if (!isUnavailableQuotedMessagePreview(content.quotedMessage)) {
    return content;
  }

  const source = findQuotedSourceMessage(
    content.quoteMsgId,
    content.quotedMessageId,
    messages,
  );

  if (!source || source.isRevoked) {
    return content;
  }

  return {
    ...content,
    quotedMessage: toNestedQuotedMessagePreview(buildQuotedMessagePreview(source)),
    quotedMessageId: content.quotedMessageId ?? source.remoteMessageId ?? source.id,
  };
}

export function mergeMessageContent(
  current: ChatMessage["content"],
  next: ChatMessage["content"],
): ChatMessage["content"] {
  if (next.type !== "quote") {
    return next;
  }

  if (current.type !== "quote") {
    return next;
  }

  return mergeQuoteMessageContent(current, next);
}

export function resolveQuoteMessagesInList(messages: Message[]) {
  return messages.map((message) => {
    if (message.role === "system" || message.content.type !== "quote") {
      return message;
    }

    const resolvedContent = resolveQuoteMessageContent(message.content, messages);

    if (resolvedContent === message.content) {
      return message;
    }

    return {
      ...message,
      content: resolvedContent,
    };
  });
}

function getQuoteReferenceId(message: ChatMessage) {
  if (message.seq != null && message.seq > 0) {
    return String(message.seq);
  }

  return undefined;
}

function toNestedQuotedMessagePreview(
  preview: QuotedMessagePreviewContent,
): QuotedMessagePreviewContent {
  const {
    quoteMsgId: _quoteMsgId,
    quotedMessageId: _quotedMessageId,
    ...nestedPreview
  } = preview;

  return nestedPreview;
}
