import type {
  WorkbenchSearchContactResultDto,
  WorkbenchSearchGroupResultDto,
} from "@chatai/contracts";
import type { ChatMessage, ChatMode, Conversation } from "@/pages/chat/chat-types";
import { canCollectMaterial } from "@/pages/chat/lib/message-collect-material";
import { sortConversations } from "@/pages/chat/lib/conversation-order";

export const MESSAGE_FORWARD_RECENT_CONTACT_LIMIT = 30;
export const MESSAGE_FORWARD_RECENT_GROUP_LIMIT = 30;
export const MESSAGE_FORWARD_MAX_RECIPIENTS = 9;
export const MESSAGE_FORWARD_MAX_MESSAGES = 20;

export const MESSAGE_FORWARD_SEND_HINT =
  "转发的每条消息会自动间隔1-5秒，每个转发对象轮流发送";

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
  if (message.isRevoked) {
    return false;
  }

  if (message.content.type === "text") {
    return message.content.text.trim().length > 0;
  }

  if (message.content.type === "quote") {
    return message.content.text.trim().length > 0;
  }

  return canCollectMaterial(message);
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
    contactLimit?: number;
    groupLimit?: number;
  },
) {
  const contactLimit = options?.contactLimit ?? MESSAGE_FORWARD_RECENT_CONTACT_LIMIT;
  const groupLimit = options?.groupLimit ?? MESSAGE_FORWARD_RECENT_GROUP_LIMIT;
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
    .slice(0, contactLimit)
    .map((conversation) => mapConversationToSearchContact(conversation))
    .filter((contact): contact is WorkbenchSearchContactResultDto => contact !== null);

  const groups = eligibleConversations
    .filter((conversation) => conversation.mode === "group")
    .slice(0, groupLimit)
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
  const originalName = conversation.contactOriginalName?.trim() || displayName;

  return {
    avatar: conversation.customerAvatarUrl,
    conversationId: conversation.id,
    name: originalName,
    realName: originalName,
    remark: displayName !== originalName ? displayName : undefined,
    thirdExternalUserId,
  };
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
