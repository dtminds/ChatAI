import {
  seedAccounts,
  seedConversations,
  seedMessages,
} from "@/pages/chat/mock-data";
import { http } from "@/lib/request";
import {
  type WorkbenchSeatChangeDto,
  type WorkbenchSeatDto,
  type WorkbenchConversationChangeDto,
  type WorkbenchConversationReadResponse,
  type WorkbenchConversationSummaryDto,
  type WorkbenchSubUserDto,
  type WorkbenchMessageDto,
  type WorkbenchMessageStatus,
  type WorkbenchMessageStatusChangeDto,
  type WorkbenchPollRequest,
  type WorkbenchPollResponse,
  type WorkbenchSendMessagePayload,
  type WorkbenchSendMessageResponse,
  type WorkbenchTakeOverSeatResponse,
} from "@chatai/contracts";
import type { Message } from "@/pages/chat/chat-types";

export type WorkbenchService = {
  getSeats: () => Promise<WorkbenchSeatDto[]>;
  getConversations: (seatId: string) => Promise<WorkbenchConversationSummaryDto[]>;
  getMe: () => Promise<WorkbenchSubUserDto>;
  getMessages: (conversationId: string, options?: { beforeSeq?: number; limit?: number }) => Promise<WorkbenchMessageDto[]>;
  markConversationRead: (conversationId: string) => Promise<WorkbenchConversationReadResponse>;
  poll: (request: WorkbenchPollRequest) => Promise<WorkbenchPollResponse>;
  sendMessage: (payload: WorkbenchSendMessagePayload) => Promise<WorkbenchSendMessageResponse>;
  takeOverSeat: (seatId: string) => Promise<WorkbenchTakeOverSeatResponse>;
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
  activeWorkbenchService = createWorkbenchService();
}

export function resolveWorkbenchServiceMode(
  rawMode = import.meta.env.VITE_WORKBENCH_SERVICE_MODE,
): WorkbenchServiceMode {
  if (rawMode === "mock" || rawMode === "http") {
    return rawMode;
  }

  return import.meta.env.MODE === "test" ? "mock" : "http";
}

export function createWorkbenchService(
  mode = resolveWorkbenchServiceMode(),
): WorkbenchService {
  return mode === "http" ? createHttpWorkbenchService() : createMockWorkbenchService();
}

export function createMockWorkbenchService(): WorkbenchService {
  const state = buildInitialState();

  return {
    async getSeats() {
      return clone(state.seats);
    },
    async getConversations(seatId) {
      const conversations = state.conversationsByAccount[seatId] ?? [];

      return clone(sortConversations(conversations));
    },
    async getMe() {
      return clone(state.subUser);
    },
    async getMessages(conversationId, options) {
      const messages = [...(state.messagesByConversationId[conversationId] ?? [])].sort(
        (left, right) => left.seq - right.seq,
      );
      const beforeSeq = options?.beforeSeq;
      const limit = options?.limit ?? 30;
      const visibleMessages =
        beforeSeq == null
          ? messages.slice(-limit)
          : messages.filter((message) => message.seq < beforeSeq).slice(-limit);

      return clone(visibleMessages);
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
      const backendMessages = segments.map((segment, index) => {
        const messageId = `msg-server-${state.nextId++}`;
        const nextSeq = getNextMessageSeq(state, payload.conversationId) + index;

        return {
          seatId: payload.seatId,
          clientMessageId: buildSegmentClientMessageId(payload.clientMessageId, index),
          content: buildPayloadSegmentContent(segment),
          contentType: segment.type,
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
    getConversations(seatId) {
      return http.get<WorkbenchConversationSummaryDto[]>("/server/conversations", {
        params: {
          seatId,
          page: 1,
          pageSize: 30,
        },
      });
    },
    getMe() {
      return http.get<WorkbenchSubUserDto>("/server/me");
    },
    getMessages(conversationId, options) {
      return http.get<WorkbenchMessageDto[]>(
        `/server/conversations/${conversationId}/messages`,
        {
          params: {
            before_seq: options?.beforeSeq,
            limit: options?.limit ?? 30,
          },
        },
      );
    },
    markConversationRead(conversationId) {
      return http.post<WorkbenchConversationReadResponse>(
        `/server/conversations/${conversationId}/read`,
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

  return {
    seats,
    conversationsByAccount,
    subUser: {
      displayName: "林洒",
      subUserId: CURRENT_SUB_USER_ID,
    },
    events: [],
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
    senderType: message.role,
    seq,
    status: normalizeBackendStatus(message.status),
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
        durationLabel: message.content.durationLabel,
        height: message.content.height,
        videoUrl: message.content.videoUrl,
        width: message.content.width,
      };
    case "file":
      return {
        extension: message.content.extension,
        fileName: message.content.fileName,
        fileSizeLabel: message.content.fileSizeLabel,
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
) {
  if (segment.type === "image") {
    return {
      alt: segment.alt,
      height: segment.height,
      imageUrl: segment.url ?? segment.localUrl ?? "",
      width: segment.width,
    };
  }

  return {
    text: segment.text,
  };
}

function getPayloadPreview(segments: ReturnType<typeof getPayloadSegments>) {
  const firstTextSegment = segments.find((segment) => segment.type === "text");

  return firstTextSegment?.text ?? (segments.some((segment) => segment.type === "image") ? "[图片]" : "");
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
    (left, right) => (right.lastMessageTime ?? 0) - (left.lastMessageTime ?? 0),
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
