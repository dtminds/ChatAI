import { Type, type Static } from "@sinclair/typebox";
import {
  GROUP_MEMBER_TYPE,
  LoginStatusSchema,
  TakeoverStatusSchema,
} from "./enums.js";

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
  | "revoke"
  | "text"
  | "voice"
  | "image"
  | "emotion"
  | "video"
  | "file"
  | "h5"
  | "contact-card"
  | "location"
  | "solitaire"
  | "redpacket"
  | "sphfeed"
  | "mini-program"
  | "quote";

export type WorkbenchQuotedMessagePreviewDto = {
  contentType: WorkbenchMessageContentType;
  fallbackText?: string;
  imageUrl?: string;
  senderName: string;
  text?: string;
  title?: string;
};

export type WorkbenchMessageStatus = "queued" | "sending" | "sent" | "failed";
export type WorkbenchMessageFileDownloadStatus = "ing" | "finished" | "failed";

export type WorkbenchMessageFileDownloadResponse = {
  messageId: string;
  status: "accepted";
};

export type WorkbenchMessageFileDownloadStatusResponse = {
  downloadStatus?: WorkbenchMessageFileDownloadStatus;
  fileSerialNo?: string;
  fileUrlExpireTime?: number;
  fileUrl?: string;
};

export type WorkbenchPlayableVoiceResponse = {
  playable: boolean;
  playableUrl?: string;
};

export type WorkbenchVoicePlaybackConfirmRequest = {
  conversationId: string;
  messageSeq: number;
  playbackUrl: string;
};

export type WorkbenchVoicePlaybackConfirmResponse = {
  messageSeq: number;
  playbackUrl: string;
  transFileUrlPersisted: true;
};

export type WorkbenchMessageFileDownloadStatusRequest = {
  conversationId: string;
  messageSeq: number;
};

export type WorkbenchSubUserDto = {
  subUserId: string;
  displayName: string;
};

/** 侧栏 iframe 涂色查询参数签发请求；三方 ID 由服务端按会话解析，不信任 body */
export type WorkbenchSidebarIframeParamsRequest = {
  conversationId: string;
  seatId: string;
};

/**
 * 侧栏 iframe 涂色查询参数（服务端签发）。
 * 仅用于 URL 脱敏与既有嵌入页协议兼容，不是对嵌入页的身份防伪边界。
 */
export type WorkbenchSidebarIframeParamsDto = {
  fsw?: string;
  /** 对应库表 `appid`，拼到 iframe 上时查询参数名为 `mid` */
  mid: string;
  rd?: string;
  ts: string;
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
  /** 关联联系人或群席位业务状态；0 表示该会话展示对象已失效 */
  bizStatus?: number;
  conversationId: string;
  seatId: string;
  thirdUserId?: string;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
  createdAt?: number;
  customerId: string;
  customerName: string;
  customerAvatar: string;
  lastMessage: string;
  lastMessageTime?: number;
  unreadCount: number;
  mode: "single" | "group";
  isPinned?: boolean;
  priority: "high" | "medium" | "low";
  verified?: boolean;
};

export type WorkbenchConversationCursorDto = {
  id: string;
  lastMsgTime: number;
  snapshotAt: number;
};

export type WorkbenchConversationListResponse = {
  hasMore: boolean;
  items: WorkbenchConversationSummaryDto[];
  nextCursor?: string;
  snapshotAt: number;
};

export type WorkbenchMessageBaseDto = {
  messageId: string;
  conversationId: string;
  seatId: string;
  customerId: string;
  thirdUserId?: string;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
  thirdFromId?: string;
  senderName?: string;
  senderAvatar?: string;
  senderType: "customer" | "agent" | "system";
  contentType: WorkbenchMessageContentType;
  status: WorkbenchMessageStatus;
  content: Record<string, unknown>;
  createdAt?: number;
  seq: number;
  clientMessageId?: string;
  optNo?: string;
  failReason?: string;
  isRevoked?: boolean;
};

export type WorkbenchMessageDto = WorkbenchMessageBaseDto;

export type WorkbenchMessagePageDto = {
  messages: WorkbenchMessageDto[];
  nextBeforeSeq?: number;
  hasMore: boolean;
  scannedCount: number;
  filteredCount: number;
};

export type WorkbenchHistoryMessageScope =
  | "all"
  | "file"
  | "media"
  | "h5"
  | "mini-program";

export type WorkbenchHistoryMessageQuery = {
  cursor?: string;
  day?: string;
  limit?: number;
  scope?: WorkbenchHistoryMessageScope;
  senderId?: string;
};

export type WorkbenchHistoryMessagePageDto = {
  messages: WorkbenchMessageDto[];
  nextCursor?: string;
  prevCursor?: string;
  hasNext: boolean;
  hasPrev: boolean;
};

export type WorkbenchSeatChangeDto = {
  seatId: string;
  unreadCount: number;
  lastMessageTime?: number;
  hostSubUserId?: string | null;
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

export type WorkbenchMessageUpdateEventDto = {
  conversationId: string;
  eventId: number;
  messageId: string;
};

export type WorkbenchMessageQueryByIdsRequest = {
  conversationId: string;
  messageIds: string[];
};

export type WorkbenchMessageQueryByIdsResponse = {
  messages: WorkbenchMessageDto[];
};

export type WorkbenchPollRequest = {
  sinceVersion: number;
  freshBaseline?: boolean;
  currentSeatId?: string;
  activeConversationId?: string;
  activeMessageSeq?: number;
  messageUpdateCursor?: number;
  seatUpdateCursor?: number;
};

export type WorkbenchPollResponse = {
  nextVersion: number;
  nextMessageUpdateCursor?: number;
  nextSeatUpdateCursor?: number;
  seatChanges: WorkbenchSeatChangeDto[];
  conversationChanges: WorkbenchConversationChangeDto[];
  activeConversationMessages: WorkbenchMessageDto[];
  messageUpdateEvents?: WorkbenchMessageUpdateEventDto[];
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

export type WorkbenchOutgoingMessageFileSegment = {
  type: "file";
  extension: string;
  fileId?: string;
  fileName: string;
  fileSize?: number;
  fileSizeLabel?: string;
  url?: string;
};

export type WorkbenchOutgoingMessageSegment =
  | WorkbenchOutgoingMessageTextSegment
  | WorkbenchOutgoingMessageImageSegment
  | WorkbenchOutgoingMessageFileSegment;

export type WorkbenchSendMessagePayload = {
  seatId: string;
  conversationId: string;
  clientMessageId: string;
  failMsgId?: string;
  contentType?: "text";
  content?: string;
  mention?: {
    all?: boolean;
    location: "start" | "end";
    memberIds: string[];
  };
  quote?: {
    quoteMsgId: string;
    quotedMessageId?: string;
    quotedMessage?: WorkbenchQuotedMessagePreviewDto;
  };
  segment?: WorkbenchOutgoingMessageSegment;
  segments?: WorkbenchOutgoingMessageSegment[];
};

export type WorkbenchSentMessageAck = {
  messageId: string;
  clientMessageId: string;
  optNo?: string;
  status: "accepted";
};

export type WorkbenchSendMessageResponse = {
  messageId: string;
  clientMessageId: string;
  optNo?: string;
  status: "accepted";
  messages?: WorkbenchSentMessageAck[];
};

export type WorkbenchConversationReadResponse = {
  conversationId: string;
  seatId: string;
  unreadCount: number;
  seatUnreadCount: number;
};

export type WorkbenchConversationUnreadResponse = WorkbenchConversationReadResponse;

export type WorkbenchConversationPinResponse = {
  conversationId: string;
  seatId: string;
  isPinned: boolean;
};

export type WorkbenchConversationUnpinResponse = WorkbenchConversationPinResponse;

export type WorkbenchConversationDeleteResponse = {
  conversationId: string;
  seatId: string;
  seatUnreadCount: number;
};

export type WorkbenchGroupMemberType =
  (typeof GROUP_MEMBER_TYPE)[keyof typeof GROUP_MEMBER_TYPE];

export type WorkbenchGroupMemberDto = {
  thirdUserId: string;
  displayName: string;
  avatarUrl: string;
  nickname?: string;
  type: WorkbenchGroupMemberType;
};

export type WorkbenchGroupMembersResponse = {
  conversationId: string;
  thirdGroupId: string;
  groupSeatId: string;
  items: WorkbenchGroupMemberDto[];
};

export type WorkbenchUploadCredentialResponse = {
  allowPerfixs: string[];
  bucket: string;
  credentials: {
    sessionToken: string;
    tmpSecretId: string;
    tmpSecretKey: string;
    token?: string;
  };
  expiration: string;
  expiredTime: number;
  region: string;
  requestId: string;
  startTime: number;
};

export type WorkbenchTakeOverSeatResponse = {
  seat: WorkbenchSeatDto;
};

export type WorkbenchSearchContactResultDto = {
  thirdExternalUserId: string;
  name: string;
  realName: string;
  avatar: string;
  remark?: string;
  conversationId?: string;
};

export type WorkbenchSearchGroupResultDto = {
  thirdGroupId: string;
  name?: string;
  avatar: string;
  remark?: string;
  conversationId?: string;
};

export type WorkbenchSearchResponseDto = {
  contacts: WorkbenchSearchContactResultDto[];
  groups: WorkbenchSearchGroupResultDto[];
};

export type WorkbenchGetOrCreateConversationRequestDto = {
  seatId: string;
  chatType: number;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
};
