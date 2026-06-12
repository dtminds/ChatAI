import { Type, type Static } from "@sinclair/typebox";
import {
  GROUP_MEMBER_TYPE,
  LoginStatusSchema,
  TakeoverStatusSchema,
  type ConversationCustodyMode,
  type MaterialCollectionBizType,
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
  | "chatrecord"
  | "quote";

export type WorkbenchMaterialCollectionContentType = Extract<
  WorkbenchMessageContentType,
  "emotion" | "file" | "h5" | "mini-program"
>;

export type WorkbenchMaterialCollectionGroupBizType = Exclude<
  MaterialCollectionBizType,
  1
>;

export type WorkbenchMaterialCollectionGroupDto = {
  id: string;
  bizType: MaterialCollectionBizType;
  title: string;
  sort: number;
};

export type WorkbenchMaterialCollectionItemDto = {
  id: string;
  bizType: MaterialCollectionBizType;
  groupId: string | 0;
  title: string;
  sort: number;
  messageId: string;
  contentType: WorkbenchMaterialCollectionContentType;
  content: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
};

export type WorkbenchMaterialCollectionListRequest = {
  bizType: MaterialCollectionBizType;
  groupId?: string | 0;
};

export type WorkbenchMaterialCollectionListResponse = {
  groups: WorkbenchMaterialCollectionGroupDto[];
  items: WorkbenchMaterialCollectionItemDto[];
};

export type WorkbenchMaterialCollectionCreateRequest = {
  bizType: MaterialCollectionBizType;
  messageId: string;
  groupId?: string | 0;
};

export type WorkbenchMaterialCollectionCreateResponse = {
  item: WorkbenchMaterialCollectionItemDto;
  duplicated?: boolean;
};

export type WorkbenchMaterialCollectionGroupCreateRequest = {
  bizType: WorkbenchMaterialCollectionGroupBizType;
  title: string;
};

export type WorkbenchMaterialCollectionGroupUpdateRequest = {
  title: string;
};

export type WorkbenchMaterialCollectionMoveRequest = {
  groupId: string | 0;
};

export type WorkbenchMaterialCollectionOkResponse = {
  ok: true;
};

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

export type WorkbenchVoiceTranscriptionRequest = {
  conversationId: string;
  messageSeq: number;
};

export type WorkbenchVoiceTranscriptionResponse = {
  messageSeq: number;
  transVoiceText: string;
  transVoiceTextPersisted: true;
};

export type WorkbenchRevokeMessageRequest = {
  conversationId: string;
};

export type WorkbenchRevokeMessageResponse = {
  accepted: true;
  conversationId: string;
  messageId: string;
  revokeMsgId: number;
};

export type WorkbenchMessageFileDownloadStatusRequest = {
  conversationId: string;
  messageSeq: number;
};

export type WorkbenchSubUserDto = {
  subUserId: string;
  displayName: string;
  platform?: number;
  uid?: number;
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
  /** 群聊时服务端签发的 AES 密文（明文为 `thirdGroupId` UTF-8 字符串本身） */
  thirdGroupId?: string;
  /** 群聊时服务端签发的 AES 密文（明文为群名称 UTF-8 字符串本身） */
  thirdGroupName?: string;
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
  /** 会话托管模式：full 全托管，semi 半托管 */
  custodyMode: ConversationCustodyMode;
  seatId: string;
  thirdUserId?: string;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
  createdAt?: number;
  customerId: string;
  customerName: string;
  customerAvatar: string;
  /** 客户原始昵称（当使用备注展示时） */
  contactOriginalName?: string;
  /** 群原始名称（当使用备注展示时） */
  groupOriginalName?: string;
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
  smartReplyEnabled?: boolean;
  smartReplies?: WorkbenchSmartReplySuggestionDto[];
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

export type WorkbenchChatRecordDetailResponse = {
  messageId: string;
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

export const SMART_REPLY_MSG_IDS_LIMIT = 100;
/** Java user-history-answer-list 终态：2 推荐成功、3 推荐失败、4 已发送 */
export const SMART_REPLY_TERMINAL_GENERATE_STATUSES = [2, 3, 4] as const;
/** Java user-history-answer-list 失败原因：未命中知识集 */
export const SMART_REPLY_FAIL_REASON_KNOWLEDGE_MISS = "knowledge_miss";
/** 智能回复轮询最小间隔（毫秒），与工作台主 poll 解耦 */
export const SMART_REPLY_POLL_INTERVAL_MS = 1000;

export type WorkbenchSmartReplyStatus = "thinking" | "processing" | "ready";

export type WorkbenchSmartReplySuggestionDto = {
  messageId: string;
  assistantName: string;
  content: string;
  failReason?: string;
  generateStatus?: number | string;
  pollComplete?: boolean;
  refAttachIds?: string[];
  status?: WorkbenchSmartReplyStatus;
  /** Java recommend-answer 记录 id，send-answer 的 recordId 参数 */
  recordId?: string;
};

/** msgIds 传消息 seq（非 messageId / msgid） */
export type WorkbenchSmartReplyPollRequest = {
  conversationId: string;
  msgIds: number[];
};

export type WorkbenchSmartReplyPollResponse = {
  suggestions: WorkbenchSmartReplySuggestionDto[];
};

/** msgId 传消息 seq（非 messageId / msgid） */
export type WorkbenchSmartReplyGeneralAnswerRequest = {
  conversationId: string;
  msgId: number;
  questionImgs?: string[];
};

export type WorkbenchSmartReplyGeneralAnswerResponse = {
  suggestion: WorkbenchSmartReplySuggestionDto | null;
};

/** msgId 传消息 seq（非 messageId / msgid） */
export type WorkbenchSmartReplyAutoGeneralAnswerRequest = {
  conversationId: string;
  msgId: number;
};

export type WorkbenchSmartReplyAutoGeneralAnswerResponse = {
  id: string;
};

export type WorkbenchSmartReplyMakeShorterRequest = {
  content: string;
  conversationId: string;
};

export type WorkbenchSmartReplyMakeShorterResponse = {
  content: string;
};

export type WorkbenchSmartReplySendAnswerRequest = {
  conversationId: string;
  realAnswer: string;
  realAttachIds: string[];
  recordId: string;
};

export type WorkbenchSmartReplySendAnswerResponse = {
  ok: true;
};

export type WorkbenchAttachmentAppInfoDto = {
  appOriginId?: string;
  appPath?: string;
  appid?: string;
  headImg?: string;
  nickName?: string;
};

export type WorkbenchAttachmentDto = {
  appId?: string;
  appInfo?: WorkbenchAttachmentAppInfoDto;
  content?: string;
  coverUrl?: string;
  fileContentType?: string;
  fileDuration?: string;
  fileHeight?: number;
  fileLength?: number;
  fileName?: string;
  /** 1 图片 2 音频 3 视频 4 图文 5 文件 6 文本 7 小程序 */
  fileType?: number;
  fileWidth?: number;
  id: number;
  jumpUrl?: string;
  localPath?: string;
  slocalPath?: string;
  textContent?: string;
};

export type WorkbenchSmartReplyAttachmentsRequest = {
  conversationId: string;
  ids: string[];
};

export type WorkbenchSmartReplyAttachmentsResponse = {
  attachments: WorkbenchAttachmentDto[];
};

export type WorkbenchSmartReplyTextModerationRequest = {
  conversationId: string;
  content: string;
};

export type WorkbenchSmartReplyTextModerationDto = {
  categoryLabel: string;
  words: string[];
};

export type WorkbenchSmartReplyTextModerationResponse = {
  result: WorkbenchSmartReplyTextModerationDto | null;
};

export type WorkbenchKnowledgeSetDto = {
  createTimestamp?: number;
  docNum?: number;
  id: string;
  name: string;
  remark?: string;
};

export type WorkbenchKnowledgePageRequest = {
  conversationId: string;
};

export type WorkbenchKnowledgePageResponse = {
  list: WorkbenchKnowledgeSetDto[];
};

export type WorkbenchKnowledgeConfigRequest = {
  conversationId: string;
};

export type WorkbenchKnowledgeConfigDto = {
  automaticCheckIllegalWords: number;
};

export type WorkbenchKnowledgeConfigResponse = {
  config: WorkbenchKnowledgeConfigDto;
};

export type WorkbenchKnowledgeDocDto = {
  id: string;
  name: string;
};

export type WorkbenchKnowledgeDocPageRequest = {
  conversationId: string;
  knowledgeId: string;
};

export type WorkbenchKnowledgeDocPageResponse = {
  list: WorkbenchKnowledgeDocDto[];
};

export type WorkbenchKnowledgeFaqAddItemDto = {
  answer: string;
  attachIds: string;
  question: string;
  similarQuestion: string;
};

export type WorkbenchKnowledgeFaqAddRequest = {
  conversationId: string;
  docId: string;
  list: WorkbenchKnowledgeFaqAddItemDto[];
};

export type WorkbenchKnowledgeFaqAddResponse = {
  docId: string;
};

export type WorkbenchSmartHeartbeatRequest = {
  conversationId: string;
};

export type WorkbenchSmartHeartbeatResponse = {
  ok: true;
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
  hostSubUserId: string;
  seatId: string;
};

export const WorkbenchCustomerSeatRelationSchema = Type.Object({
  addTime: Type.Optional(Type.Number()),
  bindId: Type.String(),
  bindStatus: Type.Number(),
  bindType: Type.Number(),
  description: Type.Optional(Type.String()),
  lastMessageTime: Type.Optional(Type.Number()),
  seatAvatar: Type.String(),
  seatId: Type.String(),
  seatName: Type.String(),
  thirdUserId: Type.String(),
});

export const WorkbenchCustomerLastConversationSchema = Type.Object({
  conversationId: Type.String(),
  lastMessageTime: Type.Number(),
  seatAvatar: Type.String(),
  seatId: Type.String(),
  seatName: Type.String(),
});

export const WorkbenchCustomerSummarySchema = Type.Object({
  avatar: Type.String(),
  bizStatus: Type.Number(),
  customerKey: Type.String(),
  gender: Type.Union([Type.Number(), Type.Null()]),
  name: Type.String(),
  lastConversation: Type.Optional(WorkbenchCustomerLastConversationSchema),
  lastMessageTime: Type.Optional(Type.Number()),
  platform: Type.Number(),
  realName: Type.String(),
  relationCount: Type.Number(),
  seatRelations: Type.Array(WorkbenchCustomerSeatRelationSchema),
  thirdExternalUserId: Type.String(),
  uid: Type.Number(),
});

export const WorkbenchCustomerListResponseSchema = Type.Object({
  hasMore: Type.Boolean(),
  items: Type.Array(WorkbenchCustomerSummarySchema),
  nextCursor: Type.Optional(Type.String()),
  total: Type.Number(),
});

export const WorkbenchCustomerLastConversationResponseSchema = Type.Object({
  lastConversation: Type.Optional(WorkbenchCustomerLastConversationSchema),
});

export const WorkbenchCustomerRelationConversationSchema = Type.Object({
  lastMessageTime: Type.Number(),
  thirdUserId: Type.String(),
});

export const WorkbenchCustomerRelationConversationsResponseSchema = Type.Object({
  items: Type.Array(WorkbenchCustomerRelationConversationSchema),
});

export const WorkbenchCustomerDetailResponseSchema = Type.Object({
  customer: WorkbenchCustomerSummarySchema,
});

export type WorkbenchCustomerSeatRelationDto = Static<
  typeof WorkbenchCustomerSeatRelationSchema
>;

export type WorkbenchCustomerLastConversationDto = Static<
  typeof WorkbenchCustomerLastConversationSchema
>;

export type WorkbenchCustomerRelationConversationDto = Static<
  typeof WorkbenchCustomerRelationConversationSchema
>;

export type WorkbenchCustomerRelationConversationsResponse = Static<
  typeof WorkbenchCustomerRelationConversationsResponseSchema
>;

export type WorkbenchCustomerSummaryDto = Static<typeof WorkbenchCustomerSummarySchema>;

export type WorkbenchCustomerListResponse = Static<
  typeof WorkbenchCustomerListResponseSchema
>;

export type WorkbenchCustomerLastConversationResponse = Static<
  typeof WorkbenchCustomerLastConversationResponseSchema
>;

export type WorkbenchCustomerDetailResponse = Static<
  typeof WorkbenchCustomerDetailResponseSchema
>;

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
