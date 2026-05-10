import { Type, type Static } from "@sinclair/typebox";
import { LoginStatusSchema, TakeoverStatusSchema } from "./enums.js";

export const ChatSeatSchema = Type.Object({
  displayName: Type.String(),
  loginStatus: LoginStatusSchema,
  seatId: Type.String(),
  takeoverStatus: TakeoverStatusSchema,
  unreadCount: Type.Optional(Type.Number()),
});

export const ChatConversationSchema = Type.Object({
  conversationId: Type.String(),
  customerName: Type.String(),
  previewText: Type.String(),
  seatId: Type.String(),
  unreadCount: Type.Number(),
  updatedAt: Type.String(),
});

export const ChatMessageSchema = Type.Object({
  conversationId: Type.String(),
  createdAt: Type.String(),
  messageId: Type.String(),
  seq: Type.Number(),
  seatId: Type.String(),
});

export type ChatSeat = Static<typeof ChatSeatSchema>;
export type ChatConversation = Static<typeof ChatConversationSchema>;
export type ChatMessage = Static<typeof ChatMessageSchema>;

export type WorkbenchMessageContentType =
  | "system"
  | "text"
  | "voice"
  | "image"
  | "video"
  | "file"
  | "h5"
  | "mini-program";

export type WorkbenchMessageStatus = "queued" | "sending" | "sent" | "failed" | "read";

export type WorkbenchSubUserDto = {
  subUserId: string;
  displayName: string;
};

export type WorkbenchSeatDto = {
  seatId: string;
  thirdUserId?: string;
  name: string;
  avatar: string;
  operatorName: string;
  description: string;
  phone: string;
  unreadCount: number;
  lastMessageTime?: number;
  loginStatus: "online" | "offline";
  hostSubUserId?: string;
};

export type WorkbenchConversationSummaryDto = {
  conversationId: string;
  seatId: string;
  thirdUserId?: string;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
  customerId: string;
  customerName: string;
  customerAvatar: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  mode: "single" | "group";
  isPinned?: boolean;
  priority: "high" | "medium" | "low";
};

export type WorkbenchMessageBaseDto = {
  messageId: string;
  conversationId: string;
  seatId: string;
  customerId: string;
  thirdUserId?: string;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
  senderType: "customer" | "agent" | "system";
  contentType: WorkbenchMessageContentType;
  status: WorkbenchMessageStatus;
  content: Record<string, unknown>;
  createdAt: number;
  seq: number;
  clientMessageId?: string;
  failReason?: string;
};

export type WorkbenchMessageDto = WorkbenchMessageBaseDto;

export type WorkbenchSeatChangeDto = {
  seatId: string;
  unreadCount: number;
  lastMessageTime?: number;
};

export type WorkbenchConversationChangeDto =
  | ({
      type: "remove";
      conversationId: string;
      seatId: string;
    })
  | ({
      type: "upsert";
    } & WorkbenchConversationSummaryDto);

export type WorkbenchMessageStatusChangeDto = {
  messageId: string;
  clientMessageId?: string;
  conversationId: string;
  status: WorkbenchMessageStatus;
  reason?: string;
};

export type WorkbenchPollRequest = {
  sinceVersion: number;
  currentSeatId?: string;
  activeConversationId?: string;
  activeMessageSeq?: number;
};

export type WorkbenchPollResponse = {
  nextVersion: number;
  seatChanges: WorkbenchSeatChangeDto[];
  conversationChanges: WorkbenchConversationChangeDto[];
  activeConversationMessages: WorkbenchMessageDto[];
  messageStatusChanges: WorkbenchMessageStatusChangeDto[];
};

export type WorkbenchOutgoingMessageTextSegment = {
  type: "text";
  text: string;
};

export type WorkbenchOutgoingMessageImageSegment = {
  type: "image";
  alt: string;
  fileId?: string;
  height?: number;
  localUrl?: string;
  url?: string;
  width?: number;
};

export type WorkbenchOutgoingMessageSegment =
  | WorkbenchOutgoingMessageTextSegment
  | WorkbenchOutgoingMessageImageSegment;

export type WorkbenchSendMessagePayload = {
  seatId: string;
  conversationId: string;
  clientMessageId: string;
  contentType?: "text";
  content?: string;
  segments?: WorkbenchOutgoingMessageSegment[];
};

export type WorkbenchSentMessageAck = {
  messageId: string;
  clientMessageId: string;
  status: "accepted";
};

export type WorkbenchSendMessageResponse = {
  messageId: string;
  clientMessageId: string;
  status: "accepted";
  messages?: WorkbenchSentMessageAck[];
};

export type WorkbenchConversationReadResponse = {
  conversationId: string;
  seatId: string;
  unreadCount: number;
  seatUnreadCount: number;
};

export type WorkbenchTakeOverSeatResponse = {
  seat: WorkbenchSeatDto;
};
