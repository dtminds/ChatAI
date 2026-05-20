import { create } from "zustand";
import { resolveImageSegmentsForSend } from "@/pages/chat/api/media-upload-service";
import { formatConversationPreview, formatWorkbenchTimestamp } from "@/pages/chat/api/workbench-adapter";
import {
  bootstrapWorkbench,
  CONVERSATION_MODE_CACHE_TTL_MS,
  deleteConversation as deleteConversationRequest,
  getVisibleConversations,
  loadAccountConversationsByMode,
  loadAccountConversationsWithBaseline,
  loadConversationHistoryMessagesPage,
  loadGroupMembers,
  loadAccountScope,
  loadConversationMessagesPage,
  loadMessagesByIds,
  loadSeats,
  markConversationRead,
  markConversationUnread,
  pinConversation,
  pollWorkbench,
  sendTextMessage,
  takeOverAccount as takeOverAccountRequest,
  unpinConversation,
} from "@/pages/chat/api/workbench-gateway";
import {
  getComposerSegmentsPreview,
  normalizeComposerSegments,
  type ComposerSegment,
  type ComposerTextSegment,
} from "@/pages/chat/lib/composer-segments";
import { sortConversations } from "@/pages/chat/lib/conversation-order";
import { seedCustomerProfiles } from "@/pages/chat/mock-data";
import type { SettingsSidebarItem } from "@chatai/contracts";
import type { WorkbenchSendMessagePayload } from "@chatai/contracts";
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

type AsyncStatus = "idle" | "loading" | "ready" | "error";
type HistoryStatus = "idle" | "loading";
type SendStatus = "idle" | "sending";
type TakeoverStatus = "idle" | "taking-over";
type SendMentionPayload = WorkbenchSendMessagePayload["mention"];
type SendQuotePayload = WorkbenchSendMessagePayload["quote"];

type SendMessageResult =
  | {
      didConsumeQuote?: boolean;
      ok: true;
    }
  | {
      errorCode: string;
      errorMessage?: string;
      reason: "file-upload" | "image-upload" | "send" | "unavailable";
      ok: false;
    };

type MessagePaginationState = {
  hasMore: boolean;
  nextBeforeSeq?: number;
  skippedHiddenCount: number;
};

type PollState = {
  status: "idle" | "polling" | "error";
  intervalMs: number;
  jitterMs: number;
  errorMessage?: string;
  lastSuccessAt?: number;
};

type HistoryPanelMode = "all" | "file" | "media" | "h5" | "mini-program";

type HistoryPanelFilters = {
  day?: string;
  senderId?: string;
  scope: HistoryPanelMode;
};

type HistoryPanelState = {
  hasNext: boolean;
  hasPrev: boolean;
  messages: Message[];
  nextCursor?: string;
  prevCursor?: string;
};

type HistoryPanelScrollMode = "end";

const emptyHistoryPanelState: HistoryPanelState = {
  hasNext: false,
  hasPrev: false,
  messages: [],
};

function getHistoryPanelScrollMode(filters: HistoryPanelFilters) {
  return filters.scope === "all" && !filters.day ? "end" : undefined;
}

type WorkbenchState = {
  me?: EmployeeProfile;
  accounts: Account[];
  conversationListCacheSeatOrder: string[];
  conversationListsByScope: Record<string, Conversation[]>;
  conversationModeLoadedAtByScope: Record<string, Partial<Record<ChatMode, number>>>;
  customerProfilesById: Record<string, CustomerProfile>;
  groupMembersLoadedAtByConversationId: Record<string, number>;
  groupMembersLoadingByConversationId: Record<string, boolean>;
  messagesByConversationId: Record<string, Message[]>;
  activeAccountId: string;
  activeConversationId: string;
  activeMode: ChatMode;
  bootstrapStatus: AsyncStatus;
  bootstrapError?: string;
  isConversationLoading: boolean;
  readReceiptError?: string;
  scopeTransitionError?: string;
  historyStatusByConversationId: Record<string, HistoryStatus>;
  historyPanelByConversationId: Record<string, HistoryPanelState | undefined>;
  historyPanelFiltersByConversationId: Record<string, HistoryPanelFilters | undefined>;
  historyPanelLoadingByConversationId: Record<string, boolean>;
  historyPanelErrorByConversationId: Record<string, string | undefined>;
  historyPanelScrollModeByConversationId: Record<string, HistoryPanelScrollMode | undefined>;
  historyPanelOpenConversationId?: string;
  groupMembersByConversationId: Record<string, GroupMember[]>;
  hasMoreHistoryByConversationId: Record<string, boolean>;
  messagePaginationByConversationId: Record<string, MessagePaginationState>;
  sendStatusByConversationId: Record<string, SendStatus>;
  takeoverStatusByAccountId: Record<string, TakeoverStatus>;
  pollState: PollState;
  sinceVersion: number;
  messageUpdateCursor?: number;
  isPollBaselineFresh: boolean;
  activeMessageSeq: number;
  pendingMessages: Message[];
  sidebarItems: SettingsSidebarItem[];
  deleteConversation: (conversationId: string) => Promise<void>;
  dismissScopeTransitionError: () => void;
  dismissReadReceiptError: () => void;
  initializeWorkbench: () => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
  pinConversation: (conversationId: string) => Promise<void>;
  setActiveAccount: (accountId: string) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  setActiveMode: (mode: ChatMode) => Promise<void>;
  loadActiveGroupMembers: (options?: { force?: boolean }) => Promise<void>;
  markConversationUnread: (conversationId: string) => Promise<void>;
  sendAgentMessageSegments: (
    segments: ComposerSegment[],
    options?: {
      mention?: SendMentionPayload;
      onImageUploaded?: (payload: {
        nextSegment: ComposerSegment;
        previousSegment: ComposerSegment;
      }) => void;
      quote?: SendQuotePayload;
    },
  ) => Promise<SendMessageResult>;
  sendAgentTextMessage: (text: string) => Promise<SendMessageResult>;
  setSidebarItems: (items: SettingsSidebarItem[]) => void;
  takeOverAccount: (accountId: string) => Promise<void>;
  unpinConversation: (conversationId: string) => Promise<void>;
  retryFailedMessage: (messageId: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  openHistoryPanel: (conversationId?: string) => Promise<void>;
  closeHistoryPanel: () => void;
  setHistoryPanelScope: (scope: HistoryPanelMode) => Promise<void>;
  setHistoryPanelDay: (day?: string) => Promise<void>;
  setHistoryPanelSenderId: (senderId?: string) => Promise<void>;
  loadHistoryMessages: (options?: { cursor?: string; direction?: "next" | "prev" }) => Promise<void>;
  refreshSeatSummaries: () => Promise<void>;
  pollWorkbench: () => Promise<void>;
  updateMessageDownloadContent: (
    conversationId: string,
    messageId: string,
    contentPatch: {
      downloadStatus?: "ing" | "finished" | "failed";
      fileUrlExpireTime?: number;
      fileUrl?: string;
    },
  ) => void;
};

type WorkbenchStore = WorkbenchState;

const defaultCustomerProfiles = seedCustomerProfiles;
const MESSAGE_PAGE_SIZE = 50;
const CONVERSATION_MODES = ["single", "group"] as const satisfies readonly ChatMode[];
const GROUP_MEMBERS_CACHE_TTL_MS = 5 * 60 * 1000;
export const MAX_CONVERSATION_LIST_CACHE_SEATS = 3;

function createInitialState(): Omit<
  WorkbenchState,
  | "deleteConversation"
  | "initializeWorkbench"
  | "markConversationRead"
  | "pinConversation"
  | "setActiveAccount"
  | "setActiveConversation"
  | "setActiveMode"
  | "loadActiveGroupMembers"
  | "markConversationUnread"
  | "sendAgentMessageSegments"
  | "sendAgentTextMessage"
  | "setSidebarItems"
  | "takeOverAccount"
  | "unpinConversation"
  | "retryFailedMessage"
  | "loadOlderMessages"
  | "openHistoryPanel"
  | "closeHistoryPanel"
  | "setHistoryPanelScope"
  | "setHistoryPanelDay"
  | "setHistoryPanelSenderId"
  | "loadHistoryMessages"
  | "refreshSeatSummaries"
  | "pollWorkbench"
  | "updateMessageDownloadContent"
  | "dismissScopeTransitionError"
  | "dismissReadReceiptError"
> {
  return {
    accounts: [],
    activeAccountId: "",
    activeConversationId: "",
    activeMessageSeq: 0,
    activeMode: "single",
    bootstrapError: undefined,
    bootstrapStatus: "idle",
    conversationListCacheSeatOrder: [],
    conversationListsByScope: {},
    conversationModeLoadedAtByScope: {},
    customerProfilesById: defaultCustomerProfiles,
    groupMembersLoadedAtByConversationId: {},
    groupMembersLoadingByConversationId: {},
    groupMembersByConversationId: {},
    hasMoreHistoryByConversationId: {},
    historyStatusByConversationId: {},
    historyPanelByConversationId: {},
    historyPanelFiltersByConversationId: {},
    historyPanelLoadingByConversationId: {},
    historyPanelErrorByConversationId: {},
    historyPanelScrollModeByConversationId: {},
    historyPanelOpenConversationId: undefined,
    isConversationLoading: false,
    me: undefined,
    messagePaginationByConversationId: {},
    messagesByConversationId: {},
    pendingMessages: [],
    pollState: {
      intervalMs: 2500,
      jitterMs: 350,
      status: "idle",
    },
    readReceiptError: undefined,
    scopeTransitionError: undefined,
    sendStatusByConversationId: {},
    sinceVersion: 0,
    messageUpdateCursor: undefined,
    isPollBaselineFresh: false,
    sidebarItems: [],
    takeoverStatusByAccountId: {},
  };
}

function getFirstConversationId(
  conversationListsByScope: Record<string, Conversation[]>,
  accountId: string,
  mode: ChatMode,
) {
  const conversations = conversationListsByScope[accountId] ?? [];
  return getFirstVisibleConversationId(conversations, mode);
}

function getFirstVisibleConversationId(
  conversations: Conversation[],
  mode: ChatMode,
) {
  const visibleConversations = getVisibleConversations(conversations);
  const firstMatch =
    visibleConversations.find((conversation) => conversation.mode === mode) ??
    visibleConversations[0];

  return firstMatch?.id ?? "";
}

function getActiveMessageSeq(
  messagesByConversationId: Record<string, Message[]>,
  conversationId: string,
) {
  const messages = messagesByConversationId[conversationId] ?? [];
  return messages.reduce((max, message, index) => Math.max(max, message.seq ?? index + 1), 0);
}

function buildMessagePaginationState(page: {
  hasMoreHistory: boolean;
  nextBeforeSeq?: number;
  skippedHiddenCount: number;
}): MessagePaginationState {
  return {
    hasMore: page.hasMoreHistory,
    nextBeforeSeq: page.nextBeforeSeq,
    skippedHiddenCount: page.skippedHiddenCount,
  };
}

function replaceConversationsByMode(
  currentList: Conversation[],
  mode: ChatMode,
  nextModeConversations: Conversation[],
) {
  return sortConversations([
    ...currentList.filter((conversation) => conversation.mode !== mode),
    ...nextModeConversations,
  ]);
}

function markConversationModesLoaded(
  loadedAtByScope: WorkbenchState["conversationModeLoadedAtByScope"],
  accountId: string,
  modes: readonly ChatMode[],
  loadedAt: number,
) {
  if (!accountId) {
    return loadedAtByScope;
  }

  const nextLoadedAtByMode = {
    ...(loadedAtByScope[accountId] ?? {}),
  };

  for (const mode of modes) {
    nextLoadedAtByMode[mode] = loadedAt;
  }

  return {
    ...loadedAtByScope,
    [accountId]: nextLoadedAtByMode,
  };
}

function markAllConversationModesLoaded(
  loadedAtByScope: WorkbenchState["conversationModeLoadedAtByScope"],
  accountId: string,
  loadedAt: number,
) {
  return markConversationModesLoaded(
    loadedAtByScope,
    accountId,
    CONVERSATION_MODES,
    loadedAt,
  );
}

function isConversationModeCacheFresh(
  state: WorkbenchState,
  accountId: string,
  mode: ChatMode,
  now = Date.now(),
) {
  const loadedAt = state.conversationModeLoadedAtByScope[accountId]?.[mode];

  return loadedAt != null && now - loadedAt <= CONVERSATION_MODE_CACHE_TTL_MS;
}

function getConversationListCacheSeatOrder(
  currentOrder: string[],
  accountId: string,
) {
  if (!accountId) {
    return currentOrder;
  }

  return [
    accountId,
    ...currentOrder.filter((cachedAccountId) => cachedAccountId !== accountId),
  ];
}

function pruneConversationListCache(input: {
  activeAccountId: string;
  conversationListsByScope: WorkbenchState["conversationListsByScope"];
  conversationModeLoadedAtByScope: WorkbenchState["conversationModeLoadedAtByScope"];
  seatOrder: string[];
}) {
  const retainedSeatIds = new Set<string>();

  for (const seatId of input.seatOrder) {
    if (retainedSeatIds.size >= MAX_CONVERSATION_LIST_CACHE_SEATS) {
      break;
    }

    retainedSeatIds.add(seatId);
  }

  if (input.activeAccountId) {
    retainedSeatIds.add(input.activeAccountId);
  }

  return {
    conversationListCacheSeatOrder: input.seatOrder.filter((seatId) =>
      retainedSeatIds.has(seatId),
    ),
    evictedSeatIds: input.seatOrder.filter((seatId) => !retainedSeatIds.has(seatId)),
    conversationListsByScope: Object.fromEntries(
      Object.entries(input.conversationListsByScope).filter(([seatId]) =>
        retainedSeatIds.has(seatId),
      ),
    ),
    conversationModeLoadedAtByScope: Object.fromEntries(
      Object.entries(input.conversationModeLoadedAtByScope).filter(([seatId]) =>
        retainedSeatIds.has(seatId),
      ),
    ),
  };
}

function mergeConversationList(
  currentList: Conversation[],
  conversation: Conversation,
) {
  return sortConversations([
    conversation,
    ...currentList.filter((item) => item.id !== conversation.id),
  ]);
}

function findNextConversationIdAfterRemove(
  conversations: Conversation[],
  removedConversationId: string,
  mode: ChatMode,
) {
  const removedIndex = conversations.findIndex(
    (conversation) => conversation.id === removedConversationId,
  );

  if (removedIndex < 0) {
    return "";
  }

  const nextConversations = conversations.filter(
    (conversation) => conversation.id !== removedConversationId,
  );
  const sameModeConversations = nextConversations.filter(
    (conversation) => conversation.mode === mode,
  );

  if (sameModeConversations.length === 0) {
    return nextConversations[0]?.id ?? "";
  }

  const nextSameMode = sameModeConversations.find(
    (conversation) => conversations.indexOf(conversation) > removedIndex,
  );

  return nextSameMode?.id ?? sameModeConversations.at(-1)?.id ?? "";
}

function getConversationMode(
  conversations: Conversation[],
  conversationId: string,
  fallbackMode: ChatMode,
) {
  return conversations.find((conversation) => conversation.id === conversationId)?.mode ?? fallbackMode;
}

function upsertMessageList(
  currentMessages: Message[],
  nextMessages: Message[],
) {
  const merged = [...currentMessages];
  const appendedMessages: Message[] = [];

  for (const nextMessage of nextMessages) {
    if (isRevokeSignalMessage(nextMessage)) {
      const targetIndex = findRevokedMessageIndex(merged, nextMessage);

      if (targetIndex >= 0) {
        merged[targetIndex] = {
          ...merged[targetIndex],
          isRevoked: true,
        };
      } else {
        const appendedIndex = findRevokedMessageIndex(appendedMessages, nextMessage);

        if (appendedIndex >= 0) {
          appendedMessages[appendedIndex] = {
            ...appendedMessages[appendedIndex],
            isRevoked: true,
          };
        }
      }

      continue;
    }

    const existingIndex = merged.findIndex((message) =>
      isSameMessage(message, nextMessage),
    );

    if (existingIndex >= 0) {
      const currentMessage = merged[existingIndex];
      if (currentMessage.role === "system" || nextMessage.role === "system") {
        merged[existingIndex] = {
          ...currentMessage,
          ...nextMessage,
        };
        continue;
      }

      const nextSender = nextMessage.sender;
      merged[existingIndex] = {
        ...currentMessage,
        ...nextMessage,
        sender: {
          ...currentMessage.sender,
          ...nextSender,
          avatarUrl: nextSender.avatarUrl || currentMessage.sender.avatarUrl,
          name: nextSender.name || currentMessage.sender.name,
        },
        senderDisplayName:
          nextMessage.senderDisplayName ?? currentMessage.senderDisplayName,
        author: nextMessage.author || currentMessage.author,
        clientMessageId: nextMessage.clientMessageId ?? currentMessage.clientMessageId,
      };
      continue;
    }

    appendedMessages.push(nextMessage);
  }

  return [...merged, ...sortMessagesForAppend(appendedMessages)];
}

function isRevokeSignalMessage(message: Message) {
  return (
    message.role === "system" &&
    message.content.type === "revoke" &&
    (message.content.revokeMsgId != null || message.content.revokeOriginMsgId != null)
  );
}

function findRevokedMessageIndex(messages: Message[], revokeMessage: Message) {
  if (revokeMessage.role !== "system" || revokeMessage.content.type !== "revoke") {
    return -1;
  }

  const revokeKeys = uniqueMessageKeys([
    revokeMessage.content.revokeOriginMsgId,
    revokeMessage.content.revokeMsgId,
  ]);

  if (!revokeKeys.length) {
    return -1;
  }

  return messages.findIndex((message) =>
    revokeKeys.some((key) => matchesMessageKey(message, key)),
  );
}

function uniqueMessageKeys(keys: Array<string | undefined>) {
  return [...new Set(keys.filter((key): key is string => Boolean(key)))];
}

function matchesMessageKey(message: Message, key: string) {
  return (
    message.id === key ||
    message.remoteMessageId === key ||
    String(message.seq ?? "") === key
  );
}

function sortMessagesForAppend(messages: Message[]) {
  return [...messages].sort((left, right) => {
    const leftSeq = left.seq;
    const rightSeq = right.seq;

    if (leftSeq != null && rightSeq != null && leftSeq !== rightSeq) {
      return leftSeq - rightSeq;
    }

    return parseWorkbenchTimestamp(left.sentAt) - parseWorkbenchTimestamp(right.sentAt);
  });
}

function isSameMessage(left: Message, right: Message) {
  return (
    (left.optNo && right.optNo && left.optNo === right.optNo) ||
    (left.remoteMessageId && right.remoteMessageId && left.remoteMessageId === right.remoteMessageId) ||
    (left.clientMessageId &&
      right.clientMessageId &&
      left.clientMessageId === right.clientMessageId) ||
    left.id === right.id
  );
}

function parseWorkbenchTimestamp(value: string) {
  return new Date(value.replace(" ", "T")).getTime();
}

function isCursorInvalidationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string; status?: number };

  return (
    candidate.code === "WORKBENCH_CURSOR_INVALIDATED" ||
    candidate.status === 409
  );
}

function applyReadResult(
  state: WorkbenchStore,
  conversationId: string,
  accountId: string,
  seatUnreadCount: number,
) {
  const nextConversations = (state.conversationListsByScope[accountId] ?? []).map(
    (conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            unread: 0,
          }
        : conversation,
  );

  return {
    accounts: state.accounts.map((account) =>
      account.id === accountId
        ? {
            ...account,
            unreadCount: seatUnreadCount,
          }
        : account,
    ),
    conversationListsByScope: {
      ...state.conversationListsByScope,
      [accountId]: nextConversations,
    },
  };
}

function applyUnreadResult(
  state: WorkbenchStore,
  conversationId: string,
  accountId: string,
  seatUnreadCount: number,
) {
  const nextConversations = (state.conversationListsByScope[accountId] ?? []).map(
    (conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            unread: 1,
          }
        : conversation,
  );

  return {
    accounts: state.accounts.map((account) =>
      account.id === accountId
        ? {
            ...account,
            unreadCount: seatUnreadCount,
          }
        : account,
    ),
    conversationListsByScope: {
      ...state.conversationListsByScope,
      [accountId]: nextConversations,
    },
  };
}

function updateConversationPreview(
  conversations: Conversation[],
  conversationId: string,
  preview: string,
  updatedAt: string,
  updatedAtMs: number,
) {
  const currentConversation = conversations.find((conversation) => conversation.id === conversationId);

  if (!currentConversation) {
    return conversations;
  }

  return mergeConversationList(conversations, {
    ...currentConversation,
    preview: formatConversationPreview(preview),
    quietFor: "刚刚更新",
    unread: 0,
    updatedAt,
    updatedAtMs,
  });
}

function buildSegmentClientMessageId(clientMessageId: string, index: number) {
  return index === 0 ? clientMessageId : `${clientMessageId}_${index + 1}`;
}

function buildOptimisticMessageContent(
  segment: ComposerSegment,
  quote?: SendQuotePayload,
): ChatMessage["content"] {
  if (quote && segment.type === "text") {
    return {
      quoteMsgId: quote.quoteMsgId,
      quotedMessageId: quote.quotedMessageId,
      quotedMessage: quote.quotedMessage,
      text: segment.text,
      type: "quote",
    };
  }

  if (segment.type === "image") {
    return {
      alt: segment.alt,
      height: segment.height,
      imageUrl: segment.url ?? segment.localUrl ?? "",
      type: "image",
      width: segment.width,
    };
  }

  if (segment.type === "file") {
    return {
      extension: segment.extension,
      fileName: segment.fileName,
      fileSizeLabel: segment.fileSizeLabel,
      sourceLabel: "文件",
      type: "file",
    };
  }

  return {
    text: segment.text,
    type: "text",
  };
}

function isAccountTakenOverByCurrentUser(account: Account | undefined, me: EmployeeProfile | undefined) {
  return !!account?.takenOverEmployeeId && account.takenOverEmployeeId === me?.id;
}

function omitByKeys<T>(record: Record<string, T>, keys: Iterable<string>) {
  const keySet = new Set(keys);
  const next: Record<string, T> = {};

  for (const key in record) {
    if (
      Object.prototype.hasOwnProperty.call(record, key) &&
      !keySet.has(key)
    ) {
      next[key] = record[key];
    }
  }

  return next;
}

function clearConversationMessageState(
  state: WorkbenchStore,
  conversationIds: Iterable<string>,
  options: { preservePending?: boolean } = {},
) {
  const retainedConversationIds = options.preservePending
    ? new Set(state.pendingMessages.map((message) => message.conversationId))
    : new Set<string>();
  const clearedConversationIds = [...conversationIds].filter(
    (conversationId) => !retainedConversationIds.has(conversationId),
  );

  return {
    hasMoreHistoryByConversationId: omitByKeys(
      state.hasMoreHistoryByConversationId,
      clearedConversationIds,
    ),
    historyStatusByConversationId: omitByKeys(
      state.historyStatusByConversationId,
      clearedConversationIds,
    ),
    historyPanelByConversationId: omitByKeys(
      state.historyPanelByConversationId,
      clearedConversationIds,
    ),
    historyPanelFiltersByConversationId: omitByKeys(
      state.historyPanelFiltersByConversationId,
      clearedConversationIds,
    ),
    historyPanelLoadingByConversationId: omitByKeys(
      state.historyPanelLoadingByConversationId,
      clearedConversationIds,
    ),
    historyPanelErrorByConversationId: omitByKeys(
      state.historyPanelErrorByConversationId,
      clearedConversationIds,
    ),
    historyPanelScrollModeByConversationId: omitByKeys(
      state.historyPanelScrollModeByConversationId,
      clearedConversationIds,
    ),
    messagePaginationByConversationId: omitByKeys(
      state.messagePaginationByConversationId,
      clearedConversationIds,
    ),
    messagesByConversationId: omitByKeys(
      state.messagesByConversationId,
      clearedConversationIds,
    ),
  };
}

function clearConversationResourceState(
  state: WorkbenchStore,
  conversationIds: Iterable<string>,
  options: { preservePending?: boolean } = {},
) {
  return {
    ...clearConversationMessageState(state, conversationIds, options),
    groupMembersLoadedAtByConversationId: omitByKeys(
      state.groupMembersLoadedAtByConversationId,
      conversationIds,
    ),
    groupMembersByConversationId: omitByKeys(
      state.groupMembersByConversationId,
      conversationIds,
    ),
    groupMembersLoadingByConversationId: omitByKeys(
      state.groupMembersLoadingByConversationId,
      conversationIds,
    ),
  };
}

function getMessageStateConversationIds(state: WorkbenchStore) {
  return new Set([
    ...Object.keys(state.messagesByConversationId),
    ...Object.keys(state.messagePaginationByConversationId),
    ...Object.keys(state.hasMoreHistoryByConversationId),
    ...Object.keys(state.historyStatusByConversationId),
    ...Object.keys(state.historyPanelByConversationId),
    ...Object.keys(state.historyPanelFiltersByConversationId),
    ...Object.keys(state.historyPanelLoadingByConversationId),
    ...Object.keys(state.historyPanelErrorByConversationId),
    ...Object.keys(state.historyPanelScrollModeByConversationId),
  ]);
}

function isGroupMembersCacheFresh(
  loadedAtByConversationId: Record<string, number>,
  conversationId: string,
  now = Date.now(),
) {
  const loadedAt = loadedAtByConversationId[conversationId];

  return loadedAt != null && now - loadedAt <= GROUP_MEMBERS_CACHE_TTL_MS;
}

export function createWorkbenchStore() {
  let latestScopeRequestId = 0;
  let latestTakeoverRequestId = 0;
  let latestGroupMembersRequestId = 0;
  const latestTakeoverRequestIdByAccountId: Record<string, number> = {};
  const latestGroupMembersRequestIdByConversationId: Record<string, number> = {};

  function issueScopeRequestId() {
    latestScopeRequestId += 1;
    return latestScopeRequestId;
  }

  function isCurrentScopeRequest(requestId: number) {
    return requestId === latestScopeRequestId;
  }

  function issueTakeoverRequestId(accountId: string) {
    latestTakeoverRequestId += 1;
    latestTakeoverRequestIdByAccountId[accountId] = latestTakeoverRequestId;
    return latestTakeoverRequestId;
  }

  function isCurrentTakeoverRequest(accountId: string, requestId: number) {
    return latestTakeoverRequestIdByAccountId[accountId] === requestId;
  }

  function clearTakeoverRequest(accountId: string) {
    delete latestTakeoverRequestIdByAccountId[accountId];
  }

  function issueGroupMembersRequestId(conversationId: string) {
    latestGroupMembersRequestId += 1;
    latestGroupMembersRequestIdByConversationId[conversationId] =
      latestGroupMembersRequestId;
    return latestGroupMembersRequestId;
  }

  function isCurrentGroupMembersRequest(conversationId: string, requestId: number) {
    return latestGroupMembersRequestIdByConversationId[conversationId] === requestId;
  }

  function clearGroupMembersRequest(conversationId: string) {
    delete latestGroupMembersRequestIdByConversationId[conversationId];
  }

  function omitTakeoverStatus(
    takeoverStatusByAccountId: Record<string, TakeoverStatus>,
    accountId: string,
  ) {
    const { [accountId]: _ignored, ...nextTakeoverStatusByAccountId } =
      takeoverStatusByAccountId;
    return nextTakeoverStatusByAccountId;
  }

  function getConversationById(state: WorkbenchStore, conversationId: string) {
    return Object.values(state.conversationListsByScope)
      .flat()
      .find((conversation) => conversation.id === conversationId);
  }

  return create<WorkbenchStore>((set, get) => {
    async function loadGroupMembersForConversation(
      conversationId: string,
      requestId: number,
      options: { force?: boolean } = {},
    ) {
      if (!conversationId) {
        return;
      }

      const state = get();
      const conversation = getConversationById(state, conversationId);

      if (
        conversation?.mode !== "group" ||
        (!options.force &&
          state.groupMembersByConversationId[conversationId] &&
          isGroupMembersCacheFresh(
            state.groupMembersLoadedAtByConversationId,
            conversationId,
          ))
      ) {
        return;
      }

      const groupMembersRequestId = issueGroupMembersRequestId(conversationId);

      set((currentState) => ({
        groupMembersLoadingByConversationId: {
          ...currentState.groupMembersLoadingByConversationId,
          [conversationId]: true,
        },
      }));

      try {
        const members = await loadGroupMembers(conversationId);

        if (
          !isCurrentScopeRequest(requestId) ||
          !isCurrentGroupMembersRequest(conversationId, groupMembersRequestId)
        ) {
          return;
        }

        set((currentState) => ({
          groupMembersLoadedAtByConversationId: {
            ...currentState.groupMembersLoadedAtByConversationId,
            [conversationId]: Date.now(),
          },
          groupMembersByConversationId: {
            ...currentState.groupMembersByConversationId,
            [conversationId]: members,
          },
          groupMembersLoadingByConversationId: {
            ...currentState.groupMembersLoadingByConversationId,
            [conversationId]: false,
          },
        }));
      } catch {
        if (
          !isCurrentScopeRequest(requestId) ||
          !isCurrentGroupMembersRequest(conversationId, groupMembersRequestId)
        ) {
          return;
        }

        set((currentState) => ({
          groupMembersByConversationId: options.force
            ? currentState.groupMembersByConversationId
            : {
                ...currentState.groupMembersByConversationId,
                [conversationId]: [],
              },
          groupMembersLoadingByConversationId: {
            ...currentState.groupMembersLoadingByConversationId,
            [conversationId]: false,
          },
        }));
      } finally {
        if (isCurrentGroupMembersRequest(conversationId, groupMembersRequestId)) {
          clearGroupMembersRequest(conversationId);
        }
      }
    }

    async function markActiveConversationRead(
      conversationId: string,
      requestId: number,
    ) {
      try {
        const readResult = await markConversationRead(conversationId);

        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

        set((currentState) => ({
          ...applyReadResult(
            currentState,
            readResult.conversationId,
            readResult.seatId,
            readResult.seatUnreadCount,
          ),
          readReceiptError: undefined,
        }));
      } catch (error) {
        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

        set({
          readReceiptError:
            error instanceof Error && error.message
              ? error.message
              : "标记已读失败",
        });
      }
    }

    async function reloadAccountConversations(accountId: string) {
      const result = await loadAccountConversationsWithBaseline(accountId);
      const loadedAt = Date.now();

      set((currentState) => ({
        conversationModeLoadedAtByScope: markAllConversationModesLoaded(
          currentState.conversationModeLoadedAtByScope,
          accountId,
          loadedAt,
        ),
        conversationListsByScope: {
          ...currentState.conversationListsByScope,
          [accountId]: result.conversations,
        },
        isPollBaselineFresh:
          currentState.activeAccountId === accountId
            ? true
            : currentState.isPollBaselineFresh,
        sinceVersion:
          currentState.activeAccountId === accountId
            ? result.pollBaseline
            : currentState.sinceVersion,
      }));
    }

    async function setConversationPinned(
      conversationId: string,
      isPinned: boolean,
    ) {
      const requestId = latestScopeRequestId;
      const state = get();
      const conversation = getConversationById(state, conversationId);
      const account = state.accounts.find(
        (item) => item.id === conversation?.accountId,
      );

      if (!conversation || !account || !isAccountTakenOverByCurrentUser(account, state.me)) {
        return;
      }

      try {
        if (isPinned) {
          await pinConversation(conversationId);
        } else {
          await unpinConversation(conversationId);
        }

        await reloadAccountConversations(account.id);
        set({ readReceiptError: undefined });
      } catch (error) {
        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

        set({
          readReceiptError:
            error instanceof Error && error.message
              ? error.message
              : isPinned
                ? "置顶失败"
                : "取消置顶失败",
        });
      }
    }

    async function loadConversationAfterDelete(
      conversationId: string,
      requestId: number,
    ) {
      if (!conversationId) {
        set({
          activeMessageSeq: 0,
          isConversationLoading: false,
        });
        return;
      }

      set({
        isConversationLoading: true,
        scopeTransitionError: undefined,
      });

      const state = get();

      try {
        const page = await loadConversationMessagesPage(
          {
            accounts: state.accounts,
            customerProfilesById: state.customerProfilesById,
            me: state.me,
          },
          conversationId,
          {
            limit: MESSAGE_PAGE_SIZE,
          },
        );

        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

        set((currentState) => ({
          activeMessageSeq: getActiveMessageSeq(
            {
              ...currentState.messagesByConversationId,
              [conversationId]: page.messages,
            },
            conversationId,
          ),
          hasMoreHistoryByConversationId: {
            ...currentState.hasMoreHistoryByConversationId,
            [conversationId]: page.hasMoreHistory,
          },
          isConversationLoading: false,
          messagePaginationByConversationId: {
            ...currentState.messagePaginationByConversationId,
            [conversationId]: buildMessagePaginationState(page),
          },
          messagesByConversationId: {
            ...currentState.messagesByConversationId,
            [conversationId]: page.messages,
          },
          scopeTransitionError: undefined,
        }));

        await loadGroupMembersForConversation(conversationId, requestId);

        const latestState = get();
        const activeAccount = latestState.accounts.find(
          (account) => account.id === latestState.activeAccountId,
        );

        if (!isAccountTakenOverByCurrentUser(activeAccount, latestState.me)) {
          return;
        }

        await markActiveConversationRead(conversationId, requestId);
      } catch (error) {
        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

        set({
          isConversationLoading: false,
          scopeTransitionError:
            error instanceof Error ? error.message : "切换会话失败",
        });
      }
    }

    return {
      ...createInitialState(),
      setSidebarItems(items) {
        set({ sidebarItems: items });
      },
      async deleteConversation(conversationId) {
        const state = get();
        const conversation = getConversationById(state, conversationId);
        const account = state.accounts.find(
          (item) => item.id === conversation?.accountId,
        );

        if (!conversation || !account || !isAccountTakenOverByCurrentUser(account, state.me)) {
          return;
        }

        let deleteResult: Awaited<ReturnType<typeof deleteConversationRequest>>;
        try {
          deleteResult = await deleteConversationRequest(conversationId);
        } catch (error) {
          set({
            readReceiptError:
              error instanceof Error && error.message
                ? error.message
                : "不显示会话失败",
          });
          return;
        }

        const currentState = get();
        const conversations = currentState.conversationListsByScope[account.id] ?? [];
        const shouldSwitchActive =
          currentState.activeAccountId === account.id &&
          currentState.activeConversationId === conversationId;
        const nextActiveConversationId = shouldSwitchActive
          ? findNextConversationIdAfterRemove(
              conversations,
              conversationId,
              currentState.activeMode,
            )
          : currentState.activeConversationId;
        const nextConversations = conversations.filter(
          (item) => item.id !== conversationId,
        );
        const nextActiveMode = shouldSwitchActive
          ? getConversationMode(
              nextConversations,
              nextActiveConversationId,
              currentState.activeMode,
            )
          : currentState.activeMode;
        const requestId = shouldSwitchActive ? issueScopeRequestId() : latestScopeRequestId;

        set((latestState) => ({
          ...clearConversationResourceState(latestState, [conversationId]),
          accounts: latestState.accounts.map((item) =>
            item.id === account.id
              ? {
                  ...item,
                  unreadCount: deleteResult.seatUnreadCount,
                }
              : item,
          ),
          activeConversationId: nextActiveConversationId,
          activeMessageSeq: shouldSwitchActive ? 0 : latestState.activeMessageSeq,
          activeMode: nextActiveMode,
          conversationListsByScope: {
            ...latestState.conversationListsByScope,
            [account.id]: (latestState.conversationListsByScope[account.id] ?? []).filter(
              (item) => item.id !== conversationId,
            ),
          },
          readReceiptError: undefined,
        }));

        if (shouldSwitchActive) {
          await loadConversationAfterDelete(nextActiveConversationId, requestId);
        }
      },
      dismissScopeTransitionError() {
        set({ scopeTransitionError: undefined });
      },
      dismissReadReceiptError() {
        set({ readReceiptError: undefined });
      },
      async markConversationUnread(conversationId) {
        const state = get();
        const conversation = getConversationById(state, conversationId);
        const account = state.accounts.find(
          (item) => item.id === conversation?.accountId,
        );

        if (
          !conversation ||
          conversation.unread > 0 ||
          !isAccountTakenOverByCurrentUser(account, state.me)
        ) {
          return;
        }

        try {
          const unreadResult = await markConversationUnread(conversationId);

          set((currentState) => ({
            ...applyUnreadResult(
              currentState,
              unreadResult.conversationId,
              unreadResult.seatId,
              unreadResult.seatUnreadCount,
            ),
            readReceiptError: undefined,
          }));
        } catch (error) {
          set({
            readReceiptError:
              error instanceof Error && error.message
                ? error.message
                : "标记未读失败",
          });
        }
      },
      async markConversationRead(conversationId) {
        const requestId = latestScopeRequestId;
        const state = get();
        const conversation = getConversationById(state, conversationId);
        const account = state.accounts.find(
          (item) => item.id === conversation?.accountId,
        );

        if (
          !conversation ||
          conversation.unread <= 0 ||
          !isAccountTakenOverByCurrentUser(account, state.me)
        ) {
          return;
        }

        await markActiveConversationRead(conversationId, requestId);
      },
      async pinConversation(conversationId) {
        await setConversationPinned(conversationId, true);
      },
      async loadActiveGroupMembers(options) {
        const state = get();
        const requestId = latestScopeRequestId;

        await loadGroupMembersForConversation(
          state.activeConversationId,
          requestId,
          options,
        );
      },
      async takeOverAccount(accountId) {
      const state = get();
      const { me } = state;

      if (!accountId || !me) {
        return;
      }

      const account = state.accounts.find((item) => item.id === accountId);

      if (
        !account ||
        account.loginStatus === "offline" ||
        account.takenOverEmployeeId === me.id
      ) {
        return;
      }

      const requestId = issueTakeoverRequestId(accountId);

      set((currentState) => ({
        takeoverStatusByAccountId: {
          ...currentState.takeoverStatusByAccountId,
          [accountId]: "taking-over",
        },
      }));

      try {
        const nextAccount = await takeOverAccountRequest(accountId);

        if (!isCurrentTakeoverRequest(accountId, requestId)) {
          return;
        }

        set((currentState) => ({
          accounts: currentState.accounts.map((item) =>
            item.id === accountId ? nextAccount : item,
          ),
          takeoverStatusByAccountId: omitTakeoverStatus(
            currentState.takeoverStatusByAccountId,
            accountId,
          ),
        }));
        clearTakeoverRequest(accountId);
      } catch {
        if (!isCurrentTakeoverRequest(accountId, requestId)) {
          return;
        }

        set((currentState) => ({
          takeoverStatusByAccountId: omitTakeoverStatus(
            currentState.takeoverStatusByAccountId,
            accountId,
          ),
        }));
        clearTakeoverRequest(accountId);
      }
    },
    async unpinConversation(conversationId) {
      await setConversationPinned(conversationId, false);
    },
    async initializeWorkbench() {
      const state = get();

      if (state.bootstrapStatus === "loading") {
        return;
      }

      set({
        bootstrapError: undefined,
        bootstrapStatus: "loading",
      });
      const requestId = issueScopeRequestId();

      try {
        const bootstrapResult = await bootstrapWorkbench(
          state.activeMode,
          defaultCustomerProfiles,
          MESSAGE_PAGE_SIZE,
        );
        const conversationPage = bootstrapResult.conversationPage;

        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

        const loadedAt = Date.now();

        const conversationListCacheSeatOrder = getConversationListCacheSeatOrder(
          get().conversationListCacheSeatOrder,
          bootstrapResult.activeAccountId,
        );
        const prunedConversationListCache = pruneConversationListCache({
          activeAccountId: bootstrapResult.activeAccountId,
          conversationListsByScope: {
            ...get().conversationListsByScope,
            ...bootstrapResult.conversationListsByScope,
          },
          conversationModeLoadedAtByScope: markAllConversationModesLoaded(
            get().conversationModeLoadedAtByScope,
            bootstrapResult.activeAccountId,
            loadedAt,
          ),
          seatOrder: conversationListCacheSeatOrder,
        });

          set({
            accounts: bootstrapResult.accounts,
            activeAccountId: bootstrapResult.activeAccountId,
            activeConversationId: bootstrapResult.activeConversationId,
          activeMessageSeq: getActiveMessageSeq(
            conversationPage
              ? {
                  [conversationPage.conversationId]: conversationPage.messages,
                }
              : {},
            bootstrapResult.activeConversationId,
          ),
          activeMode: bootstrapResult.activeMode,
          bootstrapStatus: "ready",
          conversationListCacheSeatOrder:
            prunedConversationListCache.conversationListCacheSeatOrder,
          conversationListsByScope:
            prunedConversationListCache.conversationListsByScope,
          conversationModeLoadedAtByScope:
            prunedConversationListCache.conversationModeLoadedAtByScope,
          groupMembersLoadedAtByConversationId: {},
          groupMembersByConversationId: {},
          groupMembersLoadingByConversationId: {},
          hasMoreHistoryByConversationId: conversationPage
            ? {
                [conversationPage.conversationId]: conversationPage.hasMoreHistory,
              }
            : {},
          messagePaginationByConversationId: conversationPage
            ? {
                [conversationPage.conversationId]: buildMessagePaginationState(conversationPage),
              }
            : {},
          me: bootstrapResult.me,
          messagesByConversationId: conversationPage
            ? {
                [conversationPage.conversationId]: upsertMessageList(
                  [],
                  conversationPage.messages,
                ),
              }
            : {},
          sidebarItems: bootstrapResult.sidebarItems,
          isPollBaselineFresh: true,
          messageUpdateCursor: undefined,
          sinceVersion: bootstrapResult.pollBaseline,
        });

        const bootstrapActiveConversation = bootstrapResult.conversationListsByScope[
          bootstrapResult.activeAccountId
        ]?.find(
          (conversation) => conversation.id === bootstrapResult.activeConversationId,
        );

        if (bootstrapActiveConversation?.mode === "group") {
          set((currentState) => ({
            groupMembersLoadingByConversationId: {
              ...currentState.groupMembersLoadingByConversationId,
              [bootstrapResult.activeConversationId]: true,
            },
          }));
        }

        await loadGroupMembersForConversation(
          bootstrapResult.activeConversationId,
          requestId,
        );

        if (
          bootstrapResult.activeConversationId &&
          isAccountTakenOverByCurrentUser(
            bootstrapResult.accounts.find(
              (account) => account.id === bootstrapResult.activeAccountId,
            ),
            bootstrapResult.me,
          )
        ) {
          await markActiveConversationRead(
            bootstrapResult.activeConversationId,
            requestId,
          );
        }
      } catch (error) {
        set({
          bootstrapError: error instanceof Error ? error.message : "工作台初始化失败",
          bootstrapStatus: "error",
        });
      }
    },
    async pollWorkbench() {
      const state = get();

      if (
        state.bootstrapStatus !== "ready" ||
        !state.activeAccountId ||
        state.pollState.status === "polling"
      ) {
        return;
      }

      set((currentState) => ({
        pollState: {
          ...currentState.pollState,
          errorMessage: undefined,
          status: "polling",
        },
      }));

      try {
        const request = {
          activeConversationId: state.activeConversationId,
          activeMessageSeq: state.activeMessageSeq,
          currentAccountId: state.activeAccountId,
          freshBaseline: state.isPollBaselineFresh,
          messageUpdateCursor: state.messageUpdateCursor,
          sinceVersion: state.sinceVersion,
        };
        const response = await pollWorkbench(request, {
          accounts: state.accounts,
          customerProfilesById: state.customerProfilesById,
          me: state.me,
        });
        const messageUpdateIdsByConversationId = (response.messageUpdateEvents ?? []).reduce(
          (accumulator, event) => {
            const currentIds = accumulator[event.conversationId] ?? [];
            accumulator[event.conversationId] = [...currentIds, event.messageId];
            return accumulator;
          },
          {} as Record<string, string[]>,
        );

        const refreshedMessagesByConversationId = Object.fromEntries(
          await Promise.all(
            Object.entries(messageUpdateIdsByConversationId).map(
              async ([conversationId, messageIds]): Promise<[string, Message[]]> => [
                conversationId,
                await loadMessagesByIds(
                  {
                    accounts: state.accounts,
                    customerProfilesById: state.customerProfilesById,
                    me: state.me,
                  },
                  conversationId,
                  messageIds,
                ),
              ],
            ),
          ),
        ) as Record<string, Message[]>;

        set((currentState) => {
          const isStaleScope =
            currentState.activeAccountId !== response.request.currentAccountId ||
            currentState.activeConversationId !== response.request.activeConversationId ||
            currentState.sinceVersion !== response.request.sinceVersion;

          if (isStaleScope) {
            return {
              pollState: {
                ...currentState.pollState,
                status: "idle",
              },
            };
          }

          const nextAccounts = currentState.accounts.map((account) => {
            const change = response.accountChanges.find(
              (item) => item.accountId === account.id,
            );

            if (!change) {
              return account;
            }

            return {
              ...account,
              lastMessageTime: change.lastMessageTime,
              unreadCount: change.unreadCount,
            };
          });
          const nextConversationLists = { ...currentState.conversationListsByScope };
          const removedConversationIds: string[] = [];

          for (const change of response.conversationChanges) {
            const currentList = nextConversationLists[change.accountId] ?? [];

            if (change.type === "remove") {
              nextConversationLists[change.accountId] = currentList.filter(
                (conversation) => conversation.id !== change.conversationId,
              );
              removedConversationIds.push(change.conversationId);
              continue;
            }

            nextConversationLists[change.accountId] = mergeConversationList(
              currentList,
              change.conversation,
            );
          }

          const clearedResourceState = removedConversationIds.length
            ? clearConversationResourceState(
                currentState,
                removedConversationIds,
                { preservePending: true },
              )
            : currentState;
          const nextMessagesByConversationId = {
            ...clearedResourceState.messagesByConversationId,
          };

          if (
            response.activeConversationMessages.length > 0 &&
            response.request.activeConversationId
          ) {
            const currentMessages =
              nextMessagesByConversationId[response.request.activeConversationId] ?? [];
            nextMessagesByConversationId[response.request.activeConversationId] =
              upsertMessageList(currentMessages, response.activeConversationMessages);
          }

          for (const [conversationId, refreshedMessages] of Object.entries(
            refreshedMessagesByConversationId,
          )) {
            if (!refreshedMessages.length) {
              continue;
            }

            const conversationMessages = nextMessagesByConversationId[conversationId] ?? [];
            nextMessagesByConversationId[conversationId] = upsertMessageList(
              conversationMessages,
              refreshedMessages,
            );
          }

          for (const change of response.messageStatusChanges) {
            const conversationMessages = nextMessagesByConversationId[change.conversationId] ?? [];

            nextMessagesByConversationId[change.conversationId] = conversationMessages.map(
              (message) => {
                const matches =
                  (change.clientMessageId &&
                    message.clientMessageId === change.clientMessageId) ||
                  message.remoteMessageId === change.remoteMessageId;

                if (!matches) {
                  return message;
                }

                return {
                  ...message,
                  failReason: change.reason,
                  remoteMessageId: change.remoteMessageId ?? message.remoteMessageId,
                  status: change.status,
                };
              },
            );
          }

          const pendingMessages = currentState.pendingMessages.filter(
            (pendingMessage) =>
              !response.messageStatusChanges.some(
                (change) => change.clientMessageId === pendingMessage.clientMessageId,
              ),
          );

          return {
            accounts: nextAccounts,
            activeMessageSeq: getActiveMessageSeq(
              nextMessagesByConversationId,
              response.request.activeConversationId,
            ),
            conversationListsByScope: nextConversationLists,
            isPollBaselineFresh: false,
            hasMoreHistoryByConversationId:
              clearedResourceState.hasMoreHistoryByConversationId,
            historyStatusByConversationId:
              clearedResourceState.historyStatusByConversationId,
            groupMembersLoadedAtByConversationId:
              clearedResourceState.groupMembersLoadedAtByConversationId,
            groupMembersByConversationId:
              clearedResourceState.groupMembersByConversationId,
            groupMembersLoadingByConversationId:
              clearedResourceState.groupMembersLoadingByConversationId,
            messagePaginationByConversationId:
              clearedResourceState.messagePaginationByConversationId,
            messagesByConversationId: nextMessagesByConversationId,
            pendingMessages,
            pollState: {
              ...currentState.pollState,
              lastSuccessAt: Date.now(),
              status: "idle",
            },
            messageUpdateCursor:
              response.nextMessageUpdateCursor ?? currentState.messageUpdateCursor,
            sinceVersion: response.nextVersion,
          };
        });
      } catch (error) {
        if (isCursorInvalidationError(error)) {
          try {
            const latestState = get();
            const accountId = latestState.activeAccountId;

            if (!accountId) {
              throw error;
            }

            const scopeResult = await loadAccountScope(
              accountId,
              latestState.activeMode,
              {
                accounts: latestState.accounts,
                customerProfilesById: latestState.customerProfilesById,
                me: latestState.me,
              },
              MESSAGE_PAGE_SIZE,
              latestState.activeConversationId,
            );
            const conversationPage = scopeResult.conversationPage;
            const loadedAt = Date.now();

            set((currentState) => {
              const nextMessagesByConversationId = conversationPage
                ? {
                    ...currentState.messagesByConversationId,
                    [conversationPage.conversationId]: upsertMessageList(
                      [],
                      conversationPage.messages,
                    ),
                  }
                : currentState.messagesByConversationId;
              const nextHistoryByConversationId = conversationPage
                ? {
                    ...currentState.hasMoreHistoryByConversationId,
                    [conversationPage.conversationId]: conversationPage.hasMoreHistory,
                  }
                : currentState.hasMoreHistoryByConversationId;
              const nextPaginationByConversationId = conversationPage
                ? {
                    ...currentState.messagePaginationByConversationId,
                    [conversationPage.conversationId]: buildMessagePaginationState(conversationPage),
                  }
                : currentState.messagePaginationByConversationId;
              const nextState: Partial<WorkbenchStore> = {
                conversationListsByScope: {
                  ...currentState.conversationListsByScope,
                  [accountId]: scopeResult.conversations,
                },
                conversationModeLoadedAtByScope: markAllConversationModesLoaded(
                  currentState.conversationModeLoadedAtByScope,
                  accountId,
                  loadedAt,
                ),
                hasMoreHistoryByConversationId: nextHistoryByConversationId,
                messagePaginationByConversationId: nextPaginationByConversationId,
                messagesByConversationId: nextMessagesByConversationId,
                pollState: {
                  ...currentState.pollState,
                  errorMessage: undefined,
                  lastSuccessAt: Date.now(),
                  status: "idle",
                },
              };

              if (currentState.activeAccountId !== accountId) {
                return nextState;
              }

              const nextActiveConversationId = scopeResult.conversations.some(
                (conversation) => conversation.id === currentState.activeConversationId,
              )
                ? currentState.activeConversationId
                : scopeResult.nextConversationId;

            return {
              ...nextState,
              activeConversationId: nextActiveConversationId,
              activeMessageSeq: getActiveMessageSeq(
                nextMessagesByConversationId,
                nextActiveConversationId,
              ),
              messageUpdateCursor: undefined,
              pendingMessages: currentState.pendingMessages.filter(
                (message) => message.conversationId !== state.activeConversationId,
              ),
              isPollBaselineFresh: true,
                sinceVersion: scopeResult.pollBaseline,
              };
            });

            return;
          } catch {
            // Fall through to the normal error state if the compensating reload fails.
          }
        }

        set((currentState) => ({
          pollState: {
            ...currentState.pollState,
            errorMessage: error instanceof Error ? error.message : "轮询失败",
            status: "error",
          },
        }));
      }
    },
    async sendAgentMessageSegments(segments, options) {
      const normalizedSegments = normalizeComposerSegments(segments);

      if (normalizedSegments.length === 0) {
        return { didConsumeQuote: false, ok: true };
      }

      const state = get();
      const { activeAccountId, activeConversationId, me } = state;

      if (!activeAccountId || !activeConversationId || !me) {
        return {
          errorCode: "UNAVAILABLE",
          errorMessage: "当前无法发送消息",
          reason: "unavailable",
          ok: false,
        };
      }

      const account = state.accounts.find((item) => item.id === activeAccountId);
      const activeConversation = (state.conversationListsByScope[activeAccountId] ?? []).find(
        (conversation) => conversation.id === activeConversationId,
      );

      if (
        !activeConversation ||
        account?.loginStatus === "offline" ||
        !isAccountTakenOverByCurrentUser(account, me)
      ) {
        return {
          errorCode: "UNAVAILABLE",
          errorMessage: "当前无法发送消息",
          reason: "unavailable",
          ok: false,
        };
      }
      const timestamp = Date.now();
      const clientMessageId = `local_${timestamp}_${Math.random().toString(36).slice(2, 6)}`;

      set((currentState) => ({
        sendStatusByConversationId: {
          ...currentState.sendStatusByConversationId,
          [activeConversationId]: "sending",
        },
      }));

      const sendableSegments = stripComposerMentionMetadata(normalizedSegments);
      let segmentsForSend = sendableSegments;

      try {
        if (normalizedSegments.some((segment) => segment.type === "image")) {
          segmentsForSend = options?.onImageUploaded
            ? await resolveImageSegmentsForSend(
                activeConversationId,
                sendableSegments,
                { onImageUploaded: options.onImageUploaded },
              )
            : await resolveImageSegmentsForSend(
                activeConversationId,
                sendableSegments,
              );
        }
      } catch (error) {
        set((currentState) => ({
          sendStatusByConversationId: {
            ...currentState.sendStatusByConversationId,
            [activeConversationId]: "idle",
          },
        }));

        return {
          errorCode: getRequestErrorCode(error),
          errorMessage: getRequestErrorMessage(error, "图片上传失败"),
          reason: "image-upload",
          ok: false,
        };
      }

      try {
        let hasSentMention = false;
        let hasSentQuote = false;
        for (let index = 0; index < segmentsForSend.length; index += 1) {
          const segmentForSend = segmentsForSend[index];
          const originalSegment = normalizedSegments[index] ?? segmentForSend;
          const segmentClientMessageId = buildSegmentClientMessageId(clientMessageId, index);
          const mentionForSegment: SendMentionPayload =
            !hasSentMention && segmentForSend.type === "text"
              ? options?.mention
              : undefined;
          const quoteForSegment: SendQuotePayload =
            !hasSentQuote && segmentForSend.type === "text" ? options?.quote : undefined;
          hasSentMention = hasSentMention || Boolean(mentionForSegment);
          hasSentQuote = hasSentQuote || Boolean(quoteForSegment);
          const response = await sendTextMessage({
            clientMessageId: segmentClientMessageId,
            conversationId: activeConversationId,
            mention: mentionForSegment,
            quote: quoteForSegment,
            seatId: activeAccountId,
            segment: segmentForSend,
          });
          const optimisticMessage = {
            author: account ? `${account.name}-${account.operator}` : me.displayName,
            isGroupConversation: activeConversation.mode === "group",
            isOwnMessage: true,
            clientMessageId: segmentClientMessageId,
            content: buildOptimisticMessageContent(segmentForSend, quoteForSegment),
            conversationId: activeConversationId,
            id: segmentClientMessageId,
            optNo: response.optNo ?? response.messageId,
            role: "agent" as const,
            remoteMessageId: response.messageId,
            sender: {
              avatarUrl: account?.avatarUrl,
              id: `sender-agent-${activeAccountId}`,
              name: account ? `${account.name}-${account.operator}` : me.displayName,
            },
            sentAt: formatWorkbenchTimestamp(timestamp + index),
            status: "accepted" as const,
          } satisfies Message;
          const preview = getComposerSegmentsPreview([originalSegment]);

          set((currentState) => {
            const currentMessages =
              currentState.messagesByConversationId[activeConversationId] ?? [];
            const nextMessages = [...currentMessages, optimisticMessage];
            const currentConversations =
              currentState.conversationListsByScope[activeAccountId] ?? [];

            return {
              activeMessageSeq: getActiveMessageSeq(
                {
                  ...currentState.messagesByConversationId,
                  [activeConversationId]: nextMessages,
                },
                activeConversationId,
              ),
              conversationListsByScope: {
                ...currentState.conversationListsByScope,
                [activeAccountId]: updateConversationPreview(
                  currentConversations,
                  activeConversationId,
                  preview,
                  optimisticMessage.sentAt,
                  timestamp + index,
                ),
              },
              messagesByConversationId: {
                ...currentState.messagesByConversationId,
                [activeConversationId]: nextMessages,
              },
              pendingMessages: [...currentState.pendingMessages, optimisticMessage],
            };
          });
        }

        set((currentState) => ({
          sendStatusByConversationId: {
            ...currentState.sendStatusByConversationId,
            [activeConversationId]: "idle",
          },
        }));

        return { didConsumeQuote: hasSentQuote, ok: true };
      } catch (error) {
        set((currentState) => ({
          sendStatusByConversationId: {
            ...currentState.sendStatusByConversationId,
            [activeConversationId]: "idle",
          },
        }));

        return {
          errorCode: getRequestErrorCode(error),
          errorMessage: getRequestApiErrorMessage(error),
          reason: "send",
          ok: false,
        };
      }
    },
    async sendAgentTextMessage(text) {
      return get().sendAgentMessageSegments([
        {
          text,
          type: "text",
        },
      ]);
    },
    async retryFailedMessage(messageId) {
      const state = get();
      const conversationMessages =
        state.messagesByConversationId[state.activeConversationId] ?? [];
      const failedMessage = conversationMessages.find(
        (message) =>
          message.id === messageId &&
          message.role === "agent" &&
          message.status === "failed" &&
          message.content.type === "text",
      );

      if (
        !failedMessage ||
        failedMessage.role !== "agent" ||
        failedMessage.content.type !== "text"
      ) {
        return;
      }

      set((currentState) => ({
        messagesByConversationId: {
          ...currentState.messagesByConversationId,
          [failedMessage.conversationId]: (
            currentState.messagesByConversationId[failedMessage.conversationId] ?? []
          ).filter((message) => message.id !== failedMessage.id),
        },
        pendingMessages: currentState.pendingMessages.filter(
          (message) => message.id !== failedMessage.id,
        ),
      }));

      await get().sendAgentTextMessage(failedMessage.content.text);
    },
    async loadOlderMessages() {
      const state = get();
      const conversationId = state.activeConversationId;
      const historyStatus = conversationId
        ? state.historyStatusByConversationId[conversationId] ?? "idle"
        : "idle";

      if (
        !conversationId ||
        historyStatus === "loading" ||
        state.hasMoreHistoryByConversationId[conversationId] === false
      ) {
        return;
      }

      const pagination = state.messagePaginationByConversationId[conversationId];
      const beforeSeq = pagination?.nextBeforeSeq;

      if (beforeSeq == null) {
        return;
      }

      set((currentState) => ({
        historyStatusByConversationId: {
          ...currentState.historyStatusByConversationId,
          [conversationId]: "loading",
        },
      }));

      try {
        const page = await loadConversationMessagesPage(
          {
            accounts: state.accounts,
            customerProfilesById: state.customerProfilesById,
            me: state.me,
          },
          conversationId,
          {
            beforeSeq,
            limit: MESSAGE_PAGE_SIZE,
          },
        );

        set((currentState) => {
          if (currentState.activeConversationId !== conversationId) {
            return clearConversationMessageState(currentState, [conversationId], {
              preservePending: true,
            });
          }

          return {
            hasMoreHistoryByConversationId: {
              ...currentState.hasMoreHistoryByConversationId,
              [conversationId]: page.hasMoreHistory,
            },
            historyStatusByConversationId: {
              ...currentState.historyStatusByConversationId,
              [conversationId]: "idle",
            },
            messagePaginationByConversationId: {
              ...currentState.messagePaginationByConversationId,
              [conversationId]: buildMessagePaginationState(page),
            },
            messagesByConversationId: {
              ...currentState.messagesByConversationId,
              [conversationId]: upsertMessageList(
                page.messages,
                currentState.messagesByConversationId[conversationId] ?? [],
              ),
            },
          };
        });
      } catch {
        set((currentState) => ({
          historyStatusByConversationId:
            currentState.activeConversationId === conversationId
              ? {
                  ...currentState.historyStatusByConversationId,
                  [conversationId]: "idle",
                }
              : omitByKeys(currentState.historyStatusByConversationId, [
                  conversationId,
                ]),
        }));
      }
    },
    async openHistoryPanel(conversationId) {
      const state = get();
      const nextConversationId = conversationId ?? state.activeConversationId;

      if (!nextConversationId) {
        return;
      }

      set((currentState) => {
        const filters = currentState.historyPanelFiltersByConversationId[
          nextConversationId
        ] ?? { scope: "all" as const };

        return {
          historyPanelOpenConversationId: nextConversationId,
          historyPanelErrorByConversationId: {
            ...currentState.historyPanelErrorByConversationId,
            [nextConversationId]: undefined,
          },
          historyPanelScrollModeByConversationId: {
            ...currentState.historyPanelScrollModeByConversationId,
            [nextConversationId]: getHistoryPanelScrollMode(filters),
          },
        };
      });

      await get().loadHistoryMessages({ direction: "next" });
    },
    closeHistoryPanel() {
      set((currentState) => ({
        historyPanelOpenConversationId: undefined,
        historyPanelErrorByConversationId: currentState.historyPanelOpenConversationId
          ? {
              ...currentState.historyPanelErrorByConversationId,
              [currentState.historyPanelOpenConversationId]: undefined,
            }
          : currentState.historyPanelErrorByConversationId,
      }));
    },
    async setHistoryPanelScope(scope) {
      const state = get();
      const conversationId = state.historyPanelOpenConversationId;

      if (!conversationId) {
        return;
      }

      set((currentState) => {
        const filters = {
          ...(currentState.historyPanelFiltersByConversationId[conversationId] ?? {
            scope: "all" as const,
          }),
          scope,
        };

        return {
          historyPanelByConversationId: {
            ...currentState.historyPanelByConversationId,
            [conversationId]: emptyHistoryPanelState,
          },
          historyPanelErrorByConversationId: {
            ...currentState.historyPanelErrorByConversationId,
            [conversationId]: undefined,
          },
          historyPanelFiltersByConversationId: {
            ...currentState.historyPanelFiltersByConversationId,
            [conversationId]: filters,
          },
          historyPanelScrollModeByConversationId: {
            ...currentState.historyPanelScrollModeByConversationId,
            [conversationId]: getHistoryPanelScrollMode(filters),
          },
        };
      });

      await get().loadHistoryMessages({ direction: "next" });
    },
    async setHistoryPanelDay(day) {
      const state = get();
      const conversationId = state.historyPanelOpenConversationId;

      if (!conversationId) {
        return;
      }

      set((currentState) => {
        const filters = {
          ...(currentState.historyPanelFiltersByConversationId[conversationId] ?? {
            scope: "all" as const,
          }),
          day,
        };

        return {
          historyPanelByConversationId: {
            ...currentState.historyPanelByConversationId,
            [conversationId]: emptyHistoryPanelState,
          },
          historyPanelErrorByConversationId: {
            ...currentState.historyPanelErrorByConversationId,
            [conversationId]: undefined,
          },
          historyPanelFiltersByConversationId: {
            ...currentState.historyPanelFiltersByConversationId,
            [conversationId]: filters,
          },
          historyPanelScrollModeByConversationId: {
            ...currentState.historyPanelScrollModeByConversationId,
            [conversationId]: getHistoryPanelScrollMode(filters),
          },
        };
      });

      await get().loadHistoryMessages({ direction: "next" });
    },
    async setHistoryPanelSenderId(senderId) {
      const state = get();
      const conversationId = state.historyPanelOpenConversationId;

      if (!conversationId) {
        return;
      }

      set((currentState) => {
        const filters = {
          ...(currentState.historyPanelFiltersByConversationId[conversationId] ?? {
            scope: "all" as const,
          }),
          senderId,
        };

        return {
          historyPanelByConversationId: {
            ...currentState.historyPanelByConversationId,
            [conversationId]: emptyHistoryPanelState,
          },
          historyPanelErrorByConversationId: {
            ...currentState.historyPanelErrorByConversationId,
            [conversationId]: undefined,
          },
          historyPanelFiltersByConversationId: {
            ...currentState.historyPanelFiltersByConversationId,
            [conversationId]: filters,
          },
          historyPanelScrollModeByConversationId: {
            ...currentState.historyPanelScrollModeByConversationId,
            [conversationId]: getHistoryPanelScrollMode(filters),
          },
        };
      });

      await get().loadHistoryMessages({ direction: "next" });
    },
    async loadHistoryMessages(options) {
      const state = get();
      const conversationId = state.historyPanelOpenConversationId;

      if (!conversationId) {
        return;
      }

      const filters = state.historyPanelFiltersByConversationId[conversationId] ?? {
        scope: "all",
      };
      const currentHistory = state.historyPanelByConversationId[conversationId];
      const cursor = options?.cursor;
      const direction = options?.direction ?? "next";

      if (state.historyPanelLoadingByConversationId[conversationId]) {
        return;
      }

      set((currentState) => ({
        historyPanelLoadingByConversationId: {
          ...currentState.historyPanelLoadingByConversationId,
          [conversationId]: true,
        },
        historyPanelErrorByConversationId: {
          ...currentState.historyPanelErrorByConversationId,
          [conversationId]: undefined,
        },
      }));

      try {
        const page = await loadConversationHistoryMessagesPage(
          {
            accounts: state.accounts,
            customerProfilesById: state.customerProfilesById,
            me: state.me,
          },
          conversationId,
          {
            cursor,
            day: filters.day,
            scope: filters.scope,
            senderId: filters.senderId,
          },
        );

        set((currentState) => {
          const currentConversationId = currentState.historyPanelOpenConversationId;
          const currentScrollMode =
            currentState.historyPanelScrollModeByConversationId[conversationId];

          if (currentConversationId !== conversationId) {
            return {
              historyPanelLoadingByConversationId: omitByKeys(
                currentState.historyPanelLoadingByConversationId,
                [conversationId],
              ),
            };
          }

          const nextMessages =
            cursor && direction === "prev" && currentHistory
              ? [...page.messages, ...currentHistory.messages]
              : cursor && direction === "next" && currentHistory
                ? [...currentHistory.messages, ...page.messages]
                : page.messages;
          const nextHistoryState =
            cursor && currentHistory
              ? {
                  hasNext:
                    direction === "next" ? page.hasNext : currentHistory.hasNext,
                  hasPrev:
                    direction === "prev" ? page.hasPrev : currentHistory.hasPrev,
                  messages: nextMessages,
                  nextCursor:
                    direction === "next"
                      ? page.nextCursor
                      : currentHistory.nextCursor,
                  prevCursor:
                    direction === "prev"
                      ? page.prevCursor
                      : currentHistory.prevCursor,
                }
              : {
                  hasNext: page.hasNext,
                  hasPrev: page.hasPrev,
                  messages: nextMessages,
                  nextCursor: page.nextCursor,
                  prevCursor: page.prevCursor,
                };

          return {
            historyPanelByConversationId: {
              ...currentState.historyPanelByConversationId,
              [conversationId]: nextHistoryState,
            },
            historyPanelLoadingByConversationId: {
              ...currentState.historyPanelLoadingByConversationId,
              [conversationId]: false,
            },
            historyPanelScrollModeByConversationId: {
              ...currentState.historyPanelScrollModeByConversationId,
              [conversationId]:
                cursor == null && currentScrollMode === "end" ? "end" : undefined,
            },
          };
        });
      } catch (error) {
        set((currentState) => ({
          historyPanelLoadingByConversationId: {
            ...currentState.historyPanelLoadingByConversationId,
            [conversationId]: false,
          },
          historyPanelErrorByConversationId: {
            ...currentState.historyPanelErrorByConversationId,
            [conversationId]:
              error instanceof Error ? error.message : "加载历史记录失败",
          },
        }));
      }
    },
    async refreshSeatSummaries() {
      const state = get();

      if (state.bootstrapStatus !== "ready") {
        return;
      }

      try {
        const nextAccounts = await loadSeats();

        set((currentState) => ({
          accounts: currentState.accounts.map((account) => {
            if (account.id === currentState.activeAccountId) {
              return account;
            }

            const nextAccount = nextAccounts.find((item) => item.id === account.id);
            return nextAccount ?? account;
          }),
        }));
      } catch {
        // Keep current seat summaries if the refresh fails.
      }
    },
    async setActiveAccount(accountId) {
      const state = get();

      if (!accountId || state.activeAccountId === accountId) {
        return;
      }

      const requestId = issueScopeRequestId();
      set({
        isConversationLoading: true,
        scopeTransitionError: undefined,
      });

      try {
        const scopeResult = await loadAccountScope(
          accountId,
          state.activeMode,
          {
            accounts: state.accounts,
            customerProfilesById: state.customerProfilesById,
            me: state.me,
          },
          MESSAGE_PAGE_SIZE,
        );
        const conversationPage = scopeResult.conversationPage;

        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

        const nextConversation = scopeResult.conversations.find(
          (conversation) => conversation.id === scopeResult.nextConversationId,
        );
        const loadedAt = Date.now();

        set((currentState) => {
          const conversationListCacheSeatOrder = getConversationListCacheSeatOrder(
            currentState.conversationListCacheSeatOrder,
            accountId,
          );
          const prunedConversationListCache = pruneConversationListCache({
            activeAccountId: accountId,
            conversationListsByScope: {
              ...currentState.conversationListsByScope,
              [accountId]: scopeResult.conversations,
            },
            conversationModeLoadedAtByScope: markAllConversationModesLoaded(
              currentState.conversationModeLoadedAtByScope,
              accountId,
              loadedAt,
            ),
            seatOrder: conversationListCacheSeatOrder,
          });
          const evictedConversationIds =
            prunedConversationListCache.evictedSeatIds.flatMap(
              (seatId) =>
                currentState.conversationListsByScope[seatId]?.map((conversation) => conversation.id) ?? [],
            );
          const clearedMessageState = clearConversationMessageState(
            currentState,
            getMessageStateConversationIds(currentState),
            { preservePending: true },
          );
          const nextGroupMembersLoadingByConversationId = omitByKeys(
            currentState.groupMembersLoadingByConversationId,
            evictedConversationIds,
          );

          return {
            ...clearedMessageState,
            groupMembersLoadedAtByConversationId: omitByKeys(
              currentState.groupMembersLoadedAtByConversationId,
              evictedConversationIds,
            ),
            groupMembersByConversationId: omitByKeys(
              currentState.groupMembersByConversationId,
              evictedConversationIds,
            ),
            activeAccountId: accountId,
            activeConversationId: scopeResult.nextConversationId,
            activeMode: scopeResult.nextMode,
            activeMessageSeq: getActiveMessageSeq(
              conversationPage
                ? {
                    ...clearedMessageState.messagesByConversationId,
                    [conversationPage.conversationId]: conversationPage.messages,
                  }
                : clearedMessageState.messagesByConversationId,
              scopeResult.nextConversationId,
            ),
            conversationListCacheSeatOrder:
              prunedConversationListCache.conversationListCacheSeatOrder,
            conversationListsByScope:
              prunedConversationListCache.conversationListsByScope,
            conversationModeLoadedAtByScope:
              prunedConversationListCache.conversationModeLoadedAtByScope,
            hasMoreHistoryByConversationId: conversationPage
              ? {
                  ...clearedMessageState.hasMoreHistoryByConversationId,
                  [conversationPage.conversationId]: conversationPage.hasMoreHistory,
                }
              : clearedMessageState.hasMoreHistoryByConversationId,
            messagePaginationByConversationId: conversationPage
              ? {
                  ...clearedMessageState.messagePaginationByConversationId,
                  [conversationPage.conversationId]: buildMessagePaginationState(conversationPage),
                }
              : clearedMessageState.messagePaginationByConversationId,
            isConversationLoading: false,
            messagesByConversationId: conversationPage
              ? {
                  ...clearedMessageState.messagesByConversationId,
                  [conversationPage.conversationId]: upsertMessageList(
                    [],
                    conversationPage.messages,
                  ),
                }
              : clearedMessageState.messagesByConversationId,
            scopeTransitionError: undefined,
            groupMembersLoadingByConversationId:
              nextConversation?.mode === "group" &&
              (currentState.groupMembersByConversationId[
                scopeResult.nextConversationId
              ] === undefined ||
                !isGroupMembersCacheFresh(
                  currentState.groupMembersLoadedAtByConversationId,
                  scopeResult.nextConversationId,
                ))
                ? {
                    ...nextGroupMembersLoadingByConversationId,
                    [scopeResult.nextConversationId]: true,
                  }
                : nextGroupMembersLoadingByConversationId,
            isPollBaselineFresh: true,
            messageUpdateCursor: undefined,
            sinceVersion: scopeResult.pollBaseline,
          };
        });

        await loadGroupMembersForConversation(
          scopeResult.nextConversationId,
          requestId,
        );

        if (
          scopeResult.nextConversationId &&
          isAccountTakenOverByCurrentUser(
            get().accounts.find((account) => account.id === accountId),
            get().me,
          )
        ) {
          await markActiveConversationRead(scopeResult.nextConversationId, requestId);
        }
      } catch (error) {
        if (isCurrentScopeRequest(requestId)) {
          set({
            isConversationLoading: false,
            scopeTransitionError:
              error instanceof Error ? error.message : "切换账号失败",
          });
        }
      }
    },
    async setActiveConversation(conversationId) {
      const state = get();

      if (
        !conversationId ||
        !state.activeAccountId ||
        state.activeConversationId === conversationId
      ) {
        return;
      }

      const requestId = issueScopeRequestId();
      const currentConversation = getConversationById(state, conversationId);

      set({
        activeConversationId: conversationId,
        isConversationLoading: true,
        historyPanelOpenConversationId: undefined,
        scopeTransitionError: undefined,
        messageUpdateCursor: undefined,
      });

      if (currentConversation?.mode === "group") {
        set((currentState) => ({
          groupMembersLoadingByConversationId:
            currentState.groupMembersByConversationId[conversationId] === undefined ||
            !isGroupMembersCacheFresh(
              currentState.groupMembersLoadedAtByConversationId,
              conversationId,
            )
              ? {
                  ...currentState.groupMembersLoadingByConversationId,
                  [conversationId]: true,
                }
              : currentState.groupMembersLoadingByConversationId,
        }));
      }

      try {
        const page = await loadConversationMessagesPage(
          {
            accounts: state.accounts,
            customerProfilesById: state.customerProfilesById,
            me: state.me,
          },
          conversationId,
          {
            limit: MESSAGE_PAGE_SIZE,
          },
        );

        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

        set((currentState) => {
          const staleMessageConversationIds = [
            ...getMessageStateConversationIds(currentState),
          ].filter((cachedConversationId) => cachedConversationId !== conversationId);
          const clearedMessageState = clearConversationMessageState(
            currentState,
            staleMessageConversationIds,
            { preservePending: true },
          );
          const nextMessagesByConversationId = {
            ...clearedMessageState.messagesByConversationId,
            [conversationId]: upsertMessageList([], page.messages),
          };

          return {
            ...clearedMessageState,
            activeMessageSeq: getActiveMessageSeq(
              nextMessagesByConversationId,
              conversationId,
            ),
            hasMoreHistoryByConversationId: {
              ...clearedMessageState.hasMoreHistoryByConversationId,
              [conversationId]: page.hasMoreHistory,
            },
            messagePaginationByConversationId: {
              ...clearedMessageState.messagePaginationByConversationId,
              [conversationId]: buildMessagePaginationState(page),
            },
            isConversationLoading: false,
            messagesByConversationId: nextMessagesByConversationId,
            messageUpdateCursor: undefined,
            scopeTransitionError: undefined,
          };
        });

        await loadGroupMembersForConversation(conversationId, requestId);

        const latestState = get();
        const activeAccount = latestState.accounts.find(
          (account) => account.id === latestState.activeAccountId,
        );

        if (!isAccountTakenOverByCurrentUser(activeAccount, latestState.me)) {
          return;
        }

        await markActiveConversationRead(conversationId, requestId);
      } catch (error) {
        if (isCurrentScopeRequest(requestId)) {
          set({
            isConversationLoading: false,
            scopeTransitionError:
              error instanceof Error ? error.message : "切换会话失败",
          });
        }
      }
    },
    async setActiveMode(mode) {
      const state = get();

      if (state.activeMode === mode) {
        return;
      }

      if (state.activeAccountId && !isConversationModeCacheFresh(state, state.activeAccountId, mode)) {
        const accountId = state.activeAccountId;
        const requestId = issueScopeRequestId();

        set({
          activeMode: mode,
          isConversationLoading: true,
          historyPanelOpenConversationId: undefined,
          scopeTransitionError: undefined,
        });

        try {
          const result = await loadAccountConversationsByMode(accountId, mode);
          const loadedAt = Date.now();

          if (!isCurrentScopeRequest(requestId)) {
            return;
          }

          set((currentState) => {
            const conversationListCacheSeatOrder = getConversationListCacheSeatOrder(
              currentState.conversationListCacheSeatOrder,
              accountId,
            );
            const prunedConversationListCache = pruneConversationListCache({
              activeAccountId: accountId,
              conversationListsByScope: {
                ...currentState.conversationListsByScope,
                [accountId]: replaceConversationsByMode(
                  currentState.conversationListsByScope[accountId] ?? [],
                  mode,
                  result.conversations,
                ),
              },
              conversationModeLoadedAtByScope: markConversationModesLoaded(
                currentState.conversationModeLoadedAtByScope,
                accountId,
                [mode],
                loadedAt,
              ),
              seatOrder: conversationListCacheSeatOrder,
            });

            return {
              conversationListCacheSeatOrder:
                prunedConversationListCache.conversationListCacheSeatOrder,
              conversationListsByScope:
                prunedConversationListCache.conversationListsByScope,
              conversationModeLoadedAtByScope:
                prunedConversationListCache.conversationModeLoadedAtByScope,
              isPollBaselineFresh: result.pollBaseline < currentState.sinceVersion
                ? true
                : currentState.isPollBaselineFresh,
              isConversationLoading: false,
              sinceVersion: Math.min(currentState.sinceVersion, result.pollBaseline),
            };
          });

          const nextConversationId = getFirstConversationId(
            get().conversationListsByScope,
            accountId,
            mode,
          );

          if (nextConversationId) {
            await get().setActiveConversation(nextConversationId);
          } else {
            set({
              activeConversationId: "",
              activeMessageSeq: 0,
              isConversationLoading: false,
            });
          }
        } catch (error) {
          if (isCurrentScopeRequest(requestId)) {
            set({
              isConversationLoading: false,
              scopeTransitionError:
                error instanceof Error ? error.message : "切换会话类型失败",
            });
          }
        }

        return;
      }

      const nextConversationId = getFirstConversationId(
        state.conversationListsByScope,
        state.activeAccountId,
        mode,
      );

      set({ activeMode: mode });
      set({ historyPanelOpenConversationId: undefined });

      if (nextConversationId) {
        await get().setActiveConversation(nextConversationId);
      } else {
        set({
          activeConversationId: "",
          activeMessageSeq: 0,
        });
      }
    },
      updateMessageDownloadContent(conversationId, messageId, contentPatch) {
        set((currentState) => {
          const messages = currentState.messagesByConversationId[conversationId] ?? [];

          return {
            messagesByConversationId: {
              ...currentState.messagesByConversationId,
              [conversationId]: messages.map((message) => {
                if (message.id !== messageId || !isDownloadableMessage(message)) {
                  return message;
                }

                if (message.content.type === "video") {
                  return {
                    ...message,
                    content: {
                      ...message.content,
                      downloadStatus: contentPatch.downloadStatus,
                      ...(contentPatch.fileUrlExpireTime === undefined
                        ? {}
                        : { fileUrlExpireTime: contentPatch.fileUrlExpireTime }),
                      videoUrl: contentPatch.fileUrl ?? message.content.videoUrl,
                    },
                  };
                }

                return {
                  ...message,
                  content: {
                    ...message.content,
                    ...contentPatch,
                  },
                };
              }),
            },
          };
        });
      },
    };
  });
}

function stripComposerMentionMetadata(segments: ComposerSegment[]): ComposerSegment[] {
  return segments.map((segment) => {
    if (segment.type !== "text") {
      return segment;
    }

    return {
      text: segment.text,
      type: "text",
    } satisfies ComposerTextSegment;
  });
}

function isDownloadableMessage(message: Message): message is ChatMessage {
  return (
    message.role !== "system" &&
    (message.content.type === "file" || message.content.type === "video")
  );
}

function getRequestErrorCode(error: unknown) {
  if (isErrorWithCode(error) && !isTransportErrorCode(error.code)) {
    return error.code;
  }

  if (isErrorWithStatus(error)) {
    return String(error.status);
  }

  if (isErrorWithCode(error)) {
    return error.code;
  }

  if (error instanceof Error) {
    const statusMatch = /\b([1-5]\d{2})\b/.exec(error.message);

    return statusMatch?.[1] ?? "UNKNOWN";
  }

  return "UNKNOWN";
}

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (isErrorWithMessage(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function getRequestApiErrorMessage(error: unknown) {
  if (isErrorWithMessage(error)) {
    return error.message;
  }

  return undefined;
}

function isErrorWithStatus(error: unknown): error is { status: number | string } {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return false;
  }

  const status = (error as { status?: unknown }).status;

  return typeof status === "number" || typeof status === "string";
}

function isErrorWithCode(error: unknown): error is { code: string } {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return typeof (error as { code?: unknown }).code === "string";
}

function isErrorWithMessage(error: unknown): error is { message: string } {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return false;
  }

  return typeof (error as { message?: unknown }).message === "string";
}

function isTransportErrorCode(code: string) {
  return code.startsWith("ERR_") || code === "ECONNABORTED";
}

export const useWorkbenchStore = createWorkbenchStore();
