import type {
  WorkbenchBroadcastProtectionStatusDto,
  WorkbenchConversationClearHandoffResponse,
  WorkbenchConversationDeleteResponse,
  WorkbenchConversationFullAutoResponse,
  WorkbenchConversationListResponse,
  WorkbenchConversationPinResponse,
  WorkbenchConversationReadResponse,
  WorkbenchConversationUnpinResponse,
  WorkbenchConversationUnreadResponse,
  WorkbenchGroupMembersResponse,
  WorkbenchKickGroupMemberRequest,
  WorkbenchKickGroupMemberResponse,
  WorkbenchPullGroupMembersRequest,
  WorkbenchPullGroupMembersResponse,
  WorkbenchEnterpriseMemberListResponse,
  WorkbenchEnterpriseMemberDto,
  WorkbenchHistoryMessagePageDto,
  WorkbenchHistoryMessageQuery,
  WorkbenchChatRecordDetailResponse,
  WorkbenchMessageDto,
  WorkbenchMessageFileDownloadResponse,
  WorkbenchMessageFileDownloadStatusResponse,
  WorkbenchMessagePageDto,
  WorkbenchMessageQueryBySeqsResponse,
  WorkbenchOutgoingMessageSegment,
  WorkbenchPollRequest,
  WorkbenchPollResponse,
  WorkbenchSmartReplyAttachmentsRequest,
  WorkbenchSmartReplyAttachmentsResponse,
  WorkbenchSmartReplyAutoGeneralAnswerRequest,
  WorkbenchSmartReplyAutoGeneralAnswerResponse,
  WorkbenchSmartReplyGeneralAnswerRequest,
  WorkbenchSmartReplyGeneralAnswerResponse,
  WorkbenchSmartReplyPollRequest,
  WorkbenchSmartReplyPollResponse,
  WorkbenchKnowledgePageRequest,
  WorkbenchKnowledgePageResponse,
  WorkbenchKnowledgeConfigRequest,
  WorkbenchKnowledgeConfigResponse,
  WorkbenchKnowledgeDocPageRequest,
  WorkbenchKnowledgeDocPageResponse,
  WorkbenchKnowledgeFaqAddRequest,
  WorkbenchKnowledgeFaqAddResponse,
  WorkbenchSmartHeartbeatRequest,
  WorkbenchSmartHeartbeatResponse,
  WorkbenchSmartReplyTextModerationRequest,
  WorkbenchSmartReplyTextModerationResponse,
  WorkbenchSmartReplyMakeShorterRequest,
  WorkbenchSmartReplyMakeShorterResponse,
  WorkbenchSmartReplySendAnswerRequest,
  WorkbenchSmartReplySendAnswerResponse,
  WorkbenchRevokeMessageResponse,
  WorkbenchRetryMessageRequest,
  WorkbenchSendFailReasonRequest,
  WorkbenchSendFailReasonResponse,
  WorkbenchSeatAgentModeSwitchRequest,
  WorkbenchSeatAgentModeSwitchResponse,
  WorkbenchSeatDto,
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchSidebarIframeParamsDto,
  WorkbenchSidebarIframeParamsRequest,
  WorkbenchSubUserDto,
  WorkbenchTakeOverSeatResponse,
  WorkbenchUploadCredentialResponse,
  WorkbenchSearchResponseDto,
  WorkbenchGetOrCreateConversationRequestDto,
  WorkbenchConversationSummaryDto,
  WorkbenchFullAutoAnswerStatusResponse,
  WorkbenchVoicePlaybackConfirmRequest,
  WorkbenchVoicePlaybackConfirmResponse,
  WorkbenchVoiceTranscriptionRequest,
  WorkbenchVoiceTranscriptionResponse,
  WorkbenchCustomerListResponse,
  WorkbenchCustomerSummaryDto,
  WorkbenchCustomerLastConversationResponse,
  WorkbenchCustomerRelationConversationsResponse,
  WorkbenchCustomerSeatRelationsResponse,
  WorkbenchMaterialCollectionCreateRequest,
  WorkbenchMaterialCollectionCreateResponse,
  WorkbenchMaterialCollectionGroupCreateRequest,
  WorkbenchMaterialCollectionGroupCreateResponse,
  WorkbenchMaterialCollectionGroupListRequest,
  WorkbenchMaterialCollectionGroupListResponse,
  WorkbenchMaterialCollectionGroupUpdateRequest,
  WorkbenchMaterialCollectionListRequest,
  WorkbenchMaterialCollectionListResponse,
  WorkbenchMaterialCollectionMoveRequest,
  WorkbenchMaterialCollectionOkResponse,
  WorkbenchMaterialCollectionUpdateRequest,
  WorkbenchQuickReplyBatchCreateRequest,
  WorkbenchQuickReplyBatchCreateResponse,
  WorkbenchQuickReplyCategoryCreateRequest,
  WorkbenchQuickReplyCategoryEnsureRequest,
  WorkbenchQuickReplyCategoryEnsureResponse,
  WorkbenchQuickReplyCategoryEnsureSuccessResponse,
  WorkbenchQuickReplyCategoryContentRequest,
  WorkbenchQuickReplyCategoryContentResponse,
  WorkbenchQuickReplyCategoryListRequest,
  WorkbenchQuickReplyCategoryListResponse,
  WorkbenchQuickReplyCategoryMoveRequest,
  WorkbenchQuickReplyCategorySortRequest,
  WorkbenchQuickReplyCategoryUpdateRequest,
  WorkbenchQuickReplyCreateRequest,
  WorkbenchQuickReplyDto,
  WorkbenchQuickReplyImportRowError,
  WorkbenchQuickReplyListRequest,
  WorkbenchQuickReplyListResponse,
  WorkbenchQuickReplyMoveRequest,
  WorkbenchQuickReplyOkResponse,
  WorkbenchQuickReplySortRequest,
  WorkbenchQuickReplyUpdateRequest,
} from "@chatai/contracts";
import {
  CUSTOMER_SEAT_RELATION_PREVIEW_LIMIT,
  CHAT_TYPE,
  MATERIAL_COLLECTION_BIZ_TYPE,
  WORKBENCH_ENTERPRISE_MEMBER_MAX_ITEMS,
} from "@chatai/contracts";
import {
  BadGatewayError,
  BadRequestError,
  ForbiddenError,
  AppError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors.js";
import { chatAiSubAccountTypes } from "../auth/permissions.js";
import { noopLogger, type AppLogger } from "../../shared/logger.js";
import type {
  JavaSendMessageData,
  WorkbenchJavaClient,
} from "./workbench-java-client.js";
import {
  JAVA_MESSAGE_SOURCE,
  JAVA_MENTION_HIT_TYPE,
  JAVA_MENTION_LOCATION,
  JAVA_SEND_TYPE,
} from "./workbench-java-client.js";
import { buildSidebarIframeTuseCipherTexts } from "../../lib/tuse-crypto.js";
import {
  type ConversationLookup,
  decodeConversationListCursor,
  parseMySqlId,
  type TenantSeatIdentity,
  type WorkbenchSeatAccessScope,
  type WorkbenchRepository,
} from "./workbench-repository.js";
import {
  getPlayableMediaHost,
  isPlayableVoicePathname,
  toPlayableVoicePathname,
} from "./media-config.js";
import {
  normalizeMediaAssetUrl,
  parseJsonRecordOrEmpty as parseMaterialContentRecord,
  readTrimmedRecordString as readMaterialString,
} from "./workbench-content-utils.js";
import {
  getCurrentWorkbenchPlatformScope,
  type AuthenticatedWorkbenchScope,
  type WorkbenchPlatformScope,
} from "../workbench-platform-scope.js";
import { WorkbenchAccess } from "./workbench-access.js";
import { WorkbenchKnowledgeService } from "./workbench-knowledge.service.js";
import { WorkbenchMaterialService } from "./workbench-material.service.js";
import { WorkbenchQuickReplyService } from "./workbench-quick-reply.service.js";
import { WorkbenchGroupMemberService } from "./workbench-group-member.service.js";
import { WorkbenchSmartReplyService } from "./workbench-smart-reply.service.js";

const POLL_CONVERSATION_CHANGE_LIMIT = 500;
const POLL_LAST_MESSAGE_OVERLAP_MS = 1;
const POLL_MESSAGE_UPDATE_LIMIT = 200;
const POLL_SEAT_UPDATE_LIMIT = 200;
const PLAYABLE_VOICE_HEAD_TIMEOUT_MS = 8000;
const MESSAGE_REVOKE_WINDOW_MS = 180 * 1000;
const MESSAGE_REVOKE_CLOCK_SKEW_TOLERANCE_MS = 5 * 1000;
const FULL_AUTO_SYSTEM_MESSAGE_DEDUPE_WINDOW_MS = 120 * 1000;
const SMART_REPLY_MESSAGE_PAGE_CANDIDATE_LIMIT = 5;
const SMART_REPLY_TRIGGER_RAW_MSGTYPES = new Set(["text", "image", "voice"]);
const DEFAULT_H5_COVER_URL = "https://b5.bokr.com.cn/dist/default-cover.png";

type SmartReplyMessagePageMetadata = {
  smartReplyScope?: {
    chatType: number;
    thirdExternalId: string;
    thirdGroupId?: string;
    thirdUserId: string;
    uid: number;
  };
};

type MessagePageWithSmartReplyMetadata = WorkbenchMessagePageDto &
  SmartReplyMessagePageMetadata;

function getMessageSourceThirdUserId(conversation: ConversationLookup) {
  return conversation.messageSourceThirdUserId || conversation.thirdUserId;
}

type PlayableVoiceExistsChecker = (playbackUrl: string) => Promise<boolean>;

function collectSmartReplyMessagePageCandidateIds(messages: WorkbenchMessageDto[]) {
  const seen = new Set<number>();
  const msgIds: number[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.senderType !== "customer") {
      continue;
    }

    const rawMsgtype = message.rawMsgtype?.trim();

    if (!rawMsgtype || !SMART_REPLY_TRIGGER_RAW_MSGTYPES.has(rawMsgtype)) {
      continue;
    }

    const seq = message.seq;

    if (!Number.isSafeInteger(seq) || seq <= 0 || seen.has(seq)) {
      continue;
    }

    seen.add(seq);
    msgIds.unshift(seq);

    if (msgIds.length >= SMART_REPLY_MESSAGE_PAGE_CANDIDATE_LIMIT) {
      break;
    }
  }

  return msgIds;
}

export type WorkbenchService = {
  getBroadcastProtectionStatus(
    uid: number,
  ):
    | Promise<WorkbenchBroadcastProtectionStatusDto>
    | WorkbenchBroadcastProtectionStatusDto;
  changeConversationFullAuto(
    subUserId: string,
    conversationId: string,
    request: { enabled: boolean },
  ):
    | Promise<WorkbenchConversationFullAutoResponse>
    | WorkbenchConversationFullAutoResponse;
  clearConversationHandoff(
    subUserId: string,
    conversationId: string,
  ):
    | Promise<WorkbenchConversationClearHandoffResponse>
    | WorkbenchConversationClearHandoffResponse;
  deleteConversation(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationDeleteResponse> | WorkbenchConversationDeleteResponse;
  /** 按席位与会话在服务端签发侧栏 iframe 参数（不含 secret/iv） */
  getSidebarIframeParams(
    subUserId: string,
    input: WorkbenchSidebarIframeParamsRequest,
  ):
    | Promise<WorkbenchSidebarIframeParamsDto>
    | WorkbenchSidebarIframeParamsDto;
  getConversations(
    subUserId: string,
    seatId: string,
    options?: {
      cursor?: string;
      limit?: number;
      mode?: "single" | "group";
      unreadOnly?: boolean;
    },
  ): Promise<WorkbenchConversationListResponse> | WorkbenchConversationListResponse;
  getConversation(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationSummaryDto> | WorkbenchConversationSummaryDto;
  getMe(subUserId: string): Promise<WorkbenchSubUserDto> | WorkbenchSubUserDto;
  getMessages(
    subUserId: string,
    conversationId: string,
    options?: { beforeSeq?: number; limit?: number },
  ): Promise<WorkbenchMessagePageDto> | WorkbenchMessagePageDto;
  getFullAutoAnswerStatus(
    subUserId: string,
    conversationId: string,
  ):
    | Promise<WorkbenchFullAutoAnswerStatusResponse>
    | WorkbenchFullAutoAnswerStatusResponse;
  getMessagesBySeqs(
    subUserId: string,
    conversationId: string,
    messageSeqs: number[],
  ): Promise<WorkbenchMessageQueryBySeqsResponse> | WorkbenchMessageQueryBySeqsResponse;
  getChatRecordDetail(
    subUserId: string,
    conversationId: string,
    msgInfoId: number,
  ): Promise<WorkbenchChatRecordDetailResponse> | WorkbenchChatRecordDetailResponse;
  getHistoryMessages(
    subUserId: string,
    conversationId: string,
    options?: WorkbenchHistoryMessageQuery,
  ): Promise<WorkbenchHistoryMessagePageDto> | WorkbenchHistoryMessagePageDto;
  downloadMessageFile(
    subUserId: string,
    conversationId: string,
    msgInfoId: number,
  ): Promise<WorkbenchMessageFileDownloadResponse> | WorkbenchMessageFileDownloadResponse;
  confirmVoicePlaybackReady(
    subUserId: string,
    input: WorkbenchVoicePlaybackConfirmRequest,
  ):
    | Promise<WorkbenchVoicePlaybackConfirmResponse>
    | WorkbenchVoicePlaybackConfirmResponse;
  transcribeVoiceMessage(
    subUserId: string,
    input: WorkbenchVoiceTranscriptionRequest,
  ):
    | Promise<WorkbenchVoiceTranscriptionResponse>
    | WorkbenchVoiceTranscriptionResponse;
  getMessageFileDownloadStatus(
    subUserId: string,
    conversationId: string,
    messageSeq: number,
  ):
    | Promise<WorkbenchMessageFileDownloadStatusResponse | undefined>
    | WorkbenchMessageFileDownloadStatusResponse
    | undefined;
  getGroupMembers(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchGroupMembersResponse> | WorkbenchGroupMembersResponse;
  pullGroupMembers(
    subUserId: string,
    conversationId: string,
    request: WorkbenchPullGroupMembersRequest,
  ): Promise<WorkbenchPullGroupMembersResponse> | WorkbenchPullGroupMembersResponse;
  kickGroupMember(
    subUserId: string,
    conversationId: string,
    request: WorkbenchKickGroupMemberRequest,
  ): Promise<WorkbenchKickGroupMemberResponse> | WorkbenchKickGroupMemberResponse;
  getUploadCredential(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchUploadCredentialResponse> | WorkbenchUploadCredentialResponse;
  getSeats(subUserId: string): Promise<WorkbenchSeatDto[]> | WorkbenchSeatDto[];
  getEnterpriseMembers(
    subUserId: string,
  ): Promise<WorkbenchEnterpriseMemberListResponse> | WorkbenchEnterpriseMemberListResponse;
  getCustomers(
    subUserId: string,
    options: {
      cursor?: string;
      keyword?: string;
      limit?: number;
      scope: "all" | "mine";
      seatIds?: string[];
    },
  ): Promise<WorkbenchCustomerListResponse> | WorkbenchCustomerListResponse;
  getAccessibleCustomer(
    subUserId: string,
    options: {
      scope: "all" | "mine";
      thirdExternalUserId: string;
    },
  ):
    | Promise<WorkbenchCustomerSummaryDto | undefined>
    | WorkbenchCustomerSummaryDto
    | undefined;
  getCustomerLastConversation(
    subUserId: string,
    thirdExternalUserId: string,
  ):
    | Promise<WorkbenchCustomerLastConversationResponse>
    | WorkbenchCustomerLastConversationResponse;
  getCustomerRelationConversations(
    subUserId: string,
    thirdExternalUserId: string,
    thirdUserIds: string[],
  ):
    | Promise<WorkbenchCustomerRelationConversationsResponse>
    | WorkbenchCustomerRelationConversationsResponse;
  getCustomerSeatRelations(
    subUserId: string,
    thirdExternalUserId: string,
  ):
    | Promise<WorkbenchCustomerSeatRelationsResponse>
    | WorkbenchCustomerSeatRelationsResponse;
  markConversationRead(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationReadResponse> | WorkbenchConversationReadResponse;
  markConversationUnread(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationUnreadResponse> | WorkbenchConversationUnreadResponse;
  pinConversation(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationPinResponse> | WorkbenchConversationPinResponse;
  poll(
    subUserId: string,
    request: WorkbenchPollRequest,
  ): Promise<WorkbenchPollResponse> | WorkbenchPollResponse;
  pollSmartReplies(
    subUserId: string,
    request: WorkbenchSmartReplyPollRequest,
  ):
    | Promise<WorkbenchSmartReplyPollResponse>
    | WorkbenchSmartReplyPollResponse;
  requestSmartReplyGeneralAnswer(
    subUserId: string,
    request: WorkbenchSmartReplyGeneralAnswerRequest,
  ):
    | Promise<WorkbenchSmartReplyGeneralAnswerResponse>
    | WorkbenchSmartReplyGeneralAnswerResponse;
  requestSmartReplyAutoGeneralAnswer(
    subUserId: string,
    request: WorkbenchSmartReplyAutoGeneralAnswerRequest,
  ):
    | Promise<WorkbenchSmartReplyAutoGeneralAnswerResponse>
    | WorkbenchSmartReplyAutoGeneralAnswerResponse;
  requestSmartReplyMakeShorter(
    subUserId: string,
    request: WorkbenchSmartReplyMakeShorterRequest,
  ):
    | Promise<WorkbenchSmartReplyMakeShorterResponse>
    | WorkbenchSmartReplyMakeShorterResponse;
  sendSmartReplyAnswer(
    subUserId: string,
    request: WorkbenchSmartReplySendAnswerRequest,
  ):
    | Promise<WorkbenchSmartReplySendAnswerResponse>
    | WorkbenchSmartReplySendAnswerResponse;
  listSmartReplyAttachments(
    subUserId: string,
    request: WorkbenchSmartReplyAttachmentsRequest,
  ):
    | Promise<WorkbenchSmartReplyAttachmentsResponse>
    | WorkbenchSmartReplyAttachmentsResponse;
  checkSmartReplyTextModeration(
    subUserId: string,
    request: WorkbenchSmartReplyTextModerationRequest,
  ):
    | Promise<WorkbenchSmartReplyTextModerationResponse>
    | WorkbenchSmartReplyTextModerationResponse;
  listKnowledgePage(
    subUserId: string,
    request: WorkbenchKnowledgePageRequest,
  ): Promise<WorkbenchKnowledgePageResponse> | WorkbenchKnowledgePageResponse;
  getKnowledgeConfig(
    subUserId: string,
    request: WorkbenchKnowledgeConfigRequest,
  ): Promise<WorkbenchKnowledgeConfigResponse> | WorkbenchKnowledgeConfigResponse;
  listKnowledgeDocPage(
    subUserId: string,
    request: WorkbenchKnowledgeDocPageRequest,
  ): Promise<WorkbenchKnowledgeDocPageResponse> | WorkbenchKnowledgeDocPageResponse;
  addKnowledgeFaq(
    subUserId: string,
    request: WorkbenchKnowledgeFaqAddRequest,
  ): Promise<WorkbenchKnowledgeFaqAddResponse> | WorkbenchKnowledgeFaqAddResponse;
  sendSmartHeartbeat(
    subUserId: string,
    request: WorkbenchSmartHeartbeatRequest,
  ): Promise<WorkbenchSmartHeartbeatResponse> | WorkbenchSmartHeartbeatResponse;
  revokeMessage(
    subUserId: string,
    conversationId: string,
    messageSeq: number,
  ): Promise<WorkbenchRevokeMessageResponse> | WorkbenchRevokeMessageResponse;
  sendMessage(
    subUserId: string,
    payload: WorkbenchSendMessagePayload,
  ): Promise<WorkbenchSendMessageResponse> | WorkbenchSendMessageResponse;
  retryMessage(
    subUserId: string,
    payload: WorkbenchRetryMessageRequest,
  ): Promise<WorkbenchSendMessageResponse> | WorkbenchSendMessageResponse;
  getSendFailReason(
    subUserId: string,
    payload: WorkbenchSendFailReasonRequest,
  ): Promise<WorkbenchSendFailReasonResponse> | WorkbenchSendFailReasonResponse;
  takeOverSeat(
    subUserId: string,
    seatId: string,
  ): Promise<WorkbenchTakeOverSeatResponse> | WorkbenchTakeOverSeatResponse;
  updateSeatAgentModeSwitch(
    subUserId: string,
    seatId: string,
    request: WorkbenchSeatAgentModeSwitchRequest,
  ):
    | Promise<WorkbenchSeatAgentModeSwitchResponse>
    | WorkbenchSeatAgentModeSwitchResponse;
  unpinConversation(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationUnpinResponse> | WorkbenchConversationUnpinResponse;
  search(
    subUserId: string,
    seatId: string,
    keyword: string,
  ): Promise<WorkbenchSearchResponseDto> | WorkbenchSearchResponseDto;
  getOrCreateConversation(
    subUserId: string,
    payload: WorkbenchGetOrCreateConversationRequestDto,
  ): Promise<WorkbenchConversationSummaryDto> | WorkbenchConversationSummaryDto;
  listMaterialCollections(
    subUserId: string,
    request: WorkbenchMaterialCollectionListRequest,
  ):
    | Promise<WorkbenchMaterialCollectionListResponse>
    | WorkbenchMaterialCollectionListResponse;
  listMaterialGroups(
    subUserId: string,
    request: WorkbenchMaterialCollectionGroupListRequest,
  ):
    | Promise<WorkbenchMaterialCollectionGroupListResponse>
    | WorkbenchMaterialCollectionGroupListResponse;
  collectMaterial(
    subUserId: string,
    request: WorkbenchMaterialCollectionCreateRequest,
  ):
    | Promise<WorkbenchMaterialCollectionCreateResponse>
    | WorkbenchMaterialCollectionCreateResponse;
  deleteMaterialCollection(
    subUserId: string,
    collectionId: string,
  ): Promise<WorkbenchMaterialCollectionOkResponse> | WorkbenchMaterialCollectionOkResponse;
  topMaterialCollection(
    subUserId: string,
    collectionId: string,
  ): Promise<WorkbenchMaterialCollectionOkResponse> | WorkbenchMaterialCollectionOkResponse;
  moveMaterialCollection(
    subUserId: string,
    collectionId: string,
    request: WorkbenchMaterialCollectionMoveRequest,
  ): Promise<WorkbenchMaterialCollectionOkResponse> | WorkbenchMaterialCollectionOkResponse;
  updateMaterialCollection(
    subUserId: string,
    collectionId: string,
    request: WorkbenchMaterialCollectionUpdateRequest,
  ): Promise<WorkbenchMaterialCollectionOkResponse> | WorkbenchMaterialCollectionOkResponse;
  createMaterialGroup(
    subUserId: string,
    request: WorkbenchMaterialCollectionGroupCreateRequest,
  ):
    | Promise<WorkbenchMaterialCollectionGroupCreateResponse>
    | WorkbenchMaterialCollectionGroupCreateResponse;
  renameMaterialGroup(
    subUserId: string,
    groupId: string,
    bizType: number,
    request: WorkbenchMaterialCollectionGroupUpdateRequest,
  ): Promise<WorkbenchMaterialCollectionOkResponse> | WorkbenchMaterialCollectionOkResponse;
  topMaterialGroup(
    subUserId: string,
    groupId: string,
    bizType: number,
  ): Promise<WorkbenchMaterialCollectionOkResponse> | WorkbenchMaterialCollectionOkResponse;
  deleteMaterialGroup(
    subUserId: string,
    groupId: string,
    bizType: number,
  ): Promise<WorkbenchMaterialCollectionOkResponse> | WorkbenchMaterialCollectionOkResponse;
  listQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryListRequest,
  ):
    | Promise<WorkbenchQuickReplyCategoryListResponse>
    | WorkbenchQuickReplyCategoryListResponse;
  ensureQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryEnsureRequest,
  ):
    | Promise<WorkbenchQuickReplyCategoryEnsureResponse>
    | WorkbenchQuickReplyCategoryEnsureResponse;
  listQuickReplyCategoryContent(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryContentRequest,
  ):
    | Promise<WorkbenchQuickReplyCategoryContentResponse>
    | WorkbenchQuickReplyCategoryContentResponse;
  createQuickReplyCategory(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryCreateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  renameQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeType: number,
    request: WorkbenchQuickReplyCategoryUpdateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  topQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeType: number,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  bottomQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeType: number,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  deleteQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeType: number,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  moveQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeType: number,
    request: WorkbenchQuickReplyCategoryMoveRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  sortQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategorySortRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  listQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplyListRequest,
  ): Promise<WorkbenchQuickReplyListResponse> | WorkbenchQuickReplyListResponse;
  createQuickReply(
    subUserId: string,
    request: WorkbenchQuickReplyCreateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  batchCreateQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplyBatchCreateRequest,
  ): Promise<WorkbenchQuickReplyBatchCreateResponse> | WorkbenchQuickReplyBatchCreateResponse;
  updateQuickReply(
    subUserId: string,
    quickReplyId: string,
    request: WorkbenchQuickReplyUpdateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  topQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeType: number,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  bottomQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeType: number,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  deleteQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeType: number,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  moveQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeType: number,
    request: WorkbenchQuickReplyMoveRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
  sortQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplySortRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> | WorkbenchQuickReplyOkResponse;
};

export class MysqlWorkbenchService implements WorkbenchService {
  private readonly access: WorkbenchAccess;
  private readonly knowledgeService: WorkbenchKnowledgeService;
  private readonly materialService: WorkbenchMaterialService;
  private readonly quickReplyService: WorkbenchQuickReplyService;
  private readonly groupMemberService: WorkbenchGroupMemberService;
  private readonly smartReplyService: WorkbenchSmartReplyService;

  constructor(
    private readonly repository: WorkbenchRepository,
    private readonly javaClient: WorkbenchJavaClient,
    private readonly logger: AppLogger = noopLogger,
    private readonly playableVoiceExists: PlayableVoiceExistsChecker =
      checkPlayableVoiceExists,
    private readonly workbenchScope: WorkbenchPlatformScope & { uid?: number } =
      getCurrentWorkbenchPlatformScope(),
  ) {
    this.access = new WorkbenchAccess(repository, workbenchScope);
    this.knowledgeService = new WorkbenchKnowledgeService(
      javaClient,
      this.access,
      logger,
    );
    this.materialService = new WorkbenchMaterialService(
      repository,
      javaClient,
      this.access,
      logger,
    );
    this.quickReplyService = new WorkbenchQuickReplyService(repository, this.access);
    this.groupMemberService = new WorkbenchGroupMemberService(
      repository,
      javaClient,
      this.access,
    );
    this.smartReplyService = new WorkbenchSmartReplyService(
      javaClient,
      this.access,
    );
  }

  async getBroadcastProtectionStatus(uid: number) {
    return this.javaClient.getBroadcastProtectionStatus({ uid });
  }

  async deleteConversation(subUserId: string, conversationId: string) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getOperableConversation(
      subUserId,
      conversationId,
      scope,
    );

    await this.javaClient.deleteConversation({
      conversationId: conversation.id,
      platform: conversation.platform,
      uid: conversation.uid,
    });
    await this.repository.hideConversation({
      conversationId: conversation.id,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    return {
      conversationId: conversation.id,
      seatId: conversation.seatId,
    };
  }

  async getMe(subUserId: string) {
    const subUser = await this.repository.getSubUser(subUserId);

    if (!subUser) {
      throw new UnauthorizedError();
    }

    return {
      displayName: subUser.displayName,
      subUserId: subUser.subUserId,
      uid: subUser.uid,
    };
  }

  async getSidebarIframeParams(
    subUserId: string,
    input: WorkbenchSidebarIframeParamsRequest,
  ): Promise<WorkbenchSidebarIframeParamsDto> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    await this.assertSeatAccess(subUserId, input.seatId, scope);

    const conversation = await this.repository.getConversationLookup(input.conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    if (conversation.seatId !== input.seatId) {
      throw new BadRequestError("CONVERSATION_SEAT_MISMATCH", "会话与席位不匹配");
    }

    const secrets = await this.repository.getEmbedUserRelationTuseSecrets(scope);

    if (!secrets) {
      throw new NotFoundError(
        "SIDEBAR_TUSE_CRYPTO_NOT_FOUND",
        "侧栏加密配置不存在或未启用",
      );
    }

    const cipherTexts = buildSidebarIframeTuseCipherTexts({
      aesIvUtf8Secret: secrets.ivParameter,
      aesKeyUtf8Secret: secrets.secret,
      thirdExternalUserId: conversation.thirdExternalUserId,
      thirdGroupId: conversation.thirdGroupId,
      thirdGroupName: conversation.thirdGroupName,
      thirdUserId: conversation.thirdUserId,
      unixSeconds: Math.floor(Date.now() / 1000),
    });

    return {
      mid: secrets.appId,
      ...cipherTexts,
    };
  }

  async getSeats(subUserId: string) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);

    return this.repository.listSeats(toSeatAccessScope(scope, subUserId));
  }

  async getEnterpriseMembers(subUserId: string): Promise<WorkbenchEnterpriseMemberListResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const seats = await this.repository.listTenantSeatIdentities(scope);

    return {
      items: mapTenantSeatsToEnterpriseMembers(seats),
    };
  }

  async getCustomers(
    subUserId: string,
    options: {
      cursor?: string;
      keyword?: string;
      limit?: number;
      scope: "all" | "mine";
      seatIds?: string[];
    },
  ): Promise<WorkbenchCustomerListResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);

    if (options.scope === "all") {
      return this.repository.listCustomers({
        cursor: options.cursor,
        keyword: options.keyword,
        limit: options.limit,
        platform: scope.platform,
        scope: "all",
        uid: scope.uid,
      });
    }

    return this.repository.listCustomers({
      cursor: options.cursor,
      keyword: options.keyword,
      limit: options.limit,
      platform: scope.platform,
      scope: "mine",
      seatIds: options.seatIds,
      subUserId,
      uid: scope.uid,
    });
  }

  async getAccessibleCustomer(
    subUserId: string,
    options: {
      scope: "all" | "mine";
      thirdExternalUserId: string;
    },
  ): Promise<WorkbenchCustomerSummaryDto | undefined> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);

    if (options.scope === "all") {
      return this.repository.getAccessibleCustomer({
        platform: scope.platform,
        scope: "all",
        thirdExternalUserId: options.thirdExternalUserId,
        uid: scope.uid,
      });
    }

    return this.repository.getAccessibleCustomer({
      platform: scope.platform,
      scope: "mine",
      subUserId,
      thirdExternalUserId: options.thirdExternalUserId,
      uid: scope.uid,
    });
  }

  async getCustomerLastConversation(
    subUserId: string,
    thirdExternalUserId: string,
  ): Promise<WorkbenchCustomerLastConversationResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);

    return {
      lastConversation: await this.repository.getCustomerLastConversation({
        platform: scope.platform,
        thirdExternalUserId,
        uid: scope.uid,
      }),
    };
  }

  async getCustomerRelationConversations(
    subUserId: string,
    thirdExternalUserId: string,
    thirdUserIds: string[],
  ): Promise<WorkbenchCustomerRelationConversationsResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);

    return {
      items: await this.repository.listCustomerRelationConversations({
        platform: scope.platform,
        thirdExternalUserId,
        thirdUserIds,
        uid: scope.uid,
      }),
    };
  }

  async getCustomerSeatRelations(
    subUserId: string,
    thirdExternalUserId: string,
  ): Promise<WorkbenchCustomerSeatRelationsResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const items = await this.repository.listAccessibleCustomerSeatRelations({
      limit: CUSTOMER_SEAT_RELATION_PREVIEW_LIMIT,
      platform: scope.platform,
      subUserId,
      thirdExternalUserId,
      uid: scope.uid,
    });

    if (items.length === 0) {
      return { items };
    }

    let conversationTimes: WorkbenchCustomerRelationConversationsResponse["items"];

    try {
      conversationTimes = await this.repository.listCustomerRelationConversations({
        platform: scope.platform,
        thirdExternalUserId,
        thirdUserIds: items.map((item) => item.thirdUserId),
        uid: scope.uid,
      });
    } catch (error) {
      this.logger.warn(
        {
          error,
          operation: "load-customer-seat-relation-conversation-times",
          subUserId,
          thirdExternalUserId,
          uid: scope.uid,
        },
        "Failed to load customer seat relation conversation times",
      );

      return { items };
    }

    const conversationTimeByThirdUserId = new Map(
      conversationTimes.map((item) => [item.thirdUserId, item.lastMessageTime]),
    );

    return {
      items: items.map((item) => {
        const lastMessageTime = conversationTimeByThirdUserId.get(item.thirdUserId);

        return lastMessageTime == null ? item : { ...item, lastMessageTime };
      }),
    };
  }

  async getConversations(
    subUserId: string,
    seatId: string,
    options?: {
      cursor?: string;
      limit?: number;
      mode?: "single" | "group";
      unreadOnly?: boolean;
    },
  ) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    await this.assertSeatAccess(subUserId, seatId, scope);
    const cursor = options?.cursor
      ? decodeConversationListCursor(options.cursor)
      : undefined;

    if (options?.cursor && !cursor) {
      throw new BadRequestError("INVALID_CONVERSATION_CURSOR", "会话分页游标无效");
    }

    return this.repository.listConversations(seatId, {
      cursor,
      limit: options?.limit,
      mode: options?.mode,
      unreadOnly: options?.unreadOnly,
    });
  }

  async getConversation(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationSummaryDto> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getAccessibleConversation(
      subUserId,
      conversationId,
      scope,
    );
    const hydrated = await this.repository.getHydratedConversation(
      conversation.uid,
      conversation.platform,
      conversation.thirdUserId,
      conversationId,
    );

    if (!hydrated) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    return hydrated;
  }

  async getMessages(
    subUserId: string,
    conversationId: string,
    options?: { beforeSeq?: number; limit?: number },
  ) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getAccessibleConversation(
      subUserId,
      conversationId,
      scope,
    );

    const page = (await this.repository.listMessages(conversationId, {
      beforeSeq: options?.beforeSeq,
      includeHiddenConversation: true,
      limit: options?.limit ?? 30,
    })) as MessagePageWithSmartReplyMetadata;
    const { smartReplyScope, ...publicPage } = page;

    if (options?.beforeSeq != null) {
      return publicPage;
    }

    if (!smartReplyScope) {
      return publicPage;
    }

    const msgIds = collectSmartReplyMessagePageCandidateIds(publicPage.messages);

    if (msgIds.length === 0) {
      return publicPage;
    }

    try {
      const smartReplies = await this.javaClient.listUserHistoryAnswers({
        chatType: smartReplyScope.chatType,
        msgIds,
        thirdExternalId: smartReplyScope.thirdExternalId,
        thirdGroupId: smartReplyScope.thirdGroupId,
        thirdUserId: smartReplyScope.thirdUserId,
        uid: smartReplyScope.uid,
      });

      return {
        ...publicPage,
        smartReplies: smartReplies.suggestions,
      };
    } catch (error) {
      this.logger.warn(
        { conversationId, error },
        "Failed to load smart replies for message page",
      );

      return publicPage;
    }
  }

  async getMessagesBySeqs(
    subUserId: string,
    conversationId: string,
    messageSeqs: number[],
  ) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    await this.getAccessibleConversation(subUserId, conversationId, scope);

    return this.repository.listMessagesBySeqs(conversationId, messageSeqs);
  }

  async getChatRecordDetail(
    subUserId: string,
    conversationId: string,
    msgInfoId: number,
  ) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getAccessibleConversation(
      subUserId,
      conversationId,
      scope,
    );

    const detail = await this.repository.getChatRecordDetail(
      conversation.uid,
      conversation.platform,
      conversationId,
      msgInfoId,
    );

    if (!detail) {
      throw new NotFoundError("CHAT_RECORD_NOT_FOUND", "聊天记录不存在");
    }

    return detail;
  }

  async getHistoryMessages(
    subUserId: string,
    conversationId: string,
    options: WorkbenchHistoryMessageQuery = {},
  ) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    await this.getAccessibleConversation(subUserId, conversationId, scope);

    return this.repository.listHistoryMessages(conversationId, {
      cursor: options.cursor,
      day: options.day,
      limit: options.limit,
      scope: options.scope,
      senderId: options.senderId,
    });
  }

  async getGroupMembers(subUserId: string, conversationId: string) {
    return this.groupMemberService.getGroupMembers(subUserId, conversationId);
  }

  async pullGroupMembers(
    subUserId: string,
    conversationId: string,
    request: WorkbenchPullGroupMembersRequest,
  ): Promise<WorkbenchPullGroupMembersResponse> {
    return this.groupMemberService.pullGroupMembers(
      subUserId,
      conversationId,
      request,
    );
  }

  async kickGroupMember(
    subUserId: string,
    conversationId: string,
    request: WorkbenchKickGroupMemberRequest,
  ): Promise<WorkbenchKickGroupMemberResponse> {
    return this.groupMemberService.kickGroupMember(
      subUserId,
      conversationId,
      request,
    );
  }

  async getUploadCredential(subUserId: string, conversationId: string) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getAccessibleConversation(
      subUserId,
      conversationId,
      scope,
    );

    const credential = await this.javaClient.getUploadCredential({
      uid: conversation.uid,
    });

    this.logger.info(
      {
        bucket: credential.bucket,
        conversationId: conversation.id,
        javaRequestId: credential.requestId,
        operation: "get-upload-credential",
        region: credential.region,
        seatId: conversation.seatId,
        subUserId,
        uid: conversation.uid,
      },
      "工作台上传凭证获取成功",
    );

    return credential;
  }

  async downloadMessageFile(
    subUserId: string,
    conversationId: string,
    msgInfoId: number,
  ) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getAccessibleConversation(
      subUserId,
      conversationId,
      scope,
    );

    if (!Number.isSafeInteger(msgInfoId) || msgInfoId <= 0) {
      throw new BadRequestError("INVALID_MESSAGE_ID", "消息 ID 不能为空");
    }

    await this.javaClient.downloadMsgFile({
      msgInfoId,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    this.logger.info(
      {
        conversationId: conversation.id,
        msgInfoId,
        operation: "download-message-file",
        platform: conversation.platform,
        seatId: conversation.seatId,
        subUserId,
        uid: conversation.uid,
      },
      "工作台消息文件下载已触发",
    );

    return {
      messageSeq: msgInfoId,
      status: "accepted" as const,
    };
  }

  async getMessageFileDownloadStatus(
    subUserId: string,
    conversationId: string,
    messageSeq: number,
  ) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getAccessibleConversation(
      subUserId,
      conversationId,
      scope,
    );

    if (!Number.isSafeInteger(messageSeq) || messageSeq <= 0) {
      throw new BadRequestError("INVALID_MESSAGE_SEQ", "消息序号无效");
    }

    const status = await this.repository.getMessageFileDownloadStatus({
      auditId: messageSeq,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    this.logger.info(
      {
        conversationId: conversation.id,
        downloadStatus: status?.downloadStatus,
        hasFileUrl: Boolean(status?.fileUrl),
        messageSeq,
        operation: "get-message-file-download-status",
        platform: conversation.platform,
        seatId: conversation.seatId,
        subUserId,
        uid: conversation.uid,
      },
      "工作台消息文件下载状态已查询",
    );

    return status;
  }

  async confirmVoicePlaybackReady(
    subUserId: string,
    input: WorkbenchVoicePlaybackConfirmRequest,
  ): Promise<WorkbenchVoicePlaybackConfirmResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getAccessibleConversation(
      subUserId,
      input.conversationId,
      scope,
    );

    if (!Number.isSafeInteger(input.messageSeq) || input.messageSeq <= 0) {
      throw new BadRequestError("INVALID_MESSAGE_SEQ", "消息序号无效");
    }

    const rawContent = await this.repository.getMessageRawContent({
      auditId: input.messageSeq,
      messageSourceThirdUserId: getMessageSourceThirdUserId(conversation),
      platform: conversation.platform,
      thirdExternalUserId: conversation.thirdExternalUserId,
      thirdGroupId: conversation.thirdGroupId,
      uid: conversation.uid,
    });

    if (!rawContent) {
      throw new NotFoundError("MESSAGE_NOT_FOUND", "消息不存在");
    }

    const content = parseMessageContentRecord(rawContent);
    const nextTransFileUrl = toPlayableVoiceCosObjectPath(input.playbackUrl);
    const expectedTransFileUrl = toExpectedPlayableVoiceCosObjectPath(
      readStringValue(content.fileUrl),
    );

    if (nextTransFileUrl !== expectedTransFileUrl) {
      throw new BadRequestError("PLAYABLE_VOICE_URL_MISMATCH", "语音播放地址与当前消息不匹配");
    }

    const playableExists = await this.playableVoiceExists(
      toPlayableVoiceAbsoluteUrl(nextTransFileUrl),
    );

    if (!playableExists) {
      throw new NotFoundError("PLAYABLE_VOICE_NOT_READY", "语音转码文件尚未就绪");
    }

    const nextContent = {
      ...content,
      transFileUrl: nextTransFileUrl,
      transVoiceText: readStringValue(content.transVoiceText),
    };

    await this.javaClient.updateMessageContent({
      content: JSON.stringify(nextContent),
      platform: conversation.platform,
      uid: conversation.uid,
      updateId: input.messageSeq,
    });

    return {
      messageSeq: input.messageSeq,
      playbackUrl: input.playbackUrl,
      transFileUrlPersisted: true,
    };
  }

  async transcribeVoiceMessage(
    subUserId: string,
    input: WorkbenchVoiceTranscriptionRequest,
  ): Promise<WorkbenchVoiceTranscriptionResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getAccessibleConversation(
      subUserId,
      input.conversationId,
      scope,
    );

    if (!Number.isSafeInteger(input.messageSeq) || input.messageSeq <= 0) {
      throw new BadRequestError("INVALID_MESSAGE_SEQ", "消息序号无效");
    }

    const rawContent = await this.repository.getMessageRawContent({
      auditId: input.messageSeq,
      messageSourceThirdUserId: getMessageSourceThirdUserId(conversation),
      platform: conversation.platform,
      thirdExternalUserId: conversation.thirdExternalUserId,
      thirdGroupId: conversation.thirdGroupId,
      uid: conversation.uid,
    });

    if (!rawContent) {
      throw new NotFoundError("MESSAGE_NOT_FOUND", "消息不存在");
    }

    const content = parseMessageContentRecord(rawContent);
    const existingTransVoiceText = readStringValue(content.transVoiceText).trim();

    if (existingTransVoiceText) {
      return {
        messageSeq: input.messageSeq,
        transVoiceText: existingTransVoiceText,
        transVoiceTextPersisted: true,
      };
    }

    const voiceUrl = toVoiceRecognitionUrl(readStringValue(content.fileUrl));

    if (!voiceUrl) {
      throw new BadRequestError(
        "VOICE_TRANSCRIPTION_UNSUPPORTED",
        "当前消息不支持语音转文字",
      );
    }

    const transVoiceText = (
      (await this.javaClient.recognizeSentence({ voiceUrl })) ?? ""
    ).trim();

    if (!transVoiceText) {
      throw new BadGatewayError("VOICE_TRANSCRIPTION_EMPTY", "语音识别结果为空");
    }

    const nextContent = {
      ...content,
      transVoiceText,
    };

    await this.javaClient.updateMessageContent({
      content: JSON.stringify(nextContent),
      platform: conversation.platform,
      uid: conversation.uid,
      updateId: input.messageSeq,
    });

    return {
      messageSeq: input.messageSeq,
      transVoiceText,
      transVoiceTextPersisted: true,
    };
  }

  async markConversationRead(subUserId: string, conversationId: string) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getOperableConversation(
      subUserId,
      conversationId,
      scope,
    );

    await this.javaClient.markConversationRead({
      conversationId: conversation.id,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    return {
      conversationId: conversation.id,
      seatId: conversation.seatId,
      unreadCount: 0,
    };
  }

  async markConversationUnread(subUserId: string, conversationId: string) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getOperableConversation(
      subUserId,
      conversationId,
      scope,
    );

    await this.javaClient.markConversationUnread({
      conversationId: conversation.id,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    return {
      conversationId: conversation.id,
      seatId: conversation.seatId,
      unreadCount: 1,
    };
  }

  async pinConversation(subUserId: string, conversationId: string) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getOperableConversation(
      subUserId,
      conversationId,
      scope,
    );

    await this.javaClient.pinConversation({
      conversationId: conversation.id,
      platform: conversation.platform,
      uid: conversation.uid,
    });
    await this.repository.updateConversationPinned({
      conversationId: conversation.id,
      isPinned: true,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    return {
      conversationId: conversation.id,
      isPinned: true,
      seatId: conversation.seatId,
    };
  }

  async changeConversationFullAuto(
    subUserId: string,
    conversationId: string,
    request: { enabled: boolean },
  ): Promise<WorkbenchConversationFullAutoResponse> {
    const subUserNumericId = parseMySqlId(subUserId);

    if (subUserNumericId == null) {
      throw new NotFoundError("SUB_USER_NOT_FOUND", "子账号不存在");
    }

    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getOperableConversation(
      subUserId,
      conversationId,
      scope,
    );

    if (request.enabled) {
      const capability = await this.repository.getConversationFullAutoCapability({
        platform: conversation.platform,
        seatId: conversation.seatId,
        thirdExternalUserId: conversation.thirdExternalUserId,
        thirdUserId: conversation.thirdUserId,
        uid: conversation.uid,
      });
      const canEnable =
        conversation.chatType === CHAT_TYPE.GROUP
          ? capability?.seatGroupAIHostingEnabled === true
          : conversation.chatType === CHAT_TYPE.SINGLE &&
            capability?.seatFullAutoAuth === true &&
            capability.seatFullAutoSwitch === true &&
            capability.customerBindType === 1;

      if (!canEnable) {
        throw new ForbiddenError(
          "CONVERSATION_FULL_AUTO_NOT_AVAILABLE",
          "当前会话未开通 AI 托管能力",
        );
      }
    }

    await this.javaClient.changeConversationFullAuto({
      change: request.enabled ? 1 : 0,
      conversationId: conversation.id,
      operatorId: subUserNumericId,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    if (request.enabled) {
      await this.insertFullAutoEnabledSystemMessage({
        conversationId: conversation.id,
        messageSourceThirdUserId: getMessageSourceThirdUserId(conversation),
        operatorId: subUserNumericId,
        platform: conversation.platform,
        subUserId,
        thirdExternalUserId: conversation.thirdExternalUserId,
        thirdGroupId: conversation.thirdGroupId,
        uid: conversation.uid,
      });
    }

    return {
      conversationAIHostingSwitch: request.enabled,
      conversationId: conversation.id,
      seatId: conversation.seatId,
    };
  }

  async clearConversationHandoff(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationClearHandoffResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getOperableConversation(
      subUserId,
      conversationId,
      scope,
    );

    await this.repository.clearConversationHandoff({
      conversationId: conversation.id,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    return {
      conversationId: conversation.id,
      seatId: conversation.seatId,
    };
  }

  async getFullAutoAnswerStatus(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchFullAutoAnswerStatusResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getAccessibleConversation(
      subUserId,
      conversationId,
      scope,
    );

    if (conversation.thirdGroupId || !conversation.thirdExternalUserId) {
      return {};
    }

    return this.repository.getLatestFullAutoAnswerStatus({
      thirdExternalUserId: conversation.thirdExternalUserId,
      thirdUserId: conversation.thirdUserId,
      uid: conversation.uid,
    });
  }

  async poll(subUserId: string, request: WorkbenchPollRequest) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);

    if (request.currentSeatId) {
      await this.assertSeatAccess(subUserId, request.currentSeatId, scope);
    }

    const activeConversationMessages =
      request.activeConversationId && request.activeMessageSeq != null
        ? await this.getActiveConversationMessages(
            subUserId,
            request.activeConversationId,
            request.activeMessageSeq,
            scope,
          )
        : [];
    const messageUpdateCursor = request.messageUpdateCursor ?? request.sinceVersion;
    const seatUpdateCursor = request.seatUpdateCursor ?? request.sinceVersion;
    const messageUpdateEvents =
      request.activeConversationId &&
      typeof this.repository.listMessageUpdateEvents === "function"
        ? await this.repository.listMessageUpdateEvents(request.activeConversationId, {
            afterCreateTime: messageUpdateCursor,
            limit: POLL_MESSAGE_UPDATE_LIMIT,
          })
        : [];
    const seatEventScope =
      typeof this.repository.getSeatEventScope === "function"
        ? await this.repository.getSeatEventScope(toSeatAccessScope(scope, subUserId))
        : undefined;
    const seatUpdateEvents =
      seatEventScope && typeof this.repository.listSeatUpdateEvents === "function"
        ? await this.repository.listSeatUpdateEvents({
            afterCreateTime: seatUpdateCursor,
            limit: POLL_SEAT_UPDATE_LIMIT,
            platform: seatEventScope.platform,
            seatIds: seatEventScope.seatIds,
            uid: seatEventScope.uid,
          })
        : [];
    const sinceLastMsgTime = Math.max(
      0,
      request.sinceVersion -
        (request.freshBaseline ? 0 : POLL_LAST_MESSAGE_OVERLAP_MS),
    );

    const changedConversations = request.currentSeatId
      ? await this.repository.listChangedConversations(request.currentSeatId, {
          limit: POLL_CONVERSATION_CHANGE_LIMIT,
          sinceLastMsgTime,
        })
      : {
          hasMore: false,
          items: [],
          nextVersion: Date.now(),
        };

    if (changedConversations.hasMore) {
      this.logger.warn(
        {
          activeConversationId: request.activeConversationId,
          currentSeatId: request.currentSeatId,
          operation: "workbench-poll",
          sinceLastMsgTime,
          sinceVersion: request.sinceVersion,
          subUserId,
        },
        "工作台 poll cursor 失效",
      );
      throw new AppError(
        "WORKBENCH_CURSOR_INVALIDATED",
        "会话变更过多，请重新加载会话列表",
        409,
      );
    }

    const latestChangedLastMessageTime = changedConversations.items.reduce(
      (latest, conversation) =>
        Math.max(latest, conversation.lastMessageTime ?? request.sinceVersion),
      request.sinceVersion,
    );
    const nextVersion =
      changedConversations.items.length === 0
        ? request.sinceVersion
        : latestChangedLastMessageTime > request.sinceVersion
          ? latestChangedLastMessageTime
          : request.sinceVersion + POLL_LAST_MESSAGE_OVERLAP_MS;

    const changedSeatIds = uniqueStrings([
      ...(request.currentSeatId ? [request.currentSeatId] : []),
      ...seatUpdateEvents.map((event) => event.seatId),
    ]);
    const changedSeats = await this.repository.getSeatsByIds(changedSeatIds);
    const changedSeatsById = new Map(
      changedSeats
        .filter((seat): seat is WorkbenchSeatDto => Boolean(seat))
        .map((seat) => [seat.seatId, seat] as const),
    );
    const orderedChangedSeats = changedSeatIds
      .map((seatId) => changedSeatsById.get(seatId))
      .filter((seat): seat is WorkbenchSeatDto => Boolean(seat));

    return {
      activeConversationMessages,
      conversationChanges: changedConversations.items.map((conversation) => ({
        ...conversation,
        type: "upsert" as const,
      })),
      messageUpdateEvents,
      nextVersion,
      nextMessageUpdateCursor: getNextEventCursor(
        messageUpdateCursor,
        messageUpdateEvents,
      ),
      nextSeatUpdateCursor: getNextEventCursor(
        seatUpdateCursor,
        seatUpdateEvents,
      ),
      seatChanges: orderedChangedSeats,
    };
  }

  async pollSmartReplies(
    subUserId: string,
    request: WorkbenchSmartReplyPollRequest,
  ) {
    return this.smartReplyService.pollSmartReplies(subUserId, request);
  }

  async requestSmartReplyGeneralAnswer(
    subUserId: string,
    request: WorkbenchSmartReplyGeneralAnswerRequest,
  ) {
    return this.smartReplyService.requestSmartReplyGeneralAnswer(
      subUserId,
      request,
    );
  }

  async requestSmartReplyAutoGeneralAnswer(
    subUserId: string,
    request: WorkbenchSmartReplyAutoGeneralAnswerRequest,
  ) {
    return this.smartReplyService.requestSmartReplyAutoGeneralAnswer(
      subUserId,
      request,
    );
  }

  async requestSmartReplyMakeShorter(
    subUserId: string,
    request: WorkbenchSmartReplyMakeShorterRequest,
  ) {
    return this.smartReplyService.requestSmartReplyMakeShorter(
      subUserId,
      request,
    );
  }

  async sendSmartReplyAnswer(
    subUserId: string,
    request: WorkbenchSmartReplySendAnswerRequest,
  ) {
    return this.smartReplyService.sendSmartReplyAnswer(subUserId, request);
  }

  async listSmartReplyAttachments(
    subUserId: string,
    request: WorkbenchSmartReplyAttachmentsRequest,
  ) {
    return this.smartReplyService.listSmartReplyAttachments(
      subUserId,
      request,
    );
  }

  async checkSmartReplyTextModeration(
    subUserId: string,
    request: WorkbenchSmartReplyTextModerationRequest,
  ) {
    return this.smartReplyService.checkSmartReplyTextModeration(
      subUserId,
      request,
    );
  }

  async listKnowledgePage(
    subUserId: string,
    request: WorkbenchKnowledgePageRequest,
  ) {
    return this.knowledgeService.listKnowledgePage(subUserId, request);
  }

  async getKnowledgeConfig(
    subUserId: string,
    request: WorkbenchKnowledgeConfigRequest,
  ) {
    return this.knowledgeService.getKnowledgeConfig(subUserId, request);
  }

  async listKnowledgeDocPage(
    subUserId: string,
    request: WorkbenchKnowledgeDocPageRequest,
  ) {
    return this.knowledgeService.listKnowledgeDocPage(subUserId, request);
  }

  async addKnowledgeFaq(
    subUserId: string,
    request: WorkbenchKnowledgeFaqAddRequest,
  ) {
    return this.knowledgeService.addKnowledgeFaq(subUserId, request);
  }

  async sendSmartHeartbeat(
    subUserId: string,
    request: WorkbenchSmartHeartbeatRequest,
  ) {
    return this.smartReplyService.sendSmartHeartbeat(subUserId, request);
  }

  async sendMessage(subUserId: string, payload: WorkbenchSendMessagePayload) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getOperableConversation(
      subUserId,
      payload.conversationId,
      scope,
    );

    if (conversation.seatId !== payload.seatId) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    const segment = getSingleSendSegment(payload);
    const failMsgId = getRetryFailMsgId(payload);
    const response = await this.javaClient.sendMessage({
      ...(failMsgId != null ? { failMsgId } : {}),
      msgData: await this.buildJavaSendMessageData(
        conversation.uid,
        subUserId,
        payload,
        segment,
      ),
      platform: conversation.platform,
      sendType: conversation.thirdGroupId ? JAVA_SEND_TYPE.GROUP : JAVA_SEND_TYPE.SINGLE,
      source: JAVA_MESSAGE_SOURCE.WORKBENCH,
      ...(conversation.thirdExternalUserId
        ? { thirdExternalUserid: conversation.thirdExternalUserId }
        : {}),
      ...(conversation.thirdGroupId ? { thirdGroupId: conversation.thirdGroupId } : {}),
      thirdUserId: conversation.thirdUserId,
      uid: conversation.uid,
    });

    this.logger.info(
      {
        conversationId: conversation.id,
        messageType: segment.type,
        operation: "send-message",
        optNo: response.optNo,
        platform: conversation.platform,
        seatId: conversation.seatId,
        sendType: conversation.thirdGroupId ? "group" : "single",
        status: response.status,
        subUserId,
        uid: conversation.uid,
      },
      "工作台消息发送已受理",
    );

    return response;
  }

  async retryMessage(subUserId: string, payload: WorkbenchRetryMessageRequest) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getOperableConversation(
      subUserId,
      payload.conversationId,
      scope,
    );

    if (!Number.isSafeInteger(payload.messageSeq) || payload.messageSeq <= 0) {
      throw new BadRequestError("INVALID_MESSAGE_SEQ", "消息序号无效");
    }

    const failedMessage = await this.repository.findRetryMessage({
      conversationId: conversation.id,
      messageSourceThirdUserId: getMessageSourceThirdUserId(conversation),
      messageSeq: payload.messageSeq,
      platform: conversation.platform,
      receptionThirdUserId: conversation.thirdUserId,
      ...(conversation.thirdExternalUserId
        ? { thirdExternalUserId: conversation.thirdExternalUserId }
        : {}),
      ...(conversation.thirdGroupId ? { thirdGroupId: conversation.thirdGroupId } : {}),
      uid: conversation.uid,
    });

    const retryLogContext = {
      conversationId: conversation.id,
      messageSeq: payload.messageSeq,
    };

    if (!failedMessage) {
      throw retryMessageFailed("retry_message_not_found", retryLogContext);
    }

    if (!failedMessage.optNo) {
      throw new BadRequestError("retry_message_opt_no_missing", "暂不支持重发该消息");
    }

    if (failedMessage.senderType !== "agent") {
      throw new BadRequestError("UNSUPPORTED_RETRY_MESSAGE", "暂不支持重发该消息");
    }

    const operation = await this.repository.findAsyncOperationByOptNo({
      optNo: failedMessage.optNo,
      platform: conversation.platform,
      uid: conversation.uid,
    });
    if (!operation) {
      throw retryMessageFailed("retry_operation_not_found", {
        ...retryLogContext,
        retryOptNo: failedMessage.optNo,
      });
    }

    const msgData = buildRetryJavaMessageData(operation.optParams, {
      ...retryLogContext,
      retryOptNo: failedMessage.optNo,
    });

    const response = await this.javaClient.sendMessage({
      failMsgId: failedMessage.id,
      msgData,
      platform: conversation.platform,
      sendType: conversation.thirdGroupId ? JAVA_SEND_TYPE.GROUP : JAVA_SEND_TYPE.SINGLE,
      source: JAVA_MESSAGE_SOURCE.WORKBENCH,
      ...(conversation.thirdExternalUserId
        ? { thirdExternalUserid: conversation.thirdExternalUserId }
        : {}),
      ...(conversation.thirdGroupId ? { thirdGroupId: conversation.thirdGroupId } : {}),
      thirdUserId: conversation.thirdUserId,
      uid: conversation.uid,
    });

    this.logger.info(
      {
        conversationId: conversation.id,
        messageSeq: payload.messageSeq,
        operation: "retry-message",
        optNo: response.optNo,
        platform: conversation.platform,
        retryOptNo: failedMessage.optNo,
        seatId: conversation.seatId,
        sendType: conversation.thirdGroupId ? "group" : "single",
        status: response.status,
        subUserId,
        uid: conversation.uid,
      },
      "工作台失败消息重发已受理",
    );

    return response;
  }

  async getSendFailReason(
    subUserId: string,
    payload: WorkbenchSendFailReasonRequest,
  ): Promise<WorkbenchSendFailReasonResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getAccessibleConversation(
      subUserId,
      payload.conversationId,
      scope,
    );

    if (!Number.isSafeInteger(payload.messageSeq) || payload.messageSeq <= 0) {
      throw new BadRequestError("INVALID_MESSAGE_SEQ", "消息序号无效");
    }

    const failedMessage = await this.repository.findRetryMessage({
      conversationId: conversation.id,
      messageSourceThirdUserId: getMessageSourceThirdUserId(conversation),
      messageSeq: payload.messageSeq,
      platform: conversation.platform,
      receptionThirdUserId: conversation.thirdUserId,
      ...(conversation.thirdExternalUserId
        ? { thirdExternalUserId: conversation.thirdExternalUserId }
        : {}),
      ...(conversation.thirdGroupId ? { thirdGroupId: conversation.thirdGroupId } : {}),
      uid: conversation.uid,
    });

    if (!failedMessage?.optNo) {
      return { failReason: "" };
    }

    const operation = await this.javaClient.getAsyncOperationInfo({
      optNo: failedMessage.optNo,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    return {
      failReason: operation.failReason,
    };
  }

  private async buildJavaSendMessageData(
    uid: number,
    subUserId: string,
    payload: WorkbenchSendMessagePayload,
    segment: WorkbenchOutgoingMessageSegment,
  ): Promise<JavaSendMessageData> {
    if (
      segment.type === "emotion" ||
      (segment.type === "image" && segment.materialCollectionId) ||
      (segment.type === "file" && segment.materialCollectionId) ||
      (segment.type === "h5" && segment.materialCollectionId) ||
      (segment.type === "weapp" && segment.materialCollectionId) ||
      (segment.type === "sphfeed" && segment.materialCollectionId) ||
      (segment.type === "video" && segment.materialCollectionId)
    ) {
      const materialCollectionId = segment.materialCollectionId;

      if (!materialCollectionId) {
        throw new BadRequestError("INVALID_MATERIAL_COLLECTION", "素材数据异常");
      }

      const bizType =
        segment.type === "emotion"
          ? MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
          : segment.type === "image"
          ? MATERIAL_COLLECTION_BIZ_TYPE.IMAGE
          : segment.type === "file"
          ? MATERIAL_COLLECTION_BIZ_TYPE.FILE
          : segment.type === "h5"
          ? MATERIAL_COLLECTION_BIZ_TYPE.H5
          : segment.type === "sphfeed"
          ? MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED
          : segment.type === "video"
          ? MATERIAL_COLLECTION_BIZ_TYPE.VIDEO
          : MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM;
      const collection = await this.repository.findMaterialCollectionForForward({
        bizType,
        id: materialCollectionId,
        ...(segment.type === "emotion" ? { subUserId } : {}),
        uid,
      });

      if (!collection) {
        throw new NotFoundError("MATERIAL_COLLECTION_NOT_FOUND", "素材不存在");
      }

      if (segment.type === "emotion") {
        return buildEmotionJavaSendMessageData(collection.content);
      }

      if (segment.type === "file") {
        return buildFileJavaSendMessageData(collection.content);
      }

      if (segment.type === "image") {
        return buildImageJavaSendMessageData(collection.content);
      }

      if (segment.type === "h5") {
        return buildH5JavaSendMessageData(collection.content);
      }

      return buildForwardJavaSendMessageData(segment.type, collection.msgInfoId);
    }

    if (
      segment.type === "weapp" ||
      segment.type === "sphfeed" ||
      segment.type === "video"
    ) {
      return buildForwardJavaSendMessageData(segment.type, segment.msgInfoId);
    }

    return buildJavaSendMessageData(payload, segment);
  }

  async revokeMessage(
    subUserId: string,
    conversationId: string,
    messageSeq: number,
  ): Promise<WorkbenchRevokeMessageResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getOperableConversation(
      subUserId,
      conversationId,
      scope,
    );

    if (!Number.isSafeInteger(messageSeq) || messageSeq <= 0) {
      throw new BadRequestError("INVALID_MESSAGE_SEQ", "消息序号无效");
    }

    if (conversation.isShadowGroup) {
      throw new ForbiddenError("MESSAGE_REVOKE_FORBIDDEN", "暂不支持撤回该消息");
    }

    const message = await this.repository.getMessageForRevoke({
      conversationId: conversation.id,
      messageSourceThirdUserId: getMessageSourceThirdUserId(conversation),
      messageSeq,
      platform: conversation.platform,
      receptionThirdUserId: conversation.thirdUserId,
      thirdExternalUserId: conversation.thirdExternalUserId,
      thirdGroupId: conversation.thirdGroupId,
      uid: conversation.uid,
    });

    if (!message) {
      throw new NotFoundError("MESSAGE_NOT_FOUND", "消息不存在");
    }

    if (
      message.senderType !== "agent" ||
      message.status !== "sent" ||
      message.isRevoked
    ) {
      throw new ForbiddenError("MESSAGE_REVOKE_FORBIDDEN", "暂不支持撤回该消息");
    }

    const elapsedMs = Date.now() - message.createdAt;

    if (
      !Number.isFinite(message.createdAt) ||
      elapsedMs < -MESSAGE_REVOKE_CLOCK_SKEW_TOLERANCE_MS ||
      elapsedMs >= MESSAGE_REVOKE_WINDOW_MS
    ) {
      throw new BadRequestError("MESSAGE_REVOKE_EXPIRED", "已超过撤回时间");
    }

    await this.javaClient.revokeMessage({
      platform: conversation.platform,
      revokeMsgId: message.seq,
      uid: conversation.uid,
    });

    this.logger.info(
      {
        conversationId: conversation.id,
        messageSeq,
        operation: "revoke-message",
        platform: conversation.platform,
        revokeMsgId: message.seq,
        seatId: conversation.seatId,
        subUserId,
        uid: conversation.uid,
      },
      "工作台消息撤回已受理",
    );

    return {
      accepted: true,
      conversationId: conversation.id,
      messageSeq,
      revokeMsgId: message.seq,
    };
  }

  async takeOverSeat(subUserId: string, seatId: string) {
    const subUserNumericId = parseMySqlId(subUserId);

    if (subUserNumericId == null) {
      throw new NotFoundError("SUB_USER_NOT_FOUND", "子账号不存在");
    }

    const subUser = await this.repository.getSubUser(subUserId);

    if (!subUser || !chatAiSubAccountTypes.some((type) => type === subUser.type)) {
      throw new NotFoundError("SUB_USER_NOT_FOUND", "子账号不存在");
    }

    const scope = await this.getAuthenticatedWorkbenchScope(subUserId, subUser);
    await this.assertSeatAccess(subUserId, seatId, scope);

    const seat = await this.repository.getSeatOperateScope(seatId);

    if (!seat) {
      throw new NotFoundError("SEAT_NOT_FOUND", "席位不存在");
    }

    await this.javaClient.takeOverSeat({
      platform: seat.platform,
      subId: subUserNumericId,
      thirdUserId: seat.thirdUserId,
      uid: seat.uid,
    });
    await this.repository.updateSeatHostSubUser({
      platform: seat.platform,
      seatId: seat.seatId,
      subUserId,
      uid: seat.uid,
    });

    return {
      hostSubUserId: subUserId,
      seatId: seat.seatId,
    };
  }

  async updateSeatAgentModeSwitch(
    subUserId: string,
    seatId: string,
    request: WorkbenchSeatAgentModeSwitchRequest,
  ): Promise<WorkbenchSeatAgentModeSwitchResponse> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    await this.assertSeatAccess(subUserId, seatId, scope);

    const seat = await this.repository.getSeatOperateScope(seatId);

    if (!seat) {
      throw new NotFoundError("SEAT_NOT_FOUND", "席位不存在");
    }

    if (seat.hostSubUserId !== subUserId) {
      throw new ForbiddenError("SEAT_NOT_TAKEN_OVER", "账号未接管");
    }

    const canUseAgentMode =
      request.mode === "off" ||
      (request.mode === "assistant" && seat.semiAutoAuth === true) ||
      (request.mode === "autoReply" &&
        seat.semiAutoAuth === true &&
        seat.seatAIHostingAuth === true);

    if (!canUseAgentMode) {
      throw new ForbiddenError(
        "SEAT_AGENT_MODE_UNAUTHORIZED",
        "当前账号未授权该 Agent 模式",
      );
    }

    return this.repository.updateSeatAgentModeSwitch({
      mode: request.mode,
      platform: seat.platform,
      seatId: seat.seatId,
      uid: seat.uid,
    });
  }

  async unpinConversation(subUserId: string, conversationId: string) {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.getOperableConversation(
      subUserId,
      conversationId,
      scope,
    );

    await this.javaClient.unpinConversation({
      conversationId: conversation.id,
      platform: conversation.platform,
      uid: conversation.uid,
    });
    await this.repository.updateConversationPinned({
      conversationId: conversation.id,
      isPinned: false,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    return {
      conversationId: conversation.id,
      isPinned: false,
      seatId: conversation.seatId,
    };
  }

  listMaterialCollections(
    subUserId: string,
    request: WorkbenchMaterialCollectionListRequest,
  ) {
    return this.materialService.listMaterialCollections(subUserId, request);
  }

  listMaterialGroups(
    subUserId: string,
    request: WorkbenchMaterialCollectionGroupListRequest,
  ) {
    return this.materialService.listMaterialGroups(subUserId, request);
  }

  collectMaterial(
    subUserId: string,
    request: WorkbenchMaterialCollectionCreateRequest,
  ) {
    return this.materialService.collectMaterial(subUserId, request);
  }

  deleteMaterialCollection(subUserId: string, collectionId: string) {
    return this.materialService.deleteMaterialCollection(subUserId, collectionId);
  }

  topMaterialCollection(subUserId: string, collectionId: string) {
    return this.materialService.topMaterialCollection(subUserId, collectionId);
  }

  moveMaterialCollection(
    subUserId: string,
    collectionId: string,
    request: WorkbenchMaterialCollectionMoveRequest,
  ) {
    return this.materialService.moveMaterialCollection(
      subUserId,
      collectionId,
      request,
    );
  }

  updateMaterialCollection(
    subUserId: string,
    collectionId: string,
    request: WorkbenchMaterialCollectionUpdateRequest,
  ) {
    return this.materialService.updateMaterialCollection(
      subUserId,
      collectionId,
      request,
    );
  }

  createMaterialGroup(
    subUserId: string,
    request: WorkbenchMaterialCollectionGroupCreateRequest,
  ) {
    return this.materialService.createMaterialGroup(subUserId, request);
  }

  renameMaterialGroup(
    subUserId: string,
    groupId: string,
    bizType: number,
    request: WorkbenchMaterialCollectionGroupUpdateRequest,
  ) {
    return this.materialService.renameMaterialGroup(
      subUserId,
      groupId,
      bizType,
      request,
    );
  }

  topMaterialGroup(subUserId: string, groupId: string, bizType: number) {
    return this.materialService.topMaterialGroup(subUserId, groupId, bizType);
  }

  deleteMaterialGroup(subUserId: string, groupId: string, bizType: number) {
    return this.materialService.deleteMaterialGroup(
      subUserId,
      groupId,
      bizType,
    );
  }

  async listQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryListRequest,
  ): Promise<WorkbenchQuickReplyCategoryListResponse> {
    return this.quickReplyService.listQuickReplyCategories(subUserId, request);
  }

  async ensureQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryEnsureRequest,
  ): Promise<WorkbenchQuickReplyCategoryEnsureResponse> {
    return this.quickReplyService.ensureQuickReplyCategories(subUserId, request);
  }

  async listQuickReplyCategoryContent(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryContentRequest,
  ): Promise<WorkbenchQuickReplyCategoryContentResponse> {
    return this.quickReplyService.listQuickReplyCategoryContent(subUserId, request);
  }

  async createQuickReplyCategory(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryCreateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.createQuickReplyCategory(subUserId, request);
  }

  async renameQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
    request: WorkbenchQuickReplyCategoryUpdateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.renameQuickReplyCategory(
      subUserId,
      categoryId,
      scopeTypeValue,
      request,
    );
  }

  async topQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.topQuickReplyCategory(
      subUserId,
      categoryId,
      scopeTypeValue,
    );
  }

  async bottomQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.bottomQuickReplyCategory(
      subUserId,
      categoryId,
      scopeTypeValue,
    );
  }

  async deleteQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.deleteQuickReplyCategory(
      subUserId,
      categoryId,
      scopeTypeValue,
    );
  }

  async moveQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
    request: WorkbenchQuickReplyCategoryMoveRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.moveQuickReplyCategory(
      subUserId,
      categoryId,
      scopeTypeValue,
      request,
    );
  }

  async sortQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategorySortRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.sortQuickReplyCategories(subUserId, request);
  }

  async listQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplyListRequest,
  ): Promise<WorkbenchQuickReplyListResponse> {
    return this.quickReplyService.listQuickReplies(subUserId, request);
  }

  async createQuickReply(
    subUserId: string,
    request: WorkbenchQuickReplyCreateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.createQuickReply(subUserId, request);
  }

  async batchCreateQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplyBatchCreateRequest,
  ): Promise<WorkbenchQuickReplyBatchCreateResponse> {
    return this.quickReplyService.batchCreateQuickReplies(subUserId, request);
  }

  async moveQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
    request: WorkbenchQuickReplyMoveRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.moveQuickReply(
      subUserId,
      quickReplyId,
      scopeTypeValue,
      request,
    );
  }

  async sortQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplySortRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.sortQuickReplies(subUserId, request);
  }

  async updateQuickReply(
    subUserId: string,
    quickReplyId: string,
    request: WorkbenchQuickReplyUpdateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.updateQuickReply(subUserId, quickReplyId, request);
  }

  async topQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.topQuickReply(
      subUserId,
      quickReplyId,
      scopeTypeValue,
    );
  }

  async bottomQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.bottomQuickReply(
      subUserId,
      quickReplyId,
      scopeTypeValue,
    );
  }

  async deleteQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    return this.quickReplyService.deleteQuickReply(
      subUserId,
      quickReplyId,
      scopeTypeValue,
    );
  }

  private getAuthenticatedWorkbenchScope(
    subUserId: string,
    authenticatedSubUser?: { uid: number },
  ) {
    return this.access.getAuthenticatedWorkbenchScope(
      subUserId,
      authenticatedSubUser,
    );
  }

  private assertSeatAccess(
    subUserId: string,
    seatId: string,
    scope: AuthenticatedWorkbenchScope,
  ) {
    return this.access.assertSeatAccess(subUserId, seatId, scope);
  }

  private getAccessibleConversation(
    subUserId: string,
    conversationId: string,
    scope: AuthenticatedWorkbenchScope,
  ) {
    return this.access.getAccessibleConversation(subUserId, conversationId, scope);
  }

  private getOperableConversation(
    subUserId: string,
    conversationId: string,
    scope: AuthenticatedWorkbenchScope,
  ) {
    return this.access.getOperableConversation(subUserId, conversationId, scope);
  }

  private async getActiveConversationMessages(
    subUserId: string,
    conversationId: string,
    activeMessageSeq: number,
    scope: AuthenticatedWorkbenchScope,
  ) {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId, scope);

    const page = await this.repository.listMessages(conversationId, {
      afterSeq: activeMessageSeq,
      includeHiddenConversation: true,
      limit: 50,
    });

    return page.messages.filter((message) => message.seq > activeMessageSeq);
  }

  private async insertFullAutoEnabledSystemMessage(input: {
    conversationId: string;
    messageSourceThirdUserId: string;
    operatorId: number;
    platform: number;
    subUserId: string;
    thirdExternalUserId?: string;
    thirdGroupId?: string;
    uid: number;
  }) {
    try {
      const latestMessage =
        await this.repository.getLatestConversationMessageSummary({
          messageSourceThirdUserId: input.messageSourceThirdUserId,
          platform: input.platform,
          thirdExternalUserId: input.thirdExternalUserId,
          thirdGroupId: input.thirdGroupId,
          uid: input.uid,
        });

      if (!latestMessage) {
        return;
      }

      const latestMessageAgeMs = Date.now() - latestMessage.createdAt;

      if (
        latestMessage.msgtype === "system" &&
        (!Number.isFinite(latestMessage.createdAt) ||
          latestMessage.createdAt <= 0 ||
          latestMessageAgeMs < FULL_AUTO_SYSTEM_MESSAGE_DEDUPE_WINDOW_MS)
      ) {
        return;
      }

      const subUser = await this.repository.getSubUser(input.subUserId);
      const operatorName = subUser?.displayName?.trim() || "客服";

      await this.javaClient.insertSystemMessage({
        content: `${operatorName} 开启了 AI 托管`,
        conversationId: input.conversationId,
        operatorId: input.operatorId,
        platform: input.platform,
        uid: input.uid,
      });
    } catch (error) {
      this.logger.warn(
        {
          conversationId: input.conversationId,
          error,
          operation: "insert-full-auto-system-message",
          platform: input.platform,
          subUserId: input.subUserId,
          uid: input.uid,
        },
        "插入 AI 托管系统消息失败",
      );
    }
  }

  async search(
    subUserId: string,
    seatId: string,
    keyword: string,
  ): Promise<WorkbenchSearchResponseDto> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    await this.assertSeatAccess(subUserId, seatId, scope);

    const seatNumericId = parseMySqlId(seatId);
    if (seatNumericId == null) {
      return { contacts: [], groups: [] };
    }

    const seatScope = await this.repository.getSeatOperateScope(seatId);
    if (!seatScope) {
      throw new NotFoundError("SEAT_NOT_FOUND", "席位不存在");
    }

    const [contacts, groups] = await Promise.all([
      this.repository.searchContacts(seatScope.uid, seatScope.platform, seatScope.thirdUserId, keyword),
      this.repository.searchGroups(seatScope.uid, seatScope.platform, seatScope.thirdUserId, keyword),
    ]);

    return { contacts, groups };
  }

  async getOrCreateConversation(
    subUserId: string,
    payload: WorkbenchGetOrCreateConversationRequestDto,
  ): Promise<WorkbenchConversationSummaryDto> {
    const scope = await this.getAuthenticatedWorkbenchScope(subUserId);
    await this.assertSeatAccess(subUserId, payload.seatId, scope);

    const seatNumericId = parseMySqlId(payload.seatId);
    if (seatNumericId == null) {
      throw new BadRequestError("INVALID_SEAT_ID", "席位ID无效");
    }

    const seatScope = await this.repository.getSeatOperateScope(payload.seatId);
    if (!seatScope) {
      throw new NotFoundError("SEAT_NOT_FOUND", "席位不存在");
    }

    const seatThirdUserId = seatScope.thirdUserId;
    const targetId =
      payload.chatType === CHAT_TYPE.GROUP ? payload.thirdGroupId : payload.thirdExternalUserId;

    if (!targetId) {
      throw new BadRequestError("INVALID_TARGET_ID", "目标ID无效");
    }

    // Java owns the get-or-create decision: create when absent, restore when hidden, return id.
    const javaResponse = await this.javaClient.createConversation({
      chatType: payload.chatType,
      platform: seatScope.platform,
      thirdExternalUserId: payload.thirdExternalUserId,
      thirdGroupId: payload.thirdGroupId,
      thirdUserId: seatThirdUserId,
      uid: seatScope.uid,
    });

    if (!javaResponse?.conversationId) {
      throw new BadRequestError("CREATE_CONVERSATION_FAILED", "创建会话失败，请稍后重试");
    }

    const hydrated = await this.repository.getHydratedConversation(
      seatScope.uid,
      seatScope.platform,
      seatThirdUserId,
      javaResponse.conversationId,
    );

    if (!hydrated) {
      this.logger.warn(
        { conversationId: javaResponse.conversationId, payload },
        "Java 已创建会话但本地 DB 尚未同步",
      );
      throw new NotFoundError("CONVERSATION_NOT_SYNCED", "打开会话失败，请稍后重试");
    }

    return hydrated;
  }

}

function getNextEventCursor(
  currentCursor: number,
  events: Array<{
    eventTime?: number;
  }>,
) {
  if (!Number.isFinite(currentCursor)) {
    return undefined;
  }

  if (!events.length) {
    return currentCursor;
  }

  const latestEventTime = events.reduce(
    (latest, event) => {
      const eventTime = event.eventTime;

      if (eventTime == null) {
        return latest;
      }

      return Math.max(latest, eventTime);
    },
    currentCursor,
  );

  return latestEventTime;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function parseMessageContentRecord(rawContent: string) {
  try {
    const parsed: unknown = JSON.parse(rawContent);

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toPlayableVoiceCosObjectPath(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    const objectPath = rawUrl.replace(/^\/+/, "");

    if (isPlayableVoiceObjectPath(objectPath)) {
      return objectPath;
    }

    throw new BadRequestError("MEDIA_URL_NOT_ALLOWED", "无效的语音地址");
  }

  if (
    url.protocol === "https:" &&
    url.host === getPlayableMediaHost() &&
    isPlayableVoiceObjectPath(url.pathname)
  ) {
    return url.pathname.replace(/^\/+/, "");
  }

  throw new BadRequestError("MEDIA_URL_NOT_ALLOWED", "无效的语音地址");
}

function toExpectedPlayableVoiceCosObjectPath(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return toExpectedPlayableVoicePathname(`/${rawUrl.replace(/^\/+/, "")}`).replace(
      /^\/+/,
      "",
    );
  }

  if (url.protocol !== "https:" || url.host !== getPlayableMediaHost()) {
    throw new BadRequestError("MEDIA_URL_NOT_ALLOWED", "无效的语音地址");
  }

  return toExpectedPlayableVoicePathname(url.pathname).replace(/^\/+/, "");
}

function toExpectedPlayableVoicePathname(pathname: string) {
  const playablePathname = toPlayableVoicePathname(pathname);

  if (!playablePathname) {
    throw new BadRequestError("MEDIA_URL_NOT_ALLOWED", "无效的语音地址");
  }

  return playablePathname;
}

function isPlayableVoiceObjectPath(pathname: string) {
  return isPlayableVoicePathname(pathname);
}

function toPlayableVoiceAbsoluteUrl(objectPath: string) {
  return `https://${getPlayableMediaHost()}/${objectPath.replace(/^\/+/, "")}`;
}

function toVoiceRecognitionUrl(rawUrl: string) {
  const value = rawUrl.trim();

  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || url.host !== getPlayableMediaHost()) {
      throw new BadRequestError("MEDIA_URL_NOT_ALLOWED", "无效的语音地址");
    }

    toExpectedPlayableVoicePathname(url.pathname);
    return url.toString();
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    const pathname = `/${value.replace(/^\/+/, "")}`;
    toExpectedPlayableVoicePathname(pathname);

    return `https://${getPlayableMediaHost()}${pathname}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function checkPlayableVoiceExists(playbackUrl: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PLAYABLE_VOICE_HEAD_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(playbackUrl, {
      method: "HEAD",
      signal: controller.signal,
    });
  } catch (error) {
    throw new BadGatewayError("PLAYABLE_VOICE_CHECK_FAILED", "语音转码文件检查失败", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new BadGatewayError("PLAYABLE_VOICE_CHECK_FAILED", "语音转码文件检查失败", {
      status: response.status,
    });
  }

  return true;
}

function getSingleSendSegment(
  payload: WorkbenchSendMessagePayload,
): WorkbenchOutgoingMessageSegment {
  if (payload.segment) {
    return payload.segment;
  }

  if (payload.segments && payload.segments.length > 1) {
    throw new BadRequestError("UNSUPPORTED_SEND_MESSAGE", "当前仅支持单条消息发送");
  }

  if (payload.segments?.[0]) {
    return payload.segments[0];
  }

  return {
    text: payload.content ?? "",
    type: "text",
  };
}

function buildJavaSendMessageData(
  payload: WorkbenchSendMessagePayload,
  segment: Exclude<
    WorkbenchOutgoingMessageSegment,
    { type: "emotion" } | { type: "sphfeed" } | { type: "video" } | { type: "weapp" }
  >,
): JavaSendMessageData {
  if (segment.type === "image") {
    const imageUrl =
      segment.imageUrl?.trim() || segment.url?.trim() || segment.localUrl?.trim();

    if (!imageUrl) {
      throw new BadRequestError("INVALID_IMAGE_MESSAGE", "图片消息缺少可发送地址");
    }

    return {
      fileUrl: imageUrl,
      msgtype: "image",
    };
  }

  if (segment.type === "file") {
    const fileName = segment.fileName?.trim() ?? "";
    const fileUrl = segment.url?.trim();

    if (!fileName) {
      throw new BadRequestError("INVALID_FILE_MESSAGE", "文件消息缺少文件名");
    }

    if (!fileUrl) {
      throw new BadRequestError("INVALID_FILE_MESSAGE", "文件消息缺少可发送地址");
    }

    return {
      fileName,
      fileUrl,
      msgtype: "file",
    };
  }

  if (segment.type === "h5") {
    const title = segment.title?.trim() ?? "";
    const href = segment.href?.trim() ?? "";
    const desc = segment.desc?.trim();
    const coverUrl = segment.coverUrl?.trim();

    if (!title) {
      throw new BadRequestError("INVALID_H5_MESSAGE", "H5链接消息缺少标题");
    }

    if (!href) {
      throw new BadRequestError("INVALID_H5_MESSAGE", "H5链接消息缺少跳转地址");
    }

    return {
      coverUrl: coverUrl || DEFAULT_H5_COVER_URL,
      ...(desc ? { desc } : {}),
      href,
      msgtype: "link",
      title,
    };
  }

  const quoteMsgId = payload.quote?.quoteMsgId
    ? parseMySqlId(payload.quote.quoteMsgId)
    : undefined;
  const message: JavaSendMessageData = quoteMsgId == null
    ? {
        msgtype: "text",
        text: segment.text,
      }
    : {
        msgtype: "quote",
        quoteMsgId,
        text: segment.text,
      };

  const mentionMemberIds = payload.mention?.memberIds.filter(Boolean) ?? [];

  if (payload.mention?.all) {
    message.atLocation = JAVA_MENTION_LOCATION.START;
    message.isHit = 1;
  } else if (mentionMemberIds.length > 0) {
    message.atLocation =
      payload.mention?.location === "any"
        ? JAVA_MENTION_LOCATION.ANY
        : payload.mention?.location === "end"
          ? JAVA_MENTION_LOCATION.END
          : JAVA_MENTION_LOCATION.START;
    message.atWxSerialNos = mentionMemberIds;
    message.isHit = JAVA_MENTION_HIT_TYPE.MEMBER;
    if (payload.atOriginText?.trim()) {
      message.atOriginText = payload.atOriginText;
    }
  }

  return message;
}

function retryMessageFailed(
  reason: string,
  context?: Record<string, unknown>,
): BadRequestError {
  return new BadRequestError("RETRY_MESSAGE_FAILED", "重发失败", undefined, {
    ...context,
    reason,
  });
}

function buildRetryJavaMessageData(
  rawOptParams: string | null | undefined,
  logContext?: Record<string, unknown>,
): JavaSendMessageData {
  if (!rawOptParams?.trim()) {
    throw retryMessageFailed("retry_operation_params_missing", logContext);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOptParams);
  } catch {
    throw retryMessageFailed("retry_operation_params_invalid_json", logContext);
  }

  if (!isRecord(parsed) || !isRecord(parsed.msgData)) {
    throw retryMessageFailed("retry_message_data_missing", logContext);
  }

  const msgData = parsed.msgData;

  switch (msgData.msgtype) {
    case "text":
      if (typeof msgData.text !== "string") {
        throw retryMessageFailed("retry_text_invalid", logContext);
      }
      return msgData as JavaSendMessageData;
    case "quote":
      if (
        typeof msgData.text !== "string" ||
        !Number.isSafeInteger(msgData.quoteMsgId)
      ) {
        throw retryMessageFailed("retry_quote_invalid", logContext);
      }
      return msgData as JavaSendMessageData;
    case "image":
      if (typeof msgData.fileUrl !== "string" || !msgData.fileUrl.trim()) {
        throw retryMessageFailed("retry_image_url_missing", logContext);
      }
      return msgData as JavaSendMessageData;
    case "file":
      if (
        typeof msgData.fileName !== "string" ||
        typeof msgData.fileUrl !== "string" ||
        !msgData.fileName.trim() ||
        !msgData.fileUrl.trim()
      ) {
        throw retryMessageFailed("retry_file_data_invalid", logContext);
      }
      return msgData as JavaSendMessageData;
    default:
      throw new BadRequestError("UNSUPPORTED_RETRY_MESSAGE", "暂不支持重发该消息");
  }
}

function buildEmotionJavaSendMessageData(content: string): JavaSendMessageData {
  const record = parseMaterialContentRecord(content);
  const fileUrl = readMaterialString(record, "fileUrl");

  if (!fileUrl) {
    throw new BadRequestError("INVALID_EMOTION_MESSAGE", "表情素材数据异常");
  }

  return {
    fileUrl,
    msgtype: "emotion",
  };
}

function buildImageJavaSendMessageData(content: string): JavaSendMessageData {
  const record = parseMaterialContentRecord(content);
  const fileUrl = readMaterialString(record, "fileUrl");

  if (!fileUrl) {
    throw new BadRequestError("INVALID_IMAGE_MESSAGE", "图片素材数据异常");
  }

  return {
    fileUrl: normalizeMediaAssetUrl(fileUrl),
    msgtype: "image",
  };
}

function toSeatAccessScope(
  scope: AuthenticatedWorkbenchScope,
  subUserId: string,
): WorkbenchSeatAccessScope {
  return {
    platform: scope.platform,
    subUserId,
    uid: scope.uid,
  };
}

function buildFileJavaSendMessageData(content: string): JavaSendMessageData {
  const record = parseMaterialContentRecord(content);
  const fileName = readMaterialString(record, "fileName");
  const fileUrl = readMaterialString(record, "fileUrl");

  if (!fileName || !fileUrl) {
    throw new BadRequestError("INVALID_FILE_MESSAGE", "文件素材数据异常");
  }

  return {
    fileName,
    fileUrl: normalizeMediaAssetUrl(fileUrl),
    msgtype: "file",
  };
}

function buildH5JavaSendMessageData(content: string): JavaSendMessageData {
  const record = parseMaterialContentRecord(content);
  const title = readMaterialString(record, "title");
  const href =
    readMaterialString(record, "href") ||
    readMaterialString(record, "url") ||
    readMaterialString(record, "linkUrl");
  const desc =
    readMaterialString(record, "desc") ||
    readMaterialString(record, "description");
  const coverUrl =
    readMaterialString(record, "coverUrl") ||
    readMaterialString(record, "previewImageUrl") ||
    readMaterialString(record, "imageUrl");

  if (!title || !href) {
    throw new BadRequestError("INVALID_H5_MESSAGE", "H5链接素材数据异常");
  }

  return {
    coverUrl: coverUrl || DEFAULT_H5_COVER_URL,
    ...(desc ? { desc } : {}),
    href,
    msgtype: "link",
    title,
  };
}

function buildForwardJavaSendMessageData(
  msgtype: "sphfeed" | "video" | "weapp",
  msgInfoId: string | undefined,
): JavaSendMessageData {
  const transMsgInfoId = msgInfoId ? parseMySqlId(msgInfoId) : undefined;

  if (transMsgInfoId == null) {
    throw new BadRequestError("INVALID_TRANS_MESSAGE_INFO_ID", "转发消息 ID 无效");
  }

  return {
    msgtype,
    transMsgInfoId,
  };
}

function getRetryFailMsgId(payload: WorkbenchSendMessagePayload) {
  if (!payload.failMsgId) {
    return undefined;
  }

  const failMsgId = parseMySqlId(payload.failMsgId);

  if (failMsgId == null) {
    throw new BadRequestError("INVALID_MESSAGE_ID", "失败消息 ID 无效");
  }

  return failMsgId;
}

const enterpriseMemberNameCollator = new Intl.Collator("zh-Hans-CN");

function mapTenantSeatsToEnterpriseMembers(
  seats: TenantSeatIdentity[],
): WorkbenchEnterpriseMemberDto[] {
  const items: WorkbenchEnterpriseMemberDto[] = [];
  const usedThirdUserIds = new Set<string>();

  for (const seat of seats) {
    if (items.length >= WORKBENCH_ENTERPRISE_MEMBER_MAX_ITEMS) {
      break;
    }

    const thirdUserId = seat.thirdUserId.trim();

    if (!thirdUserId || usedThirdUserIds.has(thirdUserId)) {
      continue;
    }

    usedThirdUserIds.add(thirdUserId);
    items.push({
      avatarUrl: seat.avatarUrl,
      displayName: seat.displayName.trim() || thirdUserId,
      thirdUserId,
    });
  }

  return items.sort((left, right) =>
    enterpriseMemberNameCollator.compare(left.displayName, right.displayName),
  );
}
