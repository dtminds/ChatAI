import type {
  WorkbenchConversationDeleteResponse,
  WorkbenchConversationPinResponse,
  WorkbenchConversationReadResponse,
  WorkbenchConversationUnpinResponse,
  WorkbenchConversationUnreadResponse,
  WorkbenchConversationSummaryDto,
  WorkbenchGroupMembersResponse,
  WorkbenchMessageDto,
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
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors.js";
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
  parseMySqlId,
  type WorkbenchRepository,
} from "./workbench-repository.js";

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
  ): Promise<WorkbenchConversationSummaryDto[]> | WorkbenchConversationSummaryDto[];
  getMe(subUserId: string): Promise<WorkbenchSubUserDto> | WorkbenchSubUserDto;
  getMessages(
    subUserId: string,
    conversationId: string,
    options?: { beforeSeq?: number; limit?: number },
  ): Promise<WorkbenchMessagePageDto> | WorkbenchMessagePageDto;
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

  async getConversations(subUserId: string, seatId: string) {
    await this.assertSeatAccess(subUserId, seatId);

    return this.repository.listConversations(seatId);
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

    return this.javaClient.getUploadCredential({
      uid: conversation.uid,
    });
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

    return {
      activeConversationMessages,
      conversationChanges: [],
      messageStatusChanges: [],
      nextVersion: Date.now(),
      seatChanges: [],
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

    return this.javaClient.sendMessage({
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
