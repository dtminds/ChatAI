import {
  seedAccounts,
  seedConversations,
  seedGroupMembersByConversationId,
  seedMessages,
} from "@/pages/chat/mock-data";
import { http } from "@/lib/request";
import {
  type ApiSuccessEnvelope,
  type WorkbenchConversationDeleteResponse,
  type WorkbenchSeatChangeDto,
  type WorkbenchSeatDto,
  type WorkbenchConversationChangeDto,
  type WorkbenchConversationPinResponse,
  type WorkbenchConversationReadResponse,
  type WorkbenchConversationUnpinResponse,
  type WorkbenchConversationUnreadResponse,
  type WorkbenchConversationSummaryDto,
  type WorkbenchGroupMembersResponse,
  type WorkbenchSubUserDto,
  type WorkbenchMessageDto,
  type WorkbenchMessageFileDownloadResponse,
  type WorkbenchMessageFileDownloadStatusResponse,
  type WorkbenchMessagePageDto,
  type WorkbenchMessageStatus,
  type WorkbenchMessageStatusChangeDto,
  type WorkbenchPollRequest,
  type WorkbenchPollResponse,
  type WorkbenchSendMessagePayload,
  type SettingsSidebarItemsResponse,
  type WorkbenchSendMessageResponse,
  type WorkbenchTakeOverSeatResponse,
  type WorkbenchUploadCredentialResponse,
} from "@chatai/contracts";
import type {
  ChatMode,
  FileMessageContent,
  Message,
  VideoMessageContent,
} from "@/pages/chat/chat-types";

export type WorkbenchConversationListOptions = {
  limit?: number;
  mode?: ChatMode;
};

export type WorkbenchService = {
  deleteConversation: (conversationId: string) => Promise<WorkbenchConversationDeleteResponse>;
  getSeats: () => Promise<WorkbenchSeatDto[]>;
  getConversations: (
    seatId: string,
    options?: WorkbenchConversationListOptions,
  ) => Promise<WorkbenchConversationSummaryDto[]>;
  getMe: () => Promise<WorkbenchSubUserDto>;
  getSidebarItems: () => Promise<SettingsSidebarItemsResponse>;
  getMessages: (conversationId: string, options?: { beforeSeq?: number; limit?: number }) => Promise<WorkbenchMessagePageDto>;
  downloadMessageFile: (input: {
    conversationId: string;
    messageId: string;
    messageSeq: number;
  }) => Promise<WorkbenchMessageFileDownloadResponse>;
  getMessageFileDownloadStatus: (input: {
    conversationId: string;
    messageSeq: number;
  }) => Promise<WorkbenchMessageFileDownloadStatusResponse | undefined>;
  getGroupMembers: (conversationId: string) => Promise<WorkbenchGroupMembersResponse>;
  getUploadCredential: (conversationId: string) => Promise<WorkbenchUploadCredentialResponse>;
  markConversationRead: (conversationId: string) => Promise<WorkbenchConversationReadResponse>;
  markConversationUnread: (conversationId: string) => Promise<WorkbenchConversationUnreadResponse>;
  pinConversation: (conversationId: string) => Promise<WorkbenchConversationPinResponse>;
  poll: (request: WorkbenchPollRequest) => Promise<WorkbenchPollResponse>;
  sendMessage: (payload: WorkbenchSendMessagePayload) => Promise<WorkbenchSendMessageResponse>;
  takeOverSeat: (seatId: string) => Promise<WorkbenchTakeOverSeatResponse>;
  unpinConversation: (conversationId: string) => Promise<WorkbenchConversationUnpinResponse>;
};

export type WorkbenchServiceMode = "mock" | "http";

type WorkbenchEvent =
  | {
      version: number;
      type: "seat";
      payload: WorkbenchSeatChangeDto;
    }
  | {
      version: number;
      type: "conversation";
      payload: WorkbenchConversationChangeDto;
    }
  | {
      version: number;
      type: "message";
      payload: WorkbenchMessageDto;
    }
  | {
      version: number;
      type: "message-status";
      payload: WorkbenchMessageStatusChangeDto;
    };

type MockState = {
  seats: WorkbenchSeatDto[];
  conversationsByAccount: Record<string, WorkbenchConversationSummaryDto[]>;
  subUser: WorkbenchSubUserDto;
  events: WorkbenchEvent[];
  groupMembersByConversationId: Record<string, WorkbenchGroupMembersResponse["items"]>;
  messagesByConversationId: Record<string, WorkbenchMessageDto[]>;
  nextId: number;
  version: number;
};

const CURRENT_SUB_USER_ID = "sub-user-001";
const INITIAL_VERSION = 1284;

let activeWorkbenchService: WorkbenchService = createWorkbenchService();

export function getWorkbenchService() {
  return activeWorkbenchService;
}

export function setWorkbenchService(service: WorkbenchService) {
  activeWorkbenchService = service;
}

export function resetWorkbenchService() {
  activeWorkbenchService = createMockWorkbenchService();
}

export function createWorkbenchService(): WorkbenchService {
  return createHttpWorkbenchService();
}

export function createMockWorkbenchService(): WorkbenchService {
  const state = buildInitialState();

  return {
    async getSeats() {
      return clone(state.seats);
    },
    async deleteConversation(conversationId) {
      return removeConversation(state, conversationId);
    },
    async getConversations(seatId, options) {
      const conversations = state.conversationsByAccount[seatId] ?? [];

      return clone(
        sortConversations(conversations)
          .filter((conversation) => options?.mode == null || conversation.mode === options.mode)
          .slice(0, options?.limit),
      );
    },
    async getMe() {
      return clone(state.subUser);
    },
    async getSidebarItems() {
      return {
        items: [],
      };
    },
    async getMessages(conversationId, options) {
      const messages = [...(state.messagesByConversationId[conversationId] ?? [])].sort(
        (left, right) => left.seq - right.seq,
      );
      const beforeSeq = options?.beforeSeq;
      const limit = options?.limit ?? 30;
      if (limit <= 0) {
        return {
          filteredCount: 0,
          hasMore: false,
          messages: [],
          scannedCount: 0,
        };
      }

      const candidateMessages =
        beforeSeq == null
          ? messages
          : messages.filter((message) => message.seq < beforeSeq);
      const scannedMessages = candidateMessages.slice(-(limit + 1)).slice(-limit);
      const visibleMessages = scannedMessages.filter(
        (message) => message.contentType !== "system" || message.content.type !== "revoke",
      );

      return {
        filteredCount: scannedMessages.length - visibleMessages.length,
        hasMore: candidateMessages.length > limit,
        messages: clone(visibleMessages),
        nextBeforeSeq: scannedMessages[0]?.seq,
        scannedCount: scannedMessages.length,
      };
    },
    async downloadMessageFile(input) {
      const message = findMessageByIdOrSeq(
        state,
        input.conversationId,
        input.messageId,
        input.messageSeq,
      );

      if (!message) {
        throw new Error("Message not found");
      }

      updateMessageDownloadContent(state, input.conversationId, input.messageId, {
        downloadStatus: "ing",
      });

      return {
        messageId: input.messageId,
        status: "accepted",
      };
    },
    async getMessageFileDownloadStatus(input) {
      const message = findMessageByIdOrSeq(
        state,
        input.conversationId,
        undefined,
        input.messageSeq,
      );

      if (!message) {
        return undefined;
      }

      const content = message.content;

      if (!isFileDownloadContent(content)) {
        return undefined;
      }

      return {
        downloadStatus: content.downloadStatus,
        fileUrlExpireTime: content.type === "video" ? content.fileUrlExpireTime : undefined,
        fileSerialNo: content.fileSerialNo,
        fileUrl: content.type === "file" ? content.fileUrl : content.videoUrl,
      };
    },
    async getGroupMembers(conversationId) {
      const members =
        state.groupMembersByConversationId[conversationId] ??
        state.groupMembersByConversationId["conv-004"];

      return clone({
        conversationId,
        groupSeatId: `group-seat-${conversationId}`,
        items: members,
        thirdGroupId: `third-group-${conversationId}`,
      });
    },
    async getUploadCredential(conversationId) {
      if (!findConversation(state, conversationId)) {
        throw new Error("Conversation not found");
      }

      return {
        allowPerfixs: ["chat-images/"],
        bucket: "mock-bucket-1250000000",
        credentials: {
          sessionToken: "mock-session-token",
          tmpSecretId: "mock-tmp-secret-id",
          tmpSecretKey: "mock-tmp-secret-key",
          token: "mock-token",
        },
        expiration: "2026-05-13T12:00:00Z",
        expiredTime: 1778673600,
        region: "ap-guangzhou",
        requestId: "mock-upload-credential-request",
        startTime: 1778670000,
      };
    },
    async markConversationRead(conversationId) {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const nextConversation = {
        ...conversation,
        unreadCount: 0,
      };

      upsertConversation(state, nextConversation);
      syncAccountUnread(state, nextConversation.seatId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, nextConversation.seatId);

      return {
        seatId: nextConversation.seatId,
        seatUnreadCount: findAccount(state, nextConversation.seatId)?.unreadCount ?? 0,
        conversationId,
        unreadCount: 0,
      };
    },
    async markConversationUnread(conversationId) {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const nextConversation = {
        ...conversation,
        unreadCount: 1,
      };

      upsertConversation(state, nextConversation);
      syncAccountUnread(state, nextConversation.seatId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, nextConversation.seatId);

      return {
        seatId: nextConversation.seatId,
        seatUnreadCount: findAccount(state, nextConversation.seatId)?.unreadCount ?? 0,
        conversationId,
        unreadCount: 1,
      };
    },
    async pinConversation(conversationId) {
      return setConversationPinned(state, conversationId, true);
    },
    async unpinConversation(conversationId) {
      return setConversationPinned(state, conversationId, false);
    },
    async poll(request) {
      const relevantEvents = state.events.filter((event) => event.version > request.sinceVersion);
      const seatChanges = collapseLatest(
        relevantEvents.filter((event): event is Extract<WorkbenchEvent, { type: "seat" }> => event.type === "seat"),
        (event) => event.payload.seatId,
      ).map((event) => event.payload);

      const conversationChanges = collapseLatest(
        relevantEvents.filter(
          (event): event is Extract<WorkbenchEvent, { type: "conversation" }> =>
            event.type === "conversation" &&
            event.payload.seatId === request.currentSeatId,
        ),
        (event) => event.payload.conversationId,
      ).map((event) => event.payload);

      const activeConversationMessages = relevantEvents
        .filter(
          (event): event is Extract<WorkbenchEvent, { type: "message" }> =>
            event.type === "message" &&
            event.payload.conversationId === request.activeConversationId &&
            event.payload.seq > (request.activeMessageSeq ?? 0),
        )
        .map((event) => event.payload);

      const messageStatusChanges = relevantEvents
        .filter(
          (event): event is Extract<WorkbenchEvent, { type: "message-status" }> =>
            event.type === "message-status",
        )
        .map((event) => event.payload);

      return {
        seatChanges: clone(seatChanges),
        activeConversationMessages: clone(activeConversationMessages),
        conversationChanges: clone(conversationChanges),
        messageStatusChanges: clone(messageStatusChanges),
        nextVersion: state.version,
      };
    },
    async sendMessage(payload) {
      const conversation = findConversation(state, payload.conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const now = Date.now();
      const segments = getPayloadSegments(payload);
      const outcome = resolveSendOutcome(state, payload.seatId, segments);
      let hasAppliedQuote = false;
      const backendMessages = segments.map((segment, index) => {
        const messageId = `msg-server-${state.nextId++}`;
        const nextSeq = getNextMessageSeq(state, payload.conversationId) + index;
        const quoteForSegment =
          !hasAppliedQuote && segment.type === "text" ? payload.quote : undefined;
        hasAppliedQuote = hasAppliedQuote || Boolean(quoteForSegment);

        return {
          seatId: payload.seatId,
          clientMessageId: buildSegmentClientMessageId(payload.clientMessageId, index),
          content: buildPayloadSegmentContent(segment, quoteForSegment),
          contentType: quoteForSegment ? "quote" : segment.type,
          conversationId: payload.conversationId,
          createdAt: now + index,
          customerId: conversation.customerId,
          messageId,
          senderType: "agent" as const,
          seq: nextSeq,
          status: outcome.status,
        } satisfies WorkbenchMessageDto;
      });

      const messages = state.messagesByConversationId[payload.conversationId] ?? [];
      state.messagesByConversationId[payload.conversationId] = [
        ...messages,
        ...backendMessages,
      ];

      const nextConversation = {
        ...conversation,
        lastMessage: getPayloadPreview(segments),
        lastMessageTime: now,
      };

      upsertConversation(state, nextConversation);
      syncAccountUnread(state, payload.seatId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, payload.seatId);
      backendMessages.forEach((message) => {
        pushMessageStatusEvent(state, {
          clientMessageId: message.clientMessageId,
          conversationId: message.conversationId,
          messageId: message.messageId,
          reason: outcome.reason,
          status: outcome.status,
        });
      });

      return {
        clientMessageId: payload.clientMessageId,
        messageId: backendMessages[0]?.messageId ?? payload.clientMessageId,
        messages: backendMessages.map((message) => ({
          clientMessageId: message.clientMessageId ?? payload.clientMessageId,
          messageId: message.messageId,
          status: "accepted" as const,
        })),
        status: "accepted",
      };
    },
    async takeOverSeat(seatId) {
      const seat = findAccount(state, seatId);

      if (!seat) {
        throw new Error("Account not found");
      }

      const nextAccount = {
        ...seat,
        hostSubUserId: CURRENT_SUB_USER_ID,
      };

      state.seats = state.seats.map((item) =>
        item.seatId === seatId ? nextAccount : item,
      );
      pushAccountEvent(state, seatId);

      return { seat: clone(nextAccount) };
    },
  };
}

export function createHttpWorkbenchService(): WorkbenchService {
  return {
    getSeats() {
      return http.get<WorkbenchSeatDto[]>("/server/seats");
    },
    deleteConversation(conversationId) {
      return http.post<WorkbenchConversationDeleteResponse>(
        `/server/conversations/${conversationId}/delete`,
      );
    },
    getConversations(seatId, options) {
      return http.get<WorkbenchConversationSummaryDto[]>("/server/conversations", {
        params: {
          limit: options?.limit,
          mode: options?.mode,
          seatId,
        },
      });
    },
    getMe() {
      return http.get<WorkbenchSubUserDto>("/server/me");
    },
    async getSidebarItems() {
      const response = await http.get<ApiSuccessEnvelope<SettingsSidebarItemsResponse>>(
        "/server/settings/sidebar-items",
      );

      return response.data;
    },
    getMessages(conversationId, options) {
      return http.get<WorkbenchMessagePageDto>(
        `/server/conversations/${conversationId}/messages`,
        {
          params: {
            before_seq: options?.beforeSeq,
            limit: options?.limit ?? 30,
          },
        },
      );
    },
    downloadMessageFile(input) {
      return http.post<
        WorkbenchMessageFileDownloadResponse,
        { conversationId: string; messageSeq: number }
      >(`/server/messages/${input.messageId}/download`, {
        conversationId: input.conversationId,
        messageSeq: input.messageSeq,
      });
    },
    getMessageFileDownloadStatus(input) {
      return http.post<
        WorkbenchMessageFileDownloadStatusResponse | undefined,
        { conversationId: string; messageSeq: number }
      >("/server/messages/download-status", {
        conversationId: input.conversationId,
        messageSeq: input.messageSeq,
      });
    },
    getGroupMembers(conversationId) {
      return http.get<WorkbenchGroupMembersResponse>(
        `/server/conversations/${conversationId}/group-members`,
      );
    },
    getUploadCredential(conversationId) {
      return http.post<
        WorkbenchUploadCredentialResponse,
        { conversationId: string }
      >("/server/media/upload-credential", {
        conversationId,
      });
    },
    markConversationRead(conversationId) {
      return http.post<WorkbenchConversationReadResponse>(
        `/server/conversations/${conversationId}/read`,
      );
    },
    markConversationUnread(conversationId) {
      return http.post<WorkbenchConversationUnreadResponse>(
        `/server/conversations/${conversationId}/unread`,
      );
    },
    pinConversation(conversationId) {
      return http.post<WorkbenchConversationPinResponse>(
        `/server/conversations/${conversationId}/pin`,
      );
    },
    poll(request) {
      return http.get<WorkbenchPollResponse>("/server/poll", {
        params: {
          active_conversation_id: request.activeConversationId,
          active_message_seq: request.activeMessageSeq,
          current_seat_id: request.currentSeatId,
          since_version: request.sinceVersion,
        },
      });
    },
    sendMessage(payload) {
      return http.post<WorkbenchSendMessageResponse, WorkbenchSendMessagePayload>(
        "/server/messages/send",
        payload,
      );
    },
    takeOverSeat(seatId) {
      return http.post<WorkbenchTakeOverSeatResponse>(
        `/server/seats/${seatId}/take-over`,
      );
    },
    unpinConversation(conversationId) {
      return http.post<WorkbenchConversationUnpinResponse>(
        `/server/conversations/${conversationId}/unpin`,
      );
    },
  };
}

function buildInitialState(): MockState {
  const conversationsByAccount = Object.fromEntries(
    Object.entries(seedConversations).map(([seatId, conversations]) => [
      seatId,
      sortConversations(
        conversations.map((conversation) => ({
          seatId: conversation.accountId,
          conversationId: conversation.id,
          customerAvatar: conversation.customerAvatarUrl,
          customerId: conversation.customerId,
          customerName: conversation.customerName,
          lastMessage: conversation.preview,
          lastMessageTime: new Date(conversation.updatedAt.replace(" ", "T")).getTime(),
          isPinned: conversation.isPinned,
          mode: conversation.mode,
          priority: conversation.priority,
          unreadCount: conversation.unread,
        })),
      ),
    ]),
  ) as Record<string, WorkbenchConversationSummaryDto[]>;

  const seats: WorkbenchSeatDto[] = seedAccounts.map((seat) => ({
    seatId: seat.id,
    avatar: seat.avatarUrl,
    description: seat.description,
    lastMessageTime: getAccountLastMessageTime(conversationsByAccount[seat.id] ?? []),
    loginStatus: "online",
    name: seat.name,
    operatorName: seat.operator,
    phone: seat.phone,
    hostSubUserId: seat.id === "drc" ? CURRENT_SUB_USER_ID : undefined,
    unreadCount: getAccountUnreadCount(conversationsByAccount[seat.id] ?? []),
  }));

  const messagesByConversationId = Object.fromEntries(
    Object.entries(seedMessages).map(([conversationId, messages]) => [
      conversationId,
      messages.map((message, index) =>
        buildMessageDto({
          message,
          seq: index + 1,
        }),
      ),
    ]),
  ) as Record<string, WorkbenchMessageDto[]>;
  const groupMembersByConversationId = Object.fromEntries(
    Object.entries(seedGroupMembersByConversationId).map(([conversationId, members]) => [
      conversationId,
      members.map((member) => ({
        avatarUrl: member.avatarUrl ?? "",
        displayName: member.displayName,
        thirdUserId: member.id,
        type: member.type,
      })),
    ]),
  ) as MockState["groupMembersByConversationId"];

  return {
    seats,
    conversationsByAccount,
    subUser: {
      displayName: "林洒",
      subUserId: CURRENT_SUB_USER_ID,
    },
    events: [],
    groupMembersByConversationId,
    messagesByConversationId,
    nextId: 1,
    version: INITIAL_VERSION,
  };
}

function buildMessageDto({
  message,
  seq,
}: {
  message: Message;
  seq: number;
}): WorkbenchMessageDto {
  const seatId = getSeatIdByConversationId(message.conversationId);
  const customerId = getCustomerIdByConversationId(message.conversationId);
  const isGroupConversation = isGroupConversationId(message.conversationId);

  return {
    seatId,
    clientMessageId: message.clientMessageId,
    content: buildContent(message),
    contentType: message.content.type,
    conversationId: message.conversationId,
    createdAt: new Date(message.sentAt.replace(" ", "T")).getTime(),
    customerId,
    failReason: message.failReason,
    messageId: message.remoteMessageId ?? message.id,
    senderAvatar: message.role === "system" ? undefined : message.sender.avatarUrl,
    senderName: message.role === "system" ? undefined : message.sender.name,
    senderType: message.role,
    seq,
    status: normalizeBackendStatus(message.status),
    thirdFromId: message.role === "system"
      ? undefined
      : message.sender.groupMemberId ?? (isGroupConversation ? message.sender.id : undefined),
    thirdGroupId: isGroupConversation
      ? `third-group-${message.conversationId}`
      : undefined,
    thirdUserId: isGroupConversation
      ? `third-user-${seatId}`
      : undefined,
  };
}

function buildContent(message: Message) {
  switch (message.content.type) {
    case "system":
      return { text: message.content.text };
    case "text":
      return { text: message.content.text };
    case "voice":
      return {
        audioUrl: message.content.audioUrl,
        durationLabel: message.content.durationLabel,
      };
    case "image":
      return {
        alt: message.content.alt,
        height: message.content.height,
        imageUrl: message.content.imageUrl,
        width: message.content.width,
      };
    case "video":
      return {
        alt: message.content.alt,
        coverImageUrl: message.content.coverImageUrl,
        downloadStatus: message.content.downloadStatus,
        durationLabel: message.content.durationLabel,
        fileSerialNo: message.content.fileSerialNo,
        fileUrlExpireTime: message.content.fileUrlExpireTime,
        height: message.content.height,
        videoUrl: message.content.videoUrl,
        width: message.content.width,
      };
    case "file":
      return {
        downloadStatus: message.content.downloadStatus,
        extension: message.content.extension,
        fileName: message.content.fileName,
        fileSerialNo: message.content.fileSerialNo,
        fileSizeLabel: message.content.fileSizeLabel,
        fileUrl: message.content.fileUrl,
        sourceLabel: message.content.sourceLabel,
      };
    case "h5":
      return {
        description: message.content.description,
        previewImageUrl: message.content.previewImageUrl,
        sourceLabel: message.content.sourceLabel,
        title: message.content.title,
        url: message.content.url,
      };
    case "mini-program":
      return {
        appName: message.content.appName,
        coverImageUrl: message.content.coverImageUrl,
        logoUrl: message.content.logoUrl,
        sourceLabel: message.content.sourceLabel,
        title: message.content.title,
      };
    case "contact-card":
      return {
        avatarUrl: message.content.avatarUrl,
        company: message.content.company,
        contactSerialNo: message.content.contactSerialNo,
        groupSerialNo: message.content.groupSerialNo,
        name: message.content.name,
        sourceLabel: message.content.sourceLabel,
      };
    case "location":
      return {
        address: message.content.address,
        latitude: message.content.latitude,
        longitude: message.content.longitude,
        title: message.content.title,
        zoom: message.content.zoom,
      };
    case "sphfeed":
      return {
        description: message.content.description,
        imageUrl: message.content.imageUrl,
        sourceLabel: message.content.sourceLabel,
        title: message.content.title,
        url: message.content.url,
      };
    case "solitaire":
      return {
        createMemberSerialNo: message.content.createMemberSerialNo,
        example: message.content.example,
        items: message.content.items,
        tail: message.content.tail,
        title: message.content.title,
      };
    case "redpacket":
      return {
        description: message.content.description,
        title: message.content.title,
        totalAmount: message.content.totalAmount,
        totalCnt: message.content.totalCnt,
      };
    case "quote":
      return {
        quoteMsgId: message.content.quoteMsgId,
        quotedMessage: message.content.quotedMessage,
        text: message.content.text,
      };
  }
}

function normalizeBackendStatus(status: Message["status"]): WorkbenchMessageStatus {
  switch (status) {
    case "pending":
      return "queued";
    case "sending":
      return "sending";
    case "failed":
      return "failed";
    case "read":
      return "read";
    case "sent":
    default:
      return "sent";
  }
}

function getSeatIdByConversationId(conversationId: string) {
  const conversation = Object.values(seedConversations)
    .flat()
    .find((item) => item.id === conversationId);

  return conversation?.accountId ?? "drc";
}

function getCustomerIdByConversationId(conversationId: string) {
  const conversation = Object.values(seedConversations)
    .flat()
    .find((item) => item.id === conversationId);

  return conversation?.customerId ?? "cust-001";
}

function isGroupConversationId(conversationId: string) {
  return Object.values(seedConversations)
    .flat()
    .some((item) => item.id === conversationId && item.mode === "group");
}

function getAccountUnreadCount(conversations: WorkbenchConversationSummaryDto[]) {
  return conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
}

function getAccountLastMessageTime(conversations: WorkbenchConversationSummaryDto[]) {
  return conversations.reduce(
    (latest, conversation) => Math.max(latest, conversation.lastMessageTime ?? 0),
    0,
  );
}

function findConversation(state: MockState, conversationId: string) {
  return Object.values(state.conversationsByAccount)
    .flat()
    .find((conversation) => conversation.conversationId === conversationId);
}

function findAccount(state: MockState, seatId: string) {
  return state.seats.find((seat) => seat.seatId === seatId);
}

function upsertConversation(state: MockState, nextConversation: WorkbenchConversationSummaryDto) {
  const currentConversations = state.conversationsByAccount[nextConversation.seatId] ?? [];
  state.conversationsByAccount[nextConversation.seatId] = sortConversations([
    nextConversation,
    ...currentConversations.filter(
      (conversation) => conversation.conversationId !== nextConversation.conversationId,
    ),
  ]);
}

function setConversationPinned(
  state: MockState,
  conversationId: string,
  isPinned: boolean,
) {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const nextConversation = {
    ...conversation,
    isPinned: isPinned ? true : undefined,
  };

  upsertConversation(state, nextConversation);
  pushConversationEvent(state, {
    ...nextConversation,
    isPinned,
  });

  return {
    conversationId,
    isPinned,
    seatId: nextConversation.seatId,
  };
}

function removeConversation(
  state: MockState,
  conversationId: string,
): WorkbenchConversationDeleteResponse {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  state.conversationsByAccount[conversation.seatId] = (
    state.conversationsByAccount[conversation.seatId] ?? []
  ).filter((item) => item.conversationId !== conversationId);
  syncAccountUnread(state, conversation.seatId);
  pushConversationRemoveEvent(state, conversation.seatId, conversationId);
  pushAccountEvent(state, conversation.seatId);

  return {
    conversationId,
    seatId: conversation.seatId,
  };
}

function syncAccountUnread(state: MockState, seatId: string) {
  const seat = findAccount(state, seatId);

  if (!seat) {
    return;
  }

  const conversations = state.conversationsByAccount[seatId] ?? [];
  seat.unreadCount = getAccountUnreadCount(conversations);
  seat.lastMessageTime = getAccountLastMessageTime(conversations);
}

function pushAccountEvent(state: MockState, seatId: string) {
  const seat = findAccount(state, seatId);

  if (!seat) {
    return;
  }

  state.version += 1;
  state.events.push({
    payload: {
      seatId,
      lastMessageTime: seat.lastMessageTime,
      unreadCount: seat.unreadCount,
    },
    type: "seat",
    version: state.version,
  });
}

function pushConversationEvent(state: MockState, conversation: WorkbenchConversationSummaryDto) {
  state.version += 1;
  state.events.push({
    payload: {
      ...conversation,
      type: "upsert",
    },
    type: "conversation",
    version: state.version,
  });
}

function pushConversationRemoveEvent(
  state: MockState,
  seatId: string,
  conversationId: string,
) {
  state.version += 1;
  state.events.push({
    payload: {
      conversationId,
      seatId,
      type: "remove",
    },
    type: "conversation",
    version: state.version,
  });
}

function pushMessageStatusEvent(
  state: MockState,
  change: WorkbenchMessageStatusChangeDto,
) {
  state.version += 1;
  state.events.push({
    payload: change,
    type: "message-status",
    version: state.version,
  });
}

function getNextMessageSeq(state: MockState, conversationId: string) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  return (messages.at(-1)?.seq ?? 0) + 1;
}

function getPayloadSegments(payload: WorkbenchSendMessagePayload) {
  if (payload.segment) {
    return [payload.segment];
  }

  if (payload.segments?.length) {
    return payload.segments;
  }

  return [
    {
      text: payload.content ?? "",
      type: "text" as const,
    },
  ];
}

function buildPayloadSegmentContent(
  segment: ReturnType<typeof getPayloadSegments>[number],
  quote?: WorkbenchSendMessagePayload["quote"],
) {
  if (quote && segment.type === "text") {
    return {
      quoteMsgId: quote.quoteMsgId,
      quotedMessageId: quote.quotedMessageId,
      quotedMessage: quote.quotedMessage,
      text: segment.text,
    };
  }

  if (segment.type === "image") {
    return {
      alt: segment.alt,
      height: segment.height,
      imageUrl: segment.url ?? segment.localUrl ?? "",
      width: segment.width,
    };
  }

  if (segment.type === "file") {
    return {
      extension: segment.extension,
      fileName: segment.fileName,
      fileSizeLabel: segment.fileSizeLabel ?? "",
      fileUrl: segment.url,
      sourceLabel: "文件",
    };
  }

  return {
    text: segment.text,
  };
}

function findMessageByIdOrSeq(
  state: MockState,
  conversationId: string,
  messageId: string | undefined,
  messageSeq: number,
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  return messages.find(
    (message) =>
      (messageId && message.messageId === messageId) || message.seq === messageSeq,
  );
}

function updateMessageDownloadContent(
  state: MockState,
  conversationId: string,
  messageId: string,
  patch: {
    downloadStatus: "ing" | "finished" | "failed";
    fileUrl?: string;
    fileUrlExpireTime?: number;
  },
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  state.messagesByConversationId[conversationId] = messages.map((message) => {
    if (message.messageId !== messageId || !isFileDownloadContent(message.content)) {
      return message;
    }

    return {
      ...message,
      content: {
        ...message.content,
        ...stripUndefinedFields(patch),
      },
    };
  });
}

function stripUndefinedFields<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as Partial<T>;
}

function isFileDownloadContent(
  content: WorkbenchMessageDto["content"],
): content is (FileMessageContent | VideoMessageContent) & Record<string, unknown> {
  return content.type === "file" || content.type === "video";
}

function getPayloadPreview(segments: ReturnType<typeof getPayloadSegments>) {
  const firstTextSegment = segments.find((segment) => segment.type === "text");

  if (firstTextSegment?.text) {
    return firstTextSegment.text;
  }

  if (segments.some((segment) => segment.type === "image")) {
    return "[图片]";
  }

  return segments.some((segment) => segment.type === "file") ? "[文件]" : "";
}

function buildSegmentClientMessageId(clientMessageId: string, index: number) {
  return index === 0 ? clientMessageId : `${clientMessageId}_${index + 1}`;
}

function resolveSendOutcome(
  state: MockState,
  seatId: string,
  segments: ReturnType<typeof getPayloadSegments>,
) {
  const seat = findAccount(state, seatId);
  const shouldFail =
    seat?.loginStatus === "offline" ||
    segments.some((segment) => segment.type === "text" && /\[fail\]/i.test(segment.text));

  if (shouldFail) {
    return {
      reason: seat?.loginStatus === "offline" ? "企微账号离线" : "模拟发送失败",
      status: "failed" as const,
    };
  }

  return {
    status: "sent" as const,
  };
}

function sortConversations(conversations: WorkbenchConversationSummaryDto[]) {
  return [...conversations].sort(
    (left, right) =>
      Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned)) ||
      (right.lastMessageTime ?? 0) - (left.lastMessageTime ?? 0),
  );
}

function collapseLatest<T>(
  items: T[],
  getKey: (item: T) => string,
) {
  const latestByKey = new Map<string, T>();

  for (const item of items) {
    latestByKey.set(getKey(item), item);
  }

  return [...latestByKey.values()];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
