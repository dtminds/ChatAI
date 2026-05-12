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
} from "@/pages/chat/chat-types";

type ChatMessageContent = ChatMessage["content"];

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

  return {
    accountId: dto.seatId,
    customerAvatarUrl: dto.customerAvatar,
    customerId: dto.customerId,
    customerName: dto.customerName,
    id: dto.conversationId,
    isPinned: dto.isPinned,
    mode: dto.mode,
    preview: dto.lastMessage,
    priority: dto.priority,
    quietFor: formatQuietFor(lastMessageTime),
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

  if (dto.senderType === "system") {
    return {
      clientMessageId: dto.clientMessageId,
      content: {
        text: String(dto.content.text ?? ""),
        type: "system",
      },
      conversationId: dto.conversationId,
      failReason: dto.failReason,
      id: dto.messageId,
      isRevoked: dto.isRevoked,
      remoteMessageId: dto.messageId,
      role: "system",
      sentAt,
      seq: dto.seq,
      status,
      author: "系统",
    };
  }

  const isAgent = dto.senderType === "agent";
  const customer = customerProfilesById[dto.customerId];
  const account = accountsById[dto.seatId];
  const content = adaptChatMessageContent(dto.contentType, dto.content);
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

  return {
    author: senderName,
    clientMessageId: dto.clientMessageId,
    content,
    conversationId: dto.conversationId,
    isGroupConversation,
    isOwnMessage,
    failReason: dto.failReason,
    id: dto.messageId,
    isRevoked: dto.isRevoked,
    remoteMessageId: dto.messageId,
    role: isAgent ? "agent" : "customer",
    senderDisplayName: isGroupConversation && !isOwnMessage ? senderName : undefined,
    sender: {
      avatarUrl: senderAvatar,
      id: isOwnMessage
        ? `sender-agent-${dto.seatId}`
        : `sender-customer-${dto.thirdFromId ?? dto.customerId}`,
      name: senderName,
    },
    sentAt,
    seq: dto.seq,
    status,
  };
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
        type: "voice",
      };
    case "image":
      return {
        alt: String(content.alt ?? ""),
        height: asOptionalNumber(content.height),
        imageUrl: String(content.imageUrl ?? ""),
        type: "image",
        width: asOptionalNumber(content.width),
      };
    case "video":
      return {
        alt: String(content.alt ?? ""),
        coverImageUrl: String(content.coverImageUrl ?? ""),
        durationLabel: String(content.durationLabel ?? ""),
        height: asOptionalNumber(content.height),
        type: "video",
        videoUrl: String(content.videoUrl ?? ""),
        width: asOptionalNumber(content.width),
      };
    case "file":
      return {
        extension: String(content.extension ?? ""),
        fileName: String(content.fileName ?? ""),
        fileSizeLabel: String(content.fileSizeLabel ?? ""),
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
    case "text":
    case "system":
    default:
      return {
        text: String(content.text ?? ""),
        type: "text",
      };
  }
}

function adaptMessageStatus(status: WorkbenchMessageDto["status"]): MessageStatus {
  switch (status) {
    case "queued":
    case "sending":
      return "sending";
    case "failed":
      return "failed";
    case "read":
      return "read";
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
