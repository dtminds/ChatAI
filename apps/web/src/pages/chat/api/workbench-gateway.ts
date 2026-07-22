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
  WorkbenchConversationFullAutoResponse,
  WorkbenchConversationClearHandoffResponse,
  WorkbenchFullAutoAnswerStatusResponse,
  WorkbenchConversationDeleteResponse,
  WorkbenchConversationPinResponse,
  WorkbenchConversationReadResponse,
  WorkbenchConversationUnpinResponse,
  WorkbenchConversationUnreadResponse,
  WorkbenchUnreadSummaryDto,
  WorkbenchMessageFileDownloadStatusResponse,
  WorkbenchRevokeMessageResponse,
  WorkbenchRetryMessageRequest,
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchSeatDto,
  WorkbenchSeatAgentModeSwitchRequest,
  WorkbenchSeatAgentModeSwitchResponse,
  WorkbenchUploadCredentialResponse,
  WorkbenchMessageQueryBySeqsRequest,
  WorkbenchMessageUpdateEventDto,
  WorkbenchSmartReplyPollRequest,
  WorkbenchSmartReplySendAnswerRequest,
  WorkbenchKnowledgeFaqAddRequest,
  WorkbenchVoicePlaybackConfirmRequest,
  WorkbenchVoicePlaybackConfirmResponse,
  WorkbenchVoiceTranscriptionRequest,
  WorkbenchVoiceTranscriptionResponse,
} from "@chatai/contracts";
import {
  adaptSmartReplySuggestions,
  collectQuestionImgs,
  collectSmartReplyPollMsgIds,
  createTriggeredSmartReplySuggestion,
  isSmartReplyPollComplete,
  adaptSmartReplyAttachments,
} from "@/pages/chat/api/smart-reply-adapter";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import type { SmartReplySuggestion } from "@/pages/chat/components/smart-reply-card";
import type { SmartReplyRecommendedAttachment } from "@/pages/chat/components/smart-reply-edit-dialog";
import type {
  Account,
  ChatMessage,
  ChatMode,
  Conversation,
  CustomerProfile,
  EmployeeProfile,
  GroupMember,
  Message,
} from "@/pages/chat/chat-types";
import { sortConversations } from "@/pages/chat/lib/conversation-order";
import { sortMessagesBySentAt } from "@/pages/chat/lib/message-order";

type GatewayContext = {
  accounts: Account[];
  customerProfilesById: Record<string, CustomerProfile>;
  me?: EmployeeProfile;
};

export type WorkbenchScopeRequest = {
  activeConversationId?: string;
  activeMessageSeq?: number;
  currentAccountId: string;
  freshBaseline?: boolean;
  messageUpdateCursor?: number;
  seatUpdateCursor?: number;
  sinceVersion: number;
};

export type WorkbenchConversationPage = {
  conversationId: string;
  hasMoreHistory: boolean;
  messages: Message[];
  nextBeforeSeq?: number;
  skippedHiddenCount: number;
  smartReplies: Record<string, SmartReplySuggestion>;
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
  hasMore?: boolean;
  pollBaseline: number;
  unreadSummary?: WorkbenchUnreadSummaryDto;
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

export type WorkbenchPollResult = {
  accountChanges: Array<Account & { accountId: string; seatId: string }>;
  activeConversationMessages: Message[];
  conversationChanges: WorkbenchConversationChange[];
  messageUpdateEvents: WorkbenchMessageUpdateEventDto[];
  nextMessageUpdateCursor?: number;
  nextSeatUpdateCursor?: number;
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
export const UNREAD_CONVERSATION_MODE_LIMITS = {
  group: 100,
  single: 500,
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
    hasMore: conversationDtos.hasMore,
    pollBaseline: conversationDtos.snapshotAt,
  };
}

export async function loadUnreadAccountConversationsByMode(
  accountId: string,
  mode: ChatMode,
): Promise<WorkbenchConversationLoadResult> {
  const conversationDtos = await getWorkbenchService().getConversations(accountId, {
    limit: UNREAD_CONVERSATION_MODE_LIMITS[mode],
    mode,
    unreadOnly: true,
  });

  return {
    conversations: conversationDtos.items.map(adaptConversation),
    hasMore: conversationDtos.hasMore,
    pollBaseline: conversationDtos.snapshotAt,
    unreadSummary: conversationDtos.unreadSummary,
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
  const messages = sortMessagesBySentAt(adaptMessages(page.messages, context));

  return {
    conversationId,
    hasMoreHistory: page.hasMore,
    messages,
    nextBeforeSeq: page.nextBeforeSeq,
    skippedHiddenCount: page.filteredCount,
    smartReplies: adaptSmartReplySuggestions(page.smartReplies ?? []),
  };
}

export async function loadMessagesBySeqs(
  context: GatewayContext,
  conversationId: string,
  messageSeqs: number[],
): Promise<Message[]> {
  if (!messageSeqs.length) {
    return [];
  }

  const response = await getWorkbenchService().getMessagesBySeqs({
    conversationId,
    messageSeqs,
  } satisfies WorkbenchMessageQueryBySeqsRequest);

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

export async function retryMessage(
  payload: WorkbenchRetryMessageRequest,
): Promise<WorkbenchSendMessageResponse> {
  return getWorkbenchService().retryMessage(payload);
}

export async function revokeMessage(input: {
  conversationId: string;
  messageSeq: number;
}): Promise<WorkbenchRevokeMessageResponse> {
  return getWorkbenchService().revokeMessage(input);
}

export async function downloadMessageFile(input: {
  conversationId: string;
  msgInfoId: number;
}) {
  return getWorkbenchService().downloadMessageFile(input);
}

export async function getMessageFileDownloadStatus(input: {
  conversationId: string;
  messageSeq: number;
}): Promise<WorkbenchMessageFileDownloadStatusResponse | undefined> {
  return getWorkbenchService().getMessageFileDownloadStatus(input);
}

export async function confirmVoicePlaybackReady(
  input: WorkbenchVoicePlaybackConfirmRequest,
): Promise<WorkbenchVoicePlaybackConfirmResponse> {
  return getWorkbenchService().confirmVoicePlaybackReady(input);
}

export async function transcribeVoiceMessage(
  input: WorkbenchVoiceTranscriptionRequest,
): Promise<WorkbenchVoiceTranscriptionResponse> {
  return getWorkbenchService().transcribeVoiceMessage(input);
}

export async function takeOverAccount(accountId: string) {
  return getWorkbenchService().takeOverSeat(accountId);
}

export async function changeConversationFullAuto(
  conversationId: string,
  enabled: boolean,
): Promise<WorkbenchConversationFullAutoResponse> {
  return getWorkbenchService().changeConversationFullAuto(conversationId, {
    enabled,
  });
}

export async function clearConversationHandoff(
  conversationId: string,
): Promise<WorkbenchConversationClearHandoffResponse> {
  return getWorkbenchService().clearConversationHandoff(conversationId);
}

export async function updateSeatAgentMode(
  seatId: string,
  request: WorkbenchSeatAgentModeSwitchRequest,
): Promise<WorkbenchSeatAgentModeSwitchResponse> {
  return getWorkbenchService().updateSeatAgentMode(seatId, request);
}

export async function getFullAutoAnswerStatus(
  conversationId: string,
): Promise<WorkbenchFullAutoAnswerStatusResponse> {
  return getWorkbenchService().getFullAutoAnswerStatus(conversationId);
}

export async function pollWorkbench(
  request: WorkbenchScopeRequest,
  context: GatewayContext,
): Promise<WorkbenchPollResult> {
  const response = await getWorkbenchService().poll({
    ...(request.activeConversationId
      ? {
          activeConversationId: request.activeConversationId,
          activeMessageSeq: request.activeMessageSeq,
        }
      : {}),
    currentSeatId: request.currentAccountId,
    freshBaseline: request.freshBaseline,
    messageUpdateCursor: request.messageUpdateCursor,
    seatUpdateCursor: request.seatUpdateCursor,
    sinceVersion: request.sinceVersion,
  });

  return {
    accountChanges: response.seatChanges.map((change: WorkbenchSeatDto) => ({
      ...adaptAccount(change),
      accountId: change.seatId,
      seatId: change.seatId,
    })),
    activeConversationMessages: sortMessagesBySentAt(
      adaptMessages(response.activeConversationMessages, context),
    ),
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
    nextMessageUpdateCursor: response.nextMessageUpdateCursor,
    nextSeatUpdateCursor: response.nextSeatUpdateCursor,
    nextVersion: response.nextVersion,
    request,
  };
}

export async function pollSmartReplies(
  request: WorkbenchSmartReplyPollRequest,
  messages: Message[],
  suggestions: Record<string, SmartReplySuggestion> = {},
): Promise<Record<string, SmartReplySuggestion>> {
  const msgIds =
    request.msgIds.length > 0
      ? request.msgIds.filter((seq) => !isSmartReplyPollComplete(suggestions[String(seq)]))
      : collectSmartReplyPollMsgIds(messages, suggestions);

  if (msgIds.length === 0) {
    return {};
  }

  const response = await getWorkbenchService().pollSmartReplies({
    conversationId: request.conversationId,
    msgIds,
  });

  return adaptSmartReplySuggestions(response.suggestions);
}

export async function requestSmartReplyGeneralAnswer(
  message: ChatMessage,
  conversationId: string,
): Promise<SmartReplySuggestion> {
  const msgId = message.seq;

  if (!Number.isSafeInteger(msgId) || msgId == null || msgId <= 0) {
    throw new Error("消息序号无效，无法生成智能回复");
  }

  const response = await getWorkbenchService().requestSmartReplyGeneralAnswer({
    conversationId,
    msgId,
    questionImgs: collectQuestionImgs(message),
  });

  if (!response.suggestion) {
    return createTriggeredSmartReplySuggestion(message);
  }

  const [suggestion] = Object.values(
    adaptSmartReplySuggestions([response.suggestion]),
  );

  return suggestion ?? createTriggeredSmartReplySuggestion(message);
}

export async function requestSmartReplyAutoGeneralAnswer(
  message: ChatMessage,
  conversationId: string,
) {
  const msgId = message.seq;

  if (!Number.isSafeInteger(msgId) || msgId == null || msgId <= 0) {
    throw new Error("消息序号无效，无法生成智能回复");
  }

  return getWorkbenchService().requestSmartReplyAutoGeneralAnswer({
    conversationId,
    msgId,
  });
}

export async function requestSmartReplyMakeShorter(
  conversationId: string,
  content: string,
) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    throw new Error("智能回复内容不能为空");
  }

  return getWorkbenchService().requestSmartReplyMakeShorter({
    conversationId,
    content: trimmedContent,
  });
}

export async function sendSmartReplyAnswer(
  request: WorkbenchSmartReplySendAnswerRequest,
) {
  return getWorkbenchService().sendSmartReplyAnswer(request);
}

export async function checkSmartReplyTextModeration(
  conversationId: string,
  content: string,
) {
  return getWorkbenchService().checkSmartReplyTextModeration({
    conversationId,
    content,
  });
}

export async function listKnowledgePage(conversationId: string) {
  return getWorkbenchService().listKnowledgePage({ conversationId });
}

export async function getSmartReplyKnowledgeConfig(conversationId: string) {
  return getWorkbenchService().getKnowledgeConfig({ conversationId });
}

export async function listKnowledgeDocPage(
  conversationId: string,
  knowledgeId: string,
) {
  return getWorkbenchService().listKnowledgeDocPage({
    conversationId,
    knowledgeId,
  });
}

export async function addSmartReplyKnowledgeFaq(
  request: WorkbenchKnowledgeFaqAddRequest,
) {
  return getWorkbenchService().addSmartReplyKnowledgeFaq(request);
}

export async function sendSmartHeartbeat(_conversationId: string) {
  // 暂时停用心跳，待后续观察并决策启用或删除该逻辑
  return { ok: true as const };
}

export async function listSmartReplyAttachments(
  conversationId: string,
  ids: string[],
): Promise<SmartReplyRecommendedAttachment[]> {
  if (ids.length === 0) {
    return [];
  }

  const response = await getWorkbenchService().listSmartReplyAttachments({
    conversationId,
    ids,
  });

  return adaptSmartReplyAttachments(response.attachments);
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
    messages: sortMessagesBySentAt(adaptMessages(page.messages, context)),
    nextCursor: page.nextCursor,
    prevCursor: page.prevCursor,
  };
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
