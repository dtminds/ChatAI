import type {
  WorkbenchConversationDeleteResponse,
  WorkbenchConversationFullAutoResponse,
  WorkbenchConversationListResponse,
  WorkbenchConversationPinResponse,
  WorkbenchConversationReadResponse,
  WorkbenchConversationUnpinResponse,
  WorkbenchConversationUnreadResponse,
  WorkbenchGroupMembersResponse,
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
  WorkbenchCustomerLastConversationResponse,
  WorkbenchCustomerRelationConversationsResponse,
  MaterialCollectionBizType,
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
  WorkbenchMaterialCollectionContentType,
  WorkbenchMaterialCollectionUpdateRequest,
  QuickReplyScopeType,
  WorkbenchQuickReplyBatchCreateRequest,
  WorkbenchQuickReplyBatchCreateResponse,
  WorkbenchQuickReplyCategoryCreateRequest,
  WorkbenchQuickReplyCategoryDto,
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
  CHAT_TYPE,
  MATERIAL_COLLECTION_BIZ_TYPE,
  MATERIAL_COLLECTION_GROUP_MAX_COUNT,
  MATERIAL_COLLECTION_TITLE_MAX_LENGTH,
  QUICK_REPLY_BATCH_CREATE_LIMIT,
  QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  QUICK_REPLY_CATEGORY_CONTENT_ITEM_LIMIT,
  QUICK_REPLY_CHILD_CATEGORY_LIMIT,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
  QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT,
  QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT,
  QUICK_REPLY_LABEL_TEXT_MAX_LENGTH,
  QUICK_REPLY_SCOPE_TYPE,
  QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT,
  QUICK_REPLY_TOP_CATEGORY_LIMIT,
  buildMaterialFileContentJson,
  buildMaterialH5ContentJson,
  buildMaterialImageContentJson,
  buildMaterialVideoContentJson,
  canEditMaterialCollectionItem,
  isOwnVideoMaterialUrl,
  isQuickReplyLabelColor,
  normalizeQuickReplyAttachments,
  patchMaterialFileContentJson,
  patchMaterialH5ContentJson,
  resolveMaterialFileCollectFields,
  resolveMaterialH5CollectFields,
  resolveMaterialImageCollectFields,
  resolveMaterialVideoCollectFields,
  validateQuickReplyPayload,
} from "@chatai/contracts";
import {
  BadGatewayError,
  BadRequestError,
  ForbiddenError,
  AppError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors.js";
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
  WORKBENCH_INTERNAL_API_FAILED_CODE,
} from "./workbench-java-client.js";
import { buildSidebarIframeTuseCipherTexts } from "../../lib/tuse-crypto.js";
import { normalizeAttachmentIds } from "./attachment-mappers.js";
import { normalizeKnowledgeId } from "./knowledge-doc-mappers.js";
import { JAVA_KNOWLEDGE_FAQ_SOURCE } from "./knowledge-faq-mappers.js";
import { SMART_REPLY_MAKE_SHORTER_TEMPLATE_ID } from "./ai-helper-mappers.js";
import { normalizeSmartReplyMsgIds } from "./smart-reply-mappers.js";
import {
  type ConversationLookup,
  decodeConversationListCursor,
  type MaterialCollectionScope,
  parseMySqlId,
  type WorkbenchRepository,
} from "./workbench-repository.js";
import {
  getMaterialContentTypeForBizType,
} from "./material-collection-mappers.js";
import {
  getPlayableMediaHost,
  isPlayableVoicePathname,
  toPlayableVoicePathname,
} from "./media-config.js";
import { normalizeMediaAssetUrl } from "./workbench-content-utils.js";

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
const MATERIAL_COLLECTION_GROUP_TITLE_MAX_LENGTH = 10;
const DEFAULT_H5_COVER_URL = "https://b5.bokr.com.cn/dist/default-cover.png";
const QUICK_REPLY_SORT_BASE = 1_000_000_000;

type NormalizedQuickReplyEnsureCategory = {
  children: string[];
  rowNumber: number;
  title: string;
};

type NormalizedQuickReplyBatchItem = {
  categoryId: string;
  contentText: string;
  labelColor: string;
  labelText: string;
  rowNumber: number;
};

type SmartReplyMessagePageMetadata = {
  smartReplyScope?: {
    chatType: number;
    thirdExternalId: string;
    thirdUserId: string;
    uid: number;
  };
};

type MessagePageWithSmartReplyMetadata = WorkbenchMessagePageDto &
  SmartReplyMessagePageMetadata;

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

function assertSmartReplySingleConversation(conversation: ConversationLookup) {
  if (conversation.chatType !== CHAT_TYPE.SINGLE) {
    throw new BadRequestError(
      "SMART_REPLY_SCOPE_INVALID",
      "当前会话暂不支持智能回复",
    );
  }
}

function getSmartReplyThirdExternalId(conversation: ConversationLookup) {
  assertSmartReplySingleConversation(conversation);

  const thirdExternalId = conversation.thirdExternalUserId?.trim();

  if (!thirdExternalId) {
    throw new BadRequestError(
      "SMART_REPLY_SCOPE_INVALID",
      "当前会话缺少智能回复所需的外部标识",
    );
  }

  return thirdExternalId;
}

export type WorkbenchService = {
  changeConversationFullAuto(
    subUserId: string,
    conversationId: string,
    request: { enabled: boolean },
  ):
    | Promise<WorkbenchConversationFullAutoResponse>
    | WorkbenchConversationFullAutoResponse;
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
    options?: { cursor?: string; limit?: number; mode?: "single" | "group" },
  ): Promise<WorkbenchConversationListResponse> | WorkbenchConversationListResponse;
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
  getUploadCredential(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchUploadCredentialResponse> | WorkbenchUploadCredentialResponse;
  getSeats(subUserId: string): Promise<WorkbenchSeatDto[]> | WorkbenchSeatDto[];
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
  constructor(
    private readonly repository: WorkbenchRepository,
    private readonly javaClient: WorkbenchJavaClient,
    private readonly logger: AppLogger = noopLogger,
    private readonly playableVoiceExists: PlayableVoiceExistsChecker =
      checkPlayableVoiceExists,
  ) {}

  async deleteConversation(subUserId: string, conversationId: string) {
    const conversation = await this.getOperableConversation(subUserId, conversationId);

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

    return subUser;
  }

  async getSidebarIframeParams(
    subUserId: string,
    input: WorkbenchSidebarIframeParamsRequest,
  ): Promise<WorkbenchSidebarIframeParamsDto> {
    await this.getMe(subUserId);
    await this.assertSeatAccess(subUserId, input.seatId);

    const conversation = await this.repository.getConversationLookup(input.conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    if (conversation.seatId !== input.seatId) {
      throw new BadRequestError("CONVERSATION_SEAT_MISMATCH", "会话与席位不匹配");
    }

    const secrets = await this.repository.getEmbedUserRelationTuseSecrets(subUserId);

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
    await this.getMe(subUserId);

    return this.repository.listSeats(subUserId);
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
    const subUser = await this.getMe(subUserId);

    if (options.scope === "all") {
      return this.repository.listCustomers({
        cursor: options.cursor,
        keyword: options.keyword,
        limit: options.limit,
        platform: subUser.platform,
        scope: "all",
        uid: subUser.uid,
      });
    }

    return this.repository.listCustomers({
      cursor: options.cursor,
      keyword: options.keyword,
      limit: options.limit,
      scope: "mine",
      seatIds: options.seatIds,
      subUserId,
    });
  }

  async getCustomerLastConversation(
    subUserId: string,
    thirdExternalUserId: string,
  ): Promise<WorkbenchCustomerLastConversationResponse> {
    const subUser = await this.getMe(subUserId);

    if (subUser.uid == null || subUser.platform == null) {
      return {};
    }

    return {
      lastConversation: await this.repository.getCustomerLastConversation({
        platform: subUser.platform,
        thirdExternalUserId,
        uid: subUser.uid,
      }),
    };
  }

  async getCustomerRelationConversations(
    subUserId: string,
    thirdExternalUserId: string,
    thirdUserIds: string[],
  ): Promise<WorkbenchCustomerRelationConversationsResponse> {
    const subUser = await this.getMe(subUserId);

    if (subUser.uid == null || subUser.platform == null) {
      return { items: [] };
    }

    return {
      items: await this.repository.listCustomerRelationConversations({
        platform: subUser.platform,
        thirdExternalUserId,
        thirdUserIds,
        uid: subUser.uid,
      }),
    };
  }

  async getConversations(
    subUserId: string,
    seatId: string,
    options?: { cursor?: string; limit?: number; mode?: "single" | "group" },
  ) {
    await this.assertSeatAccess(subUserId, seatId);
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
    });
  }

  async getMessages(
    subUserId: string,
    conversationId: string,
    options?: { beforeSeq?: number; limit?: number },
  ) {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

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
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    return this.repository.listMessagesBySeqs(conversationId, messageSeqs);
  }

  async getChatRecordDetail(
    subUserId: string,
    conversationId: string,
    msgInfoId: number,
  ) {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

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
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    return this.repository.listHistoryMessages(conversationId, {
      cursor: options.cursor,
      day: options.day,
      limit: options.limit,
      scope: options.scope,
      senderId: options.senderId,
    });
  }

  async getGroupMembers(subUserId: string, conversationId: string) {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    const groupMembers = await this.repository.listGroupMembers(conversationId);

    if (!groupMembers) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    return groupMembers;
  }

  async getUploadCredential(subUserId: string, conversationId: string) {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

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
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

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
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

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
    const conversation = await this.repository.getConversationLookup(input.conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    if (!Number.isSafeInteger(input.messageSeq) || input.messageSeq <= 0) {
      throw new BadRequestError("INVALID_MESSAGE_SEQ", "消息序号无效");
    }

    const rawContent = await this.repository.getMessageRawContent({
      auditId: input.messageSeq,
      platform: conversation.platform,
      thirdExternalUserId: conversation.thirdExternalUserId,
      thirdGroupId: conversation.thirdGroupId,
      thirdUserId: conversation.thirdUserId,
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
    const conversation = await this.repository.getConversationLookup(input.conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    if (!Number.isSafeInteger(input.messageSeq) || input.messageSeq <= 0) {
      throw new BadRequestError("INVALID_MESSAGE_SEQ", "消息序号无效");
    }

    const rawContent = await this.repository.getMessageRawContent({
      auditId: input.messageSeq,
      platform: conversation.platform,
      thirdExternalUserId: conversation.thirdExternalUserId,
      thirdGroupId: conversation.thirdGroupId,
      thirdUserId: conversation.thirdUserId,
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
    const conversation = await this.getOperableConversation(subUserId, conversationId);

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
    const conversation = await this.getOperableConversation(subUserId, conversationId);

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
    const conversation = await this.getOperableConversation(subUserId, conversationId);

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

    const conversation = await this.getOperableConversation(subUserId, conversationId);

    if (request.enabled && conversation.chatType !== CHAT_TYPE.SINGLE) {
      throw new BadRequestError("FULL_AUTO_GROUP_UNSUPPORTED", "群聊暂不支持 AI 托管");
    }

    await this.javaClient.changeConversationFullAuto({
      change: request.enabled ? 1 : 2,
      conversationId: conversation.id,
      operatorId: subUserNumericId,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    if (request.enabled) {
      await this.insertFullAutoEnabledSystemMessage({
        conversationId: conversation.id,
        operatorId: subUserNumericId,
        platform: conversation.platform,
        subUserId,
        thirdExternalUserId: conversation.thirdExternalUserId,
        thirdGroupId: conversation.thirdGroupId,
        thirdUserId: conversation.thirdUserId,
        uid: conversation.uid,
      });
    }

    return {
      conversationAIHostingSwitch: request.enabled,
      conversationId: conversation.id,
      seatId: conversation.seatId,
    };
  }

  async getFullAutoAnswerStatus(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchFullAutoAnswerStatusResponse> {
    const conversation = await this.getAccessibleConversation(subUserId, conversationId);

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
    if (request.currentSeatId) {
      await this.assertSeatAccess(subUserId, request.currentSeatId);
    } else {
      await this.getMe(subUserId);
    }

    const activeConversationMessages =
      request.activeConversationId && request.activeMessageSeq != null
        ? await this.getActiveConversationMessages(
            subUserId,
            request.activeConversationId,
            request.activeMessageSeq,
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
        ? await this.repository.getSeatEventScope(subUserId)
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
    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);
    assertSmartReplySingleConversation(conversation);

    const javaMsgIds = normalizeSmartReplyMsgIds(request.msgIds);

    if (javaMsgIds.length === 0) {
      return { suggestions: [] };
    }

    const thirdExternalId = getSmartReplyThirdExternalId(conversation);

    const javaRequest = {
      chatType: CHAT_TYPE.SINGLE,
      msgIds: javaMsgIds,
      thirdExternalId,
      thirdUserId: conversation.thirdUserId,
      uid: conversation.uid,
    };

    return this.javaClient.listUserHistoryAnswers(javaRequest);
  }

  async requestSmartReplyGeneralAnswer(
    subUserId: string,
    request: WorkbenchSmartReplyGeneralAnswerRequest,
  ) {
    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    if (!Number.isSafeInteger(request.msgId) || request.msgId <= 0) {
      throw new BadRequestError("SMART_REPLY_MSG_INVALID", "消息序号无效");
    }

    const thirdExternalId = getSmartReplyThirdExternalId(conversation);

    return this.javaClient.requestGeneralAnswer({
      chatType: CHAT_TYPE.SINGLE,
      msgId: request.msgId,
      questionImgs: request.questionImgs ?? [],
      thirdExternalId,
      thirdUserId: conversation.thirdUserId,
      uid: conversation.uid,
    });
  }

  async requestSmartReplyAutoGeneralAnswer(
    subUserId: string,
    request: WorkbenchSmartReplyAutoGeneralAnswerRequest,
  ) {
    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    if (!Number.isSafeInteger(request.msgId) || request.msgId <= 0) {
      throw new BadRequestError("SMART_REPLY_MSG_INVALID", "消息序号无效");
    }

    const thirdExternalId = getSmartReplyThirdExternalId(conversation);

    return this.javaClient.requestAutoGeneralAnswer({
      chatType: CHAT_TYPE.SINGLE,
      msgId: request.msgId,
      thirdExternalId,
      thirdUserId: conversation.thirdUserId,
      uid: conversation.uid,
    });
  }

  async requestSmartReplyMakeShorter(
    subUserId: string,
    request: WorkbenchSmartReplyMakeShorterRequest,
  ) {
    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);
    assertSmartReplySingleConversation(conversation);

    const content = request.content.trim();

    if (!content) {
      throw new BadRequestError("SMART_REPLY_CONTENT_EMPTY", "智能回复内容不能为空");
    }

    const configParamId = await this.javaClient.getAiHelperTemplate({
      templateId: SMART_REPLY_MAKE_SHORTER_TEMPLATE_ID,
      uid: conversation.uid,
    });

    if (configParamId == null) {
      throw new BadGatewayError(
        WORKBENCH_INTERNAL_API_FAILED_CODE,
        "智能回复模板配置无效",
      );
    }

    const { generateId } = await this.javaClient.submitAiHelperGenerateAsk({
      params: [
        {
          id: configParamId,
          value: [content],
        },
      ],
      templateId: SMART_REPLY_MAKE_SHORTER_TEMPLATE_ID,
      uid: conversation.uid,
    });

    const shortenedContent = await this.javaClient.streamAiHelperAsk({
      generateId,
      uid: conversation.uid,
    });

    return { content: shortenedContent };
  }

  async sendSmartReplyAnswer(
    subUserId: string,
    request: WorkbenchSmartReplySendAnswerRequest,
  ) {
    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);
    assertSmartReplySingleConversation(conversation);

    const realAnswer = request.realAnswer.trim();
    const recordId = request.recordId.trim();

    if (!realAnswer) {
      throw new BadRequestError("SMART_REPLY_CONTENT_EMPTY", "智能回复内容不能为空");
    }

    if (!recordId) {
      throw new BadRequestError("SMART_REPLY_RECORD_INVALID", "智能回复记录无效");
    }

    const optNos = (request.optNos ?? [])
      .map((optNo) => optNo.trim())
      .filter((optNo) => optNo.length > 0);

    if (optNos.length === 0) {
      throw new BadRequestError("SMART_REPLY_OPT_NO_INVALID", "发送消息操作编号无效");
    }

    await this.javaClient.sendRecommendAnswer({
      optNos,
      realAnswer,
      // 新 send-answer 接口暂未启用附件 id，先不传 realAttachIds
      // realAttachIds: request.realAttachIds,
      recordId,
      uid: conversation.uid,
    });

    return { ok: true as const };
  }

  async listSmartReplyAttachments(
    subUserId: string,
    request: WorkbenchSmartReplyAttachmentsRequest,
  ) {
    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);
    assertSmartReplySingleConversation(conversation);

    const ids = normalizeAttachmentIds(request.ids);

    if (ids.length === 0) {
      return { attachments: [] };
    }

    return this.javaClient.listAttachments({
      ids,
      uid: conversation.uid,
    });
  }

  async checkSmartReplyTextModeration(
    subUserId: string,
    request: WorkbenchSmartReplyTextModerationRequest,
  ) {
    const content = request.content.trim();

    if (!content) {
      throw new BadRequestError("TEXT_MODERATION_CONTENT_EMPTY", "检测内容不能为空");
    }

    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);
    assertSmartReplySingleConversation(conversation);

    return this.javaClient.checkTextModerationPlus({
      content,
      uid: conversation.uid,
    });
  }

  async listKnowledgePage(
    subUserId: string,
    request: WorkbenchKnowledgePageRequest,
  ) {
    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);
    assertSmartReplySingleConversation(conversation);

    const response = await this.javaClient.listKnowledgePage({
      page: 1,
      pageSize: 9999,
      uid: conversation.uid,
    });

    this.logger.info(
      {
        conversationId: request.conversationId,
        list: response.list,
        listLength: response.list.length,
        operation: "list-knowledge-page",
        uid: conversation.uid,
      },
      "知识集列表映射结果",
    );

    return response;
  }

  async getKnowledgeConfig(
    subUserId: string,
    request: WorkbenchKnowledgeConfigRequest,
  ) {
    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);
    assertSmartReplySingleConversation(conversation);

    return this.javaClient.getKnowledgeConfig({
      uid: conversation.uid,
    });
  }

  async listKnowledgeDocPage(
    subUserId: string,
    request: WorkbenchKnowledgeDocPageRequest,
  ) {
    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);
    assertSmartReplySingleConversation(conversation);

    const knowledgeId = normalizeKnowledgeId(request.knowledgeId);

    if (knowledgeId == null) {
      this.logger.warn(
        {
          conversationId: request.conversationId,
          knowledgeId: request.knowledgeId,
          operation: "list-knowledge-doc-page",
          uid: conversation.uid,
        },
        "知识集 ID 无效",
      );
      throw new BadRequestError("INVALID_KNOWLEDGE_ID", "知识集 ID 无效");
    }

    const response = await this.javaClient.listKnowledgeDocPage({
      knowledgeId,
      page: 1,
      pageSize: 9999,
      uid: conversation.uid,
    });

    this.logger.info(
      {
        conversationId: request.conversationId,
        knowledgeId,
        list: response.list,
        listLength: response.list.length,
        operation: "list-knowledge-doc-page",
        uid: conversation.uid,
      },
      "知识集 FAQ 列表映射结果",
    );

    return response;
  }

  async addKnowledgeFaq(
    subUserId: string,
    request: WorkbenchKnowledgeFaqAddRequest,
  ) {
    const conversation = await this.repository.getConversationLookup(
      request.conversationId,
    );

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);
    assertSmartReplySingleConversation(conversation);

    const docId = normalizeKnowledgeId(request.docId);

    if (docId == null) {
      throw new BadRequestError("INVALID_KNOWLEDGE_DOC_ID", "FAQ ID 无效");
    }

    if (request.list.length === 0) {
      throw new BadRequestError("INVALID_KNOWLEDGE_FAQ_LIST", "FAQ 内容不能为空");
    }

    return this.javaClient.addKnowledgeFaq({
      docId,
      list: request.list.map((item) => ({
        answer: item.answer,
        attachIds: item.attachIds,
        question: item.question,
        similarQuestion: item.similarQuestion,
      })),
      source: JAVA_KNOWLEDGE_FAQ_SOURCE,
      uid: conversation.uid,
    });
  }

  async sendSmartHeartbeat(
    subUserId: string,
    request: WorkbenchSmartHeartbeatRequest,
  ) {
    const conversation = await this.getOperableConversation(
      subUserId,
      request.conversationId,
    );

    if (conversation.thirdGroupId) {
      throw new BadRequestError(
        "SMART_HEARTBEAT_GROUP_UNSUPPORTED",
        "群聊不支持沟通心跳",
      );
    }

    const thirdExternalUserId = conversation.thirdExternalUserId?.trim();

    if (!thirdExternalUserId) {
      throw new BadRequestError(
        "SMART_HEARTBEAT_CUSTOMER_MISSING",
        "客户信息缺失",
      );
    }

    await this.javaClient.sendSmartHeartbeat({
      platform: conversation.platform,
      thirdExternalUserId,
      thirdUserId: conversation.thirdUserId,
      uid: conversation.uid,
    });

    return { ok: true as const };
  }

  async sendMessage(subUserId: string, payload: WorkbenchSendMessagePayload) {
    const conversation = await this.getOperableConversation(subUserId, payload.conversationId);

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
    const conversation = await this.getOperableConversation(subUserId, conversationId);

    if (!Number.isSafeInteger(messageSeq) || messageSeq <= 0) {
      throw new BadRequestError("INVALID_MESSAGE_SEQ", "消息序号无效");
    }

    const message = await this.repository.getMessageForRevoke({
      conversationId: conversation.id,
      messageSeq,
      platform: conversation.platform,
      thirdExternalUserId: conversation.thirdExternalUserId,
      thirdGroupId: conversation.thirdGroupId,
      thirdUserId: conversation.thirdUserId,
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

    await this.assertSeatAccess(subUserId, seatId);

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
    await this.assertSeatAccess(subUserId, seatId);

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
    const conversation = await this.getOperableConversation(subUserId, conversationId);

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

  async listMaterialCollections(
    subUserId: string,
    request: WorkbenchMaterialCollectionListRequest,
  ): Promise<WorkbenchMaterialCollectionListResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialBizType(request.bizType);
    const groupId =
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
        ? 0
        : request.groupId;

    if (bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION && groupId == null) {
      throw new BadRequestError("MATERIAL_GROUP_REQUIRED", "请选择分组");
    }

    const requiredGroupId = groupId ?? 0;
    const page = normalizeMaterialPage(request.page);
    const pageSize = normalizeMaterialPageSize(request.pageSize);
    const result = await this.repository.listMaterialCollections({
      bizType,
      groupId: requiredGroupId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      subUserId,
      uid: me.uid,
    });

    return {
      items: result.items,
      pagination: {
        hasMore: page * pageSize < result.total,
        page,
        pageSize,
        total: result.total,
      },
    };
  }

  async listMaterialGroups(
    subUserId: string,
    request: WorkbenchMaterialCollectionGroupListRequest,
  ): Promise<WorkbenchMaterialCollectionGroupListResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialGroupBizType(request.bizType);

    return {
      groups: await this.repository.listMaterialGroups({
        bizType,
        subUserId,
        uid: me.uid,
      }),
    };
  }

  async collectMaterial(
    subUserId: string,
    request: WorkbenchMaterialCollectionCreateRequest,
  ): Promise<WorkbenchMaterialCollectionCreateResponse> {
    const me = await this.getMaterialActor(subUserId);
    const subUserNumericId = parseMaterialSubUserId(subUserId);
    const bizType = parseMaterialBizType(request.bizType);
    const contentType = getMaterialContentTypeForBizType(bizType);

    if (!contentType) {
      throw new BadRequestError("UNSUPPORTED_MATERIAL_MESSAGE", "当前消息不支持收藏");
    }

    const enterpriseGroupId =
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
        ? undefined
        : readEnterpriseMaterialGroupId(request.groupId);
    const groupId =
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION ? 0 : enterpriseGroupId;

    if (groupId === undefined) {
      return {
        success: false,
        errorMsg: "请选择分组",
      };
    }

    if (
      enterpriseGroupId &&
      !(await this.repository.hasActiveMaterialGroup({
        bizType,
        groupId: enterpriseGroupId,
        uid: me.uid,
      }))
    ) {
      return {
        success: false,
        errorMsg: "请选择有效分组",
      };
    }

    const message = await this.repository.findMaterialMessage({
      msgInfoId: request.msgInfoId,
      uid: me.uid,
    });

    if (!message || !isMaterialMessageTypeMatched(bizType, message.msgtype)) {
      throw new BadRequestError("UNSUPPORTED_MATERIAL_MESSAGE", "当前消息不支持收藏");
    }

    if (
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO &&
      !isAgentMaterialMessage(message)
    ) {
      return {
        success: false,
        errorMsg: "只能收录席位号发送的视频",
      };
    }

    const rawContentForCollection = await this.prepareMaterialCollectionContent(
      bizType,
      message,
      me,
    );

    if ("errorMsg" in rawContentForCollection) {
      return {
        success: false,
        errorMsg: rawContentForCollection.errorMsg,
      };
    }

    const subUid =
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION ? subUserNumericId : 0;
    const sort = Date.now();
    const normalizedMaterial = normalizeMaterialCollectionPayload(
      bizType,
      rawContentForCollection.content,
      request,
      request.msgInfoId,
      contentType,
    );

    if ("errorMsg" in normalizedMaterial) {
      return {
        success: false,
        errorMsg: normalizedMaterial.errorMsg,
      };
    }

    const { content: normalizedContent, title } = normalizedMaterial;
    const msgInfoId = String(message.id);
    const duplicate = await this.repository.findMaterialCollectionByMessage({
      bizType,
      msgInfoId,
      subUid,
      uid: me.uid,
    });

    if (duplicate?.bizStatus === 1) {
      return {
        success: true,
        duplicated: true,
      };
    }

    if (duplicate) {
      await this.repository.restoreMaterialCollection({
        content: normalizedContent,
        groupId,
        id: duplicate.id,
        msgInfoId,
        opSubUserId: subUserId,
        sort,
        title,
        uid: me.uid,
      });

      return {
        success: true,
        duplicated: true,
      };
    }

    const collectionId = await this.repository.createMaterialCollection({
      bizType,
      content: normalizedContent,
      groupId,
      msgInfoId,
      opSubUserId: subUserId,
      sort,
      subUid,
      title,
      uid: me.uid,
    });

    if (collectionId === "DUPLICATE") {
      return {
        success: true,
        duplicated: true,
      };
    }

    if (!collectionId) {
      return {
        success: false,
        errorMsg: "素材收录失败，请稍后重试",
      };
    }

    return {
      success: true,
    };
  }

  async updateMaterialCollection(
    subUserId: string,
    collectionId: string,
    request: WorkbenchMaterialCollectionUpdateRequest,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scope = await this.getOperableMaterialCollectionScope(
      me.uid,
      collectionId,
      subUserId,
    );

    if (!canEditMaterialCollectionItem(scope.bizType)) {
      throw new BadRequestError("MATERIAL_COLLECTION_NOT_EDITABLE", "当前素材不支持编辑");
    }

    const record = await this.repository.findMaterialCollectionRecord({
      id: collectionId,
      subUid: scope.subUid,
      uid: me.uid,
    });

    if (!record) {
      throw new NotFoundError("MATERIAL_COLLECTION_NOT_FOUND", "素材不存在");
    }

    const patchResult =
      scope.bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE
        ? patchMaterialFileContentJson(record.content, request.fileName ?? "")
        : patchMaterialH5ContentJson(record.content, {
            description: request.description,
            title: request.title ?? "",
          });

    if ("errorMsg" in patchResult) {
      throw new BadRequestError("MATERIAL_COLLECTION_INVALID", patchResult.errorMsg);
    }

    await this.repository.updateMaterialCollectionContent({
      content: patchResult.content,
      id: collectionId,
      subUid: scope.subUid,
      title: patchResult.title,
      uid: me.uid,
    });

    return { ok: true };
  }

  async deleteMaterialCollection(
    subUserId: string,
    collectionId: string,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scope = await this.getOperableMaterialCollectionScope(
      me.uid,
      collectionId,
      subUserId,
    );

    await this.repository.deleteMaterialCollection({
      id: collectionId,
      subUid: scope.subUid,
      uid: me.uid,
    });

    return { ok: true };
  }

  async topMaterialCollection(
    subUserId: string,
    collectionId: string,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scope = await this.getOperableMaterialCollectionScope(
      me.uid,
      collectionId,
      subUserId,
    );

    await this.repository.topMaterialCollection({
      id: collectionId,
      sort: Date.now(),
      subUid: scope.subUid,
      uid: me.uid,
    });

    return { ok: true };
  }

  async moveMaterialCollection(
    subUserId: string,
    collectionId: string,
    request: WorkbenchMaterialCollectionMoveRequest,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const groupId = readEnterpriseMaterialGroupId(request.groupId);

    if (groupId === undefined) {
      throw new BadRequestError("MATERIAL_GROUP_REQUIRED", "请选择分组");
    }

    const scope = await this.getOperableMaterialCollectionScope(
      me.uid,
      collectionId,
      subUserId,
    );

    if (scope.bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
      throw new BadRequestError("MATERIAL_GROUP_UNSUPPORTED", "表情不支持移动分组");
    }

    if (
      !(await this.repository.hasActiveMaterialGroup({
        bizType: scope.bizType,
        groupId,
        uid: me.uid,
      }))
    ) {
      throw new BadRequestError("MATERIAL_GROUP_NOT_FOUND", "分组不存在");
    }

    await this.repository.moveMaterialCollection({
      groupId,
      id: collectionId,
      sort: Date.now(),
      subUid: scope.subUid,
      uid: me.uid,
    });

    return { ok: true };
  }

  async createMaterialGroup(
    subUserId: string,
    request: WorkbenchMaterialCollectionGroupCreateRequest,
  ): Promise<WorkbenchMaterialCollectionGroupCreateResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialGroupBizType(request.bizType);
    const sort = Date.now();
    const title = normalizeMaterialGroupTitle(request.title);
    const groupCount = await this.repository.countMaterialGroups({
      bizType,
      subUserId,
      uid: me.uid,
    });

    if (groupCount >= MATERIAL_COLLECTION_GROUP_MAX_COUNT) {
      throw new BadRequestError(
        "MATERIAL_GROUP_LIMIT_REACHED",
        "分组数量已达上限",
      );
    }

    const groupId = await this.repository.createMaterialGroup({
      bizType,
      sort,
      subUid: 0,
      title,
      uid: me.uid,
    });

    if (!groupId) {
      throw new InternalServerError("MATERIAL_GROUP_CREATE_FAILED", "新建分组失败");
    }

    return {
      bizType,
      id: groupId,
      sort,
      title,
    };
  }

  async renameMaterialGroup(
    subUserId: string,
    groupId: string,
    bizTypeValue: number,
    request: WorkbenchMaterialCollectionGroupUpdateRequest,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialGroupBizType(bizTypeValue);

    await this.repository.renameMaterialGroup({
      bizType,
      groupId,
      title: normalizeMaterialGroupTitle(request.title),
      uid: me.uid,
    });

    return { ok: true };
  }

  async topMaterialGroup(
    subUserId: string,
    groupId: string,
    bizTypeValue: number,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialGroupBizType(bizTypeValue);

    await this.repository.topMaterialGroup({
      bizType,
      groupId,
      sort: Date.now(),
      uid: me.uid,
    });

    return { ok: true };
  }

  async deleteMaterialGroup(
    subUserId: string,
    groupId: string,
    bizTypeValue: number,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialGroupBizType(bizTypeValue);
    const isEmpty = await this.repository.isMaterialGroupEmpty({
      bizType,
      groupId,
      uid: me.uid,
    });

    if (!isEmpty) {
      throw new BadRequestError(
        "MATERIAL_GROUP_NOT_EMPTY",
        "请先移走或删除分组内素材",
      );
    }

    await this.repository.deleteMaterialGroup({
      bizType,
      groupId,
      uid: me.uid,
    });

    return { ok: true };
  }

  async listQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryListRequest,
  ): Promise<WorkbenchQuickReplyCategoryListResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);

    return {
      categories: await this.repository.listQuickReplyCategories({
        scopeType,
        subUserId,
        uid: me.uid,
      }),
    };
  }

  async ensureQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryEnsureRequest,
  ): Promise<WorkbenchQuickReplyCategoryEnsureResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const normalized = normalizeQuickReplyCategoryEnsureRequest(request.categories);

    if (!normalized.ok) {
      return buildQuickReplyImportFailure(normalized.errors);
    }

    const existingCategories = await this.repository.listQuickReplyCategories({
      scopeType,
      subUserId,
      uid: me.uid,
    });
    const { childrenByParentId, primaryByTitle } =
      indexQuickReplyCategories(existingCategories);
    const limitErrors = validateQuickReplyCategoryEnsureLimits({
      categories: normalized.categories,
      childrenByParentId,
      primaryByTitle,
    });

    if (limitErrors.length > 0) {
      return buildQuickReplyImportFailure(limitErrors);
    }

    const responseCategories: WorkbenchQuickReplyCategoryEnsureSuccessResponse["categories"] =
      [];
    let createdPrimaryCategoryCount = 0;
    let createdSecondaryCategoryCount = 0;

    for (const category of normalized.categories) {
      let primaryCategory = primaryByTitle.get(category.title);

      if (!primaryCategory) {
        const id = await this.repository.createQuickReplyCategory({
          opSubUserId: subUserId,
          parentId: 0,
          scopeType,
          sort: await this.getQuickReplyCategoryAppendSort({
            parentId: 0,
            scopeType,
            subUserId,
            uid: me.uid,
          }),
          subUserId,
          title: category.title,
          uid: me.uid,
        });

        if (!id) {
          throw new InternalServerError(
            "QUICK_REPLY_CATEGORY_CREATE_FAILED",
            "创建快捷话术分类失败",
          );
        }

        primaryCategory = { id, title: category.title };
        primaryByTitle.set(category.title, primaryCategory);
        childrenByParentId.set(id, new Map());
        createdPrimaryCategoryCount += 1;
      }

      const childrenByTitle =
        childrenByParentId.get(primaryCategory.id) ?? new Map<string, { id: string; title: string }>();
      childrenByParentId.set(primaryCategory.id, childrenByTitle);
      const responseChildren: Array<{ id: string; title: string }> = [];

      for (const childTitle of category.children) {
        let childCategory = childrenByTitle.get(childTitle);

        if (!childCategory) {
          const id = await this.repository.createQuickReplyCategory({
            opSubUserId: subUserId,
            parentId: primaryCategory.id,
            scopeType,
            sort: await this.getQuickReplyCategoryAppendSort({
              parentId: primaryCategory.id,
              scopeType,
              subUserId,
              uid: me.uid,
            }),
            subUserId,
            title: childTitle,
            uid: me.uid,
          });

          if (!id) {
            throw new InternalServerError(
              "QUICK_REPLY_CATEGORY_CREATE_FAILED",
              "创建快捷话术分类失败",
            );
          }

          childCategory = { id, title: childTitle };
          childrenByTitle.set(childTitle, childCategory);
          createdSecondaryCategoryCount += 1;
        }

        responseChildren.push(childCategory);
      }

      responseCategories.push({
        children: responseChildren,
        id: primaryCategory.id,
        title: primaryCategory.title,
      });
    }

    return {
      categories: responseCategories,
      ok: true,
      summary: {
        createdPrimaryCategoryCount,
        createdSecondaryCategoryCount,
      },
    };
  }

  async listQuickReplyCategoryContent(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryContentRequest,
  ): Promise<WorkbenchQuickReplyCategoryContentResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const result = await this.repository.listQuickReplyCategoryContent({
      categoryLimit: QUICK_REPLY_CHILD_CATEGORY_LIMIT,
      parentCategoryId: request.parentCategoryId,
      quickReplyLimit: QUICK_REPLY_CATEGORY_CONTENT_ITEM_LIMIT,
      scopeType,
      subUserId,
      uid: me.uid,
    });
    const quickRepliesByCategoryId: Record<string, WorkbenchQuickReplyDto[]> = {};

    for (const category of result.categories) {
      quickRepliesByCategoryId[category.id] = [];
    }

    for (const quickReply of result.quickReplies) {
      if (typeof quickReply.categoryId !== "string") {
        continue;
      }

      quickRepliesByCategoryId[quickReply.categoryId] ??= [];
      quickRepliesByCategoryId[quickReply.categoryId]?.push(quickReply);
    }

    return {
      categories: result.categories,
      limits: {
        categories: QUICK_REPLY_CHILD_CATEGORY_LIMIT,
        quickReplies: QUICK_REPLY_CATEGORY_CONTENT_ITEM_LIMIT,
      },
      quickRepliesByCategoryId,
      truncated: result.truncated,
    };
  }

  async createQuickReplyCategory(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryCreateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const parentId = normalizeQuickReplyCategoryId(request.parentId ?? 0);

    if (parentId !== 0) {
      const parentExists = await this.repository.hasActiveQuickReplyCategory({
        categoryId: parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      });

      if (!parentExists) {
        throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
      }

      const parentIsChild = await this.repository.isChildQuickReplyCategory({
        categoryId: parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      });

      if (parentIsChild) {
        throw new BadRequestError(
          "QUICK_REPLY_CATEGORY_DEPTH_UNSUPPORTED",
          "最多支持二级分类",
        );
      }

      const childCount = await this.repository.countChildQuickReplyCategories({
        categoryId: parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      });

      if (childCount >= QUICK_REPLY_CHILD_CATEGORY_LIMIT) {
        throw new BadRequestError(
          "QUICK_REPLY_CHILD_CATEGORY_LIMIT_EXCEEDED",
          "二级分类最多50个",
        );
      }
    } else {
      const topCategoryCount = await this.repository.countChildQuickReplyCategories({
        categoryId: "0",
        scopeType,
        subUserId,
        uid: me.uid,
      });

      if (topCategoryCount >= QUICK_REPLY_TOP_CATEGORY_LIMIT) {
        throw new BadRequestError(
          "QUICK_REPLY_TOP_CATEGORY_LIMIT_EXCEEDED",
          "一级分类最多50个",
        );
      }
    }

    await this.repository.createQuickReplyCategory({
      opSubUserId: subUserId,
      parentId,
      scopeType,
      sort: await this.getQuickReplyCategoryAppendSort({
        parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      title: normalizeQuickReplyCategoryTitle(request.title),
      uid: me.uid,
    });

    return { ok: true };
  }

  async renameQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
    request: WorkbenchQuickReplyCategoryUpdateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);

    const updated = await this.repository.renameQuickReplyCategory({
      categoryId,
      scopeType: parseQuickReplyScopeType(scopeTypeValue),
      subUserId,
      title: normalizeQuickReplyCategoryTitle(request.title),
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    return { ok: true };
  }

  async topQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);

    const updated = await this.repository.topQuickReplyCategory({
      categoryId,
      scopeType,
      sort: await this.getQuickReplyCategoryPrependSort({
        categoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    return { ok: true };
  }

  async bottomQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);

    const updated = await this.repository.bottomQuickReplyCategory({
      categoryId,
      scopeType,
      sort: await this.getQuickReplyCategoryAppendSortForExisting({
        categoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    return { ok: true };
  }

  async deleteQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);
    const childCount = await this.repository.countChildQuickReplyCategories({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (childCount > 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CATEGORY_HAS_CHILDREN",
        "请先删除话术分组",
      );
    }

    const replyCount = await this.repository.countQuickRepliesInCategory({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (replyCount > 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CATEGORY_NOT_EMPTY",
        "请先删除分组下的话术",
      );
    }

    const updated = await this.repository.deleteQuickReplyCategory({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    return { ok: true };
  }

  async moveQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
    request: WorkbenchQuickReplyCategoryMoveRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);
    const parentId = normalizeQuickReplyCategoryId(request.parentId);

    if (parentId === 0) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_MOVE_INVALID", "请选择一级分类");
    }

    const sourceScope = await this.repository.findQuickReplyCategoryScope({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!sourceScope) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    if (sourceScope.parentId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CATEGORY_MOVE_INVALID",
        "一级分类暂不支持移动",
      );
    }

    if (sourceScope.parentId === parentId) {
      return { ok: true };
    }

    const targetScope = await this.repository.findQuickReplyCategoryScope({
      categoryId: parentId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!targetScope) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    if (targetScope.parentId !== 0) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_MOVE_INVALID", "请选择一级分类");
    }

    const childCount = await this.repository.countChildQuickReplyCategories({
      categoryId: parentId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (childCount >= QUICK_REPLY_CHILD_CATEGORY_LIMIT) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_LIMIT_EXCEEDED",
        "二级分类最多50个",
      );
    }

    const [targetQuickReplyCount, sourceQuickReplyCount] = await Promise.all([
      this.repository.countQuickRepliesUnderTopCategory({
        categoryId: parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      this.repository.countQuickRepliesInCategory({
        categoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
    ]);

    if (
      targetQuickReplyCount + sourceQuickReplyCount >
      QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT
    ) {
      throw new BadRequestError(
        "QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT_EXCEEDED",
        "一级分类下话术最多5000条",
      );
    }

    const updated = await this.repository.moveQuickReplyCategory({
      categoryId,
      parentId,
      scopeType,
      sort: await this.getQuickReplyCategoryAppendSort({
        parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    return { ok: true };
  }

  async sortQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategorySortRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const parentId = normalizeQuickReplyCategoryId(request.parentId);

    if (parentId === 0) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_SORT_INVALID", "请选择一级分类");
    }

    const parentScope = await this.repository.findQuickReplyCategoryScope({
      categoryId: parentId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!parentScope) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    if (parentScope.parentId !== 0) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_SORT_INVALID", "请选择一级分类");
    }

    const currentItems = await this.repository.listActiveQuickReplyCategorySortItems({
      parentId,
      scopeType,
      subUserId,
      uid: me.uid,
    });
    const currentIds = currentItems.map((item) => item.id);

    if (!hasSameOrderedScopeIds(currentIds, request.categoryIds)) {
      throw new BadRequestError(
        "QUICK_REPLY_SORT_SCOPE_CHANGED",
        "排序数据已变化，请刷新后重试",
      );
    }

    if (hasSameExactOrder(currentIds, request.categoryIds)) {
      return { ok: true };
    }

    const currentSortById = new Map(
      currentItems.map((item) => [item.id, item.sort]),
    );
    const items = buildSortRewriteItems(request.categoryIds)
      .map((item) => ({
        categoryId: item.id,
        sort: item.sort,
      }))
      .filter((item) => currentSortById.get(item.categoryId) !== item.sort);

    if (items.length === 0) {
      return { ok: true };
    }

    const updated = await this.repository.sortQuickReplyCategories({
      items,
      parentId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new BadRequestError(
        "QUICK_REPLY_SORT_SCOPE_CHANGED",
        "排序数据已变化，请刷新后重试",
      );
    }

    return { ok: true };
  }

  async listQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplyListRequest,
  ): Promise<WorkbenchQuickReplyListResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const page = normalizeMaterialPage(request.page);
    const pageSize = normalizeMaterialPageSize(request.pageSize ?? 50);
    const result = await this.repository.listQuickReplies({
      categoryId: request.categoryId,
      keyword: request.keyword,
      page,
      pageSize,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    return {
      items: result.items,
      pagination: {
        hasMore: page * pageSize < result.total,
        page,
        pageSize,
        total: result.total,
      },
    };
  }

  async createQuickReply(
    subUserId: string,
    request: WorkbenchQuickReplyCreateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const values = await this.normalizeQuickReplyWriteRequest(me.uid, subUserId, request);
    await this.assertQuickReplyTopCategoryItemLimit({
      categoryId: values.categoryId,
      scopeType: values.scopeType,
      subUserId,
      uid: me.uid,
    });

    await this.repository.createQuickReply({
      ...values,
      opSubUserId: subUserId,
      sort: await this.getQuickReplyAppendSort({
        categoryId: values.categoryId,
        scopeType: values.scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    return { ok: true };
  }

  async batchCreateQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplyBatchCreateRequest,
  ): Promise<WorkbenchQuickReplyBatchCreateResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const normalized = normalizeQuickReplyBatchCreateRequest(request.items);

    if (!normalized.ok) {
      return buildQuickReplyImportFailure(normalized.errors);
    }

    const categoryScopes = new Map<string, { parentId: string | 0 } | undefined>();

    for (const categoryId of uniqueStrings(
      normalized.items.map((item) => item.categoryId),
    )) {
      categoryScopes.set(
        categoryId,
        await this.repository.findQuickReplyCategoryScope({
          categoryId,
          scopeType,
          subUserId,
          uid: me.uid,
        }),
      );
    }

    const errors: WorkbenchQuickReplyImportRowError[] = [];

    for (const item of normalized.items) {
      const categoryScope = categoryScopes.get(item.categoryId);

      if (!categoryScope || categoryScope.parentId === 0) {
        errors.push({
          message: "请选择二级分类",
          rowNumber: item.rowNumber,
        });
      }
    }

    if (errors.length > 0) {
      return buildQuickReplyImportFailure(errors);
    }

    const topCategoryRows = new Map<string, NormalizedQuickReplyBatchItem[]>();

    for (const item of normalized.items) {
      const parentId = categoryScopes.get(item.categoryId)?.parentId;

      if (typeof parentId !== "string") {
        continue;
      }

      topCategoryRows.set(parentId, [
        ...(topCategoryRows.get(parentId) ?? []),
        item,
      ]);
    }

    for (const [topCategoryId, rows] of topCategoryRows) {
      const existingCount = await this.repository.countQuickRepliesUnderTopCategory({
        categoryId: topCategoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      });

      if (existingCount + rows.length > QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT) {
        errors.push(
          ...rows.map((row) => ({
            message: "一级分类下话术最多5000条",
            rowNumber: row.rowNumber,
          })),
        );
      }
    }

    if (errors.length > 0) {
      return buildQuickReplyImportFailure(errors);
    }

    const nextSortByCategoryId = new Map<string, number>();
    const createItems: Array<{
      attachments: [];
      categoryId: string;
      contentText: string;
      labelColor: string;
      labelText: string;
      sort: number;
    }> = [];

    for (const item of normalized.items) {
      let sort = nextSortByCategoryId.get(item.categoryId);

      if (sort == null) {
        sort = await this.getQuickReplyAppendSort({
          categoryId: item.categoryId,
          scopeType,
          subUserId,
          uid: me.uid,
        });
      }

      createItems.push({
        attachments: [],
        categoryId: item.categoryId,
        contentText: item.contentText,
        labelColor: item.labelColor,
        labelText: item.labelText,
        sort,
      });
      nextSortByCategoryId.set(item.categoryId, Math.max(0, sort - 1));
    }

    await this.repository.batchCreateQuickReplies({
      items: createItems,
      opSubUserId: subUserId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    return {
      ok: true,
      summary: {
        createdQuickReplyCount: normalized.items.length,
      },
    };
  }

  async moveQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
    request: WorkbenchQuickReplyMoveRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);
    const targetCategoryId = normalizeQuickReplyCategoryId(request.categoryId);

    if (targetCategoryId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    const quickReplyScope = await this.repository.findQuickReplyScope({
      quickReplyId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!quickReplyScope) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    if (quickReplyScope.categoryId === targetCategoryId) {
      return { ok: true };
    }

    if (quickReplyScope.categoryId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    const sourceCategoryScope = await this.repository.findQuickReplyCategoryScope({
      categoryId: quickReplyScope.categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });
    const targetCategoryScope = await this.repository.findQuickReplyCategoryScope({
      categoryId: targetCategoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!sourceCategoryScope || !targetCategoryScope) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    if (sourceCategoryScope.parentId === 0 || targetCategoryScope.parentId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    if (sourceCategoryScope.parentId !== targetCategoryScope.parentId) {
      throw new BadRequestError(
        "QUICK_REPLY_MOVE_SCOPE_INVALID",
        "只能移动到当前一级分类下",
      );
    }

    const updated = await this.repository.moveQuickReply({
      categoryId: targetCategoryId,
      quickReplyId,
      scopeType,
      sort: await this.getQuickReplyAppendSort({
        categoryId: targetCategoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    return { ok: true };
  }

  async sortQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplySortRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const categoryId = normalizeQuickReplyCategoryId(request.categoryId);

    if (categoryId === 0) {
      throw new BadRequestError("QUICK_REPLY_SORT_INVALID", "请选择二级分类");
    }

    const categoryScope = await this.repository.findQuickReplyCategoryScope({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!categoryScope) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    if (categoryScope.parentId === 0) {
      throw new BadRequestError("QUICK_REPLY_SORT_INVALID", "请选择二级分类");
    }

    const currentItems = await this.repository.listActiveQuickReplySortItems({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });
    const currentIds = currentItems.map((item) => item.id);

    if (!hasSameOrderedScopeIds(currentIds, request.quickReplyIds)) {
      throw new BadRequestError(
        "QUICK_REPLY_SORT_SCOPE_CHANGED",
        "排序数据已变化，请刷新后重试",
      );
    }

    if (hasSameExactOrder(currentIds, request.quickReplyIds)) {
      return { ok: true };
    }

    const currentSortById = new Map(
      currentItems.map((item) => [item.id, item.sort]),
    );
    const items = buildSortRewriteItems(request.quickReplyIds)
      .map((item) => ({
        quickReplyId: item.id,
        sort: item.sort,
      }))
      .filter((item) => currentSortById.get(item.quickReplyId) !== item.sort);

    if (items.length === 0) {
      return { ok: true };
    }

    const updated = await this.repository.sortQuickReplies({
      categoryId,
      items,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new BadRequestError(
        "QUICK_REPLY_SORT_SCOPE_CHANGED",
        "排序数据已变化，请刷新后重试",
      );
    }

    return { ok: true };
  }

  async updateQuickReply(
    subUserId: string,
    quickReplyId: string,
    request: WorkbenchQuickReplyUpdateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const values = await this.normalizeQuickReplyWriteRequest(me.uid, subUserId, request);

    const updated = await this.repository.updateQuickReply({
      ...values,
      quickReplyId,
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    return { ok: true };
  }

  async topQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);

    const updated = await this.repository.topQuickReply({
      quickReplyId,
      scopeType,
      sort: await this.getQuickReplyPrependSort({
        quickReplyId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    return { ok: true };
  }

  async bottomQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);

    const updated = await this.repository.bottomQuickReply({
      quickReplyId,
      scopeType,
      sort: await this.getQuickReplyAppendSortForExisting({
        quickReplyId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    return { ok: true };
  }

  async deleteQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.getMaterialActor(subUserId);

    const updated = await this.repository.deleteQuickReply({
      quickReplyId,
      scopeType: parseQuickReplyScopeType(scopeTypeValue),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    return { ok: true };
  }

  private async assertSeatAccess(subUserId: string, seatId: string) {
    const canAccess = await this.repository.canAccessSeat(subUserId, seatId);

    if (!canAccess) {
      throw new NotFoundError("SEAT_NOT_FOUND", "席位不存在");
    }
  }

  private async getActiveConversationMessages(
    subUserId: string,
    conversationId: string,
    activeMessageSeq: number,
  ) {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    const page = await this.repository.listMessages(conversationId, {
      beforeSeq: undefined,
      includeHiddenConversation: true,
      limit: 50,
    });

    return page.messages.filter((message) => message.seq > activeMessageSeq);
  }

  private async getOperableConversation(subUserId: string, conversationId: string) {
    const conversation = await this.getAccessibleConversation(subUserId, conversationId);

    if (conversation.seatHostSubUserId !== subUserId) {
      throw new ForbiddenError("SEAT_NOT_TAKEN_OVER", "当前账号尚未由你接管");
    }

    return conversation;
  }

  private async getAccessibleConversation(subUserId: string, conversationId: string) {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    return conversation;
  }

  private async insertFullAutoEnabledSystemMessage(input: {
    conversationId: string;
    operatorId: number;
    platform: number;
    subUserId: string;
    thirdExternalUserId?: string;
    thirdGroupId?: string;
    thirdUserId: string;
    uid: number;
  }) {
    try {
      const latestMessage =
        await this.repository.getLatestConversationMessageSummary({
          platform: input.platform,
          thirdExternalUserId: input.thirdExternalUserId,
          thirdGroupId: input.thirdGroupId,
          thirdUserId: input.thirdUserId,
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

  private async getMaterialActor(subUserId: string) {
    const me = await this.getMe(subUserId);

    if (me.uid == null) {
      throw new BadRequestError("INVALID_SUB_USER", "子账号无效");
    }

    if (me.platform == null) {
      throw new BadRequestError("INVALID_SUB_USER", "子账号无效");
    }

    return {
      uid: me.uid,
      platform: me.platform,
    };
  }

  private async prepareMaterialCollectionContent(
    bizType: MaterialCollectionBizType,
    message: {
      content: string | null;
      id: number | string;
    },
    actor: { platform: number; uid: number },
  ): Promise<{ content: string | null } | { errorMsg: string }> {
    if (bizType !== MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
      return { content: message.content };
    }

    const content = parseMaterialContentRecord(message.content);
    const fileUrl = readMaterialString(content, "fileUrl");

    const resolved = resolveMaterialVideoCollectFields(message.content);

    if ("errorMsg" in resolved) {
      return resolved;
    }

    if (!fileUrl || isOwnVideoMaterialUrl(fileUrl)) {
      return assertVideoMaterialContentReady(message.content);
    }

    const sourceDownloadStatusError = readVideoMaterialDownloadStatusError(message.content);

    if (sourceDownloadStatusError) {
      return sourceDownloadStatusError;
    }

    if (isExternalVideoFileUrlExpired(content)) {
      return { errorMsg: "视频下载地址已过期，无法收录" };
    }

    const msgInfoId = parseMySqlId(String(message.id));

    if (msgInfoId == null) {
      throw new BadRequestError("INVALID_MESSAGE_ID", "消息 ID 不能为空");
    }

    const transferredContent = await this.transferMaterialVideoFile({
      msgInfoId,
      platform: actor.platform,
      uid: actor.uid,
    });

    if (typeof transferredContent !== "string") {
      return transferredContent;
    }

    return assertVideoMaterialContentReady(transferredContent);
  }

  private async transferMaterialVideoFile(input: {
    msgInfoId: number;
    platform: number;
    uid: number;
  }): Promise<string | { errorMsg: string }> {
    try {
      return await this.javaClient.transMsgFile(input);
    } catch (error) {
      this.logger.warn(
        {
          error,
          msgInfoId: input.msgInfoId,
          platform: input.platform,
          uid: input.uid,
        },
        "视频素材转存失败",
      );
      return { errorMsg: "视频转存失败，无法收录" };
    }
  }

  private async getOperableMaterialCollectionScope(
    uid: number,
    collectionId: string,
    subUserId: string,
  ): Promise<MaterialCollectionScope> {
    const scope = await this.repository.findMaterialCollectionScope({
      id: collectionId,
      uid,
    });

    if (!scope) {
      throw new NotFoundError("MATERIAL_COLLECTION_NOT_FOUND", "素材不存在");
    }

    if (scope.bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
      const subUserNumericId = parseMaterialSubUserId(subUserId);

      if (scope.subUid !== subUserNumericId) {
        throw new NotFoundError("MATERIAL_COLLECTION_NOT_FOUND", "素材不存在");
      }

      return scope;
    }

    if (scope.subUid !== 0) {
      throw new NotFoundError("MATERIAL_COLLECTION_NOT_FOUND", "素材不存在");
    }

    return scope;
  }

  private async normalizeQuickReplyWriteRequest(
    uid: number,
    subUserId: string,
    request: WorkbenchQuickReplyCreateRequest | WorkbenchQuickReplyUpdateRequest,
  ) {
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const categoryId = normalizeQuickReplyCategoryId(request.categoryId ?? 0);
    const contentText = (request.contentText ?? "").trim();
    const validation = validateQuickReplyPayload({
      attachments: request.attachments ?? [],
      contentText,
    });

    if (!validation.ok) {
      throw new BadRequestError("INVALID_QUICK_REPLY", validation.errorMsg);
    }

    const attachments = normalizeQuickReplyAttachments(request.attachments ?? []);

    if (categoryId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    const categoryExists = await this.repository.hasActiveQuickReplyCategory({
      categoryId,
      scopeType,
      subUserId,
      uid,
    });

    if (!categoryExists) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    const categoryIsChild = await this.repository.isChildQuickReplyCategory({
        categoryId,
        scopeType,
        subUserId,
        uid,
    });

    if (!categoryIsChild) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    return {
      attachments,
      categoryId,
      contentText,
      labelColor: normalizeQuickReplyLabelColor(request.labelColor ?? ""),
      labelText: normalizeQuickReplyLabelText(request.labelText ?? ""),
      scopeType,
    };
  }

  private async assertQuickReplyTopCategoryItemLimit(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryScope = await this.repository.findQuickReplyCategoryScope(input);

    if (!categoryScope || categoryScope.parentId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    const count = await this.repository.countQuickRepliesUnderTopCategory({
      categoryId: categoryScope.parentId,
      scopeType: input.scopeType,
      subUserId: input.subUserId,
      uid: input.uid,
    });

    if (count >= QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT) {
      throw new BadRequestError(
        "QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT_EXCEEDED",
        "一级分类下话术最多5000条",
      );
    }
  }

  async search(
    subUserId: string,
    seatId: string,
    keyword: string,
  ): Promise<WorkbenchSearchResponseDto> {
    await this.getMe(subUserId);
    await this.assertSeatAccess(subUserId, seatId);

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
    await this.getMe(subUserId);
    await this.assertSeatAccess(subUserId, payload.seatId);

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

  private async getQuickReplyCategoryAppendSort(input: {
    parentId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const minSort = await this.repository.findQuickReplyCategorySortBoundary({
      ...input,
      boundary: "min",
    });

    return minSort == null ? QUICK_REPLY_SORT_BASE : Math.max(0, minSort - 1);
  }

  private async getQuickReplyCategoryPrependSort(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryScope = await this.repository.findQuickReplyCategoryScope(input);

    if (!categoryScope) {
      return QUICK_REPLY_SORT_BASE;
    }

    const maxSort = await this.repository.findQuickReplyCategorySortBoundary({
      boundary: "max",
      parentId: categoryScope.parentId,
      scopeType: input.scopeType,
      subUserId: input.subUserId,
      uid: input.uid,
    });

    return maxSort == null ? QUICK_REPLY_SORT_BASE : maxSort + 1;
  }

  private async getQuickReplyCategoryAppendSortForExisting(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryScope = await this.repository.findQuickReplyCategoryScope(input);

    if (!categoryScope) {
      return QUICK_REPLY_SORT_BASE;
    }

    return this.getQuickReplyCategoryAppendSort({
      parentId: categoryScope.parentId,
      scopeType: input.scopeType,
      subUserId: input.subUserId,
      uid: input.uid,
    });
  }

  private async getQuickReplyAppendSort(input: {
    categoryId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const minSort = await this.repository.findQuickReplySortBoundary({
      ...input,
      boundary: "min",
    });

    return minSort == null ? QUICK_REPLY_SORT_BASE : Math.max(0, minSort - 1);
  }

  private async getQuickReplyPrependSort(input: {
    quickReplyId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const quickReplyScope = await this.repository.findQuickReplyScope(input);

    if (!quickReplyScope) {
      return QUICK_REPLY_SORT_BASE;
    }

    const maxSort = await this.repository.findQuickReplySortBoundary({
      boundary: "max",
      categoryId: quickReplyScope.categoryId,
      scopeType: input.scopeType,
      subUserId: input.subUserId,
      uid: input.uid,
    });

    return maxSort == null ? QUICK_REPLY_SORT_BASE : maxSort + 1;
  }

  private async getQuickReplyAppendSortForExisting(input: {
    quickReplyId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const quickReplyScope = await this.repository.findQuickReplyScope(input);

    if (!quickReplyScope) {
      return QUICK_REPLY_SORT_BASE;
    }

    return this.getQuickReplyAppendSort({
      categoryId: quickReplyScope.categoryId,
      scopeType: input.scopeType,
      subUserId: input.subUserId,
      uid: input.uid,
    });
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

function parseMaterialBizType(value: number): MaterialCollectionBizType {
  switch (value) {
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
    case MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED:
    case MATERIAL_COLLECTION_BIZ_TYPE.IMAGE:
    case MATERIAL_COLLECTION_BIZ_TYPE.VIDEO:
      return value;
    default:
      throw new BadRequestError("INVALID_MATERIAL_BIZ_TYPE", "素材类型无效");
  }
}

function parseMaterialGroupBizType(value: number): Exclude<MaterialCollectionBizType, 1> {
  const bizType = parseMaterialBizType(value);

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
    throw new BadRequestError("MATERIAL_GROUP_UNSUPPORTED", "表情不支持自定义分组");
  }

  return bizType;
}

function normalizeMaterialPage(value: number | undefined) {
  return Number.isSafeInteger(value) && value != null && value > 0 ? value : 1;
}

function normalizeMaterialPageSize(value: number | undefined) {
  if (!Number.isSafeInteger(value) || value == null || value <= 0) {
    return 100;
  }

  return Math.min(value, 100);
}

function buildQuickReplyImportFailure(errors: WorkbenchQuickReplyImportRowError[]) {
  return {
    errorMsg: "导入数据有误",
    errors,
    ok: false as const,
  };
}

function normalizeQuickReplyCategoryEnsureRequest(categories: unknown):
  | { ok: true; categories: NormalizedQuickReplyEnsureCategory[] }
  | { ok: false; errors: WorkbenchQuickReplyImportRowError[] } {
  if (!Array.isArray(categories) || categories.length === 0) {
    return {
      errors: [{ message: "请填写分类", rowNumber: 0 }],
      ok: false,
    };
  }

  const errors: WorkbenchQuickReplyImportRowError[] = [];
  const categoryByTitle = new Map<string, NormalizedQuickReplyEnsureCategory>();

  categories.forEach((rawCategory, index) => {
    const rowNumber = index + 1;

    if (!isRecord(rawCategory)) {
      errors.push({ message: "分类数据无效", rowNumber });
      return;
    }

    const title = String(rawCategory.title ?? "").trim();

    if (!title) {
      errors.push({ message: "一级分类名称不能为空", rowNumber });
    } else if (title.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
      errors.push({ message: "一级分类名称不能超过10个字", rowNumber });
    }

    const children = rawCategory.children;

    if (!Array.isArray(children) || children.length === 0) {
      errors.push({ message: "二级分类名称不能为空", rowNumber });
      return;
    }

    const normalizedChildren: string[] = [];
    const seenChildren = new Set<string>();

    for (const rawChildTitle of children) {
      const childTitle = String(rawChildTitle ?? "").trim();

      if (!childTitle) {
        errors.push({ message: "二级分类名称不能为空", rowNumber });
        continue;
      }

      if (childTitle.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
        errors.push({ message: "二级分类名称不能超过10个字", rowNumber });
        continue;
      }

      if (!seenChildren.has(childTitle)) {
        seenChildren.add(childTitle);
        normalizedChildren.push(childTitle);
      }
    }

    if (!title || title.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
      return;
    }

    const category = categoryByTitle.get(title);

    if (category) {
      const mergedChildren = new Set(category.children);

      for (const childTitle of normalizedChildren) {
        if (!mergedChildren.has(childTitle)) {
          mergedChildren.add(childTitle);
          category.children.push(childTitle);
        }
      }
      return;
    }

    categoryByTitle.set(title, {
      children: normalizedChildren,
      rowNumber,
      title,
    });
  });

  const normalizedCategories = Array.from(categoryByTitle.values());
  const secondaryCategoryCount = normalizedCategories.reduce(
    (count, category) => count + category.children.length,
    0,
  );

  if (normalizedCategories.length > QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT) {
    errors.push({
      message: "一级分类最多导入100个",
      rowNumber: 0,
    });
  }

  if (secondaryCategoryCount > QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT) {
    errors.push({
      message: "二级分类最多导入500个",
      rowNumber: 0,
    });
  }

  for (const category of normalizedCategories) {
    if (category.children.length === 0) {
      errors.push({
        message: "二级分类名称不能为空",
        rowNumber: category.rowNumber,
      });
    }
  }

  if (errors.length > 0) {
    return { errors, ok: false };
  }

  return { categories: normalizedCategories, ok: true };
}

function validateQuickReplyCategoryEnsureLimits(input: {
  categories: NormalizedQuickReplyEnsureCategory[];
  childrenByParentId: Map<string, Map<string, { id: string; title: string }>>;
  primaryByTitle: Map<string, { id: string; title: string }>;
}) {
  const errors: WorkbenchQuickReplyImportRowError[] = [];
  let primaryCategoryCount = input.primaryByTitle.size;
  const childCountByParentId = new Map<string, number>();
  const pendingChildCountByPrimaryTitle = new Map<string, number>();

  for (const [parentId, childrenByTitle] of input.childrenByParentId) {
    childCountByParentId.set(parentId, childrenByTitle.size);
  }

  for (const category of input.categories) {
    const primaryCategory = input.primaryByTitle.get(category.title);

    if (!primaryCategory) {
      primaryCategoryCount += 1;

      if (primaryCategoryCount > QUICK_REPLY_TOP_CATEGORY_LIMIT) {
        errors.push({
          message: "一级分类最多50个",
          rowNumber: category.rowNumber,
        });
      }
    }

    const existingChildren = primaryCategory
      ? input.childrenByParentId.get(primaryCategory.id)
      : undefined;
    const existingChildCount = primaryCategory
      ? (childCountByParentId.get(primaryCategory.id) ?? 0)
      : 0;
    const pendingChildCount =
      pendingChildCountByPrimaryTitle.get(category.title) ?? 0;
    const missingChildCount = category.children.filter(
      (childTitle) => !existingChildren?.has(childTitle),
    ).length;
    const nextChildCount =
      existingChildCount + pendingChildCount + missingChildCount;

    if (nextChildCount > QUICK_REPLY_CHILD_CATEGORY_LIMIT) {
      errors.push({
        message: "二级分类最多50个",
        rowNumber: category.rowNumber,
      });
    }

    pendingChildCountByPrimaryTitle.set(
      category.title,
      pendingChildCount + missingChildCount,
    );
  }

  return errors;
}

function normalizeQuickReplyBatchCreateRequest(items: unknown):
  | { ok: true; items: NormalizedQuickReplyBatchItem[] }
  | { ok: false; errors: WorkbenchQuickReplyImportRowError[] } {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      errors: [{ message: "请填写话术", rowNumber: 0 }],
      ok: false,
    };
  }

  if (items.length > QUICK_REPLY_BATCH_CREATE_LIMIT) {
    return {
      errors: [{ message: "单次最多导入100条话术", rowNumber: 0 }],
      ok: false,
    };
  }

  const errors: WorkbenchQuickReplyImportRowError[] = [];
  const normalizedItems: NormalizedQuickReplyBatchItem[] = [];

  items.forEach((rawItem, index) => {
    if (!isRecord(rawItem)) {
      errors.push({ message: "话术数据无效", rowNumber: index + 1 });
      return;
    }

    const rowNumber = readQuickReplyImportRowNumber(rawItem.rowNumber, index);
    const categoryId = String(rawItem.categoryId ?? "").trim();
    const labelText = String(rawItem.labelText ?? "").trim();
    const labelColor = String(rawItem.labelColor ?? "").trim();
    const contentText = String(rawItem.contentText ?? "").trim();

    if (!categoryId) {
      errors.push({ message: "请选择二级分类", rowNumber });
    }

    if (labelText.length > QUICK_REPLY_LABEL_TEXT_MAX_LENGTH) {
      errors.push({ message: "短标题不能超过10个字", rowNumber });
    }

    if (!isQuickReplyLabelColor(labelColor)) {
      errors.push({ message: "短标题颜色无效", rowNumber });
    }

    if (!contentText) {
      errors.push({ message: "话术内容不能为空", rowNumber });
    } else if (contentText.length > QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH) {
      errors.push({ message: "话术内容不能超过1000个字", rowNumber });
    }

    normalizedItems.push({
      categoryId,
      contentText,
      labelColor,
      labelText,
      rowNumber,
    });
  });

  if (errors.length > 0) {
    return { errors, ok: false };
  }

  return { items: normalizedItems, ok: true };
}

function readQuickReplyImportRowNumber(value: unknown, index: number) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : index + 1;
}

function indexQuickReplyCategories(categories: WorkbenchQuickReplyCategoryDto[]) {
  const primaryById = new Map<string, { id: string; title: string }>();
  const primaryByTitle = new Map<string, { id: string; title: string }>();
  const childrenByParentId = new Map<
    string,
    Map<string, { id: string; title: string }>
  >();

  for (const category of categories) {
    if (category.parentId !== 0) {
      continue;
    }

    const primary = { id: category.id, title: category.title.trim() };
    primaryById.set(category.id, primary);

    if (!primaryByTitle.has(primary.title)) {
      primaryByTitle.set(primary.title, primary);
    }
  }

  for (const category of categories) {
    if (category.parentId === 0 || !primaryById.has(category.parentId)) {
      continue;
    }

    const childrenByTitle =
      childrenByParentId.get(category.parentId) ??
      new Map<string, { id: string; title: string }>();
    childrenByParentId.set(category.parentId, childrenByTitle);

    const title = category.title.trim();

    if (!childrenByTitle.has(title)) {
      childrenByTitle.set(title, { id: category.id, title });
    }
  }

  return { childrenByParentId, primaryByTitle };
}

function parseQuickReplyScopeType(value: number): QuickReplyScopeType {
  switch (value) {
    case QUICK_REPLY_SCOPE_TYPE.ENTERPRISE:
    case QUICK_REPLY_SCOPE_TYPE.PERSONAL:
      return value;
    default:
      throw new BadRequestError("INVALID_QUICK_REPLY_SCOPE_TYPE", "话术范围无效");
  }
}

function normalizeQuickReplyCategoryId(categoryId: string | 0 | undefined): string | 0 {
  if (categoryId === undefined || categoryId === 0 || categoryId === "0") {
    return 0;
  }

  if (!String(categoryId).trim()) {
    return 0;
  }

  return String(categoryId);
}

function normalizeQuickReplyCategoryTitle(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new BadRequestError(
      "QUICK_REPLY_CATEGORY_TITLE_REQUIRED",
      "分类名称不能为空",
    );
  }

  if (normalizedTitle.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
    throw new BadRequestError(
      "QUICK_REPLY_CATEGORY_TITLE_TOO_LONG",
      "分类名称不能超过10个字",
    );
  }

  return normalizedTitle;
}

function normalizeQuickReplyLabelText(labelText: string) {
  const normalizedLabelText = labelText.trim();

  if (normalizedLabelText.length > QUICK_REPLY_LABEL_TEXT_MAX_LENGTH) {
    throw new BadRequestError(
      "QUICK_REPLY_LABEL_TEXT_TOO_LONG",
      "短标题不能超过10个字",
    );
  }

  return normalizedLabelText;
}

function normalizeQuickReplyLabelColor(labelColor: string) {
  const normalizedLabelColor = labelColor.trim();

  if (!isQuickReplyLabelColor(normalizedLabelColor)) {
    throw new BadRequestError(
      "QUICK_REPLY_LABEL_COLOR_INVALID",
      "短标题颜色无效",
    );
  }

  return normalizedLabelColor;
}

function readEnterpriseMaterialGroupId(groupId: string | 0 | undefined) {
  if (
    groupId === undefined ||
    groupId === 0 ||
    groupId === "0" ||
    !String(groupId).trim()
  ) {
    return undefined;
  }

  return String(groupId);
}

function normalizeMaterialGroupTitle(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new BadRequestError(
      "MATERIAL_GROUP_TITLE_REQUIRED",
      "分组名称不能为空",
    );
  }

  if (normalizedTitle.length > MATERIAL_COLLECTION_GROUP_TITLE_MAX_LENGTH) {
    throw new BadRequestError(
      "MATERIAL_GROUP_TITLE_TOO_LONG",
      "分组名称不能超过10个字",
    );
  }

  return normalizedTitle;
}

function parseMaterialSubUserId(subUserId: string) {
  const subUserNumericId = parseMySqlId(subUserId);

  if (subUserNumericId == null) {
    throw new BadRequestError("INVALID_SUB_USER", "子账号无效");
  }

  return subUserNumericId;
}

function isMaterialMessageTypeMatched(
  bizType: MaterialCollectionBizType,
  msgtype: string,
) {
  switch (bizType) {
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
      return msgtype === "emotion";
    case MATERIAL_COLLECTION_BIZ_TYPE.IMAGE:
      return msgtype === "image";
    case MATERIAL_COLLECTION_BIZ_TYPE.VIDEO:
      return msgtype === "video";
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
      return msgtype === "file";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return msgtype === "weapp";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return msgtype === "link";
    case MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED:
      return msgtype === "sphfeed";
    default:
      return false;
  }
}

function isAgentMaterialMessage(message: {
  chatType?: number | null;
  fromType?: number | null;
  thirdFromId?: string | null;
  thirdUserId?: string | null;
}) {
  if (message.chatType === CHAT_TYPE.GROUP) {
    const thirdFromId = (message.thirdFromId ?? "").trim();
    const thirdUserId = (message.thirdUserId ?? "").trim();

    return thirdFromId.length > 0 && thirdFromId === thirdUserId;
  }

  return message.fromType === 1;
}

function normalizeMaterialCollectionPayload(
  bizType: MaterialCollectionBizType,
  rawContent: string | null,
  overrides: Pick<
    WorkbenchMaterialCollectionCreateRequest,
    "description" | "fileName" | "title"
  >,
  msgInfoId: string,
  contentType: WorkbenchMaterialCollectionContentType,
): { content: string; title: string } | { errorMsg: string } {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    const resolved = resolveMaterialFileCollectFields(rawContent, {
      fileName: overrides.fileName,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: buildMaterialFileContentJson(rawContent, resolved),
      title: resolved.fileName,
    };
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5) {
    const resolved = resolveMaterialH5CollectFields(rawContent, {
      description: overrides.description,
      title: overrides.title,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: buildMaterialH5ContentJson(rawContent, resolved),
      title: resolved.title,
    };
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.IMAGE) {
    const resolved = resolveMaterialImageCollectFields(rawContent);

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: buildMaterialImageContentJson(rawContent, resolved),
      title: "图片",
    };
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    const resolved = resolveMaterialVideoCollectFields(rawContent);

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: buildMaterialVideoContentJson(rawContent, resolved),
      title: "视频",
    };
  }

  return {
    content: rawContent ?? "",
    title: readMaterialTitle(rawContent, contentType, msgInfoId),
  };
}

function readMaterialTitle(
  rawContent: string | null,
  contentType: WorkbenchMaterialCollectionContentType,
  msgInfoId: string,
) {
  if (contentType === "emotion") {
    return "表情";
  }

  const content = parseMaterialContentRecord(rawContent);

  if (contentType === "file") {
    return truncateMaterialTitle(readMaterialString(content, "fileName") || msgInfoId);
  }

  if (contentType === "image") {
    return "图片";
  }

  if (contentType === "mini-program") {
    return truncateMaterialTitle(
      readMaterialString(content, "description") ||
        readMaterialString(content, "title") ||
        msgInfoId,
    );
  }

  return truncateMaterialTitle(readMaterialString(content, "title") || msgInfoId);
}

function truncateMaterialTitle(title: string) {
  return title.slice(0, MATERIAL_COLLECTION_TITLE_MAX_LENGTH);
}

function parseMaterialContentRecord(rawContent: string | null) {
  if (!rawContent) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(rawContent);

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readMaterialString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" ? value.trim() : "";
}

function readVideoMaterialDownloadStatusError(rawContent: string | null) {
  const content = parseMaterialContentRecord(rawContent);

  if (readMaterialString(content, "downloadStatus") !== "finished") {
    return { errorMsg: "视频下载未完成，无法收录" };
  }

  return null;
}

function assertVideoMaterialContentReady(
  rawContent: string | null,
): { content: string | null } | { errorMsg: string } {
  const downloadStatusError = readVideoMaterialDownloadStatusError(rawContent);

  if (downloadStatusError) {
    return downloadStatusError;
  }

  return { content: rawContent };
}

function isExternalVideoFileUrlExpired(content: Record<string, unknown>) {
  const expireTime = readMaterialNumber(content, "fileUrlExpireTime");

  return expireTime === undefined || Date.now() > expireTime;
}

function readMaterialNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue) ? numericValue : undefined;
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
      payload.mention?.location === "end"
        ? JAVA_MENTION_LOCATION.END
        : JAVA_MENTION_LOCATION.START;
    message.atWxSerialNos = mentionMemberIds;
    message.isHit = JAVA_MENTION_HIT_TYPE.MEMBER;
  }

  return message;
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

function buildSortRewriteItems(ids: string[]) {
  return ids.map((id, index) => ({
    id,
    sort: (ids.length - index) * 1000,
  }));
}

function hasSameOrderedScopeIds(currentIds: string[], submittedIds: string[]) {
  if (currentIds.length !== submittedIds.length) {
    return false;
  }

  const submittedSet = new Set(submittedIds);

  if (submittedSet.size !== submittedIds.length) {
    return false;
  }

  return currentIds.every((id) => submittedSet.has(id));
}

function hasSameExactOrder(currentIds: string[], submittedIds: string[]) {
  return (
    currentIds.length === submittedIds.length &&
    currentIds.every((id, index) => id === submittedIds[index])
  );
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
