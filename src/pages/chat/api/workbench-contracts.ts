export type WorkbenchMessageContentType =
  | "system"
  | "text"
  | "voice"
  | "image"
  | "file"
  | "h5"
  | "mini-program";

export type WorkbenchConversationStatus = "claimed" | "public" | "follow-up";

export type WorkbenchMessageStatus = "queued" | "sending" | "sent" | "failed" | "read";

export type WorkbenchEmployeeDto = {
  id: string;
  displayName: string;
};

export type WorkbenchAccountDto = {
  accountId: string;
  name: string;
  avatar: string;
  operatorName: string;
  description: string;
  phone: string;
  unreadCount: number;
  lastMessageTime?: number;
  loginStatus: "online" | "offline";
};

export type WorkbenchConversationSummaryDto = {
  conversationId: string;
  accountId: string;
  customerId: string;
  customerName: string;
  customerAvatar: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  mode: "single" | "group";
  status: WorkbenchConversationStatus;
  assignedEmployeeId?: string;
  priority: "high" | "medium" | "low";
};

export type WorkbenchMessageBaseDto = {
  messageId: string;
  conversationId: string;
  accountId: string;
  customerId: string;
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

export type WorkbenchAccountChangeDto = {
  accountId: string;
  unreadCount: number;
  lastMessageTime?: number;
};

export type WorkbenchConversationChangeDto =
  | ({
      type: "remove";
      conversationId: string;
      accountId: string;
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
  currentAccountId?: string;
  activeConversationId?: string;
  activeMessageSeq?: number;
};

export type WorkbenchPollResponse = {
  nextVersion: number;
  accountChanges: WorkbenchAccountChangeDto[];
  conversationChanges: WorkbenchConversationChangeDto[];
  activeConversationMessages: WorkbenchMessageDto[];
  messageStatusChanges: WorkbenchMessageStatusChangeDto[];
};

export type WorkbenchSendMessagePayload = {
  accountId: string;
  conversationId: string;
  clientMessageId: string;
  contentType: "text";
  content: string;
};

export type WorkbenchSendMessageResponse = {
  messageId: string;
  clientMessageId: string;
  status: "accepted";
};

export type WorkbenchConversationReadResponse = {
  conversationId: string;
  accountId: string;
  unreadCount: number;
  accountUnreadCount: number;
};

export type WorkbenchClaimConversationResponse = {
  conversation: WorkbenchConversationSummaryDto;
};
