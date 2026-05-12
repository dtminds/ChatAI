import type {
  WorkbenchConversationReadResponse,
  WorkbenchConversationUnreadResponse,
  WorkbenchConversationSummaryDto,
  WorkbenchGroupMembersResponse,
  WorkbenchMessageDto,
  WorkbenchMessagePageDto,
  WorkbenchPollRequest,
  WorkbenchPollResponse,
  WorkbenchSeatDto,
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchSubUserDto,
  WorkbenchTakeOverSeatResponse,
} from "@chatai/contracts";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors.js";
import type { WorkbenchJavaClient } from "./workbench-java-client.js";
import type { WorkbenchRepository } from "./workbench-repository.js";

export type WorkbenchService = {
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
  getSeats(subUserId: string): Promise<WorkbenchSeatDto[]> | WorkbenchSeatDto[];
  markConversationRead(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationReadResponse> | WorkbenchConversationReadResponse;
  markConversationUnread(
    subUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationUnreadResponse> | WorkbenchConversationUnreadResponse;
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
};

export class MysqlWorkbenchService implements WorkbenchService {
  constructor(
    private readonly repository: WorkbenchRepository,
    private readonly javaClient: WorkbenchJavaClient,
  ) {}

  async getMe(subUserId: string) {
    const subUser = await this.repository.getSubUser(subUserId);

    if (!subUser) {
      throw new UnauthorizedError();
    }

    return subUser;
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

    const unreadDelta = conversation.unreadCount > 0 ? 0 : 1;

    return {
      conversationId: conversation.id,
      seatId: conversation.seatId,
      seatUnreadCount: conversation.seatUnreadCount + unreadDelta,
      unreadCount: 1,
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
    const conversation = await this.repository.getConversationLookup(payload.conversationId);

    if (!conversation || conversation.seatId !== payload.seatId) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, payload.seatId);

    return this.javaClient.sendMessage({ payload, subUserId });
  }

  async takeOverSeat(subUserId: string, seatId: string) {
    await this.assertSeatAccess(subUserId, seatId);

    return this.javaClient.takeOverSeat({ seatId, subUserId });
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
