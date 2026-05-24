import type {
  WorkbenchGroupMemberType,
  WorkbenchMessageContentType,
} from "@chatai/contracts";

export type ChatMode = "single" | "group";

export type MessageRole = "customer" | "agent" | "system";

export type MessageStatus = "pending" | "sending" | "accepted" | "sent" | "failed";

export type FileUploadQueueItem = {
  fileName: string;
  id: string;
  progress: number;
  status: "uploading" | "sending";
};

export type EmployeeProfile = {
  id: string;
  displayName: string;
};

export type GroupMember = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  type: WorkbenchGroupMemberType;
};

export type Account = {
  id: string;
  name: string;
  avatarUrl: string;
  operator: string;
  description: string;
  phone: string;
  metrics: {
    totalCustomers: number;
    activeCustomers: number;
    agents: number;
    stores: number;
  };
  tone: string;
  unreadCount?: number;
  lastMessageTime?: number;
  loginStatus?: "online" | "offline";
  takenOverEmployeeId?: string;
};

export type Conversation = {
  id: string;
  accountId: string;
  /** 关联客户绑定或群席位业务状态；非 1 表示会话对象已失效 */
  bizStatus?: number;
  customerId: string;
  customerName: string;
  customerAvatarUrl: string;
  createdAtMs?: number;
  preview: string;
  updatedAt: string;
  quietFor: string;
  unread: number;
  mode: ChatMode;
  priority: "high" | "medium" | "low";
  /** 三方用户 ID（侧栏 iframe 密文由服务端按会话签发） */
  thirdUserId?: string;
  /** 外部用户 ID（侧栏 iframe 密文由服务端按会话签发） */
  thirdExternalUserId?: string;
  /** 群会话三方群 ID，侧栏 iframe 在群聊时拼入查询参数 `qd` */
  thirdGroupId?: string;
  isPinned?: boolean;
  isVerified?: boolean;
  updatedAtMs?: number;
};

export type MessageSender = {
  groupMemberId?: string;
  id: string;
  name: string;
  avatarUrl?: string;
};

export type SystemMessageContent = {
  type: "system";
  text: string;
};

export type RevokeMessageContent = {
  revokeMsgId?: string;
  revokeOriginMsgId?: string;
  type: "revoke";
  text: string;
};

export type TextMessageContent = {
  type: "text";
  text: string;
};

export type VoiceMessageContent = {
  type: "voice";
  audioUrl?: string;
  durationLabel: string;
};

export type ImageMessageContent = {
  type: "image";
  imageUrl: string;
  alt: string;
  variant?: "image" | "emotion";
  width?: number;
  height?: number;
};

export type MessageFileDownloadStatus = "ing" | "finished" | "failed";

export type VideoMessageContent = {
  type: "video";
  videoUrl: string;
  coverImageUrl: string;
  alt: string;
  durationLabel: string;
  downloadStatus?: MessageFileDownloadStatus;
  fileSerialNo?: string;
  fileUrlExpireTime?: number;
  width?: number;
  height?: number;
};

export type FileMessageContent = {
  type: "file";
  fileName: string;
  fileSizeLabel: string;
  extension: string;
  downloadStatus?: MessageFileDownloadStatus;
  fileSerialNo?: string;
  fileUrl?: string;
  sourceLabel?: string;
};

export type H5CardMessageContent = {
  type: "h5";
  title: string;
  description: string;
  url?: string;
  previewImageUrl?: string;
  sourceLabel?: string;
};

export type MiniProgramMessageContent = {
  type: "mini-program";
  title: string;
  appName: string;
  coverImageUrl?: string;
  logoUrl?: string;
  sourceLabel?: string;
};

export type ContactCardMessageContent = {
  type: "contact-card";
  name: string;
  avatarUrl?: string;
  company?: string;
  contactSerialNo?: string;
  groupSerialNo?: string;
  sourceLabel?: string;
};

export type LocationMessageContent = {
  type: "location";
  title: string;
  address: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;
};

export type SphFeedMessageContent = {
  type: "sphfeed";
  title: string;
  description: string;
  imageUrl?: string;
  url?: string;
  sourceLabel?: string;
};

export type SolitaireMessageItem = {
  content: string;
  memberSerialNo?: string;
  timestamp?: number;
};

export type SolitaireMessageContent = {
  type: "solitaire";
  title: string;
  example?: string;
  items: SolitaireMessageItem[];
  tail?: string;
  createMemberSerialNo?: string;
};

export type RedPacketMessageContent = {
  type: "redpacket";
  title: string;
  description: string;
  totalAmount?: number;
  totalCnt?: number;
};

export type QuotedMessagePreviewContent = {
  contentType: WorkbenchMessageContentType;
  fallbackText?: string;
  imageUrl?: string;
  quoteMsgId?: string;
  quotedMessageId?: string;
  senderName: string;
  text?: string;
  title?: string;
};

export type QuoteMessageContent = {
  type: "quote";
  text: string;
  quoteMsgId: string;
  quotedMessageId?: string;
  quotedMessage?: QuotedMessagePreviewContent;
};

export type MessageContent =
  | SystemMessageContent
  | RevokeMessageContent
  | TextMessageContent
  | VoiceMessageContent
  | ImageMessageContent
  | VideoMessageContent
  | FileMessageContent
  | H5CardMessageContent
  | MiniProgramMessageContent
  | ContactCardMessageContent
  | LocationMessageContent
  | SphFeedMessageContent
  | SolitaireMessageContent
  | RedPacketMessageContent
  | QuoteMessageContent;

type BaseMessage = {
  id: string;
  conversationId: string;
  role: MessageRole;
  author: string;
  sentAt: string;
  status: MessageStatus;
  clientMessageId?: string;
  optNo?: string;
  remoteMessageId?: string;
  seq?: number;
  failReason?: string;
  isRevoked?: boolean;
};

export type SystemMessage = BaseMessage & {
  role: "system";
  content: SystemMessageContent | RevokeMessageContent;
};

export type ChatMessage = BaseMessage & {
  role: "customer" | "agent";
  sender: MessageSender;
  isGroupConversation?: boolean;
  isOwnMessage?: boolean;
  senderDisplayName?: string;
  content:
    | TextMessageContent
    | VoiceMessageContent
    | ImageMessageContent
    | VideoMessageContent
    | FileMessageContent
    | H5CardMessageContent
    | MiniProgramMessageContent
    | ContactCardMessageContent
    | LocationMessageContent
    | SphFeedMessageContent
    | SolitaireMessageContent
    | RedPacketMessageContent
    | QuoteMessageContent;
};

export type Message = SystemMessage | ChatMessage;

export type CustomerProfile = {
  id: string;
  name: string;
  avatarUrl: string;
  persona: string;
  city: string;
  phone: string;
  stage: string;
  intentScore: number;
  tags: string[];
  metrics: Array<{
    label: string;
    value: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: "open" | "due" | "done";
  }>;
  notes: string[];
};
