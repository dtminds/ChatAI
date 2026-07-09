import { create } from "zustand";
import {
  isLocalImageSegment,
  resolveImageSegmentsForSend,
} from "@/pages/chat/api/media-upload-service";
import { MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE } from "@/pages/chat/api/media-upload-errors";
import {
  adaptConversation,
  formatConversationPreview,
  formatWorkbenchTimestamp,
  isInvalidMessageUiKey,
} from "@/pages/chat/api/workbench-adapter";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  bootstrapWorkbench,
  changeConversationFullAuto,
  CONVERSATION_MODE_CACHE_TTL_MS,
  deleteConversation as deleteConversationRequest,
  getFullAutoAnswerStatus,
  getVisibleConversations,
  loadAccountConversationsByMode,
  loadAccountConversationsWithBaseline,
  loadUnreadAccountConversationsByMode,
  loadConversationHistoryMessagesPage,
  loadGroupMembers,
  loadConversationMessagesPage,
  loadMessagesBySeqs,
  loadSeats,
  markConversationRead,
  markConversationUnread,
  pinConversation,
  pollWorkbench,
  pollSmartReplies,
  requestSmartReplyAutoGeneralAnswer,
  requestSmartReplyGeneralAnswer,
  requestSmartReplyMakeShorter as requestSmartReplyMakeShorterApi,
  sendSmartReplyAnswer,
  confirmVoicePlaybackReady as confirmVoicePlaybackReadyRequest,
  retryMessage as retryMessageRequest,
  revokeMessage as revokeMessageRequest,
  sendTextMessage,
  takeOverAccount as takeOverAccountRequest,
  transcribeVoiceMessage as transcribeVoiceMessageRequest,
  unpinConversation,
  updateSeatAgentMode,
} from "@/pages/chat/api/workbench-gateway";
import type { WorkbenchConversationPage } from "@/pages/chat/api/workbench-gateway";
import {
  getComposerSegmentsPreview,
  JAVA_MENTION_PLACEHOLDER,
  normalizeComposerSegments,
  type ComposerSegment,
  type ComposerTextSegment,
} from "@/pages/chat/lib/composer-segments";
import { sortConversations } from "@/pages/chat/lib/conversation-order";
import { parseWorkbenchDate } from "@/pages/chat/lib/chat-time";
import { sortMessagesBySentAt } from "@/pages/chat/lib/message-order";
import {
  buildConversationComposerDraft,
  type ConversationComposerDraft,
} from "@/pages/chat/lib/conversation-composer-draft";
import type { AgentHostingStatus } from "@/pages/chat/lib/chat-agent-hosting-status";
import { normalizeMediaAssetUrl } from "@/pages/chat/lib/media-asset-url";
import { isValidMessageSeq } from "@/pages/chat/lib/message-seq";
import { notifyPulledCustomerMessage } from "@/pages/chat/lib/new-message-title-alert";
import { canUseWorkbenchConversationActions } from "@/pages/chat/lib/workbench-permissions";
import {
  isConversationAIFeatureSupported,
  isConversationAIHostingEnabled,
} from "@/pages/chat/lib/conversation-ai-hosting";
import { seedCustomerProfiles } from "@/pages/chat/mock-data";
import {
  CHAT_TYPE,
  SMART_REPLY_POLL_INTERVAL_MS,
  type WorkbenchFullAutoAnswerStatusResponse,
  type WorkbenchSeatAgentMode,
  type SettingsSidebarItem,
  type WorkbenchSendMessagePayload,
} from "@chatai/contracts";
import {
  buildSmartReplySendSegments,
  collectPendingSmartReplyPollMsgIds,
  collectSmartReplyPendingKeysFromSuggestions,
  collectUnansweredSmartReplyPendingKeys,
  createMakeShorterSmartReplySuggestion,
  canRequestSmartReplyMakeShorter,
  createSentSmartReplySuggestion,
  createTriggeredSmartReplySuggestion,
  getSmartReplyLookupKey,
  hasSmartReplyTriggerRawMsgtype,
  isSmartReplyGenerationFailed,
  isSmartReplyKnowledgeMiss,
  isSmartReplyPollComplete,
  isSmartReplyEligibleMessage,
  isSmartReplySemanticWait,
  isSmartReplySemanticWaitExpired,
  isSmartReplySupportedConversation,
  SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT,
  SMART_REPLY_CONTENT_INCOMPLETE_SKIP_MESSAGE,
  SMART_REPLY_BUSY_TIMEOUT_MS,
  SMART_REPLY_SEMANTIC_WAIT_TIMEOUT_MS,
  type SmartReplySendPayload,
} from "@/pages/chat/api/smart-reply-adapter";
import type { SmartReplySuggestion } from "@/pages/chat/components/smart-reply-card";
import { MESSAGE_REVOKE_WINDOW_MS } from "@/pages/chat/chat-constants";
import type {
  Account,
  ChatMessage,
  ChatMode,
  Conversation,
  CustomerProfile,
  EmployeeProfile,
  GroupMember,
  Message,
  VoiceMessageContent,
} from "@/pages/chat/chat-types";

type AsyncStatus = "idle" | "loading" | "ready" | "error";
type HistoryStatus = "idle" | "loading";
type SendStatus = "idle" | "sending";
type TakeoverStatus = "idle" | "taking-over";
type FullAutoStatusState = {
  lastCustomerMessageAt: number;
  lastCustomerMessageId: string;
  status: AgentHostingStatus;
};
type FullAutoFinishedMessage = {
  messageAt: number;
  messageId: string;
};
type SendMentionPayload = WorkbenchSendMessagePayload["mention"];
type SendQuotePayload = WorkbenchSendMessagePayload["quote"];

type SendMessageResult =
  | {
      didConsumeQuote?: boolean;
      optNos?: string[];
      ok: true;
    }
  | {
      errorCode: string;
      errorMessage?: string;
      reason: "file-upload" | "image-upload" | "send" | "unavailable";
      ok: false;
    };

type RetryFailedMessageResult = SendMessageResult;

type RevokeMessageResult =
  | {
      ok: true;
    }
  | {
      errorCode: string;
      errorMessage?: string;
      ok: false;
    };

type TakeoverResult =
  | {
      ok: true;
    }
  | {
      errorMessage: string;
      ok: false;
    };

type MessagePaginationState = {
  hasMore: boolean;
  nextBeforeSeq?: number;
  skippedHiddenCount: number;
};

type PollState = {
  status: "idle" | "error" | "paused";
  intervalMs: number;
  jitterMs: number;
  errorMessage?: string;
  pauseReason?: "cursor-invalidated";
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
  hasMoreUnreadByScope: Record<string, Partial<Record<ChatMode, boolean>>>;
  customerProfilesById: Record<string, CustomerProfile>;
  groupMembersLoadedAtByConversationId: Record<string, number>;
  groupMembersLoadingByConversationId: Record<string, boolean>;
  messagesByConversationId: Record<string, Message[]>;
  smartReplyByMessageIdByConversationId: Record<
    string,
    Record<string, SmartReplySuggestion>
  >;
  smartReplyAutoPendingMessageKeysByConversationId: Record<
    string,
    Record<string, true>
  >;
  smartReplyAutoSkippedMessageKeysByConversationId: Record<
    string,
    Record<string, true>
  >;
  smartReplyHiddenMessageKeysByConversationId: Record<string, Record<string, true>>;
  smartReplyPendingMessageKeysByConversationId: Record<string, Record<string, true>>;
  smartReplyLastPolledAtByConversationId: Record<string, number>;
  activeAccountId: string;
  activeConversationId: string;
  activeMode: ChatMode;
  bootstrapStatus: AsyncStatus;
  bootstrapError?: string;
  fullAutoActionError?: string;
  fullAutoStatusByConversationId: Record<string, FullAutoStatusState>;
  seatAgentModeActionPending: boolean;
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
  fullAutoActionPending: boolean;
  groupMembersByConversationId: Record<string, GroupMember[]>;
  hasMoreHistoryByConversationId: Record<string, boolean>;
  messagePaginationByConversationId: Record<string, MessagePaginationState>;
  sendStatusByConversationId: Record<string, SendStatus>;
  takeoverStatusByAccountId: Record<string, TakeoverStatus>;
  pollState: PollState;
  sinceVersion: number;
  messageUpdateCursor?: number;
  seatUpdateCursor?: number;
  isPollBaselineFresh: boolean;
  hasChatSendPermission: boolean;
  activeMessageSeq: number;
  pendingMessages: Message[];
  revokeMessage: (uiMessageKey: string) => Promise<RevokeMessageResult>;
  sidebarItems: SettingsSidebarItem[];
  changeActiveSeatAgentMode: (mode: WorkbenchSeatAgentMode) => Promise<void>;
  changeActiveConversationFullAuto: (enabled: boolean) => Promise<void>;
  syncFullAutoAgentStatus: () => Promise<void>;
  resetWorkbenchRuntime: () => void;
  clearActiveConversation: () => void;
  resetWorkbenchSession: () => void;
  deleteConversation: (conversationId: string) => Promise<void>;
  dismissFullAutoActionError: () => void;
  dismissScopeTransitionError: () => void;
  dismissReadReceiptError: () => void;
  initializeWorkbench: () => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
  pinConversation: (conversationId: string) => Promise<void>;
  setActiveAccount: (accountId: string) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  setActiveMode: (
    mode: ChatMode,
    options?: { preserveConversation?: Conversation },
  ) => Promise<void>;
  loadActiveGroupMembers: (options?: { force?: boolean }) => Promise<void>;
  loadUnreadConversations: (mode?: ChatMode) => Promise<void>;
  markConversationUnread: (conversationId: string) => Promise<void>;
  sendAgentMessageSegments: (
    segments: ComposerSegment[],
    options?: {
      failMsgId?: string;
      mention?: SendMentionPayload;
      removeMessageIdOnAccepted?: string;
      onImageUploaded?: (payload: {
        nextSegment: ComposerSegment;
        previousSegment: ComposerSegment;
      }) => void;
      quote?: SendQuotePayload;
    },
  ) => Promise<SendMessageResult>;
  sendAgentTextMessage: (text: string) => Promise<SendMessageResult>;
  setChatSendPermission: (hasChatSendPermission: boolean) => void;
  setSidebarItems: (items: SettingsSidebarItem[]) => void;
  takeOverAccount: (accountId: string) => Promise<TakeoverResult>;
  unpinConversation: (conversationId: string) => Promise<void>;
  retryFailedMessage: (uiMessageKey: string) => Promise<RetryFailedMessageResult>;
  loadOlderMessages: () => Promise<void>;
  openHistoryPanel: (conversationId?: string) => Promise<void>;
  closeHistoryPanel: () => void;
  setHistoryPanelScope: (scope: HistoryPanelMode) => Promise<void>;
  setHistoryPanelDay: (day?: string) => Promise<void>;
  setHistoryPanelSenderId: (senderId?: string) => Promise<void>;
  loadHistoryMessages: (options?: { cursor?: string; direction?: "next" | "prev" }) => Promise<void>;
  refreshSeatSummaries: () => Promise<void>;
  pollWorkbench: () => Promise<boolean>;
  dismissSmartReply: (message: ChatMessage) => void;
  requestSmartReplyGeneralAnswer: (
    message: ChatMessage,
    options?: { force?: boolean },
  ) => Promise<void>;
  requestSmartReplyMakeShorter: (message: ChatMessage) => Promise<void>;
  sendSmartReply: (
    message: ChatMessage,
    payload: SmartReplySendPayload,
  ) => Promise<SendMessageResult>;
  updateMessageDownloadContent: (
    conversationId: string,
    uiMessageKey: string,
    contentPatch: DownloadContentPatch,
  ) => void;
  confirmVoicePlaybackReady: (
    conversationId: string,
    uiMessageKey: string,
    playbackUrl: string,
  ) => Promise<void>;
  transcribeVoiceMessage: (
    conversationId: string,
    uiMessageKey: string,
  ) => Promise<string>;
  searchKeyword: string;
  searchResults: import("@chatai/contracts").WorkbenchSearchResponseDto | null;
  isSearchLoading: boolean;
  setSearchKeyword: (keyword: string) => void;
  triggerSearch: (seatIdOverride?: string) => Promise<void>;
  selectOrCreateAndSelectConversation: (
    item: import("@chatai/contracts").WorkbenchSearchContactResultDto | import("@chatai/contracts").WorkbenchSearchGroupResultDto,
  ) => Promise<void>;
  conversationOpenError?: string;
  dismissConversationOpenError: () => void;
  composerDraftsByConversationId: Record<string, ConversationComposerDraft>;
  saveComposerDraft: (
    conversationId: string,
    draft: ConversationComposerDraft,
  ) => void;
  clearComposerDraft: (conversationId: string) => void;
};

type WorkbenchStore = WorkbenchState;

type DownloadContentPatch = {
  downloadStatus?: "ing" | "finished" | "failed";
  fileUrlExpireTime?: number;
  fileUrl?: string;
  updatedAtMs?: number;
};

type VoicePlaybackContentPatch = {
  playbackUrl: string;
  transFileUrl: string;
  transFileUrlPersisted: true;
};

type VoiceTranscriptionContentPatch = {
  transVoiceText: string;
};

const defaultCustomerProfiles = seedCustomerProfiles;
const MESSAGE_PAGE_SIZE = 50;
const FULL_AUTO_ANSWER_POLL_INTERVAL_MS = 1000;
const FULL_AUTO_RECENT_CUSTOMER_MESSAGE_WINDOW_MS = 2 * 60 * 1000;
const FULL_AUTO_TERMINAL_STATUS_RESET_MS = 5000;
const FULL_AUTO_SEMANTIC_WAIT_TIMEOUT_MS = SMART_REPLY_SEMANTIC_WAIT_TIMEOUT_MS;
const CONVERSATION_MODES = ["single", "group"] as const satisfies readonly ChatMode[];
const GROUP_MEMBERS_CACHE_TTL_MS = 5 * 60 * 1000;
const REVOKE_PENDING_TIMEOUT_MS = 10 * 1000;
export const MAX_CONVERSATION_LIST_CACHE_SEATS = 3;

function createInitialState(): Omit<
  WorkbenchState,
  | "deleteConversation"
  | "clearActiveConversation"
  | "resetWorkbenchSession"
  | "initializeWorkbench"
  | "markConversationRead"
  | "pinConversation"
  | "setActiveAccount"
  | "setActiveConversation"
  | "setActiveMode"
  | "loadActiveGroupMembers"
  | "loadUnreadConversations"
  | "markConversationUnread"
  | "sendAgentMessageSegments"
  | "sendAgentTextMessage"
  | "setChatSendPermission"
  | "setSidebarItems"
  | "takeOverAccount"
  | "unpinConversation"
  | "retryFailedMessage"
  | "revokeMessage"
  | "loadOlderMessages"
  | "openHistoryPanel"
  | "closeHistoryPanel"
  | "setHistoryPanelScope"
  | "setHistoryPanelDay"
  | "setHistoryPanelSenderId"
  | "loadHistoryMessages"
  | "refreshSeatSummaries"
  | "pollWorkbench"
  | "dismissSmartReply"
  | "requestSmartReplyGeneralAnswer"
  | "requestSmartReplyMakeShorter"
  | "sendSmartReply"
  | "updateMessageDownloadContent"
  | "confirmVoicePlaybackReady"
  | "transcribeVoiceMessage"
  | "changeActiveSeatAgentMode"
  | "changeActiveConversationFullAuto"
  | "syncFullAutoAgentStatus"
  | "dismissFullAutoActionError"
  | "resetWorkbenchRuntime"
  | "dismissScopeTransitionError"
  | "dismissReadReceiptError"
  | "setSearchKeyword"
  | "triggerSearch"
  | "selectOrCreateAndSelectConversation"
  | "dismissConversationOpenError"
  | "saveComposerDraft"
  | "clearComposerDraft"
> {
  return {
    accounts: [],
    activeAccountId: "",
    activeConversationId: "",
    activeMessageSeq: 0,
    activeMode: "single",
    bootstrapError: undefined,
    bootstrapStatus: "idle",
    hasChatSendPermission: false,
    conversationListCacheSeatOrder: [],
    conversationListsByScope: {},
    conversationModeLoadedAtByScope: {},
    hasMoreUnreadByScope: {},
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
    smartReplyAutoPendingMessageKeysByConversationId: {},
    smartReplyAutoSkippedMessageKeysByConversationId: {},
    smartReplyByMessageIdByConversationId: {},
    smartReplyHiddenMessageKeysByConversationId: {},
    smartReplyPendingMessageKeysByConversationId: {},
    smartReplyLastPolledAtByConversationId: {},
    pendingMessages: [],
    pollState: {
      intervalMs: 2500,
      jitterMs: 350,
      status: "idle",
    },
    fullAutoActionError: undefined,
    fullAutoActionPending: false,
    fullAutoStatusByConversationId: {},
    seatAgentModeActionPending: false,
    readReceiptError: undefined,
    scopeTransitionError: undefined,
    sendStatusByConversationId: {},
    sinceVersion: 0,
    messageUpdateCursor: undefined,
    seatUpdateCursor: undefined,
    isPollBaselineFresh: false,
    sidebarItems: [],
    takeoverStatusByAccountId: {},
    searchKeyword: "",
    searchResults: null,
    isSearchLoading: false,
    conversationOpenError: undefined,
    composerDraftsByConversationId: {},
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
  return messages.reduce((max, message) => Math.max(max, message.seq ?? 0), 0);
}

function getOptimisticAccountSwitchState(
  state: WorkbenchStore,
  accountId: string,
) {
  const cachedConversations = state.conversationListsByScope[accountId] ?? [];
  const nextConversationId = getFirstVisibleConversationId(
    cachedConversations,
    state.activeMode,
  );

  return {
    activeAccountId: accountId,
    activeConversationId: nextConversationId,
    activeMessageSeq: getActiveMessageSeq(
      state.messagesByConversationId,
      nextConversationId,
    ),
  };
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
  preserveConversation?: Conversation,
) {
  const nextModeList = preserveConversation
    ? mergeConversationList(nextModeConversations, preserveConversation).filter(
        (conversation) => conversation.mode === mode,
      )
    : nextModeConversations;

  return sortConversations([
    // The reloaded list already carries the preserved conversation when needed.
    ...currentList.filter((conversation) => conversation.mode !== mode),
    ...nextModeList,
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

function applyAccountUnreadSummary(
  accounts: Account[],
  accountId: string,
  unreadSummary: { group: number; single: number; total: number } | undefined,
) {
  if (!unreadSummary) {
    return accounts;
  }

  let changed = false;
  const nextAccounts = accounts.map((account) => {
    if (account.id !== accountId) {
      return account;
    }

    if (
      account.unreadCount === unreadSummary.total &&
      account.singleUnreadCount === unreadSummary.single &&
      account.groupUnreadCount === unreadSummary.group
    ) {
      return account;
    }

    changed = true;
    return {
      ...account,
      groupUnreadCount: unreadSummary.group,
      singleUnreadCount: unreadSummary.single,
      unreadCount: unreadSummary.total,
    };
  });

  return changed ? nextAccounts : accounts;
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

function mergeConversationLists(
  currentList: Conversation[],
  conversations: Conversation[],
) {
  return conversations.reduce(
    (nextList, conversation) => mergeConversationList(nextList, conversation),
    currentList,
  );
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
  options?: { markAppendedAsNew?: boolean },
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
          revokePending: false,
        };
      } else {
        const appendedIndex = findRevokedMessageIndex(appendedMessages, nextMessage);

        if (appendedIndex >= 0) {
          appendedMessages[appendedIndex] = {
            ...appendedMessages[appendedIndex],
            isRevoked: true,
            revokePending: false,
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
        revokePending: nextMessage.isRevoked
          ? false
          : currentMessage.revokePending,
        sender: {
          ...currentMessage.sender,
          ...nextSender,
          avatarUrl: nextSender.avatarUrl || currentMessage.sender.avatarUrl,
          name: nextSender.name || currentMessage.sender.name,
          userId: nextSender.userId || currentMessage.sender.userId,
        },
        senderDisplayName:
          nextMessage.senderDisplayName ?? currentMessage.senderDisplayName,
        author: nextMessage.author || currentMessage.author,
      };
      continue;
    }

    appendedMessages.push(
      options?.markAppendedAsNew && nextMessage.role !== "system"
        ? { ...nextMessage, isNew: true }
        : nextMessage,
    );
  }

  return [...merged, ...sortMessagesForAppend(appendedMessages)];
}

function hasNewCustomerMessage(
  currentMessages: Message[],
  nextMessages: Message[],
) {
  return nextMessages.some(
    (nextMessage) =>
      nextMessage.role === "customer" &&
      !currentMessages.some((currentMessage) =>
        isSameMessage(currentMessage, nextMessage),
      ),
  );
}

function hasConversationUnreadIncrease(
  conversations: Conversation[],
  nextConversation: Conversation,
) {
  const currentConversation = conversations.find(
    (conversation) => conversation.id === nextConversation.id,
  );

  return nextConversation.unread > (currentConversation?.unread ?? 0);
}

function omitPendingSmartReplyKey(
  pending: Record<string, true>,
  lookupKey: string,
) {
  const { [lookupKey]: _removed, ...restPending } = pending;

  return restPending;
}

function mapSmartReplyPendingKeys(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, true as const]));
}

function mapSmartReplyPendingKeysFromSuggestions(
  suggestions: Record<string, SmartReplySuggestion>,
  options?: { hidden?: Record<string, true> },
) {
  return mapSmartReplyPendingKeys(
    collectSmartReplyPendingKeysFromSuggestions(suggestions).filter(
      (key) => !options?.hidden?.[key],
    ),
  );
}

function buildSmartReplyHiddenKeys(
  messages: Message[],
  suggestions: Record<string, SmartReplySuggestion>,
) {
  const hidden: Record<string, true> = {};

  for (const [key, suggestion] of Object.entries(suggestions)) {
    if (
      isSmartReplyGenerationFailed(suggestion) ||
      isSmartReplyKnowledgeMiss(suggestion)
    ) {
      // Historical terminal failures are kept for auto-generation guards but
      // hidden from the chat feed because they are not useful operator replies.
      hidden[key] = true;
      continue;
    }

    const messageIndex = messages.findIndex(
      (message) => getSmartReplyLookupKey(message) === key,
    );

    if (messageIndex < 0) {
      continue;
    }

    const hasAgentReplyAfter = messages
      .slice(messageIndex + 1)
      .some((message) => message.role === "agent");

    if (hasAgentReplyAfter) {
      hidden[key] = true;
    }
  }

  return hidden;
}

function omitSmartReplyHiddenKeysForSuggestions(
  hidden: Record<string, true>,
  suggestions: Record<string, SmartReplySuggestion>,
) {
  let nextHidden = hidden;

  for (const key of Object.keys(suggestions)) {
    nextHidden = omitSmartReplyHiddenKey(nextHidden, key);
  }

  return nextHidden;
}

function omitSmartReplyHiddenKey(
  hidden: Record<string, true>,
  lookupKey: string,
) {
  const { [lookupKey]: _removed, ...restHidden } = hidden;

  return restHidden;
}

function getPageSmartReplies(page: WorkbenchConversationPage) {
  const eligibleMessageKeys = new Set(
    page.messages
      .filter(
        (message): message is ChatMessage =>
          Boolean(message) &&
          message.role !== "system" &&
          hasSmartReplyTriggerRawMsgtype(message),
      )
      .map((message) => getSmartReplyLookupKey(message)),
  );

  return filterSmartReplyRecordByKeys(page.smartReplies, eligibleMessageKeys);
}

function getPageSmartRepliesForConversation(
  state: WorkbenchState,
  page: WorkbenchConversationPage,
) {
  if (!canDisplaySmartReplyForConversation(state, page.conversationId)) {
    return {};
  }

  return getPageSmartReplies(page);
}

function getSmartReplyTimerKey(conversationId: string, lookupKey: string) {
  return `${conversationId}:${lookupKey}`;
}

function createSmartReplyTimeoutSuggestion(
  previous: SmartReplySuggestion | undefined,
): SmartReplySuggestion {
  return {
    assistantName: previous?.assistantName ?? "智能助手",
    content: previous?.content ?? "",
    failReason: "智能回复生成超时，请稍后重试",
    generateStatus: 3,
    pollComplete: true,
    refAttachIds: previous?.refAttachIds,
    status: undefined,
    recordId: previous?.recordId,
  };
}

function createSkippedSmartReplySuggestion(
  previous: SmartReplySuggestion | undefined,
): SmartReplySuggestion {
  return {
    assistantName: previous?.assistantName ?? "智能助手",
    content: "",
    failReason: SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT,
    generateStatus: 3,
    pollComplete: true,
    refAttachIds: previous?.refAttachIds,
    status: undefined,
    recordId: previous?.recordId,
  };
}

function filterSmartReplyRecordByKeys<T>(
  record: Record<string, T>,
  retainedKeys: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => retainedKeys.has(key)),
  ) as Record<string, T>;
}

function pruneSmartReplyStateToExistingMessages(input: {
  hidden?: Record<string, true>;
  messages: Message[];
  pending: Record<string, true>;
  suggestions: Record<string, SmartReplySuggestion>;
}) {
  const retainedKeys = new Set(
    input.messages
      .filter((message) => message && message.role !== "system")
      .map((message) => getSmartReplyLookupKey(message)),
  );

  return {
    hidden: filterSmartReplyRecordByKeys(input.hidden ?? {}, retainedKeys),
    pending: filterSmartReplyRecordByKeys(input.pending, retainedKeys),
    suggestions: filterSmartReplyRecordByKeys(input.suggestions, retainedKeys),
  };
}

function getLatestNonSystemMessage(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role !== "system") {
      return message;
    }
  }

  return undefined;
}

function shouldAutoGenerateSmartReply(input: {
  message?: Message;
  autoPending?: Record<string, true>;
  autoSkipped?: Record<string, true>;
  pending: Record<string, true>;
  suggestions: Record<string, SmartReplySuggestion>;
}) {
  const {
    autoPending = {},
    autoSkipped = {},
    message,
    pending,
    suggestions,
  } = input;

  if (!message || message.role === "system" || !isSmartReplyEligibleMessage(message)) {
    return undefined;
  }

  const lookupKey = getSmartReplyLookupKey(message);

  if (
    autoPending[lookupKey] ||
    autoSkipped[lookupKey] ||
    pending[lookupKey] ||
    suggestions[lookupKey]
  ) {
    return undefined;
  }

  return message;
}

function getLatestSmartReplyEligibleMessageKey(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message && message.role !== "system" && isSmartReplyEligibleMessage(message)) {
      return getSmartReplyLookupKey(message);
    }
  }

  return undefined;
}

function pruneSemanticWaitSmartReplyPendingKeys(input: {
  messages: Message[];
  pending: Record<string, true>;
  requestedMsgIds: number[];
  suggestions: Record<string, SmartReplySuggestion>;
}) {
  const nextPending = { ...input.pending };
  const latestEligibleKey = getLatestSmartReplyEligibleMessageKey(input.messages);

  for (const msgId of input.requestedMsgIds) {
    const lookupKey = String(msgId);
    const suggestion = input.suggestions[lookupKey];

    if (!isSmartReplySemanticWait(suggestion)) {
      continue;
    }

    if (isSmartReplySemanticWaitExpired(suggestion) || lookupKey !== latestEligibleKey) {
      delete nextPending[lookupKey];
    }
  }

  return nextPending;
}

function collectSmartReplyPendingMsgIds(pending: Record<string, true>) {
  return Object.keys(pending)
    .map((key) => Number(key))
    .filter((msgId) => Number.isSafeInteger(msgId) && msgId > 0);
}

function areSmartReplyPendingRecordsEqual(
  left: Record<string, true>,
  right: Record<string, true>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => right[key] === true)
  );
}

function mergeSmartReplyPollResult(
  previousSuggestions: Record<string, SmartReplySuggestion>,
  previousPending: Record<string, true>,
  nextSuggestions: Record<string, SmartReplySuggestion>,
  messages: Message[],
  requestedMsgIds: number[],
  options: { allowAnswered?: boolean } = {},
) {
  const nextPending = { ...previousPending };
  const mergedSuggestions = { ...previousSuggestions };
  const unansweredKeys = new Set(
    collectUnansweredSmartReplyPendingKeys(messages, Number.POSITIVE_INFINITY),
  );
  const returnedMsgIdKeys = new Set(Object.keys(nextSuggestions));

  for (const msgId of requestedMsgIds) {
    const lookupKey = String(msgId);

    if (
      !returnedMsgIdKeys.has(lookupKey) &&
      !options.allowAnswered &&
      !unansweredKeys.has(lookupKey)
    ) {
      delete nextPending[lookupKey];
    }
  }

  for (const [msgIdKey, suggestion] of Object.entries(nextSuggestions)) {
    if (isSmartReplyPollComplete(suggestion)) {
      delete nextPending[msgIdKey];
    }

    if (!options.allowAnswered && !unansweredKeys.has(msgIdKey)) {
      delete nextPending[msgIdKey];
      continue;
    }

    if (isSmartReplyPollComplete(previousSuggestions[msgIdKey])) {
      continue;
    }

    mergedSuggestions[msgIdKey] = suggestion;
  }

  return {
    pending: pruneSemanticWaitSmartReplyPendingKeys({
      messages,
      pending: nextPending,
      requestedMsgIds,
      suggestions: mergedSuggestions,
    }),
    suggestions: mergedSuggestions,
  };
}

function findConversationById(
  conversationListsByScope: WorkbenchState["conversationListsByScope"],
  conversationId: string,
) {
  return Object.values(conversationListsByScope)
    .flat()
    .find((conversation) => conversation.id === conversationId);
}

function canUseSmartReplyForConversation(
  state: WorkbenchState,
  conversationId: string,
) {
  if (!canDisplaySmartReplyForConversation(state, conversationId)) {
    return false;
  }

  const conversation = findConversationById(
    state.conversationListsByScope,
    conversationId,
  );

  if (!conversation) {
    return false;
  }

  const account = state.accounts.find(
    (item) => item.id === conversation.accountId,
  );

  return canUseConversationActions(state, account);
}

export function canDisplaySmartReplyForConversation(
  state: WorkbenchState,
  conversationId: string,
) {
  const conversation = findConversationById(
    state.conversationListsByScope,
    conversationId,
  );

  if (conversation) {
    if (isConversationAIHostingEnabledInState(state, conversation)) {
      return false;
    }

    const account = state.accounts.find(
      (item) => item.id === conversation.accountId,
    );

    return (
      isSmartReplySupportedConversation(conversation) &&
      account?.seatAIAssistantEnabled === true &&
      conversation.bizStatus === 1
    );
  }

  return false;
}

function scheduleSmartReplyPoll(
  get: () => WorkbenchStore,
  set: (
    partial:
      | Partial<WorkbenchStore>
      | ((state: WorkbenchStore) => Partial<WorkbenchStore>),
  ) => void,
  conversationId: string,
  options?: {
    force?: boolean;
    clearPollTimer?: (conversationId: string) => void;
    scheduleNextPoll?: (conversationId: string) => void;
    syncRuntimeTimers?: (
      conversationId: string,
      pending: Record<string, true>,
    ) => void;
  },
) {
  const state = get();

  if (!canUseSmartReplyForConversation(state, conversationId)) {
    return;
  }

  const lastPolledAt = state.smartReplyLastPolledAtByConversationId[conversationId];

  if (
    !options?.force &&
    lastPolledAt != null &&
    Date.now() - lastPolledAt < SMART_REPLY_POLL_INTERVAL_MS
  ) {
    return;
  }

  const messages = state.messagesByConversationId[conversationId] ?? [];
  const suggestions =
    state.smartReplyByMessageIdByConversationId[conversationId] ?? {};
  const pending =
    state.smartReplyPendingMessageKeysByConversationId[conversationId] ?? {};
  const prunedPending = pruneSemanticWaitSmartReplyPendingKeys({
    messages,
    pending,
    requestedMsgIds: collectSmartReplyPendingMsgIds(pending),
    suggestions,
  });

  if (!areSmartReplyPendingRecordsEqual(pending, prunedPending)) {
    set((currentState) => {
      const currentPending =
        currentState.smartReplyPendingMessageKeysByConversationId[conversationId] ??
        {};
      const currentPrunedPending = pruneSemanticWaitSmartReplyPendingKeys({
        messages: currentState.messagesByConversationId[conversationId] ?? [],
        pending: currentPending,
        requestedMsgIds: collectSmartReplyPendingMsgIds(currentPending),
        suggestions:
          currentState.smartReplyByMessageIdByConversationId[conversationId] ?? {},
      });

      if (areSmartReplyPendingRecordsEqual(currentPending, currentPrunedPending)) {
        return currentState;
      }

      return {
        smartReplyPendingMessageKeysByConversationId: {
          ...currentState.smartReplyPendingMessageKeysByConversationId,
          [conversationId]: currentPrunedPending,
        },
      };
    });
  }

  const hidden =
    state.smartReplyHiddenMessageKeysByConversationId[conversationId] ?? {};
  const msgIds = collectPendingSmartReplyPollMsgIds(
    messages,
    suggestions,
    prunedPending,
    undefined,
    {
      allowKeys: new Set(
        Object.keys(prunedPending).filter((key) => !hidden[key]),
      ),
    },
  );

  options?.syncRuntimeTimers?.(conversationId, prunedPending);

  if (msgIds.length === 0) {
    options?.clearPollTimer?.(conversationId);
    return;
  }

  options?.clearPollTimer?.(conversationId);

  set((currentState) => ({
    smartReplyLastPolledAtByConversationId: {
      ...currentState.smartReplyLastPolledAtByConversationId,
      [conversationId]: Date.now(),
    },
  }));

  void pollSmartReplies(
    {
      conversationId,
      msgIds,
    },
    messages,
    suggestions,
  )
    .then((smartReplyByMessageId) => {
      set((currentState) => {
        if (currentState.activeConversationId !== conversationId) {
          return currentState;
        }

        const previousSuggestions =
          currentState.smartReplyByMessageIdByConversationId[conversationId] ?? {};
        const previousPending =
          currentState.smartReplyPendingMessageKeysByConversationId[conversationId] ?? {};
        const previousHidden =
          currentState.smartReplyHiddenMessageKeysByConversationId[conversationId] ??
          {};
        const merged = mergeSmartReplyPollResult(
          previousSuggestions,
          previousPending,
          smartReplyByMessageId,
          currentState.messagesByConversationId[conversationId] ?? [],
          msgIds,
          { allowAnswered: true },
        );
        options?.syncRuntimeTimers?.(conversationId, merged.pending);

        return {
          smartReplyByMessageIdByConversationId: {
            ...currentState.smartReplyByMessageIdByConversationId,
            [conversationId]: merged.suggestions,
          },
          smartReplyPendingMessageKeysByConversationId: {
            ...currentState.smartReplyPendingMessageKeysByConversationId,
            [conversationId]: merged.pending,
          },
          smartReplyHiddenMessageKeysByConversationId: {
            ...currentState.smartReplyHiddenMessageKeysByConversationId,
            [conversationId]: omitSmartReplyHiddenKeysForSuggestions(
              previousHidden,
              smartReplyByMessageId,
            ),
          },
        };
      });

      const latestState = get();
      const latestPending =
        latestState.smartReplyPendingMessageKeysByConversationId[conversationId] ?? {};

      if (
        latestState.activeConversationId === conversationId &&
        Object.keys(latestPending).length > 0
      ) {
        options?.scheduleNextPoll?.(conversationId);
      } else {
        options?.clearPollTimer?.(conversationId);
      }
    })
    .catch(() => {
      const latestState = get();
      const latestPending =
        latestState.smartReplyPendingMessageKeysByConversationId[conversationId] ?? {};

      if (
        latestState.activeConversationId === conversationId &&
        Object.keys(latestPending).length > 0
      ) {
        options?.syncRuntimeTimers?.(conversationId, latestPending);
        options?.scheduleNextPoll?.(conversationId);
      } else {
        options?.clearPollTimer?.(conversationId);
      }
    });
}

function triggerSmartReplyAutoGeneration(
  get: () => WorkbenchStore,
  set: (
    partial:
      | Partial<WorkbenchStore>
      | ((state: WorkbenchStore) => Partial<WorkbenchStore>),
  ) => void,
  conversationId: string,
  message: ChatMessage,
  options: {
    clearAutoPreviewTimeout: (conversationId: string, lookupKey: string) => void;
    scheduleAutoPreviewTimeout: (conversationId: string, lookupKey: string) => void;
    schedulePoll: (conversationId: string, options?: { force?: boolean }) => void;
    syncRuntimeTimers: (
      conversationId: string,
      pending: Record<string, true>,
    ) => void;
  },
) {
  const lookupKey = getSmartReplyLookupKey(message);
  const optimisticSuggestion = createTriggeredSmartReplySuggestion(message);

  set((currentState) => {
    if (currentState.activeConversationId !== conversationId) {
      return currentState;
    }

    return {
      smartReplyAutoPendingMessageKeysByConversationId: {
        ...currentState.smartReplyAutoPendingMessageKeysByConversationId,
        [conversationId]: {
          ...(currentState.smartReplyAutoPendingMessageKeysByConversationId[
            conversationId
          ] ?? {}),
          [lookupKey]: true,
        },
      },
    };
  });
  options.scheduleAutoPreviewTimeout(conversationId, lookupKey);

  void requestSmartReplyAutoGeneralAnswer(message, conversationId)
    .then(() => {
      if (get().activeConversationId !== conversationId) {
        options.clearAutoPreviewTimeout(conversationId, lookupKey);
        set((currentState) => {
          const autoPending =
            currentState.smartReplyAutoPendingMessageKeysByConversationId[
              conversationId
            ] ?? {};

          return {
            smartReplyAutoPendingMessageKeysByConversationId: {
              ...currentState.smartReplyAutoPendingMessageKeysByConversationId,
              [conversationId]: omitPendingSmartReplyKey(autoPending, lookupKey),
            },
          };
        });
        return;
      }

      let shouldSchedulePoll = false;

      set((currentState) => {
        const autoPending =
          currentState.smartReplyAutoPendingMessageKeysByConversationId[
            conversationId
          ] ?? {};
        const suggestions =
          currentState.smartReplyByMessageIdByConversationId[conversationId] ?? {};
        const pending =
          currentState.smartReplyPendingMessageKeysByConversationId[
            conversationId
          ] ?? {};
        const nextAutoPending = omitPendingSmartReplyKey(autoPending, lookupKey);

        if (!autoPending[lookupKey] || suggestions[lookupKey] || pending[lookupKey]) {
          return {
            smartReplyAutoPendingMessageKeysByConversationId: {
              ...currentState.smartReplyAutoPendingMessageKeysByConversationId,
              [conversationId]: nextAutoPending,
            },
          };
        }

        shouldSchedulePoll = true;

        return {
          smartReplyAutoPendingMessageKeysByConversationId: {
            ...currentState.smartReplyAutoPendingMessageKeysByConversationId,
            [conversationId]: nextAutoPending,
          },
          smartReplyByMessageIdByConversationId: {
            ...currentState.smartReplyByMessageIdByConversationId,
            [conversationId]: {
              ...suggestions,
              [lookupKey]: optimisticSuggestion,
            },
          },
          smartReplyPendingMessageKeysByConversationId: {
            ...currentState.smartReplyPendingMessageKeysByConversationId,
            [conversationId]: {
              ...pending,
              [lookupKey]: true,
            },
          },
        };
      });
      options.clearAutoPreviewTimeout(conversationId, lookupKey);
      if (!shouldSchedulePoll) {
        return;
      }

      options.syncRuntimeTimers(
        conversationId,
        get().smartReplyPendingMessageKeysByConversationId[conversationId] ?? {},
      );
      options.schedulePoll(conversationId, { force: true });
    })
    .catch((error) => {
      const shouldSkipRecommendation = isSmartReplyContentIncompleteSkipError(error);
      options.clearAutoPreviewTimeout(conversationId, lookupKey);

      set((currentState) => {
        if (currentState.activeConversationId !== conversationId) {
          return currentState;
        }

        const errorMessage =
          getRequestApiErrorMessage(error) ?? "智能回复生成失败，请稍后重试";
        const nextState: Partial<WorkbenchStore> = {
          smartReplyAutoPendingMessageKeysByConversationId: {
            ...currentState.smartReplyAutoPendingMessageKeysByConversationId,
            [conversationId]: omitPendingSmartReplyKey(
              currentState.smartReplyAutoPendingMessageKeysByConversationId[
                conversationId
              ] ?? {},
              lookupKey,
            ),
          },
          smartReplyPendingMessageKeysByConversationId: {
            ...currentState.smartReplyPendingMessageKeysByConversationId,
            [conversationId]: omitPendingSmartReplyKey(
              currentState.smartReplyPendingMessageKeysByConversationId[
                conversationId
              ] ?? {},
              lookupKey,
            ),
          },
        };

        if (shouldSkipRecommendation) {
          return {
            ...nextState,
            smartReplyByMessageIdByConversationId: {
              ...currentState.smartReplyByMessageIdByConversationId,
              [conversationId]: {
                ...(currentState.smartReplyByMessageIdByConversationId[
                  conversationId
                ] ?? {}),
                [lookupKey]: createSkippedSmartReplySuggestion(
                  currentState.smartReplyByMessageIdByConversationId[
                    conversationId
                  ]?.[lookupKey],
                ),
              },
            },
            smartReplyAutoSkippedMessageKeysByConversationId: {
              ...currentState.smartReplyAutoSkippedMessageKeysByConversationId,
              [conversationId]: {
                ...(currentState.smartReplyAutoSkippedMessageKeysByConversationId[
                  conversationId
                ] ?? {}),
                [lookupKey]: true,
              },
            },
          };
        }

        return {
          ...nextState,
          smartReplyByMessageIdByConversationId: {
            ...currentState.smartReplyByMessageIdByConversationId,
            [conversationId]: {
              ...(currentState.smartReplyByMessageIdByConversationId[conversationId] ??
                {}),
              [lookupKey]: {
                ...optimisticSuggestion,
                failReason: errorMessage,
                generateStatus: 3,
                pollComplete: true,
                status: undefined,
              },
            },
          },
        };
      });

      if (get().activeConversationId === conversationId) {
        options.syncRuntimeTimers(
          conversationId,
          get().smartReplyPendingMessageKeysByConversationId[conversationId] ?? {},
        );
      }
    });
}

async function revealSmartReplyOrPollOnce(
  get: () => WorkbenchStore,
  set: (
    partial:
      | Partial<WorkbenchStore>
      | ((state: WorkbenchStore) => Partial<WorkbenchStore>),
  ) => void,
  conversationId: string,
  message: ChatMessage,
) {
  const lookupKey = getSmartReplyLookupKey(message);
  const existingSuggestion =
    get().smartReplyByMessageIdByConversationId[conversationId]?.[lookupKey];

  if (existingSuggestion) {
    set((currentState) => ({
      smartReplyHiddenMessageKeysByConversationId: {
        ...currentState.smartReplyHiddenMessageKeysByConversationId,
        [conversationId]: omitSmartReplyHiddenKey(
          currentState.smartReplyHiddenMessageKeysByConversationId[
            conversationId
          ] ?? {},
          lookupKey,
        ),
      },
    }));

    return existingSuggestion;
  }

  const msgId = message.seq;

  if (!Number.isSafeInteger(msgId) || msgId == null || msgId <= 0) {
    return undefined;
  }

  const pollResult = await pollSmartReplies(
    {
      conversationId,
      msgIds: [msgId],
    },
    get().messagesByConversationId[conversationId] ?? [],
    {},
  );
  const polledSuggestion = pollResult[lookupKey];

  if (!polledSuggestion) {
    return undefined;
  }

  set((currentState) => ({
    smartReplyByMessageIdByConversationId: {
      ...currentState.smartReplyByMessageIdByConversationId,
      [conversationId]: {
        ...(currentState.smartReplyByMessageIdByConversationId[conversationId] ?? {}),
        [lookupKey]: polledSuggestion,
      },
    },
    smartReplyHiddenMessageKeysByConversationId: {
      ...currentState.smartReplyHiddenMessageKeysByConversationId,
      [conversationId]: omitSmartReplyHiddenKey(
        currentState.smartReplyHiddenMessageKeysByConversationId[
          conversationId
        ] ?? {},
        lookupKey,
      ),
    },
  }));

  return polledSuggestion;
}

function patchExistingMessageList(
  currentMessages: Message[],
  refreshedMessages: Message[],
) {
  if (!currentMessages.length || !refreshedMessages.length) {
    return currentMessages;
  }

  const merged = [...currentMessages];

  for (const refreshedMessage of refreshedMessages) {
    const existingIndex = merged.findIndex((message) =>
      isSameMessage(message, refreshedMessage),
    );

    if (existingIndex < 0) {
      continue;
    }

    const currentMessage = merged[existingIndex];

    if (currentMessage.role === "system" || refreshedMessage.role === "system") {
      merged[existingIndex] = {
        ...currentMessage,
        ...refreshedMessage,
      };
      continue;
    }

    merged[existingIndex] = {
      ...currentMessage,
      ...refreshedMessage,
      revokePending: refreshedMessage.isRevoked
        ? false
        : currentMessage.revokePending,
    };
  }

  return merged;
}

function patchDownloadMessageList(
  currentMessages: Message[],
  uiMessageKey: string,
  contentPatch: DownloadContentPatch,
) {
  return currentMessages.map((message) =>
    patchDownloadMessage(message, uiMessageKey, contentPatch),
  );
}

function patchDownloadMessage(
  message: Message,
  uiMessageKey: string,
  contentPatch: DownloadContentPatch,
): Message {
  if (!matchesMessageKey(message, uiMessageKey) || !isDownloadableMessage(message)) {
    return message;
  }

  if (message.content.type === "video") {
    return {
      ...message,
      ...(contentPatch.updatedAtMs === undefined
        ? {}
        : { updatedAtMs: contentPatch.updatedAtMs }),
      content: {
        ...message.content,
        ...(contentPatch.downloadStatus === undefined
          ? {}
          : { downloadStatus: contentPatch.downloadStatus }),
        ...(contentPatch.fileUrlExpireTime === undefined
          ? {}
          : { fileUrlExpireTime: contentPatch.fileUrlExpireTime }),
        ...(contentPatch.fileUrl === undefined
          ? {}
          : { videoUrl: contentPatch.fileUrl }),
      },
    };
  }

  if (message.content.type === "image") {
    return {
      ...message,
      ...(contentPatch.updatedAtMs === undefined
        ? {}
        : { updatedAtMs: contentPatch.updatedAtMs }),
      content: {
        ...message.content,
        ...(contentPatch.downloadStatus === undefined
          ? {}
          : { downloadStatus: contentPatch.downloadStatus }),
        ...(contentPatch.fileUrl === undefined
          ? {}
          : { imageUrl: contentPatch.fileUrl }),
      },
    };
  }

  return {
    ...message,
    ...(contentPatch.updatedAtMs === undefined
      ? {}
      : { updatedAtMs: contentPatch.updatedAtMs }),
    content: {
      ...message.content,
      ...(contentPatch.downloadStatus === undefined
        ? {}
        : { downloadStatus: contentPatch.downloadStatus }),
      ...(contentPatch.fileUrl === undefined ? {} : { fileUrl: contentPatch.fileUrl }),
    },
  };
}

function patchVoicePlaybackMessageList(
  currentMessages: Message[],
  uiMessageKey: string,
  contentPatch: VoicePlaybackContentPatch,
) {
  return currentMessages.map((message) =>
    patchVoicePlaybackMessage(message, uiMessageKey, contentPatch),
  );
}

function patchVoicePlaybackMessage(
  message: Message,
  uiMessageKey: string,
  contentPatch: VoicePlaybackContentPatch,
): Message {
  if (!matchesMessageKey(message, uiMessageKey) || !isVoiceMessage(message)) {
    return message;
  }

  return {
    ...message,
    content: {
      ...message.content,
      playbackUrl: contentPatch.playbackUrl,
      transFileUrl: contentPatch.transFileUrl,
      transFileUrlPersisted: contentPatch.transFileUrlPersisted,
    },
  };
}

function patchVoiceTranscriptionMessageList(
  currentMessages: Message[],
  uiMessageKey: string,
  contentPatch: VoiceTranscriptionContentPatch,
) {
  return currentMessages.map((message) =>
    patchVoiceTranscriptionMessage(message, uiMessageKey, contentPatch),
  );
}

function patchVoiceTranscriptionMessage(
  message: Message,
  uiMessageKey: string,
  contentPatch: VoiceTranscriptionContentPatch,
): Message {
  if (!matchesMessageKey(message, uiMessageKey) || !isVoiceMessage(message)) {
    return message;
  }

  return {
    ...message,
    content: {
      ...message.content,
      transVoiceText: contentPatch.transVoiceText,
    },
  };
}

function patchMessageRevokePendingList(
  currentMessages: Message[],
  uiMessageKey: string,
  revokePending: boolean,
) {
  return currentMessages.map((message) =>
    patchMessageRevokePending(message, uiMessageKey, revokePending),
  );
}

function patchMessageRevokePending(
  message: Message,
  uiMessageKey: string,
  revokePending: boolean,
): Message {
  if (!matchesMessageKey(message, uiMessageKey)) {
    return message;
  }

  return {
    ...message,
    revokePending,
  };
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
  if (!key || isInvalidMessageUiKey(key)) {
    return false;
  }

  return (
    message.uiMessageKey === key ||
    message.optNo === key ||
    (isValidMessageSeq(message.seq) && String(message.seq) === key)
  );
}

function sortMessagesForAppend(messages: Message[]) {
  return sortMessagesBySentAt(messages);
}

function isSameMessage(left: Message, right: Message) {
  return (
    (left.optNo && right.optNo && left.optNo === right.optNo) ||
    (
      isValidMessageSeq(left.seq) &&
      isValidMessageSeq(right.seq) &&
      left.seq === right.seq
    ) ||
    (
      left.uiMessageKey.length > 0 &&
      !isInvalidMessageUiKey(left.uiMessageKey) &&
      !isInvalidMessageUiKey(right.uiMessageKey) &&
      left.uiMessageKey === right.uiMessageKey
    )
  );
}

function parseWorkbenchTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return Number.NaN;
  }

  return parseWorkbenchDate(value)?.getTime() ?? Number.NaN;
}

function isCursorInvalidationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string; status?: number };

  return candidate.code === "WORKBENCH_CURSOR_INVALIDATED";
}

function applyReadResult(
  state: WorkbenchStore,
  conversationId: string,
  accountId: string,
) {
  const currentConversation = (state.conversationListsByScope[accountId] ?? []).find(
    (conversation) => conversation.id === conversationId,
  );
  const currentUnreadCount = currentConversation?.unread ?? 0;
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
            groupUnreadCount:
              currentConversation?.mode === "group"
                ? Math.max(0, (account.groupUnreadCount ?? 0) - currentUnreadCount)
                : account.groupUnreadCount,
            singleUnreadCount:
              currentConversation?.mode === "single"
                ? Math.max(0, (account.singleUnreadCount ?? 0) - currentUnreadCount)
                : account.singleUnreadCount,
            unreadCount: Math.max(
              0,
              (account.unreadCount ?? 0) - currentUnreadCount,
            ),
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
) {
  const currentConversation = (state.conversationListsByScope[accountId] ?? []).find(
    (conversation) => conversation.id === conversationId,
  );
  const currentUnreadCount = currentConversation?.unread ?? 0;
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
            groupUnreadCount:
              currentConversation?.mode === "group"
                ? Math.max(0, (account.groupUnreadCount ?? 0) + 1 - currentUnreadCount)
                : account.groupUnreadCount,
            singleUnreadCount:
              currentConversation?.mode === "single"
                ? Math.max(0, (account.singleUnreadCount ?? 0) + 1 - currentUnreadCount)
                : account.singleUnreadCount,
            unreadCount: Math.max(
              0,
              (account.unreadCount ?? 0) + 1 - currentUnreadCount,
            ),
          }
        : account,
    ),
    conversationListsByScope: {
      ...state.conversationListsByScope,
      [accountId]: nextConversations,
    },
  };
}

function applyConversationAIHostingSwitchResult(
  state: WorkbenchStore,
  conversationId: string,
  accountId: string,
  enabled: boolean,
) {
  return {
    conversationListsByScope: {
      ...state.conversationListsByScope,
      [accountId]: (state.conversationListsByScope[accountId] ?? []).map(
        (conversation): Conversation =>
          conversation.id === conversationId
            ? {
                ...conversation,
                conversationAIHostingSwitch: enabled,
                agentHostingStatus: enabled
                  ? undefined
                  : "exited",
              }
            : conversation,
      ),
    },
    fullAutoStatusByConversationId: enabled
      ? state.fullAutoStatusByConversationId
      : omitByKeys(state.fullAutoStatusByConversationId, [conversationId]),
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
    updatedAt,
    updatedAtMs,
  });
}

function buildOptimisticMessageContent(
  segment: ComposerSegment,
  quote?: SendQuotePayload,
): ChatMessage["content"] {
  if (quote && segment.type === "text") {
    return {
      quoteMsgId: quote.quoteMsgId,
      quotedMessage: quote.quotedMessage,
      text: segment.text,
      type: "quote",
    };
  }

  if (segment.type === "image") {
    const imageUrl = segment.imageUrl ?? segment.url ?? segment.localUrl ?? "";

    return {
      alt: segment.alt,
      height: segment.height,
      imageUrl,
      type: "image",
      width: segment.width,
    };
  }

  if (segment.type === "emotion") {
    return {
      alt: "自定义表情",
      imageUrl: segment.imageUrl,
      type: "image",
      variant: "emotion",
    };
  }

  if (segment.type === "file") {
    return {
      extension: segment.extension,
      fileName: segment.fileName,
      ...(segment.fileSizeLabel ? { fileSizeLabel: segment.fileSizeLabel } : {}),
      sourceLabel: "文件",
      type: "file",
    };
  }

  if (segment.type === "h5") {
    return {
      description: segment.desc ?? "",
      previewImageUrl: segment.coverUrl,
      sourceLabel: "链接",
      title: segment.title,
      type: "h5",
      url: segment.href,
    };
  }

  if (segment.type === "weapp") {
    return {
      appName: segment.appName ?? "小程序",
      coverImageUrl: segment.coverImageUrl,
      logoUrl: segment.logoUrl,
      sourceLabel: segment.sourceLabel ?? "小程序",
      title: segment.title ?? "小程序",
      type: "mini-program",
    };
  }

  if (segment.type === "sphfeed") {
    return {
      description: segment.description ?? "",
      imageUrl: segment.imageUrl,
      sourceLabel: segment.sourceLabel ?? "视频号",
      title: segment.title ?? "视频号",
      type: "sphfeed",
      url: segment.url,
    };
  }

  if (segment.type === "video") {
    return {
      alt: segment.title ?? "视频",
      coverImageUrl: normalizeMediaAssetUrl(segment.coverUrl),
      downloadStatus: "finished",
      durationLabel: "",
      type: "video",
      videoUrl: normalizeMediaAssetUrl(segment.url),
    };
  }

  if (segment.type === "text") {
    return {
      text: segment.text,
      type: "text",
    };
  }

  return {
    text: "",
    type: "text",
  };
}

function canRetryMessageContent(message: ChatMessage) {
  return (
    message.content.type === "text" ||
    message.content.type === "quote" ||
    message.content.type === "image" ||
    message.content.type === "file"
  );
}

function getRetryPreviewText(message: ChatMessage) {
  if (message.content.type === "text" || message.content.type === "quote") {
    return message.content.text;
  }

  if (message.content.type === "image") {
    return "[图片]";
  }

  if (message.content.type === "file") {
    return message.content.fileName || "[文件]";
  }

  return "";
}

function canUseConversationActions(state: WorkbenchState, account: Account | undefined) {
  return canUseWorkbenchConversationActions({
    account,
    hasSendPermission: state.hasChatSendPermission,
    me: state.me,
  });
}

function isConversationAIHostingEnabledInState(
  state: WorkbenchState,
  conversation: Conversation | undefined,
) {
  const account = state.accounts.find(
    (item) => item.id === conversation?.accountId,
  );

  return isConversationAIHostingEnabled(
    conversation,
    account?.seatAIHostingEnabled === true,
  );
}

function getLatestCustomerMessage(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role === "customer") {
      return message;
    }

    if (message?.role === "agent") {
      return undefined;
    }
  }

  return undefined;
}

function isFullAutoAnswerRecordForMessage(
  answerStatus: WorkbenchFullAutoAnswerStatusResponse,
  messageId: string,
) {
  return (
    answerStatus.recordId == null ||
    (answerStatus.analyseMsgId != null &&
      String(answerStatus.analyseMsgId) === messageId)
  );
}

function resolveFullAutoAnswerStatus(
  status: WorkbenchFullAutoAnswerStatusResponse,
): { isTerminal: boolean; status: AgentHostingStatus } {
  if (status.sendStatus === 2) {
    return { isTerminal: true, status: "sendFailed" };
  }

  if (status.sendStatus === 3) {
    return { isTerminal: true, status: "sendPartialFailed" };
  }

  if (status.genStatus === 4) {
    return { isTerminal: true, status: "handoff" };
  }

  if (status.genStatus === 5) {
    if (
      typeof status.createdAt === "number" &&
      Number.isFinite(status.createdAt) &&
      Date.now() - status.createdAt >= FULL_AUTO_SEMANTIC_WAIT_TIMEOUT_MS
    ) {
      return { isTerminal: true, status: "active" };
    }

    return { isTerminal: false, status: "waiting" };
  }

  if (status.genStatus === 3) {
    return { isTerminal: true, status: "failed" };
  }

  if (status.genStatus === 2 && status.sendStatus === 1) {
    return { isTerminal: true, status: "sent" };
  }

  if (status.genStatus === 2 && status.sendStatus === 0) {
    return { isTerminal: false, status: "sending" };
  }

  if (status.genStatus === 1) {
    return { isTerminal: false, status: "generating" };
  }

  if (status.genStatus === 0) {
    return { isTerminal: false, status: "waiting" };
  }

  return { isTerminal: false, status: "thinking" };
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
  const smartReplyClearedConversationIds = [...conversationIds];

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
    fullAutoStatusByConversationId: omitByKeys(
      state.fullAutoStatusByConversationId,
      clearedConversationIds,
    ),
    smartReplyAutoPendingMessageKeysByConversationId: omitByKeys(
      state.smartReplyAutoPendingMessageKeysByConversationId,
      smartReplyClearedConversationIds,
    ),
    smartReplyAutoSkippedMessageKeysByConversationId: omitByKeys(
      state.smartReplyAutoSkippedMessageKeysByConversationId,
      smartReplyClearedConversationIds,
    ),
    smartReplyByMessageIdByConversationId: omitByKeys(
      state.smartReplyByMessageIdByConversationId,
      smartReplyClearedConversationIds,
    ),
    smartReplyHiddenMessageKeysByConversationId: omitByKeys(
      state.smartReplyHiddenMessageKeysByConversationId,
      smartReplyClearedConversationIds,
    ),
    smartReplyPendingMessageKeysByConversationId: omitByKeys(
      state.smartReplyPendingMessageKeysByConversationId,
      smartReplyClearedConversationIds,
    ),
    smartReplyLastPolledAtByConversationId: omitByKeys(
      state.smartReplyLastPolledAtByConversationId,
      smartReplyClearedConversationIds,
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
    ...Object.keys(state.smartReplyHiddenMessageKeysByConversationId),
    ...Object.keys(state.historyStatusByConversationId),
    ...Object.keys(state.historyPanelByConversationId),
    ...Object.keys(state.historyPanelFiltersByConversationId),
    ...Object.keys(state.historyPanelLoadingByConversationId),
    ...Object.keys(state.historyPanelErrorByConversationId),
    ...Object.keys(state.historyPanelScrollModeByConversationId),
    ...Object.keys(state.smartReplyAutoPendingMessageKeysByConversationId),
    ...Object.keys(state.smartReplyAutoSkippedMessageKeysByConversationId),
    ...Object.keys(state.smartReplyByMessageIdByConversationId),
    ...Object.keys(state.smartReplyPendingMessageKeysByConversationId),
    ...Object.keys(state.smartReplyLastPolledAtByConversationId),
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
  let latestUnreadRequestId = 0;
  let latestPollRunId = 0;
  let runningPollRunId: number | undefined;
  let isPollWorkbenchRunning = false;
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const fullAutoPollInFlightConversationIds = new Set<string>();
  const fullAutoFinishedMessageByConversationId = new Map<
    string,
    FullAutoFinishedMessage
  >();
  const fullAutoPollTimersByConversationId = new Map<string, ReturnType<typeof setTimeout>>();
  const fullAutoResetTimersByConversationId = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingVoicePlaybackConfirmKeys = new Set<string>();
  const smartReplyPollTimersByConversationId = new Map<string, ReturnType<typeof setTimeout>>();
  const smartReplyAutoPreviewTimeoutsByKey = new Map<string, ReturnType<typeof setTimeout>>();
  const smartReplyTimeoutsByKey = new Map<string, ReturnType<typeof setTimeout>>();
  const latestTakeoverRequestIdByAccountId: Record<string, number> = {};
  const latestGroupMembersRequestIdByConversationId: Record<string, number> = {};
  const latestUnreadRequestIdByScope: Record<string, number> = {};
  const revokePendingTimeoutsByMessageId = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingRevokeRequestMessageIds = new Set<string>();

  function issueScopeRequestId() {
    latestScopeRequestId += 1;
    return latestScopeRequestId;
  }

  function bumpScopeRequestId() {
    latestScopeRequestId += 1;
  }

  function getScopeRequestId() {
    return latestScopeRequestId;
  }

  function isCurrentScopeRequest(requestId: number) {
    return requestId === latestScopeRequestId;
  }

  function isReadyScopeRequest(requestId: number, state: WorkbenchStore) {
    return isCurrentScopeRequest(requestId) && state.bootstrapStatus === "ready";
  }

  function buildAcceptedOptimisticMessageState(
    currentState: WorkbenchStore,
    input: {
      activeAccountId?: string;
      activeConversationId: string;
      optimisticMessage: Message;
      preview: string;
      previewTimestamp: number;
      minimumActiveMessageSeq?: number;
      removeMessageKeys?: string[];
    },
  ) {
    const currentMessages =
      currentState.messagesByConversationId[input.activeConversationId] ?? [];
    const shouldRemoveMessage = input.removeMessageKeys?.length
      ? (message: Message) =>
          input.removeMessageKeys?.some((key) => matchesMessageKey(message, key)) ??
          false
      : undefined;
    const nextMessages = [
      ...(shouldRemoveMessage
        ? currentMessages.filter((message) => !shouldRemoveMessage(message))
        : currentMessages),
      input.optimisticMessage,
    ];
    const currentConversations = input.activeAccountId
      ? currentState.conversationListsByScope[input.activeAccountId] ?? []
      : [];

    const nextActiveMessageSeq = getActiveMessageSeq(
      {
        ...currentState.messagesByConversationId,
        [input.activeConversationId]: nextMessages,
      },
      input.activeConversationId,
    );

    return {
      activeMessageSeq: Math.max(
        nextActiveMessageSeq,
        currentState.activeMessageSeq,
        input.minimumActiveMessageSeq ?? 0,
      ),
      ...(input.activeAccountId
        ? {
            conversationListsByScope: {
              ...currentState.conversationListsByScope,
              [input.activeAccountId]: updateConversationPreview(
                currentConversations,
                input.activeConversationId,
                input.preview,
                input.optimisticMessage.sentAt,
                input.previewTimestamp,
              ),
            },
          }
        : {}),
      messagesByConversationId: {
        ...currentState.messagesByConversationId,
        [input.activeConversationId]: nextMessages,
      },
      pendingMessages: [
        ...(shouldRemoveMessage
          ? currentState.pendingMessages.filter(
              (message) => !shouldRemoveMessage(message),
            )
          : currentState.pendingMessages),
        input.optimisticMessage,
      ],
    };
  }

  function issueUnreadRequestId(accountId: string, mode: ChatMode) {
    latestUnreadRequestId += 1;
    latestUnreadRequestIdByScope[`${accountId}:${mode}`] = latestUnreadRequestId;
    return latestUnreadRequestId;
  }

  function isCurrentUnreadRequest(
    accountId: string,
    mode: ChatMode,
    requestId: number,
  ) {
    return latestUnreadRequestIdByScope[`${accountId}:${mode}`] === requestId;
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

  function clearRevokePendingTimeout(uiMessageKey: string) {
    const timeoutId = revokePendingTimeoutsByMessageId.get(uiMessageKey);

    if (timeoutId) {
      clearTimeout(timeoutId);
      revokePendingTimeoutsByMessageId.delete(uiMessageKey);
    }
  }

  function clearSmartReplyPollTimer(conversationId: string) {
    const timer = smartReplyPollTimersByConversationId.get(conversationId);

    if (timer) {
      clearTimeout(timer);
      smartReplyPollTimersByConversationId.delete(conversationId);
    }
  }

  function clearFullAutoPollTimer(conversationId: string) {
    const timer = fullAutoPollTimersByConversationId.get(conversationId);

    if (timer) {
      clearTimeout(timer);
      fullAutoPollTimersByConversationId.delete(conversationId);
    }
  }

  function clearFullAutoResetTimer(conversationId: string) {
    const timer = fullAutoResetTimersByConversationId.get(conversationId);

    if (timer) {
      clearTimeout(timer);
      fullAutoResetTimersByConversationId.delete(conversationId);
    }
  }

  function clearFullAutoRuntime(conversationId: string) {
    clearFullAutoPollTimer(conversationId);
    clearFullAutoResetTimer(conversationId);
    fullAutoPollInFlightConversationIds.delete(conversationId);
  }

  function clearSmartReplyTimeout(conversationId: string, lookupKey: string) {
    const timerKey = getSmartReplyTimerKey(conversationId, lookupKey);
    const timer = smartReplyTimeoutsByKey.get(timerKey);

    if (timer) {
      clearTimeout(timer);
      smartReplyTimeoutsByKey.delete(timerKey);
    }
  }

  function clearSmartReplyAutoPreviewTimeout(
    conversationId: string,
    lookupKey: string,
  ) {
    const timerKey = getSmartReplyTimerKey(conversationId, lookupKey);
    const timer = smartReplyAutoPreviewTimeoutsByKey.get(timerKey);

    if (timer) {
      clearTimeout(timer);
      smartReplyAutoPreviewTimeoutsByKey.delete(timerKey);
    }
  }

  function clearSmartReplyRuntimeTimers(conversationId: string) {
    clearSmartReplyPollTimer(conversationId);

    for (const [timerKey, timer] of smartReplyAutoPreviewTimeoutsByKey.entries()) {
      if (timerKey.startsWith(`${conversationId}:`)) {
        clearTimeout(timer);
        smartReplyAutoPreviewTimeoutsByKey.delete(timerKey);
      }
    }

    for (const [timerKey, timer] of smartReplyTimeoutsByKey.entries()) {
      if (timerKey.startsWith(`${conversationId}:`)) {
        clearTimeout(timer);
        smartReplyTimeoutsByKey.delete(timerKey);
      }
    }
  }

  function clearAllRuntimeState() {
    bumpScopeRequestId();
    latestTakeoverRequestId += 1;
    latestGroupMembersRequestId += 1;
    runningPollRunId = undefined;
    isPollWorkbenchRunning = false;

    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }

    for (const timer of smartReplyPollTimersByConversationId.values()) {
      clearTimeout(timer);
    }
    smartReplyPollTimersByConversationId.clear();

    for (const timer of fullAutoPollTimersByConversationId.values()) {
      clearTimeout(timer);
    }
    fullAutoPollTimersByConversationId.clear();

    for (const timer of fullAutoResetTimersByConversationId.values()) {
      clearTimeout(timer);
    }
    fullAutoResetTimersByConversationId.clear();
    fullAutoPollInFlightConversationIds.clear();
    fullAutoFinishedMessageByConversationId.clear();

    for (const timer of smartReplyAutoPreviewTimeoutsByKey.values()) {
      clearTimeout(timer);
    }
    smartReplyAutoPreviewTimeoutsByKey.clear();

    for (const timer of smartReplyTimeoutsByKey.values()) {
      clearTimeout(timer);
    }
    smartReplyTimeoutsByKey.clear();

    for (const timeoutId of revokePendingTimeoutsByMessageId.values()) {
      clearTimeout(timeoutId);
    }
    revokePendingTimeoutsByMessageId.clear();

    pendingVoicePlaybackConfirmKeys.clear();
    pendingRevokeRequestMessageIds.clear();

    for (const accountId of Object.keys(latestTakeoverRequestIdByAccountId)) {
      delete latestTakeoverRequestIdByAccountId[accountId];
    }

    for (const conversationId of Object.keys(
      latestGroupMembersRequestIdByConversationId,
    )) {
      delete latestGroupMembersRequestIdByConversationId[conversationId];
    }
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
    function scheduleFullAutoStatusReset(conversationId: string) {
      clearFullAutoResetTimer(conversationId);

      const timeoutId = setTimeout(() => {
        fullAutoResetTimersByConversationId.delete(conversationId);
        set((state) => ({
          fullAutoStatusByConversationId: omitByKeys(
            state.fullAutoStatusByConversationId,
            [conversationId],
          ),
        }));
      }, FULL_AUTO_TERMINAL_STATUS_RESET_MS);

      fullAutoResetTimersByConversationId.set(conversationId, timeoutId);
    }

    async function pollFullAutoAnswerStatus(
      conversationId: string,
      lastCustomerMessageId: string,
      lastCustomerMessageAt: number,
    ) {
      if (fullAutoPollInFlightConversationIds.has(conversationId)) {
        return;
      }

      const currentState = get();
      const conversation = getConversationById(currentState, conversationId);

      if (
        currentState.activeConversationId !== conversationId ||
        !isConversationAIHostingEnabledInState(currentState, conversation) ||
        conversation?.mode !== "single" ||
        Date.now() - lastCustomerMessageAt > FULL_AUTO_RECENT_CUSTOMER_MESSAGE_WINDOW_MS
      ) {
        clearFullAutoRuntime(conversationId);
        set((state) => ({
          fullAutoStatusByConversationId: omitByKeys(
            state.fullAutoStatusByConversationId,
            [conversationId],
          ),
        }));
        return;
      }

      fullAutoPollInFlightConversationIds.add(conversationId);

      try {
        const answerStatus = await getFullAutoAnswerStatus(conversationId);

        if (
          get().activeConversationId !== conversationId ||
          Date.now() - lastCustomerMessageAt > FULL_AUTO_RECENT_CUSTOMER_MESSAGE_WINDOW_MS
        ) {
          return;
        }

        const nextStatus = isFullAutoAnswerRecordForMessage(
          answerStatus,
          lastCustomerMessageId,
        )
          ? resolveFullAutoAnswerStatus(answerStatus)
          : { isTerminal: false, status: "thinking" as const };

        set((state) => ({
          fullAutoStatusByConversationId: {
            ...state.fullAutoStatusByConversationId,
            [conversationId]: {
              lastCustomerMessageAt,
              lastCustomerMessageId,
              status: nextStatus.status,
            },
          },
        }));

        if (nextStatus.isTerminal) {
          clearFullAutoPollTimer(conversationId);
          fullAutoFinishedMessageByConversationId.set(conversationId, {
            messageAt: lastCustomerMessageAt,
            messageId: lastCustomerMessageId,
          });
          scheduleFullAutoStatusReset(conversationId);
          return;
        }

        clearFullAutoPollTimer(conversationId);
        const timeoutId = setTimeout(() => {
          fullAutoPollTimersByConversationId.delete(conversationId);
          void pollFullAutoAnswerStatus(
            conversationId,
            lastCustomerMessageId,
            lastCustomerMessageAt,
          );
        }, FULL_AUTO_ANSWER_POLL_INTERVAL_MS);
        fullAutoPollTimersByConversationId.set(conversationId, timeoutId);
      } finally {
        fullAutoPollInFlightConversationIds.delete(conversationId);
      }
    }

    async function syncFullAutoAgentStatusForCurrentState() {
      const state = get();
      const conversationId = state.activeConversationId;

      if (!conversationId) {
        return;
      }

      const conversation = getConversationById(state, conversationId);

      if (
        !isConversationAIHostingEnabledInState(state, conversation) ||
        conversation?.mode !== "single"
      ) {
        clearFullAutoRuntime(conversationId);
        set((currentState) => ({
          fullAutoStatusByConversationId: omitByKeys(
            currentState.fullAutoStatusByConversationId,
            [conversationId],
          ),
        }));
        return;
      }

      const latestCustomerMessage = getLatestCustomerMessage(
        state.messagesByConversationId[conversationId] ?? [],
      );
      const lastCustomerMessageId =
        latestCustomerMessage?.seq != null
          ? String(latestCustomerMessage.seq)
          : latestCustomerMessage?.uiMessageKey;
      const lastCustomerMessageAt = latestCustomerMessage?.createdAtMs;

      if (
        !lastCustomerMessageId ||
        !lastCustomerMessageAt ||
        Date.now() - lastCustomerMessageAt > FULL_AUTO_RECENT_CUSTOMER_MESSAGE_WINDOW_MS
      ) {
        clearFullAutoRuntime(conversationId);
        set((currentState) => ({
          fullAutoStatusByConversationId: omitByKeys(
            currentState.fullAutoStatusByConversationId,
            [conversationId],
          ),
        }));
        return;
      }

      const currentFullAutoStatus =
        state.fullAutoStatusByConversationId[conversationId];

      const finishedMessage =
        fullAutoFinishedMessageByConversationId.get(conversationId);

      if (
        finishedMessage?.messageAt === lastCustomerMessageAt &&
        finishedMessage.messageId === lastCustomerMessageId
      ) {
        return;
      }

      if (
        currentFullAutoStatus?.lastCustomerMessageAt === lastCustomerMessageAt &&
        currentFullAutoStatus.lastCustomerMessageId === lastCustomerMessageId
      ) {
        return;
      }

      clearFullAutoRuntime(conversationId);
      fullAutoFinishedMessageByConversationId.delete(conversationId);
      set((currentState) => ({
        fullAutoStatusByConversationId: {
          ...currentState.fullAutoStatusByConversationId,
          [conversationId]: {
            lastCustomerMessageAt,
            lastCustomerMessageId,
            status: "thinking",
          },
        },
      }));

      await pollFullAutoAnswerStatus(
        conversationId,
        lastCustomerMessageId,
        lastCustomerMessageAt,
      );
    }

    function scheduleSmartReplyAutoPreviewTimeout(
      conversationId: string,
      lookupKey: string,
    ) {
      clearSmartReplyAutoPreviewTimeout(conversationId, lookupKey);

      const timerKey = getSmartReplyTimerKey(conversationId, lookupKey);
      const timeoutId = setTimeout(() => {
        smartReplyAutoPreviewTimeoutsByKey.delete(timerKey);

        set((currentState) => {
          const autoPending =
            currentState.smartReplyAutoPendingMessageKeysByConversationId[
              conversationId
            ] ?? {};

          if (!autoPending[lookupKey]) {
            return {};
          }

          const previousSuggestion =
            currentState.smartReplyByMessageIdByConversationId[conversationId]?.[
              lookupKey
            ];

          return {
            smartReplyAutoPendingMessageKeysByConversationId: {
              ...currentState.smartReplyAutoPendingMessageKeysByConversationId,
              [conversationId]: omitPendingSmartReplyKey(autoPending, lookupKey),
            },
            smartReplyByMessageIdByConversationId: {
              ...currentState.smartReplyByMessageIdByConversationId,
              [conversationId]: {
                ...(currentState.smartReplyByMessageIdByConversationId[
                  conversationId
                ] ?? {}),
                [lookupKey]: createSmartReplyTimeoutSuggestion(previousSuggestion),
              },
            },
          };
        });
      }, SMART_REPLY_BUSY_TIMEOUT_MS);

      smartReplyAutoPreviewTimeoutsByKey.set(timerKey, timeoutId);
    }

    function scheduleSmartReplyTimeout(conversationId: string, lookupKey: string) {
      clearSmartReplyTimeout(conversationId, lookupKey);

      const timerKey = getSmartReplyTimerKey(conversationId, lookupKey);
      const timeoutId = setTimeout(() => {
        smartReplyTimeoutsByKey.delete(timerKey);
        let nextPendingAfterTimeout: Record<string, true> | undefined;

        set((currentState) => {
          const pending =
            currentState.smartReplyPendingMessageKeysByConversationId[
              conversationId
            ] ?? {};

          if (!pending[lookupKey]) {
            return {};
          }

          nextPendingAfterTimeout = omitPendingSmartReplyKey(pending, lookupKey);
          const previousSuggestion =
            currentState.smartReplyByMessageIdByConversationId[conversationId]?.[
              lookupKey
            ];

          return {
            smartReplyByMessageIdByConversationId: {
              ...currentState.smartReplyByMessageIdByConversationId,
              [conversationId]: {
                ...(currentState.smartReplyByMessageIdByConversationId[
                  conversationId
                ] ?? {}),
                [lookupKey]: createSmartReplyTimeoutSuggestion(previousSuggestion),
              },
            },
            smartReplyPendingMessageKeysByConversationId: {
              ...currentState.smartReplyPendingMessageKeysByConversationId,
              [conversationId]: nextPendingAfterTimeout,
            },
          };
        });

        if (!nextPendingAfterTimeout) {
          return;
        }

        syncSmartReplyRuntimeTimers(conversationId, nextPendingAfterTimeout);

        if (
          get().activeConversationId === conversationId &&
          Object.keys(nextPendingAfterTimeout).length > 0
        ) {
          scheduleSmartReplyPollForConversation(conversationId, { force: true });
        } else {
          clearSmartReplyPollTimer(conversationId);
        }
      }, SMART_REPLY_BUSY_TIMEOUT_MS);

      smartReplyTimeoutsByKey.set(timerKey, timeoutId);
    }

    function syncSmartReplyRuntimeTimers(
      conversationId: string,
      pending: Record<string, true>,
    ) {
      for (const lookupKey of Object.keys(pending)) {
        const timerKey = getSmartReplyTimerKey(conversationId, lookupKey);

        if (!smartReplyTimeoutsByKey.has(timerKey)) {
          scheduleSmartReplyTimeout(conversationId, lookupKey);
        }
      }

      for (const [timerKey, timer] of smartReplyTimeoutsByKey.entries()) {
        if (!timerKey.startsWith(`${conversationId}:`)) {
          continue;
        }

        const lookupKey = timerKey.slice(conversationId.length + 1);

        if (!pending[lookupKey]) {
          clearTimeout(timer);
          smartReplyTimeoutsByKey.delete(timerKey);
        }
      }
    }

    function scheduleSmartReplyPollForConversation(
      conversationId: string,
      options?: { force?: boolean },
    ) {
      scheduleSmartReplyPoll(get, set, conversationId, {
        ...options,
        clearPollTimer: clearSmartReplyPollTimer,
        scheduleNextPoll: (targetConversationId) => {
          clearSmartReplyPollTimer(targetConversationId);

          const timeoutId = setTimeout(() => {
            smartReplyPollTimersByConversationId.delete(targetConversationId);
            scheduleSmartReplyPollForConversation(targetConversationId, {
              force: true,
            });
          }, SMART_REPLY_POLL_INTERVAL_MS);

          smartReplyPollTimersByConversationId.set(targetConversationId, timeoutId);
        },
        syncRuntimeTimers: syncSmartReplyRuntimeTimers,
      });
    }

    function scheduleRevokePendingTimeout(conversationId: string, uiMessageKey: string) {
      clearRevokePendingTimeout(uiMessageKey);

      const timeoutId = setTimeout(() => {
        revokePendingTimeoutsByMessageId.delete(uiMessageKey);

        set((currentState) => {
          const message = (currentState.messagesByConversationId[conversationId] ?? [])
            .find((item) => item.uiMessageKey === uiMessageKey);

          if (!message?.revokePending || message.isRevoked) {
            return {};
          }

          return {
            messagesByConversationId: {
              ...currentState.messagesByConversationId,
              [conversationId]: patchMessageRevokePendingList(
                currentState.messagesByConversationId[conversationId] ?? [],
                uiMessageKey,
                false,
              ),
            },
          };
        });
      }, REVOKE_PENDING_TIMEOUT_MS);

      revokePendingTimeoutsByMessageId.set(uiMessageKey, timeoutId);
    }

    function clearResolvedRevokePendingTimeouts(messages: Message[]) {
      messages
        .filter((message) => message.isRevoked)
        .forEach((message) => {
          clearRevokePendingTimeout(message.uiMessageKey);
        });
    }

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

      set((currentState) => {
        const conversationModeLoadedAtByScope = markAllConversationModesLoaded(
          currentState.conversationModeLoadedAtByScope,
          accountId,
          loadedAt,
        );
        const conversationListsByScope = {
          ...currentState.conversationListsByScope,
          [accountId]: result.conversations,
        };

        return {
          accounts: currentState.accounts,
          conversationModeLoadedAtByScope,
          conversationListsByScope,
          isPollBaselineFresh:
            currentState.activeAccountId === accountId
              ? true
              : currentState.isPollBaselineFresh,
          sinceVersion:
            currentState.activeAccountId === accountId
              ? result.pollBaseline
              : currentState.sinceVersion,
        };
      });
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

      if (!conversation || !account || !canUseConversationActions(state, account)) {
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

        const pageSmartReplyByMessageId = getPageSmartRepliesForConversation(
          get(),
          page,
        );
        const pageSmartReplyHidden = buildSmartReplyHiddenKeys(
          page.messages,
          pageSmartReplyByMessageId,
        );
        const pageSmartReplyPending = mapSmartReplyPendingKeysFromSuggestions(
          pageSmartReplyByMessageId,
          { hidden: pageSmartReplyHidden },
        );

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
          smartReplyPendingMessageKeysByConversationId: {
            ...currentState.smartReplyPendingMessageKeysByConversationId,
            [conversationId]: pageSmartReplyPending,
          },
          smartReplyByMessageIdByConversationId: {
            ...currentState.smartReplyByMessageIdByConversationId,
            [conversationId]: pageSmartReplyByMessageId,
          },
          smartReplyHiddenMessageKeysByConversationId: {
            ...currentState.smartReplyHiddenMessageKeysByConversationId,
            [conversationId]: pageSmartReplyHidden,
          },
          scopeTransitionError: undefined,
        }));

        await loadGroupMembersForConversation(conversationId, requestId);

        const latestState = get();
        const activeAccount = latestState.accounts.find(
          (account) => account.id === latestState.activeAccountId,
        );

        if (!canUseConversationActions(latestState, activeAccount)) {
          return;
        }

        await markActiveConversationRead(conversationId, requestId);
        scheduleSmartReplyPollForConversation(conversationId, {
          force: Object.keys(pageSmartReplyPending).length > 0,
        });

        const autoGenerateMessage = shouldAutoGenerateSmartReply({
          autoPending:
            get().smartReplyAutoPendingMessageKeysByConversationId[conversationId] ?? {},
          autoSkipped:
            get().smartReplyAutoSkippedMessageKeysByConversationId[conversationId] ?? {},
          message: getLatestNonSystemMessage(page.messages),
          pending: get().smartReplyPendingMessageKeysByConversationId[conversationId] ?? {},
          suggestions:
            get().smartReplyByMessageIdByConversationId[conversationId] ?? {},
        });

        if (
          autoGenerateMessage &&
          canUseSmartReplyForConversation(get(), conversationId)
        ) {
          triggerSmartReplyAutoGeneration(get, set, conversationId, autoGenerateMessage, {
            clearAutoPreviewTimeout: clearSmartReplyAutoPreviewTimeout,
            scheduleAutoPreviewTimeout: scheduleSmartReplyAutoPreviewTimeout,
            schedulePoll: scheduleSmartReplyPollForConversation,
            syncRuntimeTimers: syncSmartReplyRuntimeTimers,
          });
        }
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
      setChatSendPermission(hasChatSendPermission) {
        set({ hasChatSendPermission });
      },
      setSearchKeyword(keyword) {
        set({ searchKeyword: keyword });

        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
        }

        if (!keyword.trim()) {
          set({ searchResults: null, isSearchLoading: false });
          return;
        }

        // Capture seatId now so the debounce fires against the correct account
        // even if the user switches accounts within the 450 ms window.
        const seatIdAtSchedule = get().activeAccountId;

        set({ isSearchLoading: true });

        searchDebounceTimer = setTimeout(() => {
          void get().triggerSearch(seatIdAtSchedule ?? undefined);
        }, 450);
      },
      async triggerSearch(seatIdOverride?: string) {
        const keyword = get().searchKeyword;
        const seatId = seatIdOverride ?? get().activeAccountId;
        // If the account has changed since the debounce was scheduled, discard.
        if (!keyword.trim() || !seatId || seatId !== get().activeAccountId) {
          set({ searchResults: null, isSearchLoading: false });
          return;
        }

        set({ isSearchLoading: true });
        try {
          const service = getWorkbenchService();
          const results = await service.search(seatId, keyword);
          // Discard stale results if keyword or account changed while awaiting.
          if (get().searchKeyword === keyword && get().activeAccountId === seatId) {
            set({ searchResults: results, isSearchLoading: false });
          }
        } catch (error) {
          if (get().searchKeyword === keyword && get().activeAccountId === seatId) {
            set({ searchResults: null, isSearchLoading: false });
          }
        }
      },
      async selectOrCreateAndSelectConversation(item) {
        const seatId = get().activeAccountId;
        const isGroup = "thirdGroupId" in item;
        const nextMode: ChatMode = isGroup ? "group" : "single";

        try {
          set({ isConversationLoading: true });
          const service = getWorkbenchService();
          const payload = {
            seatId,
            chatType: isGroup ? CHAT_TYPE.GROUP : CHAT_TYPE.SINGLE,
            thirdExternalUserId: isGroup ? undefined : item.thirdExternalUserId,
            thirdGroupId: isGroup ? item.thirdGroupId : undefined,
          };
          const summaryDto = await service.getOrCreateConversation(payload);

          if (get().activeAccountId !== seatId) {
            return;
          }

          const hydratedConversation = adaptConversation(summaryDto);

          await get().setActiveMode(nextMode, {
            preserveConversation: hydratedConversation,
          });

          if (get().activeAccountId !== seatId) {
            return;
          }
          await get().setActiveConversation(hydratedConversation.id);

          if (get().activeAccountId === seatId) {
            set({ searchKeyword: "", searchResults: null, isSearchLoading: false });
          }
        } catch (error) {
          if (get().activeAccountId === seatId) {
            set({
              conversationOpenError:
                getRequestApiErrorMessage(error) ?? "获取/开启会话失败，请稍后重试",
            });
          }
        } finally {
          if (get().activeAccountId === seatId) {
            set({ isConversationLoading: false });
          }
        }
      },
      dismissConversationOpenError() {
        set({ conversationOpenError: undefined });
      },
      saveComposerDraft(conversationId, draft) {
        if (!conversationId) {
          return;
        }

        set((currentState) => ({
          composerDraftsByConversationId: {
            ...currentState.composerDraftsByConversationId,
            [conversationId]: buildConversationComposerDraft(draft),
          },
        }));
      },
      clearComposerDraft(conversationId) {
        if (!conversationId) {
          return;
        }

        set((currentState) => {
          if (!currentState.composerDraftsByConversationId[conversationId]) {
            return currentState;
          }

          const { [conversationId]: _removed, ...composerDraftsByConversationId } =
            currentState.composerDraftsByConversationId;

          return { composerDraftsByConversationId };
        });
      },
      dismissSmartReply(message) {
        const state = get();
        const conversationId = message.conversationId;
        const lookupKey = getSmartReplyLookupKey(message);

        if (!state.smartReplyByMessageIdByConversationId[conversationId]?.[lookupKey]) {
          return;
        }

        set((currentState) => ({
          smartReplyHiddenMessageKeysByConversationId: {
            ...currentState.smartReplyHiddenMessageKeysByConversationId,
            [conversationId]: {
              ...(currentState.smartReplyHiddenMessageKeysByConversationId[
                conversationId
              ] ?? {}),
              [lookupKey]: true,
            },
          },
        }));
      },
      async requestSmartReplyGeneralAnswer(message, options) {
        const state = get();
        const conversationId = state.activeConversationId;

        if (
          !conversationId ||
          !canUseSmartReplyForConversation(state, conversationId) ||
          !isSmartReplyEligibleMessage(message)
        ) {
          return;
        }

        const lookupKey = getSmartReplyLookupKey(message);

        try {
          const revealedSuggestion = options?.force
            ? undefined
            : await revealSmartReplyOrPollOnce(
                get,
                set,
                conversationId,
                message,
              );

          if (revealedSuggestion) {
            if (get().activeConversationId !== conversationId) {
              return;
            }

            if (!isSmartReplyPollComplete(revealedSuggestion)) {
              set((currentState) => ({
                smartReplyPendingMessageKeysByConversationId: {
                  ...currentState.smartReplyPendingMessageKeysByConversationId,
                  [conversationId]: {
                    ...(currentState.smartReplyPendingMessageKeysByConversationId[
                      conversationId
                    ] ?? {}),
                    [lookupKey]: true,
                  },
                },
              }));
              syncSmartReplyRuntimeTimers(
                conversationId,
                get().smartReplyPendingMessageKeysByConversationId[conversationId] ??
                  {},
              );
              scheduleSmartReplyPollForConversation(conversationId, {
                force: true,
              });
            }

            return;
          }
        } catch {
          // 单次历史查询失败不展示错误卡片，继续走原生成链路。
        }

        set((currentState) => ({
          smartReplyPendingMessageKeysByConversationId: {
            ...currentState.smartReplyPendingMessageKeysByConversationId,
            [conversationId]: {
              ...(currentState.smartReplyPendingMessageKeysByConversationId[
                conversationId
              ] ?? {}),
              [lookupKey]: true,
            },
          },
        }));
        syncSmartReplyRuntimeTimers(
          conversationId,
          get().smartReplyPendingMessageKeysByConversationId[conversationId] ?? {},
        );

        try {
          const suggestion = await requestSmartReplyGeneralAnswer(message, conversationId);

          set((currentState) => {
            if (currentState.activeConversationId !== conversationId) {
              return currentState;
            }

            return {
              smartReplyByMessageIdByConversationId: {
                ...currentState.smartReplyByMessageIdByConversationId,
                [conversationId]: {
                  ...(currentState.smartReplyByMessageIdByConversationId[conversationId] ?? {}),
                  [lookupKey]: suggestion,
                },
              },
              smartReplyPendingMessageKeysByConversationId: {
                ...currentState.smartReplyPendingMessageKeysByConversationId,
                [conversationId]: isSmartReplyPollComplete(suggestion)
                  ? omitPendingSmartReplyKey(
                      currentState.smartReplyPendingMessageKeysByConversationId[
                        conversationId
                      ] ?? {},
                      lookupKey,
                    )
                  : {
                      ...(currentState.smartReplyPendingMessageKeysByConversationId[
                        conversationId
                      ] ?? {}),
                      [lookupKey]: true,
                    },
              },
            };
          });

          syncSmartReplyRuntimeTimers(
            conversationId,
            get().smartReplyPendingMessageKeysByConversationId[conversationId] ?? {},
          );
          scheduleSmartReplyPollForConversation(conversationId, { force: true });
        } catch (error) {
          set((currentState) => {
            if (currentState.activeConversationId !== conversationId) {
              return currentState;
            }

            const errorMessage =
              getRequestApiErrorMessage(error) ?? "智能回复生成失败，请稍后重试";

            return {
              smartReplyByMessageIdByConversationId: {
                ...currentState.smartReplyByMessageIdByConversationId,
                [conversationId]: {
                  ...(currentState.smartReplyByMessageIdByConversationId[conversationId] ??
                    {}),
                  [lookupKey]: {
                    ...createTriggeredSmartReplySuggestion(message),
                    failReason: errorMessage,
                    generateStatus: 3,
                    pollComplete: true,
                    status: undefined,
                  },
                },
              },
              smartReplyPendingMessageKeysByConversationId: {
                ...currentState.smartReplyPendingMessageKeysByConversationId,
                [conversationId]: omitPendingSmartReplyKey(
                  currentState.smartReplyPendingMessageKeysByConversationId[
                    conversationId
                  ] ?? {},
                  lookupKey,
                ),
              },
            };
          });
          syncSmartReplyRuntimeTimers(
            conversationId,
            get().smartReplyPendingMessageKeysByConversationId[conversationId] ?? {},
          );
        }
      },
      async requestSmartReplyMakeShorter(message) {
        const state = get();
        const conversationId = state.activeConversationId;

        if (
          !conversationId ||
          !canUseSmartReplyForConversation(state, conversationId) ||
          !isSmartReplyEligibleMessage(message)
        ) {
          return;
        }

        const lookupKey = getSmartReplyLookupKey(message);
        const previousSuggestion =
          state.smartReplyByMessageIdByConversationId[conversationId]?.[lookupKey];

        if (!canRequestSmartReplyMakeShorter(previousSuggestion)) {
          return;
        }

        const content = previousSuggestion.content.trim();

        const optimisticSuggestion: SmartReplySuggestion = {
          ...previousSuggestion,
          busyRequestId: Date.now(),
          status: "thinking",
        };

        set((currentState) => ({
          smartReplyByMessageIdByConversationId: {
            ...currentState.smartReplyByMessageIdByConversationId,
            [conversationId]: {
              ...(currentState.smartReplyByMessageIdByConversationId[conversationId] ?? {}),
              [lookupKey]: optimisticSuggestion,
            },
          },
        }));

        try {
          const response = await requestSmartReplyMakeShorterApi(conversationId, content);

          set((currentState) => {
            if (currentState.activeConversationId !== conversationId) {
              return currentState;
            }

            const currentSuggestion =
              currentState.smartReplyByMessageIdByConversationId[conversationId]?.[
                lookupKey
              ];

            if (!currentSuggestion) {
              return currentState;
            }

            return {
              smartReplyByMessageIdByConversationId: {
                ...currentState.smartReplyByMessageIdByConversationId,
                [conversationId]: {
                  ...(currentState.smartReplyByMessageIdByConversationId[conversationId] ??
                    {}),
                  [lookupKey]: createMakeShorterSmartReplySuggestion(
                    currentSuggestion,
                    response.content,
                  ),
                },
              },
              smartReplyPendingMessageKeysByConversationId: {
                ...currentState.smartReplyPendingMessageKeysByConversationId,
                [conversationId]: omitPendingSmartReplyKey(
                  currentState.smartReplyPendingMessageKeysByConversationId[
                    conversationId
                  ] ?? {},
                  lookupKey,
                ),
              },
            };
          });
        } catch {
          set((currentState) => {
            if (currentState.activeConversationId !== conversationId) {
              return currentState;
            }

            return {
              smartReplyByMessageIdByConversationId: {
                ...currentState.smartReplyByMessageIdByConversationId,
                [conversationId]: {
                  ...(currentState.smartReplyByMessageIdByConversationId[conversationId] ??
                    {}),
                  [lookupKey]: previousSuggestion,
                },
              },
            };
          });
        }
      },
      async sendSmartReply(message, payload) {
        const state = get();
        const conversationId = state.activeConversationId;

        if (
          !conversationId ||
          !canUseSmartReplyForConversation(state, conversationId) ||
          !isSmartReplyEligibleMessage(message)
        ) {
          return {
            errorCode: "CONVERSATION_NOT_ACTIVE",
            reason: "unavailable",
            ok: false,
          };
        }

        const lookupKey = getSmartReplyLookupKey(message);
        const suggestion =
          state.smartReplyByMessageIdByConversationId[conversationId]?.[lookupKey];
        const recordId = suggestion?.recordId?.trim();
        const segments = buildSmartReplySendSegments(payload);

        if (segments.length === 0) {
          return {
            errorCode: "SMART_REPLY_CONTENT_EMPTY",
            reason: "unavailable",
            ok: false,
          };
        }

        if (!recordId) {
          return {
            errorCode: "SMART_REPLY_RECORD_INVALID",
            errorMessage: "智能回复记录无效，请重新生成后再发送",
            reason: "send",
            ok: false,
          };
        }

        const sendResult = await get().sendAgentMessageSegments(segments);

        if (!sendResult.ok) {
          return sendResult;
        }

        const optNos = (sendResult.optNos ?? [])
          .map((optNo) => optNo?.trim())
          .filter((optNo): optNo is string => Boolean(optNo));

        if (optNos.length > 0) {
          try {
            await sendSmartReplyAnswer({
              conversationId,
              optNos,
              recordId,
            });
          } catch {
            // send-answer only marks the recommendation as adopted. The message
            // has already been sent, so marker failures must not surface as send failures.
          }
        }

        set((currentState) => {
          if (currentState.activeConversationId !== conversationId) {
            return currentState;
          }

          const previousSuggestions =
            currentState.smartReplyByMessageIdByConversationId[conversationId] ?? {};
          const previousSuggestion = previousSuggestions[lookupKey];

          if (!previousSuggestion) {
            return currentState;
          }

          return {
            smartReplyByMessageIdByConversationId: {
              ...currentState.smartReplyByMessageIdByConversationId,
              [conversationId]: {
                ...previousSuggestions,
                [lookupKey]: createSentSmartReplySuggestion(
                  previousSuggestion,
                  payload.content,
                ),
              },
            },
            smartReplyPendingMessageKeysByConversationId: {
              ...currentState.smartReplyPendingMessageKeysByConversationId,
              [conversationId]: omitPendingSmartReplyKey(
                currentState.smartReplyPendingMessageKeysByConversationId[
                  conversationId
                ] ?? {},
                lookupKey,
              ),
            },
            smartReplyHiddenMessageKeysByConversationId: {
              ...currentState.smartReplyHiddenMessageKeysByConversationId,
              [conversationId]: {
                ...(currentState.smartReplyHiddenMessageKeysByConversationId[
                  conversationId
                ] ?? {}),
                [lookupKey]: true,
              },
            },
          };
        });

        return sendResult;
      },
      setSidebarItems(items) {
        set({ sidebarItems: items });
      },
      async deleteConversation(conversationId) {
        const state = get();
        const conversation = getConversationById(state, conversationId);
        const account = state.accounts.find(
          (item) => item.id === conversation?.accountId,
        );

        if (!conversation || !account || !canUseConversationActions(state, account)) {
          return;
        }

        try {
          await deleteConversationRequest(conversationId);
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

        set((latestState) => {
          const {
            [conversationId]: _removedDraft,
            ...composerDraftsByConversationId
          } = latestState.composerDraftsByConversationId;

          return {
            ...clearConversationResourceState(latestState, [conversationId]),
            accounts: latestState.accounts.map((item) =>
              item.id === account.id
                ? {
                    ...item,
                    groupUnreadCount:
                      conversation.mode === "group"
                        ? Math.max(0, (item.groupUnreadCount ?? 0) - conversation.unread)
                        : item.groupUnreadCount,
                    singleUnreadCount:
                      conversation.mode === "single"
                        ? Math.max(0, (item.singleUnreadCount ?? 0) - conversation.unread)
                        : item.singleUnreadCount,
                    unreadCount: Math.max(
                      0,
                      (item.unreadCount ?? 0) - conversation.unread,
                    ),
                  }
                : item,
            ),
            activeConversationId: nextActiveConversationId,
            activeMessageSeq: shouldSwitchActive ? 0 : latestState.activeMessageSeq,
            activeMode: nextActiveMode,
            composerDraftsByConversationId,
            conversationListsByScope: {
              ...latestState.conversationListsByScope,
              [account.id]: (latestState.conversationListsByScope[account.id] ?? []).filter(
                (item) => item.id !== conversationId,
              ),
            },
            readReceiptError: undefined,
          };
        });

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
      dismissFullAutoActionError() {
        set({ fullAutoActionError: undefined });
      },
      async syncFullAutoAgentStatus() {
        await syncFullAutoAgentStatusForCurrentState();
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
          !canUseConversationActions(state, account)
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
          !canUseConversationActions(state, account)
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
          return { ok: true };
        }

        const account = state.accounts.find((item) => item.id === accountId);

        if (
          !account ||
          account.loginStatus === "offline" ||
          account.takenOverEmployeeId === me.id
        ) {
          return { ok: true };
        }

        const requestId = issueTakeoverRequestId(accountId);

        set((currentState) => ({
          takeoverStatusByAccountId: {
            ...currentState.takeoverStatusByAccountId,
            [accountId]: "taking-over",
          },
        }));

        try {
          const takeoverResult = await takeOverAccountRequest(accountId);

          if (!isCurrentTakeoverRequest(accountId, requestId)) {
            return { ok: true };
          }

          set((currentState) => ({
            accounts: currentState.accounts.map((item) =>
              item.id === accountId
                ? {
                    ...item,
                    takenOverEmployeeId: takeoverResult.hostSubUserId,
                  }
                : item,
            ),
            takeoverStatusByAccountId: omitTakeoverStatus(
              currentState.takeoverStatusByAccountId,
              accountId,
            ),
          }));
          clearTakeoverRequest(accountId);
          return { ok: true };
        } catch (error) {
          if (!isCurrentTakeoverRequest(accountId, requestId)) {
            return { ok: true };
          }

          set((currentState) => ({
            takeoverStatusByAccountId: omitTakeoverStatus(
              currentState.takeoverStatusByAccountId,
              accountId,
            ),
          }));
          clearTakeoverRequest(accountId);
          return {
            errorMessage: getRequestErrorMessage(error, "接管失败，请稍后重试"),
            ok: false,
          };
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

          const bootstrapSmartReplyState = {
            ...get(),
            accounts: bootstrapResult.accounts,
            conversationListsByScope:
              prunedConversationListCache.conversationListsByScope,
            me: bootstrapResult.me,
          };
          const bootstrapSmartReplyByMessageId = conversationPage
            ? getPageSmartRepliesForConversation(
                bootstrapSmartReplyState,
                conversationPage,
              )
            : {};
          const bootstrapSmartReplyHidden = conversationPage
            ? buildSmartReplyHiddenKeys(
                conversationPage.messages,
                bootstrapSmartReplyByMessageId,
              )
            : {};
          const bootstrapSmartReplyPending = mapSmartReplyPendingKeysFromSuggestions(
            bootstrapSmartReplyByMessageId,
            { hidden: bootstrapSmartReplyHidden },
          );

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
            smartReplyPendingMessageKeysByConversationId: conversationPage
              ? {
                  [conversationPage.conversationId]: bootstrapSmartReplyPending,
                }
              : {},
            smartReplyByMessageIdByConversationId: conversationPage
              ? {
                  [conversationPage.conversationId]: bootstrapSmartReplyByMessageId,
                }
              : {},
            smartReplyHiddenMessageKeysByConversationId: conversationPage
              ? {
                  [conversationPage.conversationId]: bootstrapSmartReplyHidden,
                }
              : {},
            sidebarItems: bootstrapResult.sidebarItems,
            isPollBaselineFresh: true,
            messageUpdateCursor: undefined,
            pollState: {
              ...get().pollState,
              errorMessage: undefined,
              status: "idle",
            },
            seatUpdateCursor: undefined,
            sinceVersion: bootstrapResult.pollBaseline,
          });

        const bootstrapActiveConversation = bootstrapResult.conversationListsByScope[
          bootstrapResult.activeAccountId
        ]?.find(
          (conversation) => conversation.id === bootstrapResult.activeConversationId,
        );

        await syncFullAutoAgentStatusForCurrentState();

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
          canUseConversationActions(
            get(),
            bootstrapResult.accounts.find(
              (account) => account.id === bootstrapResult.activeAccountId,
            ),
          )
        ) {
          await markActiveConversationRead(
            bootstrapResult.activeConversationId,
            requestId,
          );
        }

        if (bootstrapResult.activeConversationId) {
          scheduleSmartReplyPollForConversation(bootstrapResult.activeConversationId, {
            force: Object.keys(bootstrapSmartReplyPending).length > 0,
          });

          const autoGenerateMessage = conversationPage
            ? shouldAutoGenerateSmartReply({
                autoPending:
                  get().smartReplyAutoPendingMessageKeysByConversationId[
                    bootstrapResult.activeConversationId
                  ] ?? {},
                autoSkipped:
                  get().smartReplyAutoSkippedMessageKeysByConversationId[
                    bootstrapResult.activeConversationId
                  ] ?? {},
                message: getLatestNonSystemMessage(conversationPage.messages),
                pending:
                  get().smartReplyPendingMessageKeysByConversationId[
                    bootstrapResult.activeConversationId
                  ] ?? {},
                suggestions:
                  get().smartReplyByMessageIdByConversationId[
                    bootstrapResult.activeConversationId
                  ] ?? {},
              })
            : undefined;

          if (
            autoGenerateMessage &&
            canUseSmartReplyForConversation(
              get(),
              bootstrapResult.activeConversationId,
            )
          ) {
            triggerSmartReplyAutoGeneration(
              get,
              set,
              bootstrapResult.activeConversationId,
              autoGenerateMessage,
              {
                clearAutoPreviewTimeout: clearSmartReplyAutoPreviewTimeout,
                scheduleAutoPreviewTimeout: scheduleSmartReplyAutoPreviewTimeout,
                schedulePoll: scheduleSmartReplyPollForConversation,
                syncRuntimeTimers: syncSmartReplyRuntimeTimers,
              },
            );
          }
        }
      } catch (error) {
        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

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
        state.pollState.status === "paused" ||
        isPollWorkbenchRunning
      ) {
        return false;
      }

      isPollWorkbenchRunning = true;
      latestPollRunId += 1;
      const pollRunId = latestPollRunId;
      runningPollRunId = pollRunId;
      const requestId = getScopeRequestId();

      try {
        const activeConversationId = state.activeConversationId || undefined;
        const request = {
          ...(activeConversationId
            ? {
                activeConversationId,
                activeMessageSeq: state.activeMessageSeq,
                messageUpdateCursor: state.messageUpdateCursor,
              }
            : {}),
          currentAccountId: state.activeAccountId,
          freshBaseline: state.isPollBaselineFresh,
          seatUpdateCursor: state.seatUpdateCursor,
          sinceVersion: state.sinceVersion,
        };
        const response = await pollWorkbench(request, {
          accounts: state.accounts,
          customerProfilesById: state.customerProfilesById,
          me: state.me,
        });

        if (!isReadyScopeRequest(requestId, get())) {
          return false;
        }

        const messageUpdateSeqsByConversationId = (response.messageUpdateEvents ?? []).reduce(
          (accumulator, event) => {
            const currentSeqs = accumulator[event.conversationId];

            if (currentSeqs) {
              currentSeqs.push(event.messageSeq);
            } else {
              accumulator[event.conversationId] = [event.messageSeq];
            }

            return accumulator;
          },
          {} as Record<string, number[]>,
        );

        const refreshedMessagesByConversationId = Object.fromEntries(
          await Promise.all(
            Object.entries(messageUpdateSeqsByConversationId).map(
              async ([conversationId, messageSeqs]): Promise<[string, Message[]]> => [
                conversationId,
                await loadMessagesBySeqs(
                  {
                    accounts: state.accounts,
                    customerProfilesById: state.customerProfilesById,
                    me: state.me,
                  },
                  conversationId,
                  messageSeqs,
                ),
              ],
            ),
          ),
        ) as Record<string, Message[]>;
        const hasRefreshedMessageEntries = Object.values(
          refreshedMessagesByConversationId,
        ).some((messages) => messages.length > 0);
        const shouldSyncFullAutoAgentStatus =
          response.activeConversationMessages.length > 0 ||
          hasRefreshedMessageEntries ||
          response.conversationChanges.length > 0 ||
          response.accountChanges.length > 0;

        if (!isReadyScopeRequest(requestId, get())) {
          return false;
        }

        const polledConversationId = response.request.activeConversationId;
        let shouldNotifyPulledCustomerMessage = false;
        let shouldAutoGenerateForPulledCustomerMessage = false;

        set((currentState) => {
          if (!isReadyScopeRequest(requestId, currentState)) {
            return currentState;
          }

          const requestedActiveConversationId =
            response.request.activeConversationId ?? "";
          const isStaleScope =
            currentState.activeAccountId !== response.request.currentAccountId ||
            currentState.activeConversationId !== requestedActiveConversationId ||
            currentState.sinceVersion !== response.request.sinceVersion;

          if (isStaleScope) {
            return currentState;
          }

          const accountChangesById = new Map(
            response.accountChanges.map((change) => [change.accountId, change]),
          );
          const hasAccountChanges =
            accountChangesById.size > 0 &&
            currentState.accounts.some((account) =>
              accountChangesById.has(account.id),
            );
          const nextAccounts = hasAccountChanges
            ? currentState.accounts.map((account) => {
                const change = accountChangesById.get(account.id);

                if (!change) {
                  return account;
                }

                const { accountId, seatId, ...accountChange } = change;
                void accountId;
                void seatId;

                return {
                  ...account,
                  ...accountChange,
                  id: account.id,
                  metrics: account.metrics,
                  tone: account.tone,
                };
              })
            : currentState.accounts;
          const hasConversationChanges = response.conversationChanges.length > 0;
          const nextConversationLists = hasConversationChanges
            ? { ...currentState.conversationListsByScope }
            : currentState.conversationListsByScope;
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
            shouldNotifyPulledCustomerMessage ||= hasConversationUnreadIncrease(
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
          const hasActiveConversationMessages =
            response.activeConversationMessages.length > 0 &&
            Boolean(polledConversationId);
          const shouldPatchMessageState =
            hasActiveConversationMessages ||
            hasRefreshedMessageEntries ||
            removedConversationIds.length > 0;
          const nextMessagesByConversationId = shouldPatchMessageState
            ? { ...clearedResourceState.messagesByConversationId }
            : clearedResourceState.messagesByConversationId;
          const shouldPatchSmartReplyState =
            hasActiveConversationMessages || removedConversationIds.length > 0;
          const nextSmartReplyPendingMessageKeysByConversationId =
            shouldPatchSmartReplyState
              ? { ...clearedResourceState.smartReplyPendingMessageKeysByConversationId }
              : clearedResourceState.smartReplyPendingMessageKeysByConversationId;
          const nextSmartReplyByMessageIdByConversationId =
            shouldPatchSmartReplyState
              ? { ...clearedResourceState.smartReplyByMessageIdByConversationId }
              : clearedResourceState.smartReplyByMessageIdByConversationId;
          const nextSmartReplyHiddenMessageKeysByConversationId =
            shouldPatchSmartReplyState
              ? { ...clearedResourceState.smartReplyHiddenMessageKeysByConversationId }
              : clearedResourceState.smartReplyHiddenMessageKeysByConversationId;

          if (
            hasActiveConversationMessages &&
            polledConversationId
          ) {
            const currentMessages =
              nextMessagesByConversationId[polledConversationId] ?? [];
            const hasPulledNewCustomerMessage = hasNewCustomerMessage(
              currentMessages,
              response.activeConversationMessages,
            );
            shouldNotifyPulledCustomerMessage ||= hasPulledNewCustomerMessage;
            shouldAutoGenerateForPulledCustomerMessage ||=
              hasPulledNewCustomerMessage;
            nextMessagesByConversationId[polledConversationId] = upsertMessageList(
              currentMessages,
              response.activeConversationMessages,
              { markAppendedAsNew: true },
            );
            const currentSuggestions =
              clearedResourceState.smartReplyByMessageIdByConversationId[
                polledConversationId
              ] ?? {};
            const currentHidden =
              clearedResourceState.smartReplyHiddenMessageKeysByConversationId[
                polledConversationId
              ] ?? {};
            const currentPending =
              nextSmartReplyPendingMessageKeysByConversationId[polledConversationId] ?? {};
            const prunedSmartReplyState = pruneSmartReplyStateToExistingMessages({
              hidden: currentHidden,
              messages: nextMessagesByConversationId[polledConversationId],
              pending: currentPending,
              suggestions: currentSuggestions,
            });

            nextSmartReplyPendingMessageKeysByConversationId[polledConversationId] =
              prunedSmartReplyState.pending;
            nextSmartReplyByMessageIdByConversationId[polledConversationId] =
              prunedSmartReplyState.suggestions;
            nextSmartReplyHiddenMessageKeysByConversationId[polledConversationId] =
              prunedSmartReplyState.hidden;
          }

          for (const [conversationId, refreshedMessages] of Object.entries(
            refreshedMessagesByConversationId,
          )) {
            if (!refreshedMessages.length) {
              continue;
            }

            const conversationMessages = nextMessagesByConversationId[conversationId] ?? [];
            nextMessagesByConversationId[conversationId] = patchExistingMessageList(
              conversationMessages,
              refreshedMessages,
            );
          }

          let nextHistoryPanelByConversationId =
            clearedResourceState.historyPanelByConversationId;

          for (const [conversationId, refreshedMessages] of Object.entries(
            refreshedMessagesByConversationId,
          )) {
            if (!refreshedMessages.length) {
              continue;
            }

            const historyPanel = nextHistoryPanelByConversationId[conversationId];

            if (!historyPanel) {
              continue;
            }

            if (
              nextHistoryPanelByConversationId ===
              clearedResourceState.historyPanelByConversationId
            ) {
              nextHistoryPanelByConversationId = {
                ...clearedResourceState.historyPanelByConversationId,
              };
            }
            nextHistoryPanelByConversationId[conversationId] = {
              ...historyPanel,
              messages: patchExistingMessageList(
                historyPanel.messages,
                refreshedMessages,
              ),
            };
          }

          const serverMessages = [
            ...response.activeConversationMessages,
            ...Object.values(refreshedMessagesByConversationId).flat(),
          ];
          clearResolvedRevokePendingTimeouts(serverMessages);

          const filteredPendingMessages = serverMessages.length
            ? currentState.pendingMessages.filter(
                (pendingMessage) =>
                  !serverMessages.some((message) =>
                    isSameMessage(pendingMessage, message),
                  ),
              )
            : currentState.pendingMessages;
          const pendingMessages =
            filteredPendingMessages.length === currentState.pendingMessages.length
              ? currentState.pendingMessages
              : filteredPendingMessages;
          const nextPollState =
            currentState.pollState.status === "error" ||
            currentState.pollState.errorMessage != null
              ? {
                  ...currentState.pollState,
                  errorMessage: undefined,
                  pauseReason: undefined,
                  status: "idle" as const,
                }
              : currentState.pollState;

          return {
            accounts: nextAccounts,
            activeMessageSeq: Math.max(
              currentState.activeMessageSeq,
              getActiveMessageSeq(
                nextMessagesByConversationId,
                requestedActiveConversationId,
              ),
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
            historyPanelByConversationId: nextHistoryPanelByConversationId,
            messagePaginationByConversationId:
              clearedResourceState.messagePaginationByConversationId,
            messagesByConversationId: nextMessagesByConversationId,
            pendingMessages,
            smartReplyByMessageIdByConversationId:
              nextSmartReplyByMessageIdByConversationId,
            smartReplyHiddenMessageKeysByConversationId:
              nextSmartReplyHiddenMessageKeysByConversationId,
            smartReplyPendingMessageKeysByConversationId:
              nextSmartReplyPendingMessageKeysByConversationId,
            pollState: nextPollState,
            messageUpdateCursor:
              response.nextMessageUpdateCursor ?? currentState.messageUpdateCursor,
            seatUpdateCursor:
              response.nextSeatUpdateCursor ?? currentState.seatUpdateCursor,
            sinceVersion: response.nextVersion,
          };
        });

        if (!isReadyScopeRequest(requestId, get())) {
          return false;
        }

        if (shouldSyncFullAutoAgentStatus) {
          await syncFullAutoAgentStatusForCurrentState();
        }

        if (shouldNotifyPulledCustomerMessage) {
          notifyPulledCustomerMessage();
        }

        if (polledConversationId) {
          scheduleSmartReplyPollForConversation(polledConversationId, {
            force: false,
          });
        }

        if (polledConversationId && shouldAutoGenerateForPulledCustomerMessage) {
          const autoGenerateMessage = shouldAutoGenerateSmartReply({
            autoPending:
              get().smartReplyAutoPendingMessageKeysByConversationId[
                polledConversationId
              ] ?? {},
            autoSkipped:
              get().smartReplyAutoSkippedMessageKeysByConversationId[
                polledConversationId
              ] ?? {},
            message: getLatestNonSystemMessage(
              get().messagesByConversationId[polledConversationId] ?? [],
            ),
            pending:
              get().smartReplyPendingMessageKeysByConversationId[
                polledConversationId
              ] ?? {},
            suggestions:
              get().smartReplyByMessageIdByConversationId[polledConversationId] ??
              {},
          });

          if (
            autoGenerateMessage &&
            canUseSmartReplyForConversation(get(), polledConversationId)
          ) {
            triggerSmartReplyAutoGeneration(
              get,
              set,
              polledConversationId,
              autoGenerateMessage,
              {
                clearAutoPreviewTimeout: clearSmartReplyAutoPreviewTimeout,
                scheduleAutoPreviewTimeout: scheduleSmartReplyAutoPreviewTimeout,
                schedulePoll: scheduleSmartReplyPollForConversation,
                syncRuntimeTimers: syncSmartReplyRuntimeTimers,
              },
            );
          }
        }

        return true;
      } catch (error) {
        if (!isCurrentScopeRequest(requestId)) {
          return false;
        }

        set((currentState) => ({
          pollState: isCursorInvalidationError(error)
            ? {
                ...currentState.pollState,
                errorMessage: undefined,
                pauseReason: "cursor-invalidated",
                status: "paused",
              }
            : {
                ...currentState.pollState,
                errorMessage: error instanceof Error ? error.message : "轮询失败",
                pauseReason: undefined,
                status: "error",
              },
        }));

        return false;
      } finally {
        if (runningPollRunId === pollRunId) {
          runningPollRunId = undefined;
          isPollWorkbenchRunning = false;
        }
      }
    },
    async sendAgentMessageSegments(segments, options) {
      const normalizedSegments = normalizeComposerSegments(segments);

      if (normalizedSegments.length === 0) {
        return { didConsumeQuote: false, ok: true, optNos: [] };
      }

      if (hasMemberMentionSegments(normalizedSegments) && !options?.mention) {
        return {
          errorCode: "MENTION_PAYLOAD_MISSING",
          errorMessage: "消息发送失败，请重新编辑后发送",
          reason: "send",
          ok: false,
        };
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
        activeConversation.bizStatus !== 1 ||
        !canUseConversationActions(state, account)
      ) {
        return {
          errorCode: "UNAVAILABLE",
          errorMessage: "当前无法发送消息",
          reason: "unavailable",
          ok: false,
        };
      }
      const timestamp = Date.now();

      set((currentState) => ({
        sendStatusByConversationId: {
          ...currentState.sendStatusByConversationId,
          [activeConversationId]: "sending",
        },
      }));

      const sendableSegments = buildSendableComposerSegments(segments);
      let segmentsForSend = sendableSegments;

      try {
        if (normalizedSegments.some(isLocalImageSegment)) {
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
          errorMessage: getRequestErrorMessage(
            error,
            getMediaUploadFallbackMessage(error, "图片上传失败"),
          ),
          reason: "image-upload",
          ok: false,
        };
      }

      if (import.meta.env.DEV && segmentsForSend.length !== normalizedSegments.length) {
        console.warn(
          "Composer segment count mismatch before sending",
          segmentsForSend.length,
          normalizedSegments.length,
        );
      }

      try {
        let hasSentQuote = false;
        const optNos: string[] = [];
        for (let index = 0; index < segmentsForSend.length; index += 1) {
          const segmentForSend = segmentsForSend[index];
          const payloadSegment = toWorkbenchSendSegment(segmentForSend);
          // Sendable and normalized segments share media boundaries, so indexes identify the same outbound message.
          const originalSegment = normalizedSegments[index] ?? segmentForSend;
          const optimisticSegment =
            segmentForSend.type === "text" && originalSegment.type === "text"
              ? originalSegment
              : segmentForSend;
          const mentionForSegment =
            segmentForSend.type === "text" && originalSegment.type === "text"
              ? buildMentionPayloadForSegment(originalSegment, options?.mention)
              : undefined;
          const atOriginText =
            mentionForSegment?.memberIds.length && originalSegment.type === "text"
              ? originalSegment.text
              : undefined;
          const quoteForSegment: SendQuotePayload =
            !hasSentQuote && segmentForSend.type === "text" ? options?.quote : undefined;
          hasSentQuote = hasSentQuote || Boolean(quoteForSegment);
          const response = await sendTextMessage({
            conversationId: activeConversationId,
            failMsgId: options?.failMsgId,
            mention: mentionForSegment,
            quote: quoteForSegment,
            atOriginText,
            seatId: activeAccountId,
            segment: payloadSegment,
          });
          optNos.push(response.optNo);
          const optimisticMessage = {
            author: account ? `${account.name}-${account.operator}` : me.displayName,
            isGroupConversation: activeConversation.mode === "group",
            isOwnMessage: true,
            isNew: true,
            content: buildOptimisticMessageContent(optimisticSegment, quoteForSegment),
            conversationId: activeConversationId,
            uiMessageKey: response.optNo,
            optNo: response.optNo,
            role: "agent" as const,
            sender: {
              avatarUrl: account?.avatarUrl,
              id: `sender-agent-${activeAccountId}`,
              name: account ? `${account.name}-${account.operator}` : me.displayName,
              userId: activeConversation.thirdUserId,
            },
            sentAt: formatWorkbenchTimestamp(timestamp + index),
            status: "accepted" as const,
          } satisfies Message;
          const preview = getComposerSegmentsPreview([originalSegment]);

          set((currentState) =>
            buildAcceptedOptimisticMessageState(currentState, {
              activeAccountId,
              activeConversationId,
              optimisticMessage,
              preview,
              previewTimestamp: timestamp + index,
              removeMessageKeys: options?.removeMessageIdOnAccepted
                ? [options.removeMessageIdOnAccepted]
                : undefined,
            }),
          );
        }

        set((currentState) => ({
          sendStatusByConversationId: {
            ...currentState.sendStatusByConversationId,
            [activeConversationId]: "idle",
          },
        }));

        return { didConsumeQuote: hasSentQuote, ok: true, optNos };
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
    async retryFailedMessage(uiMessageKey) {
      const state = get();
      const conversationMessages =
        state.messagesByConversationId[state.activeConversationId] ?? [];
      const failedMessage = conversationMessages.find(
        (message) =>
          matchesMessageKey(message, uiMessageKey) &&
          message.role === "agent" &&
          message.status === "failed",
      );

      if (
        !failedMessage ||
        failedMessage.role !== "agent"
      ) {
        return {
          errorCode: "MESSAGE_NOT_RETRYABLE",
          errorMessage: "暂不支持重发该消息",
          reason: "unavailable",
          ok: false,
        };
      }

      if (!canRetryMessageContent(failedMessage) || !isValidMessageSeq(failedMessage.seq)) {
        return {
          errorCode: !isValidMessageSeq(failedMessage.seq)
            ? "MESSAGE_NOT_RETRYABLE"
            : "UNSUPPORTED_RETRY_MESSAGE",
          errorMessage: "暂不支持重发该消息",
          reason: "unavailable",
          ok: false,
        };
      }

      const activeConversationId = state.activeConversationId;
      const activeAccountId = state.activeAccountId;
      const account = state.accounts.find((item) => item.id === activeAccountId);
      const activeConversation = activeAccountId
        ? (state.conversationListsByScope[activeAccountId] ?? []).find(
            (conversation) => conversation.id === activeConversationId,
          )
        : undefined;

      if (
        !activeAccountId ||
        !activeConversationId ||
        !activeConversation ||
        activeConversation.bizStatus !== 1 ||
        !canUseConversationActions(state, account)
      ) {
        return {
          errorCode: "UNAVAILABLE",
          errorMessage: "当前无法发送消息",
          reason: "unavailable",
          ok: false,
        };
      }

      const timestamp = Date.now();

      set((currentState) => ({
        sendStatusByConversationId: {
          ...currentState.sendStatusByConversationId,
          [activeConversationId]: "sending",
        },
      }));

      try {
        const response = await retryMessageRequest({
          conversationId: activeConversationId,
          messageSeq: failedMessage.seq,
        });
        const {
          failReason: _failedReason,
          msgid: _failedMsgid,
          seq: _failedSeq,
          ...retryMessageBase
        } = failedMessage;
        const optimisticMessage = {
          ...retryMessageBase,
          author: account
            ? `${account.name}-${account.operator}`
            : failedMessage.author,
          isNew: true,
          optNo: response.optNo,
          status: "accepted" as const,
          uiMessageKey: response.optNo,
          sentAt: formatWorkbenchTimestamp(timestamp),
        } satisfies Message;
        const preview = getRetryPreviewText(failedMessage);
        const retryRemovalKeys = uniqueMessageKeys([
          uiMessageKey,
          failedMessage.uiMessageKey,
          failedMessage.optNo,
          isValidMessageSeq(failedMessage.seq) ? String(failedMessage.seq) : undefined,
        ]);

        set((currentState) =>
          buildAcceptedOptimisticMessageState(currentState, {
            activeAccountId,
            activeConversationId,
            optimisticMessage,
            preview,
            previewTimestamp: timestamp,
            minimumActiveMessageSeq: failedMessage.seq,
            removeMessageKeys: retryRemovalKeys,
          }),
        );

        set((currentState) => ({
          sendStatusByConversationId: {
            ...currentState.sendStatusByConversationId,
            [activeConversationId]: "idle",
          },
        }));

        return {
          didConsumeQuote: false,
          ok: true,
          optNos: [response.optNo],
        };
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
    async revokeMessage(uiMessageKey) {
      const state = get();
      const message = findRevokableMessage(
        state.messagesByConversationId[state.activeConversationId] ?? [],
        uiMessageKey,
      );

      if (!message || !canUseMessageRevoke(message)) {
        return {
          errorCode: "MESSAGE_NOT_REVOKABLE",
          errorMessage: "暂不支持撤回该消息",
          ok: false,
        };
      }

      const messageSeq = message.seq;

      if (messageSeq == null) {
        return {
          errorCode: "MESSAGE_NOT_REVOKABLE",
          errorMessage: "暂不支持撤回该消息",
          ok: false,
        };
      }

      if (pendingRevokeRequestMessageIds.has(message.uiMessageKey)) {
        return {
          errorCode: "MESSAGE_REVOKE_PENDING",
          errorMessage: "消息正在撤回中",
          ok: false,
        };
      }

      pendingRevokeRequestMessageIds.add(message.uiMessageKey);

      try {
        await revokeMessageRequest({
          conversationId: message.conversationId,
          messageSeq,
        });

        set((currentState) => ({
          messagesByConversationId: {
            ...currentState.messagesByConversationId,
            [message.conversationId]: patchMessageRevokePendingList(
              currentState.messagesByConversationId[message.conversationId] ?? [],
              message.uiMessageKey,
              true,
            ),
          },
        }));
        scheduleRevokePendingTimeout(message.conversationId, message.uiMessageKey);

        return { ok: true };
      } catch (error) {
        const errorMessage = getRequestErrorMessage(error, "撤回失败，请稍后重试");

        return {
          errorCode: getRequestErrorCode(error),
          errorMessage,
          ok: false,
        };
      } finally {
        pendingRevokeRequestMessageIds.delete(message.uiMessageKey);
      }
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
    clearActiveConversation() {
      const previousConversationId = get().activeConversationId;

      if (previousConversationId) {
        clearFullAutoRuntime(previousConversationId);
      }

      set({
        activeConversationId: "",
        activeMessageSeq: 0,
        fullAutoStatusByConversationId: previousConversationId
          ? omitByKeys(get().fullAutoStatusByConversationId, [previousConversationId])
          : get().fullAutoStatusByConversationId,
        historyPanelOpenConversationId: undefined,
        isConversationLoading: false,
        messageUpdateCursor: undefined,
        scopeTransitionError: undefined,
      });
    },
    async changeActiveSeatAgentMode(mode) {
      const state = get();
      const { activeAccountId } = state;

      if (!activeAccountId || state.seatAgentModeActionPending) {
        return;
      }

      const account = state.accounts.find((item) => item.id === activeAccountId);

      const canConfigureMode =
        mode === "off" ||
        (mode === "assistant" && account?.semiAutoAuth === true) ||
        (mode === "autoReply" && account?.seatAIHostingAuth === true);

      if (!canUseConversationActions(state, account) || !canConfigureMode) {
        return;
      }

      set({ seatAgentModeActionPending: true });

      try {
        const response = await updateSeatAgentMode(activeAccountId, {
          mode,
        });
        set((currentState) => {
          const nextAccount = currentState.accounts.find(
            (item) => item.id === response.seatId,
          );
          const nextSeatAIHostingEnabled =
            nextAccount?.seatAIHostingAuth === true &&
            response.fullAutoSwitch === true;
          const nextSeatAIAssistantEnabled =
            nextAccount?.semiAutoAuth === true &&
            response.semiAutoSwitch === true;

          return {
            accounts: currentState.accounts.map((item) =>
              item.id === response.seatId
                ? {
                    ...item,
                    fullAutoSwitch: response.fullAutoSwitch,
                    seatAIAssistantEnabled: nextSeatAIAssistantEnabled,
                    seatAIHostingEnabled: nextSeatAIHostingEnabled,
                    semiAutoSwitch: response.semiAutoSwitch,
                  }
                : item,
            ),
          };
        });
        set({ fullAutoActionError: undefined, seatAgentModeActionPending: false });
      } catch (error) {
        set({
          fullAutoActionError: getRequestErrorMessage(
            error,
            "更新 AI 辅助模式失败",
          ),
          seatAgentModeActionPending: false,
        });
      }
    },
    async changeActiveConversationFullAuto(enabled) {
      const state = get();
      const { activeConversationId } = state;

      if (!activeConversationId || state.fullAutoActionPending) {
        return;
      }

      const conversation = getConversationById(state, activeConversationId);

      if (!conversation) {
        return;
      }

      const account = state.accounts.find(
        (item) => item.id === conversation.accountId,
      );

      if (
        !canUseConversationActions(state, account) ||
        !isConversationAIFeatureSupported(conversation) ||
        account?.seatAIHostingEnabled !== true
      ) {
        return;
      }

      set({ fullAutoActionPending: true });

      try {
        const response = await changeConversationFullAuto(activeConversationId, enabled);
        const nextConversationAIHostingSwitch =
          response.conversationAIHostingSwitch === true;
        if (!nextConversationAIHostingSwitch) {
          clearFullAutoRuntime(activeConversationId);
        }
        set((currentState) => ({
          ...applyConversationAIHostingSwitchResult(
            currentState,
            activeConversationId,
            conversation.accountId,
            nextConversationAIHostingSwitch,
          ),
          fullAutoActionError: undefined,
          fullAutoActionPending: false,
        }));
      } catch (error) {
        set({
          fullAutoActionError: getRequestErrorMessage(
            error,
            enabled ? "开启托管失败" : "取消托管失败",
          ),
          fullAutoActionPending: false,
        });
      }
    },
    resetWorkbenchSession() {
      clearAllRuntimeState();
      set(createInitialState());
    },
    resetWorkbenchRuntime() {
      clearAllRuntimeState();
    },
    async refreshSeatSummaries() {
      const state = get();

      if (state.bootstrapStatus !== "ready") {
        return;
      }

      const requestId = getScopeRequestId();

      try {
        const nextAccounts = await loadSeats();

        if (!isReadyScopeRequest(requestId, get())) {
          return;
        }

        set((currentState) => {
          const mergedAccounts = currentState.accounts.map((account) => {
            if (account.id === currentState.activeAccountId) {
              return account;
            }

            const nextAccount = nextAccounts.find((item) => item.id === account.id);
            return nextAccount ?? account;
          });

          return {
            accounts: mergedAccounts,
          };
        });
      } catch {
        // Keep current seat summaries if the refresh fails.
      }
    },
    async setActiveAccount(accountId) {
      const state = get();

      if (!accountId || state.activeAccountId === accountId) {
        return;
      }

      if (state.activeConversationId) {
        clearSmartReplyRuntimeTimers(state.activeConversationId);
      }

      // 切换账号时立即取消未完成的搜索定时器并清空搜索态，
      // 防止上一个账号的搜索结果或进行中的请求污染新账号的视图。
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }
      set({ searchKeyword: "", searchResults: null, isSearchLoading: false });

      const requestId = issueScopeRequestId();
      set((currentState) => ({
        ...getOptimisticAccountSwitchState(currentState, accountId),
        isConversationLoading: true,
        scopeTransitionError: undefined,
      }));

      try {
        const scopeLoadResult = await loadAccountConversationsWithBaseline(accountId);

        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

        const visibleConversations = getVisibleConversations(
          scopeLoadResult.conversations,
        );
        const nextConversation =
          visibleConversations.find(
            (conversation) => conversation.mode === state.activeMode,
          ) ?? visibleConversations[0];
        const nextConversationId = nextConversation?.id ?? "";
        const nextMode = nextConversation?.mode ?? state.activeMode;
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
              [accountId]: scopeLoadResult.conversations,
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
            accounts: currentState.accounts,
            groupMembersLoadedAtByConversationId: omitByKeys(
              currentState.groupMembersLoadedAtByConversationId,
              evictedConversationIds,
            ),
            groupMembersByConversationId: omitByKeys(
              currentState.groupMembersByConversationId,
              evictedConversationIds,
            ),
            activeAccountId: accountId,
            activeConversationId: nextConversationId,
            activeMode: nextMode,
            activeMessageSeq: getActiveMessageSeq(
              clearedMessageState.messagesByConversationId,
              nextConversationId,
            ),
            conversationListCacheSeatOrder:
              prunedConversationListCache.conversationListCacheSeatOrder,
            conversationListsByScope:
              prunedConversationListCache.conversationListsByScope,
            conversationModeLoadedAtByScope:
              prunedConversationListCache.conversationModeLoadedAtByScope,
            hasMoreHistoryByConversationId:
              clearedMessageState.hasMoreHistoryByConversationId,
            messagePaginationByConversationId:
              clearedMessageState.messagePaginationByConversationId,
            isConversationLoading: Boolean(nextConversationId),
            messagesByConversationId: clearedMessageState.messagesByConversationId,
            scopeTransitionError: undefined,
            groupMembersLoadingByConversationId:
              nextGroupMembersLoadingByConversationId,
            isPollBaselineFresh: true,
            messageUpdateCursor: undefined,
            sinceVersion: scopeLoadResult.pollBaseline,
          };
        });

        if (!nextConversationId) {
          return;
        }

        const conversationPage = await loadConversationMessagesPage(
          {
            accounts: state.accounts,
            customerProfilesById: state.customerProfilesById,
            me: state.me,
          },
          nextConversationId,
          { limit: MESSAGE_PAGE_SIZE },
        );

        if (!isCurrentScopeRequest(requestId)) {
          return;
        }

        const accountSwitchSmartReplyByMessageId =
          getPageSmartRepliesForConversation(get(), conversationPage);
        const accountSwitchSmartReplyHidden = buildSmartReplyHiddenKeys(
          conversationPage.messages,
          accountSwitchSmartReplyByMessageId,
        );
        const accountSwitchSmartReplyPending = mapSmartReplyPendingKeysFromSuggestions(
          accountSwitchSmartReplyByMessageId,
          { hidden: accountSwitchSmartReplyHidden },
        );

        set((currentState) => {
          const currentMessages =
            currentState.messagesByConversationId[conversationPage.conversationId] ??
            [];

          return {
            activeMessageSeq: getActiveMessageSeq(
              {
                ...currentState.messagesByConversationId,
                [conversationPage.conversationId]: conversationPage.messages,
              },
              nextConversationId,
            ),
            hasMoreHistoryByConversationId: {
              ...currentState.hasMoreHistoryByConversationId,
              [conversationPage.conversationId]: conversationPage.hasMoreHistory,
            },
            messagePaginationByConversationId: {
              ...currentState.messagePaginationByConversationId,
              [conversationPage.conversationId]:
                buildMessagePaginationState(conversationPage),
            },
            isConversationLoading: false,
            messagesByConversationId: {
              ...currentState.messagesByConversationId,
              [conversationPage.conversationId]: upsertMessageList(
                currentMessages,
                conversationPage.messages,
              ),
            },
            smartReplyByMessageIdByConversationId: {
              ...currentState.smartReplyByMessageIdByConversationId,
              [conversationPage.conversationId]: accountSwitchSmartReplyByMessageId,
            },
            smartReplyHiddenMessageKeysByConversationId: {
              ...currentState.smartReplyHiddenMessageKeysByConversationId,
              [conversationPage.conversationId]: accountSwitchSmartReplyHidden,
            },
            smartReplyPendingMessageKeysByConversationId: {
              ...currentState.smartReplyPendingMessageKeysByConversationId,
              [conversationPage.conversationId]: accountSwitchSmartReplyPending,
            },
            scopeTransitionError: undefined,
            groupMembersLoadingByConversationId:
              nextConversation?.mode === "group" &&
              (currentState.groupMembersByConversationId[nextConversationId] ===
                undefined ||
                !isGroupMembersCacheFresh(
                  currentState.groupMembersLoadedAtByConversationId,
                  nextConversationId,
                ))
                ? {
                    ...currentState.groupMembersLoadingByConversationId,
                    [nextConversationId]: true,
                  }
                : currentState.groupMembersLoadingByConversationId,
          };
        });

        await loadGroupMembersForConversation(
          nextConversationId,
          requestId,
        );

        if (
          nextConversationId &&
          canUseConversationActions(
            get(),
            get().accounts.find((account) => account.id === accountId),
          )
        ) {
          await markActiveConversationRead(nextConversationId, requestId);
        }

        scheduleSmartReplyPollForConversation(nextConversationId, {
          force: Object.keys(accountSwitchSmartReplyPending).length > 0,
        });

        const autoGenerateMessage = shouldAutoGenerateSmartReply({
          autoPending:
            get().smartReplyAutoPendingMessageKeysByConversationId[nextConversationId] ??
            {},
          autoSkipped:
            get().smartReplyAutoSkippedMessageKeysByConversationId[nextConversationId] ??
            {},
          message: getLatestNonSystemMessage(conversationPage.messages),
          pending:
            get().smartReplyPendingMessageKeysByConversationId[nextConversationId] ??
            {},
          suggestions:
            get().smartReplyByMessageIdByConversationId[nextConversationId] ?? {},
        });

        if (
          autoGenerateMessage &&
          canUseSmartReplyForConversation(get(), nextConversationId)
        ) {
          triggerSmartReplyAutoGeneration(get, set, nextConversationId, autoGenerateMessage, {
            clearAutoPreviewTimeout: clearSmartReplyAutoPreviewTimeout,
            scheduleAutoPreviewTimeout: scheduleSmartReplyAutoPreviewTimeout,
            schedulePoll: scheduleSmartReplyPollForConversation,
            syncRuntimeTimers: syncSmartReplyRuntimeTimers,
          });
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
      clearSmartReplyRuntimeTimers(state.activeConversationId);
      clearSmartReplyRuntimeTimers(conversationId);
      clearFullAutoRuntime(state.activeConversationId);
      clearFullAutoRuntime(conversationId);

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

        const pageSmartReplyByMessageId = getPageSmartRepliesForConversation(
          get(),
          page,
        );
        const pageSmartReplyHidden = buildSmartReplyHiddenKeys(
          page.messages,
          pageSmartReplyByMessageId,
        );
        const pageSmartReplyPending = mapSmartReplyPendingKeysFromSuggestions(
          pageSmartReplyByMessageId,
          { hidden: pageSmartReplyHidden },
        );

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
            smartReplyPendingMessageKeysByConversationId: {
              ...clearedMessageState.smartReplyPendingMessageKeysByConversationId,
              [conversationId]: pageSmartReplyPending,
            },
            smartReplyByMessageIdByConversationId: {
              ...clearedMessageState.smartReplyByMessageIdByConversationId,
              [conversationId]: pageSmartReplyByMessageId,
            },
            smartReplyHiddenMessageKeysByConversationId: {
              ...clearedMessageState.smartReplyHiddenMessageKeysByConversationId,
              [conversationId]: pageSmartReplyHidden,
            },
            scopeTransitionError: undefined,
          };
        });

        await syncFullAutoAgentStatusForCurrentState();

        await loadGroupMembersForConversation(conversationId, requestId);

        const latestState = get();
        const activeAccount = latestState.accounts.find(
          (account) => account.id === latestState.activeAccountId,
        );

        if (!canUseConversationActions(latestState, activeAccount)) {
          return;
        }

        await markActiveConversationRead(conversationId, requestId);
        scheduleSmartReplyPollForConversation(conversationId, {
          force: Object.keys(pageSmartReplyPending).length > 0,
        });

        const autoGenerateMessage = shouldAutoGenerateSmartReply({
          autoPending:
            get().smartReplyAutoPendingMessageKeysByConversationId[conversationId] ?? {},
          autoSkipped:
            get().smartReplyAutoSkippedMessageKeysByConversationId[conversationId] ?? {},
          message: getLatestNonSystemMessage(page.messages),
          pending: get().smartReplyPendingMessageKeysByConversationId[conversationId] ?? {},
          suggestions:
            get().smartReplyByMessageIdByConversationId[conversationId] ?? {},
        });

        if (
          autoGenerateMessage &&
          canUseSmartReplyForConversation(get(), conversationId)
        ) {
          triggerSmartReplyAutoGeneration(get, set, conversationId, autoGenerateMessage, {
            clearAutoPreviewTimeout: clearSmartReplyAutoPreviewTimeout,
            scheduleAutoPreviewTimeout: scheduleSmartReplyAutoPreviewTimeout,
            schedulePoll: scheduleSmartReplyPollForConversation,
            syncRuntimeTimers: syncSmartReplyRuntimeTimers,
          });
        }
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
    async loadUnreadConversations(mode) {
      const state = get();
      const accountId = state.activeAccountId;
      const targetMode = mode ?? state.activeMode;

      if (!accountId) {
        return;
      }

      const requestId = issueUnreadRequestId(accountId, targetMode);

      try {
        const result = await loadUnreadAccountConversationsByMode(accountId, targetMode);

        if (
          !isCurrentUnreadRequest(accountId, targetMode, requestId) ||
          get().activeAccountId !== accountId
        ) {
          return;
        }

        set((currentState) => {
          const nextConversationListsByScope = {
            ...currentState.conversationListsByScope,
            [accountId]: mergeConversationLists(
              currentState.conversationListsByScope[accountId] ?? [],
              result.conversations,
            ),
          };

          return {
            accounts: applyAccountUnreadSummary(
              currentState.accounts,
              accountId,
              result.unreadSummary,
            ),
            conversationListsByScope: nextConversationListsByScope,
            hasMoreUnreadByScope: {
              ...currentState.hasMoreUnreadByScope,
              [accountId]: {
                ...currentState.hasMoreUnreadByScope[accountId],
                [targetMode]: result.hasMore ?? false,
              },
            },
            isPollBaselineFresh:
              result.pollBaseline < currentState.sinceVersion
                ? true
                : currentState.isPollBaselineFresh,
            sinceVersion: Math.min(currentState.sinceVersion, result.pollBaseline),
          };
        });
      } catch {
        // The unread refresh is a best-effort补漏动作；失败时保留当前列表与计数。
      }
    },
    async setActiveMode(mode, options) {
      const state = get();
      const preserveConversation = options?.preserveConversation;

      if (state.activeMode === mode) {
        const accountId = preserveConversation?.accountId;

        if (preserveConversation && accountId) {
          set((currentState) => ({
            conversationListsByScope: {
              ...currentState.conversationListsByScope,
              [accountId]: mergeConversationList(
                currentState.conversationListsByScope[accountId] ?? [],
                preserveConversation,
              ),
            },
          }));
        }

        return;
      }

      if (state.activeConversationId) {
        clearSmartReplyRuntimeTimers(state.activeConversationId);
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
                  preserveConversation,
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
              accounts: currentState.accounts,
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
            const previousConversationId = get().activeConversationId;

            if (previousConversationId) {
              clearSmartReplyRuntimeTimers(previousConversationId);
            }

            set({
              activeConversationId: "",
              activeMessageSeq: 0,
              isConversationLoading: false,
              smartReplyByMessageIdByConversationId: previousConversationId
                ? omitByKeys(
                    get().smartReplyByMessageIdByConversationId,
                    [previousConversationId],
                  )
                : get().smartReplyByMessageIdByConversationId,
              smartReplyPendingMessageKeysByConversationId: previousConversationId
                ? omitByKeys(
                    get().smartReplyPendingMessageKeysByConversationId,
                    [previousConversationId],
                  )
                : get().smartReplyPendingMessageKeysByConversationId,
              smartReplyLastPolledAtByConversationId: previousConversationId
                ? omitByKeys(
                    get().smartReplyLastPolledAtByConversationId,
                    [previousConversationId],
                  )
                : get().smartReplyLastPolledAtByConversationId,
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
        if (state.activeConversationId) {
          clearSmartReplyRuntimeTimers(state.activeConversationId);
        }

        set({
          activeConversationId: "",
          activeMessageSeq: 0,
          smartReplyByMessageIdByConversationId: state.activeConversationId
            ? omitByKeys(
                get().smartReplyByMessageIdByConversationId,
                [state.activeConversationId],
              )
            : get().smartReplyByMessageIdByConversationId,
          smartReplyPendingMessageKeysByConversationId: state.activeConversationId
            ? omitByKeys(
                get().smartReplyPendingMessageKeysByConversationId,
                [state.activeConversationId],
              )
            : get().smartReplyPendingMessageKeysByConversationId,
          smartReplyLastPolledAtByConversationId: state.activeConversationId
            ? omitByKeys(
                get().smartReplyLastPolledAtByConversationId,
                [state.activeConversationId],
              )
            : get().smartReplyLastPolledAtByConversationId,
        });
      }
    },
      updateMessageDownloadContent(conversationId, uiMessageKey, contentPatch) {
        set((currentState) => {
          const messages = currentState.messagesByConversationId[conversationId] ?? [];
          const historyPanel = currentState.historyPanelByConversationId[conversationId];

          return {
            historyPanelByConversationId: historyPanel
              ? {
                  ...currentState.historyPanelByConversationId,
                  [conversationId]: {
                    ...historyPanel,
                    messages: patchDownloadMessageList(
                      historyPanel.messages,
                      uiMessageKey,
                      contentPatch,
                    ),
                  },
                }
              : currentState.historyPanelByConversationId,
            messagesByConversationId: {
              ...currentState.messagesByConversationId,
              [conversationId]: patchDownloadMessageList(
                messages,
                uiMessageKey,
                contentPatch,
              ),
            },
          };
        });

        const latestState = get();

        if (
          latestState.activeConversationId === conversationId &&
          canUseSmartReplyForConversation(latestState, conversationId)
        ) {
          const autoGenerateMessage = shouldAutoGenerateSmartReply({
            autoPending:
              latestState.smartReplyAutoPendingMessageKeysByConversationId[
                conversationId
              ] ?? {},
            autoSkipped:
              latestState.smartReplyAutoSkippedMessageKeysByConversationId[
                conversationId
              ] ?? {},
            message: getLatestNonSystemMessage(
              latestState.messagesByConversationId[conversationId] ?? [],
            ),
            pending:
              latestState.smartReplyPendingMessageKeysByConversationId[
                conversationId
              ] ?? {},
            suggestions:
              latestState.smartReplyByMessageIdByConversationId[conversationId] ??
              {},
          });

          if (autoGenerateMessage) {
            triggerSmartReplyAutoGeneration(
              get,
              set,
              conversationId,
              autoGenerateMessage,
              {
                clearAutoPreviewTimeout: clearSmartReplyAutoPreviewTimeout,
                scheduleAutoPreviewTimeout: scheduleSmartReplyAutoPreviewTimeout,
                schedulePoll: scheduleSmartReplyPollForConversation,
                syncRuntimeTimers: syncSmartReplyRuntimeTimers,
              },
            );
          }
        }
      },
      async confirmVoicePlaybackReady(conversationId, uiMessageKey, playbackUrl) {
        const currentState = get();
        const message = findVoiceMessageByUiKey(
          [
            ...(currentState.messagesByConversationId[conversationId] ?? []),
            ...(currentState.historyPanelByConversationId[conversationId]?.messages ?? []),
          ],
          uiMessageKey,
        );

        if (!message || !message.seq || message.content.transFileUrlPersisted) {
          return;
        }

        const pendingKey = `${conversationId}:${message.seq}:${playbackUrl}`;

        if (pendingVoicePlaybackConfirmKeys.has(pendingKey)) {
          return;
        }

        pendingVoicePlaybackConfirmKeys.add(pendingKey);

        try {
          await confirmVoicePlaybackReadyRequest({
            conversationId,
            messageSeq: message.seq,
            playbackUrl,
          });

          set((state) => {
            const messages = state.messagesByConversationId[conversationId] ?? [];
            const historyPanel = state.historyPanelByConversationId[conversationId];
            const contentPatch = {
              playbackUrl,
              transFileUrl: playbackUrl,
              transFileUrlPersisted: true,
            } satisfies VoicePlaybackContentPatch;

            return {
              historyPanelByConversationId: historyPanel
                ? {
                    ...state.historyPanelByConversationId,
                    [conversationId]: {
                      ...historyPanel,
                      messages: patchVoicePlaybackMessageList(
                        historyPanel.messages,
                        uiMessageKey,
                        contentPatch,
                      ),
                    },
                  }
                : state.historyPanelByConversationId,
              messagesByConversationId: {
                ...state.messagesByConversationId,
                [conversationId]: patchVoicePlaybackMessageList(
                  messages,
                  uiMessageKey,
                  contentPatch,
                ),
              },
            };
          });
        } finally {
          pendingVoicePlaybackConfirmKeys.delete(pendingKey);
        }
      },
      async transcribeVoiceMessage(conversationId, uiMessageKey) {
        const currentState = get();
        const message = findVoiceMessageByUiKey(
          [
            ...(currentState.messagesByConversationId[conversationId] ?? []),
            ...(currentState.historyPanelByConversationId[conversationId]?.messages ?? []),
          ],
          uiMessageKey,
        );

        if (!message || !message.seq) {
          throw new Error("语音消息不存在");
        }

        if (message.content.transVoiceText?.trim()) {
          return message.content.transVoiceText.trim();
        }

        const response = await transcribeVoiceMessageRequest({
          conversationId,
          messageSeq: message.seq,
        });
        const transVoiceText = response.transVoiceText;

        set((state) => {
          const messages = state.messagesByConversationId[conversationId] ?? [];
          const historyPanel = state.historyPanelByConversationId[conversationId];
          const contentPatch = {
            transVoiceText,
          } satisfies VoiceTranscriptionContentPatch;

          return {
            historyPanelByConversationId: historyPanel
              ? {
                  ...state.historyPanelByConversationId,
                  [conversationId]: {
                    ...historyPanel,
                    messages: patchVoiceTranscriptionMessageList(
                      historyPanel.messages,
                      uiMessageKey,
                      contentPatch,
                    ),
                  },
                }
              : state.historyPanelByConversationId,
            messagesByConversationId: {
              ...state.messagesByConversationId,
              [conversationId]: patchVoiceTranscriptionMessageList(
                messages,
                uiMessageKey,
                contentPatch,
              ),
            },
          };
        });

        const latestState = get();

        if (
          latestState.activeConversationId === conversationId &&
          canUseSmartReplyForConversation(latestState, conversationId)
        ) {
          const autoGenerateMessage = shouldAutoGenerateSmartReply({
            autoPending:
              latestState.smartReplyAutoPendingMessageKeysByConversationId[
                conversationId
              ] ?? {},
            autoSkipped:
              latestState.smartReplyAutoSkippedMessageKeysByConversationId[
                conversationId
              ] ?? {},
            message: getLatestNonSystemMessage(
              latestState.messagesByConversationId[conversationId] ?? [],
            ),
            pending:
              latestState.smartReplyPendingMessageKeysByConversationId[
                conversationId
              ] ?? {},
            suggestions:
              latestState.smartReplyByMessageIdByConversationId[conversationId] ??
              {},
          });

          if (autoGenerateMessage) {
            triggerSmartReplyAutoGeneration(
              get,
              set,
              conversationId,
              autoGenerateMessage,
              {
                clearAutoPreviewTimeout: clearSmartReplyAutoPreviewTimeout,
                scheduleAutoPreviewTimeout: scheduleSmartReplyAutoPreviewTimeout,
                schedulePoll: scheduleSmartReplyPollForConversation,
                syncRuntimeTimers: syncSmartReplyRuntimeTimers,
              },
            );
          }
        }

        return transVoiceText;
      },
    };
  });
}

function buildMentionPayloadForSegment(
  segment: ComposerTextSegment,
  mention?: SendMentionPayload,
): SendMentionPayload {
  if (!mention) {
    return undefined;
  }

  if (segment.mentionAll) {
    // @所有人 owns the whole text segment; member mentions in the same segment are sent as plain text.
    return {
      all: true,
      location: "start",
      memberIds: [],
    };
  }

  const memberIds = segment.mentionMemberIds?.filter(Boolean) ?? [];

  if (memberIds.length === 0) {
    return undefined;
  }

  return {
    location: "any",
    memberIds,
  };
}

function hasMemberMentionSegments(segments: ComposerSegment[]) {
  return segments.some(
    (segment) =>
      segment.type === "text" && (segment.mentionMemberIds?.length ?? 0) > 0,
  );
}

function buildSendableComposerSegments(segments: ComposerSegment[]): ComposerSegment[] {
  const sendableSegments: ComposerSegment[] = [];
  let textSegmentsBuffer: ComposerTextSegment[] = [];

  const flushTextSegmentsBuffer = () => {
    if (textSegmentsBuffer.length === 0) {
      return;
    }

    const hasMentionAll = textSegmentsBuffer.some((segment) => segment.mentionAll);
    const text = textSegmentsBuffer
      .map((segment) => {
        if (hasMentionAll || (segment.mentionMemberIds?.length ?? 0) === 0) {
          return segment.text;
        }

        return JAVA_MENTION_PLACEHOLDER;
      })
      .join("")
      .trim();

    if (text) {
      sendableSegments.push({
        text,
        type: "text",
      });
    }

    textSegmentsBuffer = [];
  };

  for (const segment of segments) {
    if (segment.type === "text") {
      textSegmentsBuffer.push(segment);
      continue;
    }

    flushTextSegmentsBuffer();
    sendableSegments.push(segment);
  }

  flushTextSegmentsBuffer();

  return sendableSegments;
}

function toWorkbenchSendSegment(
  segment: ComposerSegment,
): WorkbenchSendMessagePayload["segment"] {
  if (segment.type === "image" && segment.materialCollectionId) {
    return {
      alt: segment.alt,
      materialCollectionId: segment.materialCollectionId,
      type: "image",
    };
  }

  if (segment.type === "image") {
    const imageUrl = segment.imageUrl?.trim();

    if (imageUrl) {
      return {
        alt: segment.alt,
        imageUrl,
        type: "image",
        url: imageUrl,
        ...(segment.height != null ? { height: segment.height } : {}),
        ...(segment.width != null ? { width: segment.width } : {}),
      };
    }
  }

  if (segment.type === "file" && segment.materialCollectionId) {
    return {
      materialCollectionId: segment.materialCollectionId,
      type: "file",
    };
  }

  if (segment.type === "h5" && segment.materialCollectionId) {
    return {
      materialCollectionId: segment.materialCollectionId,
      type: "h5",
    };
  }

  if (segment.type === "weapp" && segment.materialCollectionId) {
    return {
      materialCollectionId: segment.materialCollectionId,
      type: "weapp",
    };
  }

  if (segment.type === "sphfeed" && segment.materialCollectionId) {
    return {
      materialCollectionId: segment.materialCollectionId,
      type: "sphfeed",
    };
  }

  if (segment.type === "video" && segment.materialCollectionId) {
    return {
      materialCollectionId: segment.materialCollectionId,
      type: "video",
    };
  }

  if (
    (segment.type === "file" ||
      segment.type === "h5" ||
      segment.type === "weapp" ||
      segment.type === "sphfeed" ||
      segment.type === "video") &&
    segment.msgInfoId
  ) {
    return segment;
  }

  if (segment.type === "emotion") {
    return {
      materialCollectionId: segment.materialCollectionId,
      type: "emotion",
    };
  }

  return segment;
}

function isDownloadableMessage(message: Message): message is ChatMessage {
  return (
    message.role !== "system" &&
    (message.content.type === "file" ||
      message.content.type === "image" ||
      message.content.type === "video")
  );
}

function isVoiceMessage(
  message: Message,
): message is ChatMessage & { content: VoiceMessageContent } {
  return message.role !== "system" && message.content.type === "voice";
}

function findVoiceMessageByUiKey(
  messages: Message[],
  uiMessageKey: string,
): (ChatMessage & { content: VoiceMessageContent }) | undefined {
  return messages.find(
    (message): message is ChatMessage & { content: VoiceMessageContent } =>
      isVoiceMessage(message) && matchesMessageKey(message, uiMessageKey),
  );
}

function findRevokableMessage(
  messages: Message[],
  uiMessageKey: string,
): ChatMessage | undefined {
  return messages.find(
    (message): message is ChatMessage =>
      message.role !== "system" && matchesMessageKey(message, uiMessageKey),
  );
}

function canUseMessageRevoke(message: ChatMessage, now = Date.now()) {
  if (
    message.role !== "agent" ||
    !message.isOwnMessage ||
    message.isRevoked ||
    message.revokePending ||
    message.status !== "sent" ||
    !isValidMessageSeq(message.seq)
  ) {
    return false;
  }

  const sentAt = parseWorkbenchTimestamp(message.sentAt);

  return Number.isFinite(sentAt) && now - sentAt < MESSAGE_REVOKE_WINDOW_MS;
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

function getMediaUploadFallbackMessage(error: unknown, fallback: string) {
  return getRequestErrorCode(error) === MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE
    ? "上传组件加载失败，请刷新页面后重试"
    : fallback;
}

function getRequestApiErrorMessage(error: unknown) {
  if (isErrorWithMessage(error)) {
    return error.message;
  }

  return undefined;
}

function isSmartReplyContentIncompleteSkipError(error: unknown) {
  return (
    getRequestApiErrorDetailText(error, "errorMsg") ===
      SMART_REPLY_CONTENT_INCOMPLETE_SKIP_MESSAGE ||
    getRequestApiErrorMessage(error)?.trim() ===
    SMART_REPLY_CONTENT_INCOMPLETE_SKIP_MESSAGE
  );
}

function getRequestApiErrorDetailText(error: unknown, key: string) {
  if (!error || typeof error !== "object" || !("details" in error)) {
    return undefined;
  }

  const details = (error as { details?: unknown }).details;

  if (!details || typeof details !== "object" || !(key in details)) {
    return undefined;
  }

  const value = (details as Record<string, unknown>)[key];

  return typeof value === "string" ? value.trim() : undefined;
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
