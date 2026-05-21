import {
  adaptAccount,
  adaptConversation,
  adaptEmployee,
  adaptGroupMember,
  adaptMessage,
} from "@/pages/chat/api/workbench-adapter";
import type {
  SettingsSidebarItem,
  WorkbenchHistoryMessagePageDto,
  WorkbenchHistoryMessageQuery,
  WorkbenchConversationDeleteResponse,
  WorkbenchConversationPinResponse,
  WorkbenchConversationReadResponse,
  WorkbenchConversationUnpinResponse,
  WorkbenchConversationUnreadResponse,
  WorkbenchMessageStatus,
  WorkbenchMessageFileDownloadStatusResponse,
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchSeatChangeDto,
  WorkbenchUploadCredentialResponse,
  WorkbenchMessageQueryByIdsRequest,
  WorkbenchMessageUpdateEventDto,
} from "@chatai/contracts";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import type {
  Account,
  ChatMode,
  Conversation,
  CustomerProfile,
  EmployeeProfile,
  GroupMember,
  Message,
  MessageStatus,
} from "@/pages/chat/chat-types";
import { sortConversations } from "@/pages/chat/lib/conversation-order";

type GatewayContext = {
  accounts: Account[];
  customerProfilesById: Record<string, CustomerProfile>;
  me?: EmployeeProfile;
};

export type WorkbenchScopeRequest = {
  activeConversationId: string;
  activeMessageSeq: number;
  currentAccountId: string;
  freshBaseline?: boolean;
  messageUpdateCursor?: number;
  sinceVersion: number;
};

export type WorkbenchConversationPage = {
  conversationId: string;
  hasMoreHistory: boolean;
  messages: Message[];
  nextBeforeSeq?: number;
  skippedHiddenCount: number;
};

export type WorkbenchHistoryPage = {
  hasNext: boolean;
  hasPrev: boolean;
  messages: Message[];
  nextCursor?: string;
  prevCursor?: string;
};

export type WorkbenchBootstrapResult = {
  accounts: Account[];
  activeAccountId: string;
  activeConversationId: string;
  activeMode: ChatMode;
  conversationListsByScope: Record<string, Conversation[]>;
  conversationPage?: WorkbenchConversationPage;
  me: EmployeeProfile;
  pollBaseline: number;
  sidebarItems: SettingsSidebarItem[];
};

export type WorkbenchAccountScopeResult = {
  accountId: string;
  conversations: Conversation[];
  conversationPage?: WorkbenchConversationPage;
  nextConversationId: string;
  nextMode: ChatMode;
  pollBaseline: number;
};

export type WorkbenchConversationLoadResult = {
  conversations: Conversation[];
  pollBaseline: number;
};

export type WorkbenchConversationChange =
  | {
      accountId: string;
      conversationId: string;
      type: "remove";
    }
  | {
      accountId: string;
      conversation: Conversation;
      type: "upsert";
    };

export type WorkbenchMessageStatusChange = {
  clientMessageId?: string;
  conversationId: string;
  reason?: string;
  remoteMessageId: string;
  status: MessageStatus;
};

export type WorkbenchPollResult = {
  accountChanges: Array<WorkbenchSeatChangeDto & { accountId: string }>;
  activeConversationMessages: Message[];
  conversationChanges: WorkbenchConversationChange[];
  messageUpdateEvents: WorkbenchMessageUpdateEventDto[];
  messageStatusChanges: WorkbenchMessageStatusChange[];
  nextMessageUpdateCursor?: number;
  nextVersion: number;
  request: WorkbenchScopeRequest;
};

const DEFAULT_MESSAGE_PAGE_SIZE = 50;
export const UNVERIFIED_CONVERSATION_HIDE_DELAY_MS = 3 * 60 * 1000;
export const CONVERSATION_MODE_CACHE_TTL_MS = 60 * 1000;
export const CONVERSATION_MODE_LIMITS = {
  group: 100,
  single: 1000,
} as const satisfies Record<ChatMode, number>;

export async function bootstrapWorkbench(
  preferredMode: ChatMode,
  customerProfilesById: Record<string, CustomerProfile>,
  pageSize = DEFAULT_MESSAGE_PAGE_SIZE,
  now = Date.now(),
): Promise<WorkbenchBootstrapResult> {
  const service = getWorkbenchService();
  const [meDto, accountDtos, sidebarItemsResponse] = await Promise.all([
    service.getMe(),
    service.getSeats(),
    service.getSidebarItems().catch(() => ({ items: [] })),
  ]);

  const me = adaptEmployee(meDto);
  const accounts = accountDtos.map((account) => adaptAccount(account, account.unreadCount));
  const activeAccountId = accounts[0]?.id ?? "";
  const conversationLoadResult = activeAccountId
    ? await loadAccountConversationsWithBaseline(activeAccountId)
    : { conversations: [], pollBaseline: now };
  const conversations = conversationLoadResult.conversations;
  const nextConversation = getFirstConversation(
    getVisibleConversations(conversations, now),
    preferredMode,
  );
  const activeConversationId = nextConversation?.id ?? "";
  const activeMode = nextConversation?.mode ?? preferredMode;
  const conversationPage = activeConversationId
    ? await loadConversationMessagesPage(
        {
          accounts,
          customerProfilesById,
          me,
        },
        activeConversationId,
        { limit: pageSize },
      )
    : undefined;

  return {
    accounts,
    activeAccountId,
    activeConversationId,
    activeMode,
    conversationListsByScope: {
      [activeAccountId]: conversations,
    },
    conversationPage,
    me,
    pollBaseline: conversationLoadResult.pollBaseline,
    sidebarItems: getSidebarItemsFromResponse(sidebarItemsResponse),
  };
}

function mergeConversations(conversationLists: Conversation[][]) {
  const conversationsById = new Map<string, Conversation>();

  for (const conversations of conversationLists) {
    for (const conversation of conversations) {
      conversationsById.set(conversation.id, conversation);
    }
  }

  return sortConversations([...conversationsById.values()]);
}

function getSidebarItemsFromResponse(response: unknown): SettingsSidebarItem[] {
  return getSidebarItemsPayload(response)?.items ?? [];
}

function getSidebarItemsPayload(response: unknown) {
  if (isSidebarItemsPayload(response)) {
    return response;
  }

  if (!isObjectRecord(response)) {
    return undefined;
  }

  return isSidebarItemsPayload(response.data) ? response.data : undefined;
}

function isSidebarItemsPayload(value: unknown): value is { items: SettingsSidebarItem[] } {
  return isObjectRecord(value) && Array.isArray(value.items) && value.items.every(isSidebarItem);
}

function isSidebarItem(value: unknown): value is SettingsSidebarItem {
  if (!isObjectRecord(value)) {
    return false;
  }

  const bindTypes = value.bindTypes;

  return (
    Array.isArray(bindTypes) &&
    bindTypes.length > 0 &&
    bindTypes.length <= 2 &&
    bindTypes.every((element) => element === "1" || element === "2") &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.sort === "number" &&
    (value.status === "active" || value.status === "disabled") &&
    typeof value.url === "string"
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export async function loadAccountScope(
  accountId: string,
  preferredMode: ChatMode,
  context: GatewayContext,
  pageSize = DEFAULT_MESSAGE_PAGE_SIZE,
  preferredConversationId?: string,
  now = Date.now(),
): Promise<WorkbenchAccountScopeResult> {
  const conversationLoadResult = await loadAccountConversationsWithBaseline(accountId);
  const conversations = conversationLoadResult.conversations;
  const visibleConversations = getVisibleConversations(conversations, now);
  const nextConversation =
    visibleConversations.find((conversation) => conversation.id === preferredConversationId) ??
    getFirstConversation(visibleConversations, preferredMode);
  const nextConversationId = nextConversation?.id ?? "";
  const nextMode = nextConversation?.mode ?? preferredMode;
  const conversationPage = nextConversationId
    ? await loadConversationMessagesPage(context, nextConversationId, {
        limit: pageSize,
      })
    : undefined;

  return {
    accountId,
    conversations,
    conversationPage,
    nextConversationId,
    nextMode,
    pollBaseline: conversationLoadResult.pollBaseline,
  };
}

export async function loadAccountConversations(accountId: string): Promise<Conversation[]> {
  return (await loadAccountConversationsWithBaseline(accountId)).conversations;
}

export async function loadAccountConversationsWithBaseline(
  accountId: string,
): Promise<WorkbenchConversationLoadResult> {
  const [singleResult, groupResult] = await Promise.all([
    loadAccountConversationsByMode(accountId, "single"),
    loadAccountConversationsByMode(accountId, "group"),
  ]);

  return {
    conversations: mergeConversations([
      singleResult.conversations,
      groupResult.conversations,
    ]),
    pollBaseline: Math.min(singleResult.pollBaseline, groupResult.pollBaseline),
  };
}

export async function loadAccountConversationsByMode(
  accountId: string,
  mode: ChatMode,
): Promise<WorkbenchConversationLoadResult> {
  const conversationDtos = await getWorkbenchService().getConversations(accountId, {
    limit: CONVERSATION_MODE_LIMITS[mode],
    mode,
  });

  return {
    conversations: conversationDtos.items.map(adaptConversation),
    pollBaseline: conversationDtos.snapshotAt,
  };
}

export async function loadSeats(): Promise<Account[]> {
  const seatDtos = await getWorkbenchService().getSeats();
  return seatDtos.map((seatDto) => adaptAccount(seatDto, seatDto.unreadCount));
}

export async function loadConversationMessagesPage(
  context: GatewayContext,
  conversationId: string,
  options?: {
    beforeSeq?: number;
    limit?: number;
  },
): Promise<WorkbenchConversationPage> {
  const service = getWorkbenchService();
  const page = await service.getMessages(conversationId, options);
  const messages = adaptMessages(page.messages, context);

  return {
    conversationId,
    hasMoreHistory: page.hasMore,
    messages,
    nextBeforeSeq: page.nextBeforeSeq,
    skippedHiddenCount: page.filteredCount,
  };
}

export async function loadMessagesByIds(
  context: GatewayContext,
  conversationId: string,
  messageIds: string[],
): Promise<Message[]> {
  if (!messageIds.length) {
    return [];
  }

  const response = await getWorkbenchService().getMessagesByIds({
    conversationId,
    messageIds,
  } satisfies WorkbenchMessageQueryByIdsRequest);

  return adaptMessages(response.messages, context);
}

export async function loadConversationHistoryMessagesPage(
  context: GatewayContext,
  conversationId: string,
  options?: WorkbenchHistoryMessageQuery,
): Promise<WorkbenchHistoryPage> {
  const page = await getWorkbenchService().getHistoryMessages(conversationId, options);

  return adaptHistoryMessagePage(page, context);
}

export async function loadGroupMembers(
  conversationId: string,
): Promise<GroupMember[]> {
  const response = await getWorkbenchService().getGroupMembers(conversationId);

  return response.items.map(adaptGroupMember);
}

export async function getUploadCredential(
  conversationId: string,
): Promise<WorkbenchUploadCredentialResponse> {
  return getWorkbenchService().getUploadCredential(conversationId);
}

export async function markConversationRead(
  conversationId: string,
): Promise<WorkbenchConversationReadResponse> {
  return getWorkbenchService().markConversationRead(conversationId);
}

export async function markConversationUnread(
  conversationId: string,
): Promise<WorkbenchConversationUnreadResponse> {
  return getWorkbenchService().markConversationUnread(conversationId);
}

export async function deleteConversation(
  conversationId: string,
): Promise<WorkbenchConversationDeleteResponse> {
  return getWorkbenchService().deleteConversation(conversationId);
}

export async function pinConversation(
  conversationId: string,
): Promise<WorkbenchConversationPinResponse> {
  return getWorkbenchService().pinConversation(conversationId);
}

export async function unpinConversation(
  conversationId: string,
): Promise<WorkbenchConversationUnpinResponse> {
  return getWorkbenchService().unpinConversation(conversationId);
}

export async function sendTextMessage(
  payload: WorkbenchSendMessagePayload,
): Promise<WorkbenchSendMessageResponse> {
  return getWorkbenchService().sendMessage(payload);
}

export async function downloadMessageFile(input: {
  conversationId: string;
  messageId: string;
  messageSeq: number;
}) {
  return getWorkbenchService().downloadMessageFile(input);
}

export async function getMessageFileDownloadStatus(input: {
  conversationId: string;
  messageSeq: number;
}): Promise<WorkbenchMessageFileDownloadStatusResponse | undefined> {
  return getWorkbenchService().getMessageFileDownloadStatus(input);
}

export async function takeOverAccount(accountId: string): Promise<Account> {
  const response = await getWorkbenchService().takeOverSeat(accountId);
  return adaptAccount(response.seat, response.seat.unreadCount);
}

export async function pollWorkbench(
  request: WorkbenchScopeRequest,
  context: GatewayContext,
): Promise<WorkbenchPollResult> {
  const response = await getWorkbenchService().poll({
    activeConversationId: request.activeConversationId,
    activeMessageSeq: request.activeMessageSeq,
    currentSeatId: request.currentAccountId,
    freshBaseline: request.freshBaseline,
    messageUpdateCursor: request.messageUpdateCursor,
    sinceVersion: request.sinceVersion,
  });

  return {
    accountChanges: response.seatChanges.map((change) => ({
      ...change,
      accountId: change.seatId,
    })),
    activeConversationMessages: adaptMessages(response.activeConversationMessages, context),
    conversationChanges: response.conversationChanges.map((change) =>
      change.type === "remove"
        ? {
            accountId: change.seatId,
            conversationId: change.conversationId,
            type: "remove" as const,
          }
        : {
            accountId: change.seatId,
            conversation: adaptConversation(change),
            type: "upsert" as const,
        },
    ),
    messageUpdateEvents: response.messageUpdateEvents ?? [],
    messageStatusChanges: response.messageStatusChanges.map((change) => ({
      clientMessageId: change.clientMessageId,
      conversationId: change.conversationId,
      reason: change.reason,
      remoteMessageId: change.messageId,
      status: adaptMessageStatus(change.status),
    })),
    nextMessageUpdateCursor: response.nextMessageUpdateCursor,
    nextVersion: response.nextVersion,
    request,
  };
}

function adaptMessages(
  messageDtos: Parameters<typeof adaptMessage>[0][],
  context: GatewayContext,
) {
  const accountMap = buildAccountMap(context.accounts);

  return messageDtos.map((message) =>
    adaptMessage(
      message,
      context.customerProfilesById,
      accountMap,
      context.me,
    ),
  );
}

function buildAccountMap(accounts: Account[]) {
  return Object.fromEntries(accounts.map((account) => [account.id, account])) as Record<
    string,
    Account
  >;
}

function adaptHistoryMessagePage(
  page: WorkbenchHistoryMessagePageDto,
  context: GatewayContext,
): WorkbenchHistoryPage {
  return {
    hasNext: page.hasNext,
    hasPrev: page.hasPrev,
    messages: adaptMessages(page.messages, context),
    nextCursor: page.nextCursor,
    prevCursor: page.prevCursor,
  };
}

function adaptMessageStatus(status: WorkbenchMessageStatus): MessageStatus {
  switch (status) {
    case "failed":
      return "failed";
    case "queued":
    case "sending":
      return "sending";
    case "sent":
    default:
      return "sent";
  }
}

function getFirstConversation(
  conversations: Conversation[],
  mode: ChatMode,
) {
  return conversations.find((conversation) => conversation.mode === mode) ?? conversations[0];
}

export function getVisibleConversations(
  conversations: Conversation[],
  now = Date.now(),
) {
  return conversations.filter((conversation) =>
    isConversationVisible(conversation, now),
  );
}

export function isConversationVisible(conversation: Conversation, now = Date.now()) {
  if (conversation.isVerified !== false) {
    return true;
  }

  const createdAt = conversation.createdAtMs;

  if (!createdAt || createdAt <= 0) {
    return true;
  }

  return now - createdAt >= UNVERIFIED_CONVERSATION_HIDE_DELAY_MS;
}
