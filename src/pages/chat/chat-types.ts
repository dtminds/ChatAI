export type ChatMode = "single" | "group";

export type MessageRole = "customer" | "agent" | "system";

export type MessageStatus = "sending" | "sent" | "failed" | "read";

export type Account = {
  id: string;
  name: string;
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
};

export type Conversation = {
  id: string;
  accountId: string;
  customerId: string;
  customerName: string;
  preview: string;
  updatedAt: string;
  quietFor: string;
  unread: number;
  mode: ChatMode;
  status: "claimed" | "public" | "follow-up";
  priority: "high" | "medium" | "low";
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
  durationLabel: string;
};

export type ImageMessageContent = {
  type: "image";
  imageUrl: string;
  alt: string;
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
  previewImageUrl?: string;
  sourceLabel?: string;
};

export type MiniProgramMessageContent = {
  type: "mini-program";
  title: string;
  appName: string;
  coverImageUrl?: string;
  sourceLabel?: string;
};

export type MessageContent =
  | SystemMessageContent
  | TextMessageContent
  | VoiceMessageContent
  | ImageMessageContent
  | FileMessageContent
  | H5CardMessageContent
  | MiniProgramMessageContent;

type BaseMessage = {
  id: string;
  conversationId: string;
  role: MessageRole;
  author: string;
  sentAt: string;
  status: MessageStatus;
};

export type SystemMessage = BaseMessage & {
  role: "system";
  content: SystemMessageContent;
};

export type ChatMessage = BaseMessage & {
  role: "customer" | "agent";
  sender: MessageSender;
  content:
    | TextMessageContent
    | VoiceMessageContent
    | ImageMessageContent
    | FileMessageContent
    | H5CardMessageContent
    | MiniProgramMessageContent;
};

export type Message = SystemMessage | ChatMessage;

export type CustomerProfile = {
  id: string;
  name: string;
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
