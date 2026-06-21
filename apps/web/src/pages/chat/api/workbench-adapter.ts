import type {
  WorkbenchConversationSummaryDto,
  WorkbenchGroupMemberDto,
  WorkbenchMessageDto,
  WorkbenchSeatDto,
  WorkbenchSubUserDto,
} from "@chatai/contracts";
import type {
  Account,
  ChatMessage,
  Conversation,
  CustomerProfile,
  EmployeeProfile,
  Message,
  MessageStatus,
  QuotedMessagePreviewContent,
} from "@/pages/chat/chat-types";

type ChatMessageContent = ChatMessage["content"];

export const INVALID_MESSAGE_UI_KEY_PREFIX = "invalid-message:";

let invalidMessageUiKeyCounter = 0;

export function isInvalidMessageUiKey(key: string | undefined) {
  return Boolean(key?.startsWith(INVALID_MESSAGE_UI_KEY_PREFIX));
}

export function adaptEmployee(dto: WorkbenchSubUserDto): EmployeeProfile {
  return {
    displayName: dto.displayName,
    id: dto.subUserId,
  };
}

export function adaptAccount(dto: WorkbenchSeatDto, unreadCount = dto.unreadCount): Account {
  return {
    avatarUrl: dto.avatar,
    description: dto.description,
    id: dto.seatId,
    lastMessageTime: dto.lastMessageTime,
    loginStatus: dto.loginStatus,
    metrics: {
      activeCustomers: 0,
      agents: 0,
      stores: 0,
      totalCustomers: 0,
    },
    name: dto.name,
    operator: dto.operatorName,
    phone: dto.phone,
    takenOverEmployeeId: dto.hostSubUserId,
    tone: buildAccountTone(dto.seatId),
    unreadCount,
  };
}

export function adaptConversation(dto: WorkbenchConversationSummaryDto): Conversation {
  const lastMessageTime = normalizeOptionalTimestamp(dto.lastMessageTime);
  const createdAt = normalizeOptionalTimestamp(dto.createdAt);

  return {
    accountId: dto.seatId,
    bizStatus: dto.bizStatus ?? 0,
    custodyMode: dto.custodyMode,
    createdAtMs: createdAt,
    customerAvatarUrl: dto.customerAvatar,
    customerId: dto.customerId,
    customerName: dto.customerName,
    contactOriginalName: dto.contactOriginalName,
    groupOriginalName: dto.groupOriginalName,
    id: dto.conversationId,
    isPinned: dto.isPinned,
    isVerified: dto.verified,
    mode: dto.mode,
    preview: dto.lastMessage,
    priority: dto.priority,
    quietFor: formatQuietFor(lastMessageTime),
    thirdExternalUserId: dto.thirdExternalUserId,
    thirdGroupId: dto.thirdGroupId,
    thirdUserId: dto.thirdUserId,
    unread: dto.unreadCount,
    updatedAt: formatWorkbenchTimestamp(lastMessageTime),
    updatedAtMs: lastMessageTime,
  };
}

export function adaptGroupMember(dto: WorkbenchGroupMemberDto) {
  return {
    avatarUrl: dto.avatarUrl,
    displayName: dto.displayName,
    id: dto.thirdUserId,
    type: dto.type,
  };
}

export function adaptMessage(
  dto: WorkbenchMessageDto,
  customerProfilesById: Record<string, CustomerProfile>,
  accountsById: Record<string, Account>,
  me?: EmployeeProfile,
): Message {
  const sentAt = formatWorkbenchTimestamp(dto.createdAt);
  const status = adaptMessageStatus(dto.status);
  const isGroupConversation = Boolean(dto.thirdGroupId);
  const uiMessageKey = getMessageUiKey(dto);

  if (dto.contentType === "revoke") {
    return {
      content: {
        revokeMsgId: asOptionalString(dto.content.revokeMsgId),
        revokeOriginMsgId: asOptionalString(dto.content.revokeOriginMsgId),
        text: readSystemMessageText(dto.content),
        type: "revoke",
      },
      conversationId: dto.conversationId,
      failReason: dto.failReason,
      isRevoked: dto.isRevoked,
      msgid: dto.msgid,
      optNo: dto.optNo,
      rawMsgtype: dto.rawMsgtype,
      role: "system",
      sentAt,
      seq: dto.seq,
      status,
      author: "系统",
      uiMessageKey,
    };
  }

  if (dto.contentType === "system" || dto.senderType === "system") {
    return {
      content: {
        text: readSystemMessageText(dto.content),
        type: "system",
      },
      conversationId: dto.conversationId,
      failReason: dto.failReason,
      isRevoked: dto.isRevoked,
      msgid: dto.msgid,
      optNo: dto.optNo,
      rawMsgtype: dto.rawMsgtype,
      role: "system",
      sentAt,
      seq: dto.seq,
      status,
      author: "系统",
      uiMessageKey,
    };
  }

  const isAgent = dto.senderType === "agent";
  const customer = customerProfilesById[dto.customerId];
  const account = accountsById[dto.seatId];
  const content = adaptChatMessageContent(
    dto.contentType,
    mergeTopLevelDownloadMetadata(dto),
  );
  const isOwnMessage = isGroupConversation
    ? dto.thirdFromId === dto.thirdUserId
    : isAgent;
  const senderName = isAgent
    ? dto.senderName ||
      (me && account
        ? `${account.name}-${account.operator}`
        : account?.name ?? "当前客服")
    : isGroupConversation
      ? dto.senderName || dto.thirdFromId || "群成员"
      : dto.senderName || customer?.name || "微信客户";
  const senderAvatar = dto.senderAvatar
    || (isAgent
      ? account?.avatarUrl
      : isGroupConversation
        ? ""
        : customer?.avatarUrl);
  const senderUserId = isOwnMessage
    ? dto.thirdUserId
    : isGroupConversation
      ? dto.thirdFromId
      : dto.thirdExternalUserId ?? dto.customerId;

  return {
    author: senderName,
    content,
    conversationId: dto.conversationId,
    isGroupConversation,
    isOwnMessage,
    failReason: dto.failReason,
    isRevoked: dto.isRevoked,
    msgid: dto.msgid,
    optNo: dto.optNo,
    rawMsgtype: dto.rawMsgtype,
    role: isAgent ? "agent" : "customer",
    senderDisplayName: isGroupConversation && !isOwnMessage ? senderName : undefined,
    sender: {
      avatarUrl: senderAvatar,
      groupMemberId: isGroupConversation && !isOwnMessage
        ? dto.thirdFromId
        : undefined,
      id: isOwnMessage
        ? `sender-agent-${dto.seatId}`
        : `sender-customer-${dto.thirdFromId ?? dto.customerId}`,
      name: senderName,
      userId: senderUserId,
    },
    sentAt,
    seq: dto.seq,
    status,
    uiMessageKey,
  };
}

function getMessageUiKey(dto: WorkbenchMessageDto) {
  if (Number.isSafeInteger(dto.seq) && dto.seq > 0) {
    return String(dto.seq);
  }

  if (dto.optNo) {
    return dto.optNo;
  }

  return createInvalidMessageUiKey();
}

function createInvalidMessageUiKey() {
  const randomPart = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${invalidMessageUiKeyCounter++}`;

  return `${INVALID_MESSAGE_UI_KEY_PREFIX}${randomPart}`;
}

function readSystemMessageText(content: Record<string, unknown>) {
  const text = content.text ?? content.content;

  return typeof text === "string" ? text : "";
}

export function formatWorkbenchTimestamp(value: number | Date | undefined) {
  if (value == null) {
    return "";
  }

  const timestamp = value instanceof Date ? value.getTime() : value;

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }

  const date = new Date(timestamp);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
    .concat(" ")
    .concat(
      [
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0"),
      ].join(":"),
    );
}

function normalizeOptionalTimestamp(value: number | undefined) {
  return value && value > 0 ? value : undefined;
}

export function formatConversationPreview(text: string) {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (normalizedText.length <= 28) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, 28)}…`;
}

function adaptChatMessageContent(
  contentType: WorkbenchMessageDto["contentType"],
  content: Record<string, unknown>,
): ChatMessageContent {
  switch (contentType) {
    case "voice":
      return {
        audioUrl: asOptionalString(content.audioUrl),
        durationLabel: String(content.durationLabel ?? ""),
        playbackUrl: asOptionalString(content.playbackUrl),
        transFileUrl: asOptionalString(content.transFileUrl),
        transFileUrlPersisted: Boolean(content.transFileUrlPersisted),
        transVoiceText: asOptionalString(content.transVoiceText),
        type: "voice",
      };
    case "image":
    case "emotion":
      return {
        alt: String(content.alt ?? ""),
        downloadStatus: asDownloadStatus(content.downloadStatus),
        fileSerialNo: asOptionalString(content.fileSerialNo),
        height: asOptionalNumber(content.height),
        imageUrl:
          contentType === "emotion"
            ? String(content.fileUrl ?? "")
            : String(content.imageUrl ?? ""),
        type: "image",
        variant: contentType,
        width: asOptionalNumber(content.width),
      };
    case "video":
      return {
        alt: String(content.alt ?? ""),
        coverImageUrl: String(content.coverImageUrl ?? ""),
        downloadStatus: asDownloadStatus(content.downloadStatus),
        durationLabel: String(content.durationLabel ?? ""),
        fileSerialNo: asOptionalString(content.fileSerialNo),
        fileUrlExpireTime: asOptionalNumber(content.fileUrlExpireTime),
        height: asOptionalNumber(content.height),
        type: "video",
        videoUrl: String(content.videoUrl ?? ""),
        width: asOptionalNumber(content.width),
      };
    case "file":
      return {
        downloadStatus: asDownloadStatus(content.downloadStatus),
        extension: String(content.extension ?? ""),
        fileName: String(content.fileName ?? ""),
        fileSerialNo: asOptionalString(content.fileSerialNo),
        fileSizeLabel: String(content.fileSizeLabel ?? ""),
        fileUrl: asOptionalString(content.fileUrl),
        sourceLabel: asOptionalString(content.sourceLabel),
        type: "file",
      };
    case "h5":
      return {
        description: String(content.description ?? ""),
        previewImageUrl: asOptionalString(content.previewImageUrl),
        sourceLabel: asOptionalString(content.sourceLabel),
        title: String(content.title ?? ""),
        type: "h5",
        url: asOptionalString(content.url),
      };
    case "mini-program":
      return {
        appName: String(content.appName ?? ""),
        coverImageUrl: asOptionalString(content.coverImageUrl),
        logoUrl: asOptionalString(content.logoUrl),
        sourceLabel: asOptionalString(content.sourceLabel),
        title: String(content.title ?? ""),
        type: "mini-program",
      };
    case "contact-card":
      return {
        avatarUrl: asOptionalString(content.avatarUrl),
        company: asOptionalString(content.company),
        contactSerialNo: asOptionalString(content.contactSerialNo),
        groupSerialNo: asOptionalString(content.groupSerialNo),
        name: String(content.name ?? ""),
        sourceLabel: asOptionalString(content.sourceLabel),
        type: "contact-card",
      };
    case "location":
      return {
        address: String(content.address ?? ""),
        latitude: asOptionalNumber(content.latitude),
        longitude: asOptionalNumber(content.longitude),
        title: String(content.title ?? ""),
        type: "location",
        zoom: asOptionalNumber(content.zoom),
      };
    case "sphfeed":
      return {
        description: String(content.description ?? ""),
        imageUrl: asOptionalString(content.imageUrl),
        sourceLabel: asOptionalString(content.sourceLabel),
        title: String(content.title ?? ""),
        type: "sphfeed",
        url: asOptionalString(content.url),
      };
    case "solitaire":
      return {
        createMemberSerialNo: asOptionalString(content.createMemberSerialNo),
        example: asOptionalString(content.example),
        items: adaptSolitaireItems(content.items),
        tail: asOptionalString(content.tail),
        title: String(content.title ?? ""),
        type: "solitaire",
      };
    case "redpacket":
      return {
        description: String(content.description ?? ""),
        title: String(content.title ?? ""),
        totalAmount: asOptionalNumber(content.totalAmount),
        totalCnt: asOptionalNumber(content.totalCnt),
        type: "redpacket",
      };
    case "quote":
      return {
        quoteMsgId: String(content.quoteMsgId ?? ""),
        quotedMessage: adaptQuotedMessagePreview(content.quotedMessage),
        text: String(content.text ?? ""),
        type: "quote",
      };
    case "chatrecord":
      return {
        msgContent: adaptChatRecordContentLines(content.msgContent),
        msgTitle: String(content.msgTitle ?? "聊天记录"),
        type: "chatrecord",
        unsupportedDisplayText: asOptionalString(content.unsupportedDisplayText),
        viewState: content.viewState === "loading" ? "loading" : undefined,
      };
    case "text":
    case "system":
    case "revoke":
    default:
      return {
        text: String(content.text ?? ""),
        type: "text",
      };
  }
}

function mergeTopLevelDownloadMetadata(
  dto: WorkbenchMessageDto,
): Record<string, unknown> {
  const topLevelMetadata = dto as WorkbenchMessageDto & {
    downloadStatus?: unknown;
    fileSerialNo?: unknown;
    fileUrl?: unknown;
    fileUrlExpireTime?: unknown;
  };
  const content = { ...dto.content };

  if (content.downloadStatus === undefined) {
    content.downloadStatus = topLevelMetadata.downloadStatus;
  }

  if (content.fileSerialNo === undefined) {
    content.fileSerialNo = topLevelMetadata.fileSerialNo;
  }

  if (content.fileUrl === undefined) {
    content.fileUrl = topLevelMetadata.fileUrl;
  }

  if (content.fileUrlExpireTime === undefined) {
    content.fileUrlExpireTime = topLevelMetadata.fileUrlExpireTime;
  }

  return content;
}

function adaptQuotedMessagePreview(value: unknown): QuotedMessagePreviewContent | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const contentType = String(value.contentType ?? "");

  if (!isQuotedPreviewContentType(contentType)) {
    return undefined;
  }

  return {
    contentType,
    fallbackText: asOptionalString(value.fallbackText),
    imageUrl: asOptionalString(value.imageUrl),
    senderName: String(value.senderName ?? ""),
    text: asOptionalString(value.text),
    title: asOptionalString(value.title),
  };
}

function isQuotedPreviewContentType(
  value: string,
): value is QuotedMessagePreviewContent["contentType"] {
  return [
    "system",
    "revoke",
    "text",
    "voice",
    "image",
    "emotion",
    "video",
    "file",
    "h5",
    "contact-card",
    "location",
    "solitaire",
    "redpacket",
    "sphfeed",
    "mini-program",
    "chatrecord",
    "quote",
  ].includes(value);
}

function adaptChatRecordContentLines(value: unknown) {
  if (!Array.isArray(value)) {
    return ["[聊天记录]"];
  }

  const lines = value.filter((item): item is string => typeof item === "string");

  return lines.length > 0 ? lines : ["[聊天记录]"];
}

function adaptMessageStatus(status: WorkbenchMessageDto["status"]): MessageStatus {
  switch (status) {
    case "queued":
    case "sending":
      return "sending";
    case "failed":
      return "failed";
    case "sent":
    default:
      return "sent";
  }
}

function formatQuietFor(lastMessageTime: number | undefined) {
  if (lastMessageTime == null) {
    return "";
  }

  const diffMs = Date.now() - lastMessageTime;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays <= 0) {
    const diffHours = Math.max(Math.floor(diffMs / (60 * 60 * 1000)), 1);
    return `${diffHours}小时内有消息`;
  }

  return `${diffDays}天没聊了`;
}

function buildAccountTone(accountId: string) {
  return accountId === "ndt"
    ? "linear-gradient(135deg, var(--primary), var(--muted-foreground))"
    : "linear-gradient(135deg, var(--muted-foreground), var(--primary))";
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asDownloadStatus(value: unknown) {
  return value === "ing" || value === "finished" || value === "failed"
    ? value
    : undefined;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function adaptSolitaireItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const itemRecord = isRecord(item) ? item : {};

    return {
      content: String(itemRecord.content ?? ""),
      memberSerialNo: asOptionalString(itemRecord.memberSerialNo),
      timestamp: asOptionalNumber(itemRecord.timestamp),
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
