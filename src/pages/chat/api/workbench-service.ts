import {
  seedAccounts,
  seedConversations,
  seedMessages,
} from "@/pages/chat/mock-data";
import { http } from "@/lib/request";
import {
  type WorkbenchAccountChangeDto,
  type WorkbenchAccountDto,
  type WorkbenchConversationChangeDto,
  type WorkbenchConversationReadResponse,
  type WorkbenchConversationSummaryDto,
  type WorkbenchEmployeeDto,
  type WorkbenchMessageDto,
  type WorkbenchMessageStatus,
  type WorkbenchMessageStatusChangeDto,
  type WorkbenchPollRequest,
  type WorkbenchPollResponse,
  type WorkbenchSendMessagePayload,
  type WorkbenchSendMessageResponse,
  type WorkbenchTakeOverAccountResponse,
} from "@/pages/chat/api/workbench-contracts";
import type { Message } from "@/pages/chat/chat-types";

export type WorkbenchService = {
  getAccounts: () => Promise<WorkbenchAccountDto[]>;
  getConversations: (accountId: string) => Promise<WorkbenchConversationSummaryDto[]>;
  getMe: () => Promise<WorkbenchEmployeeDto>;
  getMessages: (conversationId: string, options?: { beforeSeq?: number; limit?: number }) => Promise<WorkbenchMessageDto[]>;
  markConversationRead: (conversationId: string) => Promise<WorkbenchConversationReadResponse>;
  poll: (request: WorkbenchPollRequest) => Promise<WorkbenchPollResponse>;
  sendMessage: (payload: WorkbenchSendMessagePayload) => Promise<WorkbenchSendMessageResponse>;
  takeOverAccount: (accountId: string) => Promise<WorkbenchTakeOverAccountResponse>;
};

export type WorkbenchServiceMode = "mock" | "http";

type WorkbenchEvent =
  | {
      version: number;
      type: "account";
      payload: WorkbenchAccountChangeDto;
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
  accounts: WorkbenchAccountDto[];
  conversationsByAccount: Record<string, WorkbenchConversationSummaryDto[]>;
  employee: WorkbenchEmployeeDto;
  events: WorkbenchEvent[];
  messagesByConversationId: Record<string, WorkbenchMessageDto[]>;
  nextId: number;
  version: number;
};

const CURRENT_EMPLOYEE_ID = "emp-001";
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
  return rawMode === "http" ? "http" : "mock";
}

export function createWorkbenchService(
  mode = resolveWorkbenchServiceMode(),
): WorkbenchService {
  return mode === "http" ? createHttpWorkbenchService() : createMockWorkbenchService();
}

export function createMockWorkbenchService(): WorkbenchService {
  const state = buildInitialState();

  return {
    async getAccounts() {
      return clone(state.accounts);
    },
    async getConversations(accountId) {
      const conversations = state.conversationsByAccount[accountId] ?? [];

      return clone(sortConversations(conversations));
    },
    async getMe() {
      return clone(state.employee);
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
      syncAccountUnread(state, nextConversation.accountId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, nextConversation.accountId);

      return {
        accountId: nextConversation.accountId,
        accountUnreadCount: findAccount(state, nextConversation.accountId)?.unreadCount ?? 0,
        conversationId,
        unreadCount: 0,
      };
    },
    async poll(request) {
      const relevantEvents = state.events.filter((event) => event.version > request.sinceVersion);
      const accountChanges = collapseLatest(
        relevantEvents.filter((event): event is Extract<WorkbenchEvent, { type: "account" }> => event.type === "account"),
        (event) => event.payload.accountId,
      ).map((event) => event.payload);

      const conversationChanges = collapseLatest(
        relevantEvents.filter(
          (event): event is Extract<WorkbenchEvent, { type: "conversation" }> =>
            event.type === "conversation" &&
            event.payload.accountId === request.currentAccountId,
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
        accountChanges: clone(accountChanges),
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

      const messageId = `msg-server-${state.nextId++}`;
      const nextSeq = getNextMessageSeq(state, payload.conversationId);
      const now = Date.now();
      const outcome = resolveSendOutcome(state, payload.accountId, payload.content);
      const backendMessage = {
        accountId: payload.accountId,
        clientMessageId: payload.clientMessageId,
        content: {
          text: payload.content,
        },
        contentType: "text" as const,
        conversationId: payload.conversationId,
        createdAt: now,
        customerId: conversation.customerId,
        messageId,
        senderType: "agent" as const,
        seq: nextSeq,
        status: outcome.status,
      } satisfies WorkbenchMessageDto;

      const messages = state.messagesByConversationId[payload.conversationId] ?? [];
      state.messagesByConversationId[payload.conversationId] = [...messages, backendMessage];

      const nextConversation = {
        ...conversation,
        lastMessage: payload.content,
        lastMessageTime: now,
      };

      upsertConversation(state, nextConversation);
      syncAccountUnread(state, payload.accountId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, payload.accountId);
      pushMessageStatusEvent(state, {
        clientMessageId: payload.clientMessageId,
        conversationId: payload.conversationId,
        messageId,
        reason: outcome.reason,
        status: outcome.status,
      });

      return {
        clientMessageId: payload.clientMessageId,
        messageId,
        status: "accepted",
      };
    },
    async takeOverAccount(accountId) {
      const account = findAccount(state, accountId);

      if (!account) {
        throw new Error("Account not found");
      }

      const nextAccount = {
        ...account,
        takenOverEmployeeId: CURRENT_EMPLOYEE_ID,
      };

      state.accounts = state.accounts.map((item) =>
        item.accountId === accountId ? nextAccount : item,
      );
      pushAccountEvent(state, accountId);

      return { account: clone(nextAccount) };
    },
  };
}

export function createHttpWorkbenchService(): WorkbenchService {
  return {
    getAccounts() {
      return http.get<WorkbenchAccountDto[]>("/qywx-accounts");
    },
    getConversations(accountId) {
      return http.get<WorkbenchConversationSummaryDto[]>("/workbench/conversations", {
        params: {
          accountId,
          page: 1,
          pageSize: 30,
        },
      });
    },
    getMe() {
      return http.get<WorkbenchEmployeeDto>("/me");
    },
    getMessages(conversationId, options) {
      return http.get<WorkbenchMessageDto[]>(
        `/workbench/conversations/${conversationId}/messages`,
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
        `/workbench/conversations/${conversationId}/read`,
      );
    },
    poll(request) {
      return http.get<WorkbenchPollResponse>("/workbench/poll", {
        params: {
          active_conversation_id: request.activeConversationId,
          active_message_seq: request.activeMessageSeq,
          current_account_id: request.currentAccountId,
          since_version: request.sinceVersion,
        },
      });
    },
    sendMessage(payload) {
      return http.post<WorkbenchSendMessageResponse, WorkbenchSendMessagePayload>(
        "/workbench/messages/send",
        payload,
      );
    },
    takeOverAccount(accountId) {
      return http.post<WorkbenchTakeOverAccountResponse>(
        `/workbench/accounts/${accountId}/take-over`,
      );
    },
  };
}

function buildInitialState(): MockState {
  const conversationsByAccount = Object.fromEntries(
    Object.entries(seedConversations).map(([accountId, conversations]) => [
      accountId,
      sortConversations(
        conversations.map((conversation) => ({
          accountId: conversation.accountId,
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

  const accounts: WorkbenchAccountDto[] = seedAccounts.map((account) => ({
    accountId: account.id,
    avatar: account.avatarUrl,
    description: account.description,
    lastMessageTime: getAccountLastMessageTime(conversationsByAccount[account.id] ?? []),
    loginStatus: "online",
    name: account.name,
    operatorName: account.operator,
    phone: account.phone,
    takenOverEmployeeId: account.id === "drc" ? CURRENT_EMPLOYEE_ID : undefined,
    unreadCount: getAccountUnreadCount(conversationsByAccount[account.id] ?? []),
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
    accounts,
    conversationsByAccount,
    employee: {
      displayName: "林洒",
      id: CURRENT_EMPLOYEE_ID,
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
  const accountId = getAccountIdByConversationId(message.conversationId);
  const customerId = getCustomerIdByConversationId(message.conversationId);

  return {
    accountId,
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
      return { durationLabel: message.content.durationLabel };
    case "image":
      return {
        alt: message.content.alt,
        height: message.content.height,
        imageUrl: message.content.imageUrl,
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
      };
    case "mini-program":
      return {
        appName: message.content.appName,
        coverImageUrl: message.content.coverImageUrl,
        sourceLabel: message.content.sourceLabel,
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

function getAccountIdByConversationId(conversationId: string) {
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
    (latest, conversation) => Math.max(latest, conversation.lastMessageTime),
    0,
  );
}

function findConversation(state: MockState, conversationId: string) {
  return Object.values(state.conversationsByAccount)
    .flat()
    .find((conversation) => conversation.conversationId === conversationId);
}

function findAccount(state: MockState, accountId: string) {
  return state.accounts.find((account) => account.accountId === accountId);
}

function upsertConversation(state: MockState, nextConversation: WorkbenchConversationSummaryDto) {
  const currentConversations = state.conversationsByAccount[nextConversation.accountId] ?? [];
  state.conversationsByAccount[nextConversation.accountId] = sortConversations([
    nextConversation,
    ...currentConversations.filter(
      (conversation) => conversation.conversationId !== nextConversation.conversationId,
    ),
  ]);
}

function syncAccountUnread(state: MockState, accountId: string) {
  const account = findAccount(state, accountId);

  if (!account) {
    return;
  }

  const conversations = state.conversationsByAccount[accountId] ?? [];
  account.unreadCount = getAccountUnreadCount(conversations);
  account.lastMessageTime = getAccountLastMessageTime(conversations);
}

function pushAccountEvent(state: MockState, accountId: string) {
  const account = findAccount(state, accountId);

  if (!account) {
    return;
  }

  state.version += 1;
  state.events.push({
    payload: {
      accountId,
      lastMessageTime: account.lastMessageTime,
      unreadCount: account.unreadCount,
    },
    type: "account",
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

function resolveSendOutcome(state: MockState, accountId: string, content: string) {
  const account = findAccount(state, accountId);
  const shouldFail = account?.loginStatus === "offline" || /\[fail\]/i.test(content);

  if (shouldFail) {
    return {
      reason: account?.loginStatus === "offline" ? "企微账号离线" : "模拟发送失败",
      status: "failed" as const,
    };
  }

  return {
    status: "sent" as const,
  };
}

function sortConversations(conversations: WorkbenchConversationSummaryDto[]) {
  return [...conversations].sort((left, right) => right.lastMessageTime - left.lastMessageTime);
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
