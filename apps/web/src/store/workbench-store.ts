import { create } from "zustand";
import { formatConversationPreview, formatWorkbenchTimestamp } from "@/pages/chat/api/workbench-adapter";
import {
  bootstrapWorkbench,
  loadAccountScope,
  loadConversationMessagesPage,
  markConversationRead,
  pollWorkbench,
  sendTextMessage,
  takeOverAccount as takeOverAccountRequest,
} from "@/pages/chat/api/workbench-gateway";
import {
  getComposerSegmentsPreview,
  normalizeComposerSegments,
  type ComposerSegment,
} from "@/pages/chat/lib/composer-segments";
import { seedCustomerProfiles } from "@/pages/chat/mock-data";
import type {
  Account,
  ChatMessage,
  ChatMode,
  Conversation,
  CustomerProfile,
  EmployeeProfile,
  Message,
} from "@/pages/chat/chat-types";

type AsyncStatus = "idle" | "loading" | "ready" | "error";
type HistoryStatus = "idle" | "loading";
type SendStatus = "idle" | "sending";
type TakeoverStatus = "idle" | "taking-over";

type PollState = {
  status: "idle" | "polling" | "error";
  intervalMs: number;
  jitterMs: number;
  errorMessage?: string;
  lastSuccessAt?: number;
};

type WorkbenchState = {
  me?: EmployeeProfile;
  accounts: Account[];
  conversationListsByScope: Record<string, Conversation[]>;
  customerProfilesById: Record<string, CustomerProfile>;
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
  hasMoreHistoryByConversationId: Record<string, boolean>;
  sendStatusByConversationId: Record<string, SendStatus>;
  takeoverStatusByAccountId: Record<string, TakeoverStatus>;
  pollState: PollState;
  sinceVersion: number;
  activeMessageSeq: number;
  pendingMessages: Message[];
  dismissScopeTransitionError: () => void;
  dismissReadReceiptError: () => void;
  initializeWorkbench: () => Promise<void>;
  setActiveAccount: (accountId: string) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  setActiveMode: (mode: ChatMode) => Promise<void>;
  sendAgentMessageSegments: (segments: ComposerSegment[]) => Promise<void>;
  sendAgentTextMessage: (text: string) => Promise<void>;
  takeOverAccount: (accountId: string) => Promise<void>;
  retryFailedMessage: (messageId: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  pollWorkbench: () => Promise<void>;
};

type WorkbenchStore = WorkbenchState;

const defaultCustomerProfiles = seedCustomerProfiles;
const MESSAGE_PAGE_SIZE = 50;

function createInitialState(): Omit<
  WorkbenchState,
  | "initializeWorkbench"
  | "setActiveAccount"
  | "setActiveConversation"
  | "setActiveMode"
  | "sendAgentMessageSegments"
  | "sendAgentTextMessage"
  | "takeOverAccount"
  | "retryFailedMessage"
  | "loadOlderMessages"
  | "pollWorkbench"
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
    conversationListsByScope: {},
    customerProfilesById: defaultCustomerProfiles,
    hasMoreHistoryByConversationId: {},
    historyStatusByConversationId: {},
    isConversationLoading: false,
    me: undefined,
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
    takeoverStatusByAccountId: {},
  };
}

function getFirstConversationId(
  conversationListsByScope: Record<string, Conversation[]>,
  accountId: string,
  mode: ChatMode,
) {
  const conversations = conversationListsByScope[accountId] ?? [];
  const firstMatch =
    conversations.find((conversation) => conversation.mode === mode) ??
    conversations[0];

  return firstMatch?.id ?? "";
}

function getActiveMessageSeq(
  messagesByConversationId: Record<string, Message[]>,
  conversationId: string,
) {
  const messages = messagesByConversationId[conversationId] ?? [];
  return messages.reduce((max, message, index) => Math.max(max, message.seq ?? index + 1), 0);
}

function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort(
    (left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0),
  );
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

function upsertMessageList(currentMessages: Message[], nextMessages: Message[]) {
  const merged = [...currentMessages];

  for (const nextMessage of nextMessages) {
    const existingIndex = merged.findIndex((message) =>
      isSameMessage(message, nextMessage),
    );

    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...nextMessage,
      };
      continue;
    }

    merged.push(nextMessage);
  }

  return merged.sort((left, right) => {
    const leftSeq = left.seq ?? 0;
    const rightSeq = right.seq ?? 0;

    if (leftSeq !== rightSeq) {
      return leftSeq - rightSeq;
    }

    return parseWorkbenchTimestamp(left.sentAt) - parseWorkbenchTimestamp(right.sentAt);
  });
}

function isSameMessage(left: Message, right: Message) {
  return (
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

function buildOptimisticMessageContent(segment: ComposerSegment): ChatMessage["content"] {
  if (segment.type === "image") {
    return {
      alt: segment.alt,
      height: segment.height,
      imageUrl: segment.url ?? segment.localUrl ?? "",
      type: "image",
      width: segment.width,
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

export function createWorkbenchStore() {
  let latestScopeRequestId = 0;
  let latestTakeoverRequestId = 0;
  const latestTakeoverRequestIdByAccountId: Record<string, number> = {};

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

  function omitTakeoverStatus(
    takeoverStatusByAccountId: Record<string, TakeoverStatus>,
    accountId: string,
  ) {
    const { [accountId]: _ignored, ...nextTakeoverStatusByAccountId } =
      takeoverStatusByAccountId;
    return nextTakeoverStatusByAccountId;
  }

  return create<WorkbenchStore>((set, get) => {
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

    return {
      ...createInitialState(),
      dismissScopeTransitionError() {
        set({ scopeTransitionError: undefined });
      },
      dismissReadReceiptError() {
        set({ readReceiptError: undefined });
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
          conversationListsByScope: bootstrapResult.conversationListsByScope,
          hasMoreHistoryByConversationId: conversationPage
            ? {
                [conversationPage.conversationId]: conversationPage.hasMoreHistory,
              }
            : {},
          me: bootstrapResult.me,
          messagesByConversationId: conversationPage
            ? { [conversationPage.conversationId]: conversationPage.messages }
            : {},
        });

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
          sinceVersion: state.sinceVersion,
        };
        const response = await pollWorkbench(request, {
          accounts: state.accounts,
          customerProfilesById: state.customerProfilesById,
          me: state.me,
        });

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

          for (const change of response.conversationChanges) {
            const currentList = nextConversationLists[change.accountId] ?? [];

            if (change.type === "remove") {
              nextConversationLists[change.accountId] = currentList.filter(
                (conversation) => conversation.id !== change.conversationId,
              );
              continue;
            }

            nextConversationLists[change.accountId] = mergeConversationList(
              currentList,
              change.conversation,
            );
          }

          const nextMessagesByConversationId = { ...currentState.messagesByConversationId };

          if (
            response.activeConversationMessages.length > 0 &&
            response.request.activeConversationId
          ) {
            const currentMessages =
              nextMessagesByConversationId[response.request.activeConversationId] ?? [];
            nextMessagesByConversationId[response.request.activeConversationId] =
              upsertMessageList(currentMessages, response.activeConversationMessages);
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
                  remoteMessageId: change.remoteMessageId,
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
            messagesByConversationId: nextMessagesByConversationId,
            pendingMessages,
            pollState: {
              ...currentState.pollState,
              lastSuccessAt: Date.now(),
              status: "idle",
            },
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

            set((currentState) => {
              const nextMessagesByConversationId = conversationPage
                ? {
                    ...currentState.messagesByConversationId,
                    [conversationPage.conversationId]: conversationPage.messages,
                  }
                : currentState.messagesByConversationId;
              const nextHistoryByConversationId = conversationPage
                ? {
                    ...currentState.hasMoreHistoryByConversationId,
                    [conversationPage.conversationId]: conversationPage.hasMoreHistory,
                  }
                : currentState.hasMoreHistoryByConversationId;
              const nextState: Partial<WorkbenchStore> = {
                conversationListsByScope: {
                  ...currentState.conversationListsByScope,
                  [accountId]: scopeResult.conversations,
                },
                hasMoreHistoryByConversationId: nextHistoryByConversationId,
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
                pendingMessages: currentState.pendingMessages.filter(
                  (message) => message.conversationId !== state.activeConversationId,
                ),
                sinceVersion: 0,
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
    async sendAgentMessageSegments(segments) {
      const normalizedSegments = normalizeComposerSegments(segments);

      if (normalizedSegments.length === 0) {
        return;
      }

      const state = get();
      const { activeAccountId, activeConversationId, me } = state;

      if (!activeAccountId || !activeConversationId || !me) {
        return;
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
        return;
      }
      const timestamp = Date.now();
      const clientMessageId = `local_${timestamp}_${Math.random().toString(36).slice(2, 6)}`;
      const optimisticMessages = normalizedSegments.map((segment, index) => {
        const segmentClientMessageId = buildSegmentClientMessageId(clientMessageId, index);

        return {
          author: account ? `${account.name}-${account.operator}` : me.displayName,
          isGroupConversation: activeConversation.mode === "group",
          isOwnMessage: true,
          clientMessageId: segmentClientMessageId,
          content: buildOptimisticMessageContent(segment),
          conversationId: activeConversationId,
          id: segmentClientMessageId,
          role: "agent" as const,
          sender: {
            avatarUrl: account?.avatarUrl,
            id: `sender-agent-${activeAccountId}`,
            name: account ? `${account.name}-${account.operator}` : me.displayName,
          },
          sentAt: formatWorkbenchTimestamp(timestamp + index),
          status: "sending" as const,
        } satisfies Message;
      });
      const preview = getComposerSegmentsPreview(normalizedSegments);

      set((currentState) => {
        const currentMessages =
          currentState.messagesByConversationId[activeConversationId] ?? [];
        const nextMessages = [...currentMessages, ...optimisticMessages];
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
              optimisticMessages[0]?.sentAt ?? formatWorkbenchTimestamp(timestamp),
              timestamp,
            ),
          },
          messagesByConversationId: {
            ...currentState.messagesByConversationId,
            [activeConversationId]: nextMessages,
          },
          pendingMessages: [...currentState.pendingMessages, ...optimisticMessages],
          sendStatusByConversationId: {
            ...currentState.sendStatusByConversationId,
            [activeConversationId]: "sending",
          },
        };
      });

      try {
        const response = await sendTextMessage({
          clientMessageId,
          conversationId: activeConversationId,
          seatId: activeAccountId,
          segments: normalizedSegments,
        });
        const ackByClientMessageId = new Map(
          (response.messages ?? [response]).map((message) => [
            message.clientMessageId,
            message.messageId,
          ]),
        );

        set((currentState) => ({
          messagesByConversationId: {
            ...currentState.messagesByConversationId,
            [activeConversationId]: (
              currentState.messagesByConversationId[activeConversationId] ?? []
            ).map((message) =>
              message.clientMessageId && ackByClientMessageId.has(message.clientMessageId)
                ? {
                    ...message,
                    remoteMessageId: ackByClientMessageId.get(message.clientMessageId),
                  }
                : message,
            ),
          },
          sendStatusByConversationId: {
            ...currentState.sendStatusByConversationId,
            [activeConversationId]: "idle",
          },
        }));
      } catch (error) {
        set((currentState) => ({
          messagesByConversationId: {
            ...currentState.messagesByConversationId,
            [activeConversationId]: (
              currentState.messagesByConversationId[activeConversationId] ?? []
            ).map((message) =>
              optimisticMessages.some(
                (optimisticMessage) =>
                  optimisticMessage.clientMessageId === message.clientMessageId,
              )
                ? {
                    ...message,
                    failReason:
                      error instanceof Error ? error.message : "消息发送失败",
                    status: "failed",
                  }
                : message,
            ),
          },
          pendingMessages: currentState.pendingMessages.filter(
            (message) =>
              !optimisticMessages.some(
                (optimisticMessage) =>
                  optimisticMessage.clientMessageId === message.clientMessageId,
              ),
          ),
          sendStatusByConversationId: {
            ...currentState.sendStatusByConversationId,
            [activeConversationId]: "idle",
          },
        }));
      }
    },
    async sendAgentTextMessage(text) {
      await get().sendAgentMessageSegments([
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

      const currentMessages = state.messagesByConversationId[conversationId] ?? [];
      const firstSeq = currentMessages.reduce<number | undefined>((minSeq, message) => {
        if (message.seq == null) {
          return minSeq;
        }

        return minSeq == null ? message.seq : Math.min(minSeq, message.seq);
      }, undefined);

      if (firstSeq == null) {
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
            beforeSeq: firstSeq,
            limit: MESSAGE_PAGE_SIZE,
          },
        );

        set((currentState) => ({
          hasMoreHistoryByConversationId: {
            ...currentState.hasMoreHistoryByConversationId,
            [conversationId]: page.hasMoreHistory,
          },
          historyStatusByConversationId: {
            ...currentState.historyStatusByConversationId,
            [conversationId]: "idle",
          },
          messagesByConversationId: {
            ...currentState.messagesByConversationId,
            [conversationId]: upsertMessageList(
              page.messages,
              currentState.messagesByConversationId[conversationId] ?? [],
            ),
          },
        }));
      } catch {
        set((currentState) => ({
          historyStatusByConversationId: {
            ...currentState.historyStatusByConversationId,
            [conversationId]: "idle",
          },
        }));
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

        set((currentState) => ({
          activeAccountId: accountId,
          activeConversationId: scopeResult.nextConversationId,
          activeMode: scopeResult.nextMode,
          activeMessageSeq: getActiveMessageSeq(
            conversationPage
              ? {
                  ...currentState.messagesByConversationId,
                  [conversationPage.conversationId]: conversationPage.messages,
                }
              : currentState.messagesByConversationId,
            scopeResult.nextConversationId,
          ),
          conversationListsByScope: {
            ...currentState.conversationListsByScope,
            [accountId]: scopeResult.conversations,
          },
          hasMoreHistoryByConversationId: conversationPage
            ? {
                ...currentState.hasMoreHistoryByConversationId,
                [conversationPage.conversationId]: conversationPage.hasMoreHistory,
              }
            : currentState.hasMoreHistoryByConversationId,
          isConversationLoading: false,
          messagesByConversationId: conversationPage
            ? {
                ...currentState.messagesByConversationId,
                [conversationPage.conversationId]: conversationPage.messages,
              }
            : currentState.messagesByConversationId,
          scopeTransitionError: undefined,
        }));

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
      set({
        activeConversationId: conversationId,
        isConversationLoading: true,
        scopeTransitionError: undefined,
      });

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
          messagesByConversationId: {
            ...currentState.messagesByConversationId,
            [conversationId]: page.messages,
          },
          scopeTransitionError: undefined,
        }));

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

      const nextConversationId = getFirstConversationId(
        state.conversationListsByScope,
        state.activeAccountId,
        mode,
      );

      set({ activeMode: mode });

      if (nextConversationId) {
        await get().setActiveConversation(nextConversationId);
      } else {
        set({
          activeConversationId: "",
          activeMessageSeq: 0,
        });
      }
    },
    };
  });
}

export const useWorkbenchStore = createWorkbenchStore();
