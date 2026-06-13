import type {
  WorkbenchConversationDeleteResponse,
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
  WorkbenchMessageQueryByIdsRequest,
  WorkbenchMessageQueryByIdsResponse,
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
} from "@chatai/contracts";
import { CHAT_TYPE, MATERIAL_COLLECTION_BIZ_TYPE, MATERIAL_COLLECTION_GROUP_MAX_COUNT } from "@chatai/contracts";
import {
  BadGatewayError,
  BadRequestError,
  ForbiddenError,
  AppError,
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

const POLL_CONVERSATION_CHANGE_LIMIT = 500;
const POLL_LAST_MESSAGE_OVERLAP_MS = 1;
const POLL_MESSAGE_UPDATE_LIMIT = 200;
const POLL_SEAT_UPDATE_LIMIT = 200;
const PLAYABLE_VOICE_HEAD_TIMEOUT_MS = 8000;
const MESSAGE_REVOKE_WINDOW_MS = 180 * 1000;
const MESSAGE_REVOKE_CLOCK_SKEW_TOLERANCE_MS = 5 * 1000;
const SMART_REPLY_MESSAGE_PAGE_CANDIDATE_LIMIT = 5;
const MATERIAL_COLLECTION_TITLE_MAX_LENGTH = 100;
const MATERIAL_COLLECTION_GROUP_TITLE_MAX_LENGTH = 10;

type SmartReplyMessagePageMetadata = {
  smartReplyEnabled?: boolean;
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
  deleteConversation(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationDeleteResponse> | WorkbenchConversationDeleteResponse;
  /** 按席位与会话在服务端签发侧栏 iframe 涂色参数（不含 secret/iv） */
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
  getMessagesByIds(
    subUserId: string,
    conversationId: string,
    messageIds: string[],
  ): Promise<WorkbenchMessageQueryByIdsResponse> | WorkbenchMessageQueryByIdsResponse;
  getChatRecordDetail(
    subUserId: string,
    conversationId: string,
    messageId: string,
  ): Promise<WorkbenchChatRecordDetailResponse> | WorkbenchChatRecordDetailResponse;
  getHistoryMessages(
    subUserId: string,
    conversationId: string,
    options?: WorkbenchHistoryMessageQuery,
  ): Promise<WorkbenchHistoryMessagePageDto> | WorkbenchHistoryMessagePageDto;
  downloadMessageFile(
    subUserId: string,
    conversationId: string,
    messageId: string,
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
    messageId: string,
  ): Promise<WorkbenchRevokeMessageResponse> | WorkbenchRevokeMessageResponse;
  sendMessage(
    subUserId: string,
    payload: WorkbenchSendMessagePayload,
  ): Promise<WorkbenchSendMessageResponse> | WorkbenchSendMessageResponse;
  takeOverSeat(
    subUserId: string,
    seatId: string,
  ): Promise<WorkbenchTakeOverSeatResponse> | WorkbenchTakeOverSeatResponse;
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
    const { smartReplyEnabled, smartReplyScope, ...publicPage } = page;

    if (options?.beforeSeq != null) {
      return publicPage;
    }

    if (!smartReplyEnabled || !smartReplyScope) {
      return {
        ...publicPage,
        smartReplyEnabled: false,
      };
    }

    const msgIds = collectSmartReplyMessagePageCandidateIds(publicPage.messages);

    if (msgIds.length === 0) {
      return {
        ...publicPage,
        smartReplyEnabled: true,
      };
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
        smartReplyEnabled: true,
        smartReplies: smartReplies.suggestions,
      };
    } catch (error) {
      this.logger.warn(
        { conversationId, error },
        "Failed to load smart replies for message page",
      );

      return {
        ...publicPage,
        smartReplyEnabled: true,
      };
    }
  }

  async getMessagesByIds(
    subUserId: string,
    conversationId: string,
    messageIds: string[],
  ) {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    return this.repository.listMessagesByIds(conversationId, messageIds);
  }

  async getChatRecordDetail(
    subUserId: string,
    conversationId: string,
    messageId: string,
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
      messageId,
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
    messageId: string,
  ) {
    const conversation = await this.repository.getConversationLookup(conversationId);
    const normalizedMessageId = messageId.trim();

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    if (!normalizedMessageId) {
      throw new BadRequestError("INVALID_MESSAGE_ID", "消息 ID 不能为空");
    }

    await this.javaClient.downloadMsgFile({
      msgid: normalizedMessageId,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    this.logger.info(
      {
        conversationId: conversation.id,
        messageId: normalizedMessageId,
        operation: "download-message-file",
        platform: conversation.platform,
        seatId: conversation.seatId,
        subUserId,
        uid: conversation.uid,
      },
      "工作台消息文件下载已触发",
    );

    return {
      messageId: normalizedMessageId,
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
      seatChanges: orderedChangedSeats
        .map((seat) => ({
          hostSubUserId: seat.hostSubUserId ?? null,
          lastMessageTime: seat.lastMessageTime,
          seatId: seat.seatId,
          unreadCount: seat.unreadCount,
        })),
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

    const javaMsgIds = normalizeSmartReplyMsgIds(request.msgIds);

    if (javaMsgIds.length === 0) {
      return { suggestions: [] };
    }

    const thirdExternalId = conversation.thirdGroupId
      ? conversation.thirdGroupId
      : conversation.thirdExternalUserId;

    if (!thirdExternalId) {
      throw new BadRequestError(
        "SMART_REPLY_SCOPE_INVALID",
        "当前会话缺少智能回复所需的外部标识",
      );
    }

    const javaRequest = {
      chatType: conversation.thirdGroupId ? CHAT_TYPE.GROUP : CHAT_TYPE.SINGLE,
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

    const thirdExternalId = conversation.thirdGroupId
      ? conversation.thirdGroupId
      : conversation.thirdExternalUserId;

    if (!thirdExternalId) {
      throw new BadRequestError(
        "SMART_REPLY_SCOPE_INVALID",
        "当前会话缺少智能回复所需的外部标识",
      );
    }

    return this.javaClient.requestGeneralAnswer({
      chatType: conversation.thirdGroupId ? CHAT_TYPE.GROUP : CHAT_TYPE.SINGLE,
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

    if (conversation.thirdGroupId) {
      throw new BadRequestError(
        "SMART_REPLY_SCOPE_INVALID",
        "当前会话暂不支持智能回复",
      );
    }

    const thirdExternalId = conversation.thirdExternalUserId?.trim();

    if (!thirdExternalId) {
      throw new BadRequestError(
        "SMART_REPLY_SCOPE_INVALID",
        "当前会话缺少智能回复所需的外部标识",
      );
    }

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

    const realAnswer = request.realAnswer.trim();
    const recordId = request.recordId.trim();

    if (!realAnswer) {
      throw new BadRequestError("SMART_REPLY_CONTENT_EMPTY", "智能回复内容不能为空");
    }

    if (!recordId) {
      throw new BadRequestError("SMART_REPLY_RECORD_INVALID", "智能回复记录无效");
    }

    await this.javaClient.sendRecommendAnswer({
      realAnswer,
      realAttachIds: request.realAttachIds,
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
      clientMessageId: payload.clientMessageId,
      ...(failMsgId != null ? { failMsgId } : {}),
      msgData: buildJavaSendMessageData(payload, segment),
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
        clientMessageId: payload.clientMessageId,
        conversationId: conversation.id,
        messageId: response.messageId,
        messageType: segment.type,
        operation: "send-message",
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

  async revokeMessage(
    subUserId: string,
    conversationId: string,
    messageId: string,
  ): Promise<WorkbenchRevokeMessageResponse> {
    const conversation = await this.getOperableConversation(subUserId, conversationId);
    const normalizedMessageId = messageId.trim();

    if (!normalizedMessageId) {
      throw new BadRequestError("INVALID_MESSAGE_ID", "消息 ID 不能为空");
    }

    const message = await this.repository.getMessageForRevoke({
      conversationId: conversation.id,
      messageId: normalizedMessageId,
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
        messageId: normalizedMessageId,
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
      messageId: normalizedMessageId,
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
      msgid: request.messageId,
      uid: me.uid,
    });

    if (!message || !isMaterialMessageTypeMatched(bizType, message.msgtype)) {
      throw new BadRequestError("UNSUPPORTED_MATERIAL_MESSAGE", "当前消息不支持收藏");
    }

    const subUid =
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION ? subUserNumericId : 0;
    const sort = Date.now();
    const title = readMaterialTitle(message.content, contentType, request.messageId);
    const duplicate = await this.repository.findMaterialCollectionByMessage({
      bizType,
      msgid: request.messageId,
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
        content: message.content,
        groupId,
        id: duplicate.id,
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
      content: message.content,
      groupId,
      msgid: request.messageId,
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
      throw new BadGatewayError("MATERIAL_GROUP_CREATE_FAILED", "新建分组失败");
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
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    if (conversation.seatHostSubUserId !== subUserId) {
      throw new ForbiddenError("SEAT_NOT_TAKEN_OVER", "当前账号尚未由你接管");
    }

    return conversation;
  }

  private async getMaterialActor(subUserId: string) {
    const me = await this.getMe(subUserId);

    if (me.uid == null) {
      throw new BadRequestError("INVALID_SUB_USER", "子账号无效");
    }

    return {
      uid: me.uid,
    };
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
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
      return msgtype === "file";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return msgtype === "weapp";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return msgtype === "link";
    default:
      return false;
  }
}

function readMaterialTitle(
  rawContent: string | null,
  contentType: WorkbenchMaterialCollectionContentType,
  messageId: string,
) {
  if (contentType === "emotion") {
    return "表情";
  }

  const content = parseMaterialContentRecord(rawContent);

  if (contentType === "file") {
    return truncateMaterialTitle(readMaterialString(content, "fileName") || messageId);
  }

  if (contentType === "mini-program") {
    return truncateMaterialTitle(
      readMaterialString(content, "description") ||
        readMaterialString(content, "title") ||
        messageId,
    );
  }

  return truncateMaterialTitle(readMaterialString(content, "title") || messageId);
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
  segment: WorkbenchOutgoingMessageSegment,
): JavaSendMessageData {
  if (segment.type === "image") {
    const imageUrl = segment.url?.trim() || segment.localUrl?.trim();

    if (!imageUrl) {
      throw new BadRequestError("INVALID_IMAGE_MESSAGE", "图片消息缺少可发送地址");
    }

    return {
      fileUrl: imageUrl,
      msgtype: "image",
    };
  }

  if (segment.type === "file") {
    const fileName = segment.fileName.trim();
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
    const title = segment.title.trim();
    const href = segment.href.trim();
    const desc = segment.desc?.trim();
    const coverUrl = segment.coverUrl?.trim();

    if (!title) {
      throw new BadRequestError("INVALID_H5_MESSAGE", "H5链接消息缺少标题");
    }

    if (!href) {
      throw new BadRequestError("INVALID_H5_MESSAGE", "H5链接消息缺少跳转地址");
    }

    return {
      ...(coverUrl ? { coverUrl } : {}),
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
