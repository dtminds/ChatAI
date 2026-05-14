import type {
  WorkbenchGroupMemberType,
  WorkbenchMessageContentType,
} from "@chatai/contracts";

export type ChatMode = "single" | "group";

export type MessageRole = "customer" | "agent" | "system";

export type MessageStatus = "pending" | "sending" | "accepted" | "sent" | "failed" | "read";

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
  customerId: string;
  customerName: string;
  customerAvatarUrl: string;
  preview: string;
  updatedAt: string;
  quietFor: string;
  unread: number;
  mode: ChatMode;
  priority: "high" | "medium" | "low";
  isPinned?: boolean;
  updatedAtMs?: number;
};

export type MessageSender = {
  id: string;
  name: string;
  avatarUrl?: string;
};

export type SystemMessageContent = {
  type: "system";
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
  width?: number;
  height?: number;
};

export type VideoMessageContent = {
  type: "video";
  videoUrl: string;
  coverImageUrl: string;
  alt: string;
  durationLabel: string;
  width?: number;
  height?: number;
};

export type FileMessageContent = {
  type: "file";
  fileName: string;
  fileSizeLabel: string;
  extension: string;
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

export type QuotedMessagePreviewContent = {
  contentType: WorkbenchMessageContentType;
  fallbackText?: string;
  imageUrl?: string;
  senderName: string;
  text?: string;
  title?: string;
};

export type QuoteMessageContent = {
  type: "quote";
  text: string;
  quoteMsgId: string;
  quotedMessage?: QuotedMessagePreviewContent;
};

export type MessageContent =
  | SystemMessageContent
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
  content: SystemMessageContent;
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
