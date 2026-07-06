import type {
  WorkbenchOutgoingMessageSegment,
  WorkbenchSearchContactResultDto,
  WorkbenchSearchGroupResultDto,
} from "@chatai/contracts";
import type { ChatMessage, ChatMode, Conversation } from "@/pages/chat/chat-types";
import { sortConversations } from "@/pages/chat/lib/conversation-order";
import { isValidMessageSeq } from "@/pages/chat/lib/message-seq";

export const MESSAGE_FORWARD_MAX_RECIPIENTS = 1;
export const MESSAGE_FORWARD_MAX_MESSAGES = 20;
export const MESSAGE_FORWARD_SEND_INTERVAL_MIN_MS = 1000;
export const MESSAGE_FORWARD_SEND_INTERVAL_MAX_MS = 5000;

export const MESSAGE_FORWARD_SEND_HINT =
  "轮流发送每条消息来实现转发，消息间隔1-5秒，需要较长时间";

export function resolveForwardSendDelayMs() {
  const min = MESSAGE_FORWARD_SEND_INTERVAL_MIN_MS;
  const max = MESSAGE_FORWARD_SEND_INTERVAL_MAX_MS;

  return min + Math.floor(Math.random() * (max - min + 1));
}

export type MessageForwardRecipient = {
  avatar: string;
  conversationId?: string;
  id: string;
  mode: ChatMode;
  name: string;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
};

export type MessageForwardMode = "single" | "batch";

function readForwardMessageInfoId(message: ChatMessage) {
  const seq = message.seq;

  return isValidMessageSeq(seq) ? String(seq) : undefined;
}

export function getMessageForwardPreview(message: ChatMessage) {
  switch (message.content.type) {
    case "text":
      return message.content.text.trim() || "[文本]";
    case "quote":
      return message.content.text.trim() || "[引用消息]";
    case "image":
      return message.content.variant === "emotion"
        ? "[表情]"
        : message.content.alt?.trim() || "[图片]";
    case "video":
      return message.content.alt?.trim() || "[视频]";
    case "voice":
      return message.content.transVoiceText?.trim() || "[语音]";
    case "file":
      return message.content.fileName?.trim() || "[文件]";
    case "h5":
      return message.content.title?.trim() || "[链接]";
    case "mini-program":
      return message.content.title?.trim() || message.content.appName?.trim() || "[小程序]";
    case "sphfeed":
      return message.content.title?.trim() || "[视频号]";
    case "contact-card":
      return message.content.name?.trim() || "[名片]";
    case "location":
      return message.content.title?.trim() || message.content.address?.trim() || "[位置]";
    case "chatrecord":
      return message.content.msgTitle?.trim() || "[聊天记录]";
    case "solitaire":
      return message.content.title?.trim() || "[接龙]";
    case "redpacket":
      return message.content.title?.trim() || "[红包]";
    default:
      return "[消息]";
  }
}

export function canForwardMessage(message: ChatMessage) {
  if (message.isRevoked || message.status === "failed") {
    return false;
  }

  return buildForwardSegmentFromMessage(message) !== null;
}

export function buildForwardSegmentFromMessage(
  message: ChatMessage,
): WorkbenchOutgoingMessageSegment | null {
  const msgInfoId = readForwardMessageInfoId(message);
  const content = message.content;

  switch (content.type) {
    case "text":
      return content.text.trim()
        ? {
            text: content.text,
            type: "text",
          }
        : null;
    case "quote":
      return content.text.trim()
        ? {
            text: content.text,
            type: "text",
          }
        : null;
    case "image": {
      const imageUrl = content.imageUrl?.trim();

      if (!imageUrl) {
        return null;
      }

      if (content.variant === "emotion") {
        return {
          alt: content.alt || "[表情]",
          imageUrl,
          type: "image",
          url: imageUrl,
        };
      }

      if (content.downloadStatus !== "finished") {
        return null;
      }

      return {
        alt: content.alt || "[图片]",
        imageUrl,
        type: "image",
        url: imageUrl,
        ...(content.height != null ? { height: content.height } : {}),
        ...(content.width != null ? { width: content.width } : {}),
      };
    }
    case "file": {
      const fileUrl = content.fileUrl?.trim();
      const fileName = content.fileName?.trim();

      if (!fileUrl || !fileName) {
        return null;
      }

      return {
        extension: content.extension,
        fileName,
        fileSizeLabel: content.fileSizeLabel,
        type: "file",
        url: fileUrl,
      };
    }
    case "h5": {
      const href = content.url?.trim();
      const title = content.title?.trim();

      if (!href || !title) {
        return null;
      }

      return {
        coverUrl: content.previewImageUrl,
        desc: content.description,
        href,
        title,
        type: "h5",
      };
    }
    case "mini-program":
      if (!msgInfoId) {
        return null;
      }

      return {
        appName: content.appName,
        coverImageUrl: content.coverImageUrl,
        logoUrl: content.logoUrl,
        msgInfoId,
        sourceLabel: content.sourceLabel,
        title: content.title,
        type: "weapp",
      };
    default:
      return null;
  }
}

export function buildMessageForwardRecipientId(input: {
  mode: ChatMode;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
}) {
  if (input.mode === "group") {
    return `group:${input.thirdGroupId ?? ""}`;
  }

  return `contact:${input.thirdExternalUserId ?? ""}`;
}

export function buildRecentForwardSearchResults(
  conversations: Conversation[],
  options?: {
    excludeConversationId?: string;
  },
) {
  const eligibleConversations = sortConversations(conversations).filter((conversation) => {
    if (
      conversation.bizStatus != null &&
      conversation.bizStatus !== 1
    ) {
      return false;
    }

    if (
      options?.excludeConversationId &&
      conversation.id === options.excludeConversationId
    ) {
      return false;
    }

    if (conversation.mode === "single") {
      return Boolean(conversation.thirdExternalUserId?.trim());
    }

    if (conversation.mode === "group") {
      return Boolean(conversation.thirdGroupId?.trim());
    }

    return false;
  });

  const contacts = eligibleConversations
    .filter((conversation) => conversation.mode === "single")
    .map((conversation) => mapConversationToSearchContact(conversation))
    .filter((contact): contact is WorkbenchSearchContactResultDto => contact !== null);

  const groups = eligibleConversations
    .filter((conversation) => conversation.mode === "group")
    .map((conversation) => mapConversationToSearchGroup(conversation))
    .filter((group): group is WorkbenchSearchGroupResultDto => group !== null);

  return { contacts, groups };
}

function mapConversationToSearchContact(
  conversation: Conversation,
): WorkbenchSearchContactResultDto | null {
  const thirdExternalUserId = conversation.thirdExternalUserId?.trim();

  if (!thirdExternalUserId) {
    return null;
  }

  const displayName = conversation.customerName?.trim() || "未知客户";
  const originalName =
    normalizeForwardContactOriginalName(conversation.contactOriginalName) ||
    displayName;

  return {
    avatar: conversation.customerAvatarUrl ?? "",
    conversationId: conversation.id,
    name: originalName,
    realName: originalName,
    remark: displayName !== originalName ? displayName : undefined,
    thirdExternalUserId,
  };
}

function normalizeForwardContactOriginalName(name?: string) {
  const trimmedName = name?.trim();

  if (!trimmedName) {
    return "";
  }

  return trimmedName.replace(/^微信昵称[:：]\s*/, "").trim();
}

function mapConversationToSearchGroup(
  conversation: Conversation,
): WorkbenchSearchGroupResultDto | null {
  const thirdGroupId = conversation.thirdGroupId?.trim();

  if (!thirdGroupId) {
    return null;
  }

  const displayName = conversation.customerName?.trim() || "未知群聊";
  const originalName = conversation.groupOriginalName?.trim() || displayName;

  return {
    avatar: conversation.customerAvatarUrl ?? "",
    conversationId: conversation.id,
    name: originalName,
    remark: displayName !== originalName ? displayName : undefined,
    thirdGroupId,
  };
}
