import {
  type WorkbenchConversationDeleteResponse,
  type WorkbenchConversationListResponse,
  type WorkbenchSeatDto,
  type WorkbenchConversationFullAutoResponse,
  type WorkbenchConversationClearHandoffResponse,
  type WorkbenchFullAutoAnswerStatusResponse,
  type WorkbenchConversationPinResponse,
  type WorkbenchConversationReadResponse,
  type WorkbenchConversationUnpinResponse,
  type WorkbenchConversationUnreadResponse,
  type WorkbenchConversationSummaryDto,
  type WorkbenchCustomerListResponse,
  type WorkbenchCustomerLastConversationResponse,
  type WorkbenchCustomerRelationConversationsResponse,
  type WorkbenchCustomerSeatRelationsResponse,
  type WorkbenchHistoryMessagePageDto,
  type WorkbenchHistoryMessageQuery,
  type WorkbenchChatRecordDetailResponse,
  type WorkbenchGroupMembersResponse,
  type WorkbenchEnterpriseMemberListResponse,
  type WorkbenchKickGroupMemberRequest,
  type WorkbenchKickGroupMemberResponse,
  type WorkbenchPullGroupMembersRequest,
  type WorkbenchPullGroupMembersResponse,
  type WorkbenchSubUserDto,
  type WorkbenchMessageDto,
  type WorkbenchMessageQueryBySeqsRequest,
  type WorkbenchMessageQueryBySeqsResponse,
  type WorkbenchMessageFileDownloadResponse,
  type WorkbenchMessageFileDownloadStatusResponse,
  type WorkbenchMessagePageDto,
  type WorkbenchPollRequest,
  type WorkbenchPollResponse,
  type WorkbenchSmartReplyAttachmentsRequest,
  type WorkbenchSmartReplyAttachmentsResponse,
  type WorkbenchSmartReplyAutoGeneralAnswerRequest,
  type WorkbenchSmartReplyAutoGeneralAnswerResponse,
  type WorkbenchSmartReplyGeneralAnswerRequest,
  type WorkbenchSmartReplyGeneralAnswerResponse,
  type WorkbenchSmartReplyMakeShorterRequest,
  type WorkbenchSmartReplyMakeShorterResponse,
  type ComposerAiEditRequest,
  type ComposerAiEditResponse,
  type WorkbenchSmartReplySendAnswerRequest,
  type WorkbenchSmartReplySendAnswerResponse,
  type WorkbenchSmartReplyPollRequest,
  type WorkbenchSmartReplyPollResponse,
  type WorkbenchKnowledgePageRequest,
  type WorkbenchKnowledgePageResponse,
  type WorkbenchKnowledgeConfigRequest,
  type WorkbenchKnowledgeConfigResponse,
  type WorkbenchKnowledgeDocPageRequest,
  type WorkbenchKnowledgeDocPageResponse,
  type WorkbenchKnowledgeFaqAddRequest,
  type WorkbenchKnowledgeFaqAddResponse,
  type WorkbenchSmartHeartbeatRequest,
  type WorkbenchSmartHeartbeatResponse,
  type WorkbenchSmartReplyTextModerationRequest,
  type WorkbenchSmartReplyTextModerationResponse,
  type WorkbenchRevokeMessageResponse,
  type WorkbenchRetryMessageRequest,
  type WorkbenchSendFailReasonRequest,
  type WorkbenchSendFailReasonResponse,
  type WorkbenchVoicePlaybackConfirmRequest,
  type WorkbenchVoicePlaybackConfirmResponse,
  type WorkbenchVoiceTranscriptionRequest,
  type WorkbenchVoiceTranscriptionResponse,
  type WorkbenchSendMessagePayload,
  type SettingsSidebarItemsResponse,
  type WorkbenchSidebarIframeParamsDto,
  type WorkbenchSendMessageResponse,
  type WorkbenchTakeOverSeatResponse,
  type WorkbenchUploadCredentialResponse,
  type WorkbenchSearchResponseDto,
  type WorkbenchSeatAgentModeSwitchRequest,
  type WorkbenchSeatAgentModeSwitchResponse,
  type WorkbenchGetOrCreateConversationRequestDto,
  type WorkbenchMaterialCollectionCreateRequest,
  type WorkbenchMaterialCollectionCreateResponse,
  type WorkbenchMaterialCollectionGroupCreateRequest,
  type WorkbenchMaterialCollectionGroupCreateResponse,
  type WorkbenchMaterialCollectionGroupListRequest,
  type WorkbenchMaterialCollectionGroupListResponse,
  type WorkbenchMaterialCollectionGroupUpdateRequest,
  type WorkbenchMaterialCollectionListRequest,
  type WorkbenchMaterialCollectionListResponse,
  type WorkbenchMaterialCollectionMoveRequest,
  type WorkbenchMaterialCollectionOkResponse,
  type WorkbenchMaterialCollectionUpdateRequest,
} from "@chatai/contracts";
import type {
  ChatMode,
} from "@/pages/chat/chat-types";

export type WorkbenchConversationListOptions = {
  cursor?: string;
  limit?: number;
  mode?: ChatMode;
  unreadOnly?: boolean;
};

export type WorkbenchService = {
  __mock?: {
    appendMessage: (
      conversationId: string,
      message: Omit<WorkbenchMessageDto, "conversationId" | "seq"> & {
        conversationId?: string;
        seq?: number;
      },
    ) => Promise<WorkbenchMessageDto>;
    revokeMessage: (conversationId: string, messageSeq: number) => Promise<void>;
  };
  deleteConversation: (conversationId: string) => Promise<WorkbenchConversationDeleteResponse>;
  getSeats: () => Promise<WorkbenchSeatDto[]>;
  getEnterpriseMembers: () => Promise<WorkbenchEnterpriseMemberListResponse>;
  getConversations: (
    seatId: string,
    options?: WorkbenchConversationListOptions,
  ) => Promise<WorkbenchConversationListResponse>;
  getConversation: (conversationId: string) => Promise<WorkbenchConversationSummaryDto>;
  getMe: () => Promise<WorkbenchSubUserDto>;
  getCustomers: (options: {
    cursor?: string;
    keyword?: string;
    limit?: number;
    scope: "all" | "mine";
    seatIds?: string[];
  }) => Promise<WorkbenchCustomerListResponse>;
  getCustomerLastConversation: (
    thirdExternalUserId: string,
  ) => Promise<WorkbenchCustomerLastConversationResponse>;
  getCustomerRelationConversations: (
    thirdExternalUserId: string,
    thirdUserIds: string[],
  ) => Promise<WorkbenchCustomerRelationConversationsResponse>;
  getCustomerSeatRelations: (
    thirdExternalUserId: string,
  ) => Promise<WorkbenchCustomerSeatRelationsResponse>;
  /** 未配置或未接入数据库时可为 `null` */
  getSidebarIframeParams: (input: {
    conversationId: string;
    seatId: string;
  }) => Promise<WorkbenchSidebarIframeParamsDto | null>;
  getHistoryMessages: (
    conversationId: string,
    options?: WorkbenchHistoryMessageQuery,
  ) => Promise<WorkbenchHistoryMessagePageDto>;
  getSidebarItems: () => Promise<SettingsSidebarItemsResponse>;
  getMessages: (conversationId: string, options?: { beforeSeq?: number; limit?: number }) => Promise<WorkbenchMessagePageDto>;
  getMessagesBySeqs: (
    input: WorkbenchMessageQueryBySeqsRequest,
  ) => Promise<WorkbenchMessageQueryBySeqsResponse>;
  getChatRecordDetail: (input: {
    conversationId: string;
    messageSeq: number;
  }) => Promise<WorkbenchChatRecordDetailResponse>;
  revokeMessage: (input: {
    conversationId: string;
    messageSeq: number;
  }) => Promise<WorkbenchRevokeMessageResponse>;
  downloadMessageFile: (input: {
    conversationId: string;
    msgInfoId: number;
  }) => Promise<WorkbenchMessageFileDownloadResponse>;
  getMessageFileDownloadStatus: (input: {
    conversationId: string;
    messageSeq: number;
  }) => Promise<WorkbenchMessageFileDownloadStatusResponse | undefined>;
  confirmVoicePlaybackReady: (
    input: WorkbenchVoicePlaybackConfirmRequest,
  ) => Promise<WorkbenchVoicePlaybackConfirmResponse>;
  transcribeVoiceMessage: (
    input: WorkbenchVoiceTranscriptionRequest,
  ) => Promise<WorkbenchVoiceTranscriptionResponse>;
  getGroupMembers: (conversationId: string) => Promise<WorkbenchGroupMembersResponse>;
  pullGroupMembers: (
    conversationId: string,
    request: WorkbenchPullGroupMembersRequest,
  ) => Promise<WorkbenchPullGroupMembersResponse>;
  kickGroupMember: (
    conversationId: string,
    request: WorkbenchKickGroupMemberRequest,
  ) => Promise<WorkbenchKickGroupMemberResponse>;
  getUploadCredential: (conversationId: string) => Promise<WorkbenchUploadCredentialResponse>;
  markConversationRead: (conversationId: string) => Promise<WorkbenchConversationReadResponse>;
  markConversationUnread: (conversationId: string) => Promise<WorkbenchConversationUnreadResponse>;
  pinConversation: (conversationId: string) => Promise<WorkbenchConversationPinResponse>;
  changeConversationFullAuto: (
    conversationId: string,
    request: { enabled: boolean },
  ) => Promise<WorkbenchConversationFullAutoResponse>;
  clearConversationHandoff: (
    conversationId: string,
  ) => Promise<WorkbenchConversationClearHandoffResponse>;
  updateSeatAgentMode: (
    seatId: string,
    request: WorkbenchSeatAgentModeSwitchRequest,
  ) => Promise<WorkbenchSeatAgentModeSwitchResponse>;
  getFullAutoAnswerStatus: (
    conversationId: string,
  ) => Promise<WorkbenchFullAutoAnswerStatusResponse>;
  poll: (request: WorkbenchPollRequest) => Promise<WorkbenchPollResponse>;
  pollSmartReplies: (
    request: WorkbenchSmartReplyPollRequest,
  ) => Promise<WorkbenchSmartReplyPollResponse>;
  requestSmartReplyGeneralAnswer: (
    request: WorkbenchSmartReplyGeneralAnswerRequest,
  ) => Promise<WorkbenchSmartReplyGeneralAnswerResponse>;
  requestSmartReplyAutoGeneralAnswer: (
    request: WorkbenchSmartReplyAutoGeneralAnswerRequest,
  ) => Promise<WorkbenchSmartReplyAutoGeneralAnswerResponse>;
  requestSmartReplyMakeShorter: (
    request: WorkbenchSmartReplyMakeShorterRequest,
  ) => Promise<WorkbenchSmartReplyMakeShorterResponse>;
  rewriteComposerText: (
    request: ComposerAiEditRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<ComposerAiEditResponse>;
  sendSmartReplyAnswer: (
    request: WorkbenchSmartReplySendAnswerRequest,
  ) => Promise<WorkbenchSmartReplySendAnswerResponse>;
  listSmartReplyAttachments: (
    request: WorkbenchSmartReplyAttachmentsRequest,
  ) => Promise<WorkbenchSmartReplyAttachmentsResponse>;
  checkSmartReplyTextModeration: (
    request: WorkbenchSmartReplyTextModerationRequest,
  ) => Promise<WorkbenchSmartReplyTextModerationResponse>;
  listKnowledgePage: (
    request: WorkbenchKnowledgePageRequest,
  ) => Promise<WorkbenchKnowledgePageResponse>;
  getKnowledgeConfig: (
    request: WorkbenchKnowledgeConfigRequest,
  ) => Promise<WorkbenchKnowledgeConfigResponse>;
  listKnowledgeDocPage: (
    request: WorkbenchKnowledgeDocPageRequest,
  ) => Promise<WorkbenchKnowledgeDocPageResponse>;
  addSmartReplyKnowledgeFaq: (
    request: WorkbenchKnowledgeFaqAddRequest,
  ) => Promise<WorkbenchKnowledgeFaqAddResponse>;
  sendSmartHeartbeat: (
    request: WorkbenchSmartHeartbeatRequest,
  ) => Promise<WorkbenchSmartHeartbeatResponse>;
  sendMessage: (payload: WorkbenchSendMessagePayload) => Promise<WorkbenchSendMessageResponse>;
  retryMessage: (
    request: WorkbenchRetryMessageRequest,
  ) => Promise<WorkbenchSendMessageResponse>;
  getSendFailReason: (
    request: WorkbenchSendFailReasonRequest,
  ) => Promise<WorkbenchSendFailReasonResponse>;
  takeOverSeat: (seatId: string) => Promise<WorkbenchTakeOverSeatResponse>;
  unpinConversation: (conversationId: string) => Promise<WorkbenchConversationUnpinResponse>;
  search: (seatId: string, keyword: string) => Promise<WorkbenchSearchResponseDto>;
  getOrCreateConversation: (payload: WorkbenchGetOrCreateConversationRequestDto) => Promise<WorkbenchConversationSummaryDto>;
  listMaterialCollections: (
    request: WorkbenchMaterialCollectionListRequest,
  ) => Promise<WorkbenchMaterialCollectionListResponse>;
  listMaterialGroups: (
    request: WorkbenchMaterialCollectionGroupListRequest,
  ) => Promise<WorkbenchMaterialCollectionGroupListResponse>;
  collectMaterial: (
    request: WorkbenchMaterialCollectionCreateRequest,
  ) => Promise<WorkbenchMaterialCollectionCreateResponse>;
  deleteMaterialCollection: (
    collectionId: string,
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  topMaterialCollection: (
    collectionId: string,
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  moveMaterialCollection: (
    collectionId: string,
    request: WorkbenchMaterialCollectionMoveRequest,
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  updateMaterialCollection: (
    collectionId: string,
    request: WorkbenchMaterialCollectionUpdateRequest,
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  createMaterialGroup: (
    request: WorkbenchMaterialCollectionGroupCreateRequest,
  ) => Promise<WorkbenchMaterialCollectionGroupCreateResponse>;
  renameMaterialGroup: (
    groupId: string,
    bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
    request: WorkbenchMaterialCollectionGroupUpdateRequest,
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  topMaterialGroup: (
    groupId: string,
    bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  deleteMaterialGroup: (
    groupId: string,
    bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
};

export type WorkbenchServiceMode = "mock" | "http";
