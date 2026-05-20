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
  WorkbenchMessageDto,
  WorkbenchMessageFileDownloadResponse,
  WorkbenchMessageFileDownloadStatusResponse,
  WorkbenchMessagePageDto,
  WorkbenchOutgoingMessageSegment,
  WorkbenchPollRequest,
  WorkbenchPollResponse,
  WorkbenchSeatDto,
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchSidebarIframeParamsDto,
  WorkbenchSidebarIframeParamsRequest,
  WorkbenchSubUserDto,
  WorkbenchTakeOverSeatResponse,
  WorkbenchUploadCredentialResponse,
} from "@chatai/contracts";
import {
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
  JAVA_MENTION_HIT_TYPE,
  JAVA_MENTION_LOCATION,
  JAVA_MSG_TYPE,
  JAVA_SEND_TYPE,
} from "./workbench-java-client.js";
import { buildSidebarIframeTuseCipherTexts } from "../../lib/tuse-crypto.js";
import {
  decodeConversationListCursor,
  parseMySqlId,
  type WorkbenchRepository,
} from "./workbench-repository.js";

const POLL_CONVERSATION_CHANGE_LIMIT = 500;
const POLL_LAST_MESSAGE_OVERLAP_MS = 1;
const POLL_MESSAGE_UPDATE_OVERLAP_MS = 1_000;
const POLL_MESSAGE_UPDATE_LIMIT = 50;

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
};

export class MysqlWorkbenchService implements WorkbenchService {
  constructor(
    private readonly repository: WorkbenchRepository,
    private readonly javaClient: WorkbenchJavaClient,
    private readonly logger: AppLogger = noopLogger,
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
    // Avoid an aggregate query on delete. The response may be briefly stale if
    // concurrent messages arrive, and the next poll will reconcile that value.
    const seatUnreadCount = Math.max(
      0,
      conversation.seatUnreadCount - conversation.unreadCount,
    );

    return {
      conversationId: conversation.id,
      seatId: conversation.seatId,
      seatUnreadCount,
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

    return this.repository.listMessages(conversationId, {
      beforeSeq: options?.beforeSeq,
      limit: options?.limit ?? 30,
    });
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
    const conversation = await this.getOperableConversation(subUserId, conversationId);
    const normalizedMessageId = messageId.trim();

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

  async markConversationRead(subUserId: string, conversationId: string) {
    const conversation = await this.getOperableConversation(subUserId, conversationId);

    await this.javaClient.markConversationRead({
      conversationId: conversation.id,
      platform: conversation.platform,
      uid: conversation.uid,
    });

    const seatUnreadCount = await this.repository.getSeatUnreadCountAfterMarkRead({
      conversationId: conversation.id,
      platform: conversation.platform,
      seatId: conversation.seatId,
      uid: conversation.uid,
    });

    return {
      conversationId: conversation.id,
      seatId: conversation.seatId,
      seatUnreadCount,
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

    const nextUnreadCount = 1;
    const nextSeatUnreadCount = Math.max(
      0,
      conversation.seatUnreadCount + nextUnreadCount - conversation.unreadCount,
    );

    return {
      conversationId: conversation.id,
      seatId: conversation.seatId,
      seatUnreadCount: nextSeatUnreadCount,
      unreadCount: nextUnreadCount,
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
        ? await this.getMessages(subUserId, request.activeConversationId, {
            beforeSeq: undefined,
            limit: 50,
          }).then((page) =>
            page.messages.filter((message) => message.seq > (request.activeMessageSeq ?? 0)),
          )
        : [];
    const messageUpdateCursor = request.messageUpdateCursor ?? request.sinceVersion;
    const messageUpdateEvents =
      request.activeConversationId &&
      typeof this.repository.listMessageUpdateEvents === "function"
        ? await this.repository.listMessageUpdateEvents(request.activeConversationId, {
            afterCreateTime: messageUpdateCursor,
            limit: POLL_MESSAGE_UPDATE_LIMIT,
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

    const seatChange = request.currentSeatId
      ? await this.repository.getSeat(request.currentSeatId)
      : undefined;

    return {
      activeConversationMessages,
      conversationChanges: changedConversations.items.map((conversation) => ({
        ...conversation,
        type: "upsert" as const,
      })),
      messageStatusChanges: [],
      messageUpdateEvents,
      nextVersion,
      nextMessageUpdateCursor: getNextMessageUpdateCursor(
        messageUpdateCursor,
        messageUpdateEvents,
      ),
      seatChanges: seatChange
        ? [
            {
              lastMessageTime: seatChange.lastMessageTime,
              seatId: seatChange.seatId,
              unreadCount: seatChange.unreadCount,
            },
          ]
        : [],
    };
  }

  async sendMessage(subUserId: string, payload: WorkbenchSendMessagePayload) {
    const conversation = await this.getOperableConversation(subUserId, payload.conversationId);

    if (conversation.seatId !== payload.seatId) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    const segment = getSingleSendSegment(payload);
    const quoteContentBase64 = await this.getQuoteContentBase64(payload, segment, {
      platform: conversation.platform,
      uid: conversation.uid,
    });

    const response = await this.javaClient.sendMessage({
      clientMessageId: payload.clientMessageId,
      message: buildJavaSendMessageData(payload, segment, quoteContentBase64),
      platform: conversation.platform,
      sendType: conversation.thirdGroupId ? JAVA_SEND_TYPE.GROUP : JAVA_SEND_TYPE.SINGLE,
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

  private async getQuoteContentBase64(
    payload: WorkbenchSendMessagePayload,
    segment: WorkbenchOutgoingMessageSegment,
    scope: { platform: number; uid: number },
  ) {
    if (segment.type !== "text") {
      return undefined;
    }

    const messageId = payload.quote?.quotedMessageId?.trim();

    if (!messageId) {
      return undefined;
    }

    return this.repository.getQuoteContentBase64({
      messageId,
      platform: scope.platform,
      uid: scope.uid,
    });
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

    const nextSeat = await this.repository.getSeat(seatId);

    if (!nextSeat) {
      throw new NotFoundError("SEAT_NOT_FOUND", "席位不存在");
    }

    return { seat: nextSeat };
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

  private async assertSeatAccess(subUserId: string, seatId: string) {
    const canAccess = await this.repository.canAccessSeat(subUserId, seatId);

    if (!canAccess) {
      throw new NotFoundError("SEAT_NOT_FOUND", "席位不存在");
    }
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
}

function getNextMessageUpdateCursor(
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

  return latestEventTime > currentCursor ? latestEventTime : currentCursor + POLL_MESSAGE_UPDATE_OVERLAP_MS;
}

function getSingleSendSegment(
  payload: WorkbenchSendMessagePayload,
): WorkbenchOutgoingMessageSegment {
  if (payload.segment) {
    return payload.segment;
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
  quoteContentBase64?: string,
): JavaSendMessageData {
  const normalizedQuoteContentBase64 = quoteContentBase64?.trim();
  const withQuoteContentBase64 = (message: JavaSendMessageData): JavaSendMessageData =>
    normalizedQuoteContentBase64
      ? { ...message, quoteContentBase64: normalizedQuoteContentBase64 }
      : message;

  if (segment.type === "image") {
    const imageUrl = segment.url?.trim() || segment.localUrl?.trim();

    if (!imageUrl) {
      throw new BadRequestError("INVALID_IMAGE_MESSAGE", "图片消息缺少可发送地址");
    }

    return withQuoteContentBase64({
      msgContent: imageUrl,
      msgNum: 1,
      msgType: JAVA_MSG_TYPE.IMAGE,
    });
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

    return withQuoteContentBase64({
      msgContent: fileName,
      msgNum: 1,
      msgType: JAVA_MSG_TYPE.FILE,
      vcHref: fileUrl,
      vcTitle: fileName,
    });
  }

  const message: JavaSendMessageData = {
    msgContent: segment.text,
    msgNum: 1,
    msgType: normalizedQuoteContentBase64
      ? JAVA_MSG_TYPE.QUOTE_TEXT
      : JAVA_MSG_TYPE.TEXT,
  };
  if (normalizedQuoteContentBase64) {
    message.quoteContentBase64 = normalizedQuoteContentBase64;
  }

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
