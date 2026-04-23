import { create } from "zustand";
import {
  adaptAccount,
  adaptConversation,
  adaptEmployee,
  adaptMessage,
  formatConversationPreview,
  formatWorkbenchTimestamp,
} from "@/pages/chat/api/workbench-adapter";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import { seedCustomerProfiles } from "@/pages/chat/mock-data";
import type {
  Account,
  ChatMode,
  Conversation,
  CustomerProfile,
  EmployeeProfile,
  Message,
} from "@/pages/chat/chat-types";

type AsyncStatus = "idle" | "loading" | "ready" | "error";

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
  claimStatus: "idle" | "claiming";
  sendStatus: "idle" | "sending";
  pollState: PollState;
  sinceVersion: number;
  activeMessageSeq: number;
  pendingMessages: Message[];
  initializeWorkbench: () => Promise<void>;
  setActiveAccount: (accountId: string) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  setActiveMode: (mode: ChatMode) => Promise<void>;
  claimActiveConversation: () => Promise<void>;
  sendAgentTextMessage: (text: string) => Promise<void>;
  pollWorkbench: () => Promise<void>;
};

type WorkbenchStore = WorkbenchState;

const defaultCustomerProfiles = seedCustomerProfiles;

function createInitialState(): Omit<
  WorkbenchState,
  | "initializeWorkbench"
  | "setActiveAccount"
  | "setActiveConversation"
  | "setActiveMode"
  | "claimActiveConversation"
  | "sendAgentTextMessage"
  | "pollWorkbench"
> {
  return {
    accounts: [],
    activeAccountId: "",
    activeConversationId: "",
    activeMessageSeq: 0,
    activeMode: "single",
    bootstrapError: undefined,
    bootstrapStatus: "idle",
    claimStatus: "idle",
    conversationListsByScope: {},
    customerProfilesById: defaultCustomerProfiles,
    isConversationLoading: false,
    me: undefined,
    messagesByConversationId: {},
    pendingMessages: [],
    pollState: {
      intervalMs: 2500,
      jitterMs: 350,
      status: "idle",
    },
    sendStatus: "idle",
    sinceVersion: 0,
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

function getFirstConversation(
  conversations: Conversation[],
  mode: ChatMode,
) {
  return conversations.find((conversation) => conversation.mode === mode) ?? conversations[0];
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

function applyReadResult(
  state: WorkbenchStore,
  conversationId: string,
  accountId: string,
  accountUnreadCount: number,
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
            unreadCount: accountUnreadCount,
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
  assignedEmployeeId?: string,
) {
  const currentConversation = conversations.find((conversation) => conversation.id === conversationId);

  if (!currentConversation) {
    return conversations;
  }

  return mergeConversationList(conversations, {
    ...currentConversation,
    assignedEmployeeId,
    preview: formatConversationPreview(preview),
    quietFor: "刚刚更新",
    status: "claimed",
    unread: 0,
    updatedAt,
    updatedAtMs,
  });
}

export const useWorkbenchStore = create<WorkbenchStore>((set, get) => ({
  ...createInitialState(),
  async claimActiveConversation() {
    const state = get();
    const { activeAccountId, activeConversationId, me } = state;

    if (!activeConversationId || !activeAccountId || !me) {
      return;
    }

    const activeConversation = (state.conversationListsByScope[activeAccountId] ?? []).find(
      (conversation) => conversation.id === activeConversationId,
    );

    if (activeConversation?.assignedEmployeeId === me.id) {
      return;
    }

    set({ claimStatus: "claiming" });

    try {
      const response = await getWorkbenchService().claimConversation(activeConversationId);
      const nextConversation = adaptConversation(response.conversation);

      set((currentState) => ({
        claimStatus: "idle",
        conversationListsByScope: {
          ...currentState.conversationListsByScope,
          [activeAccountId]: mergeConversationList(
            currentState.conversationListsByScope[activeAccountId] ?? [],
            nextConversation,
          ),
        },
      }));
    } catch {
      set({ claimStatus: "idle" });
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

    try {
      const service = getWorkbenchService();
      const [meDto, accountDtos] = await Promise.all([
        service.getMe(),
        service.getAccounts(),
      ]);

      const me = adaptEmployee(meDto);
      const accounts = accountDtos.map((account) => adaptAccount(account, account.unreadCount));
      const accountMap = Object.fromEntries(accounts.map((account) => [account.id, account])) as Record<
        string,
        Account
      >;
      const activeAccountId = accounts[0]?.id ?? "";
      const conversationDtos = activeAccountId
        ? await service.getConversations(activeAccountId)
        : [];
      const activeConversations = conversationDtos.map(adaptConversation);
      const activeConversationId = getFirstConversationId(
        {
          [activeAccountId]: activeConversations,
        },
        activeAccountId,
        state.activeMode,
      );
      const messageDtos = activeConversationId
        ? await service.getMessages(activeConversationId, { limit: 30 })
        : [];
      const messages = messageDtos.map((message) =>
        adaptMessage(message, defaultCustomerProfiles, accountMap, me),
      );

      set({
        accounts,
        activeAccountId,
        activeConversationId,
        activeMessageSeq: getActiveMessageSeq(
          {
            [activeConversationId]: messages,
          },
          activeConversationId,
        ),
        bootstrapStatus: "ready",
        conversationListsByScope: {
          [activeAccountId]: activeConversations,
        },
        me,
        messagesByConversationId: activeConversationId
          ? { [activeConversationId]: messages }
          : {},
      });

      if (activeConversationId) {
        const readResult = await service.markConversationRead(activeConversationId);

        set((currentState) => ({
          ...applyReadResult(
            currentState,
            readResult.conversationId,
            readResult.accountId,
            readResult.accountUnreadCount,
          ),
        }));
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
      const response = await getWorkbenchService().poll({
        activeConversationId: state.activeConversationId,
        activeMessageSeq: state.activeMessageSeq,
        currentAccountId: state.activeAccountId,
        sinceVersion: state.sinceVersion,
      });

      set((currentState) => {
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
        const nextAccountMap = Object.fromEntries(
          nextAccounts.map((account) => [account.id, account]),
        ) as Record<string, Account>;
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
            adaptConversation(change),
          );
        }

        const nextMessagesByConversationId = { ...currentState.messagesByConversationId };

        if (response.activeConversationMessages.length > 0 && currentState.activeConversationId) {
          const incomingMessages = response.activeConversationMessages.map((message) =>
            adaptMessage(
              message,
              currentState.customerProfilesById,
              nextAccountMap,
              currentState.me,
            ),
          );
          const currentMessages =
            nextMessagesByConversationId[currentState.activeConversationId] ?? [];
          nextMessagesByConversationId[currentState.activeConversationId] =
            upsertMessageList(currentMessages, incomingMessages);
        }

        for (const change of response.messageStatusChanges) {
          const conversationMessages = nextMessagesByConversationId[change.conversationId] ?? [];

          nextMessagesByConversationId[change.conversationId] = conversationMessages.map(
            (message) => {
              const matches =
                (change.clientMessageId &&
                  message.clientMessageId === change.clientMessageId) ||
                message.remoteMessageId === change.messageId;

              if (!matches) {
                return message;
              }

              return {
                ...message,
                failReason: change.reason,
                remoteMessageId: change.messageId,
                status:
                  change.status === "failed"
                    ? "failed"
                    : change.status === "read"
                      ? "read"
                      : "sent",
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
            currentState.activeConversationId,
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
      set((currentState) => ({
        pollState: {
          ...currentState.pollState,
          errorMessage: error instanceof Error ? error.message : "轮询失败",
          status: "error",
        },
      }));
    }
  },
  async sendAgentTextMessage(text) {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return;
    }

    const state = get();
    const { activeAccountId, activeConversationId, me } = state;

    if (!activeAccountId || !activeConversationId || !me) {
      return;
    }

    const activeConversation = (state.conversationListsByScope[activeAccountId] ?? []).find(
      (conversation) => conversation.id === activeConversationId,
    );

    if (!activeConversation) {
      return;
    }

    if (
      activeConversation.assignedEmployeeId &&
      activeConversation.assignedEmployeeId !== me.id
    ) {
      return;
    }

    if (!activeConversation.assignedEmployeeId || activeConversation.status === "public") {
      await get().claimActiveConversation();
    }

    const account = state.accounts.find((item) => item.id === activeAccountId);
    const timestamp = Date.now();
    const clientMessageId = `local_${timestamp}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMessage: Message = {
      author: account ? `${account.name}-${account.operator}` : me.displayName,
      clientMessageId,
      content: {
        text: normalizedText,
        type: "text",
      },
      conversationId: activeConversationId,
      id: clientMessageId,
      role: "agent",
      sender: {
        avatarUrl: account?.avatarUrl,
        id: `sender-agent-${activeAccountId}`,
        name: account ? `${account.name}-${account.operator}` : me.displayName,
      },
      sentAt: formatWorkbenchTimestamp(timestamp),
      status: "sending",
    };

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
            normalizedText,
            optimisticMessage.sentAt,
            timestamp,
            currentState.me?.id,
          ),
        },
        messagesByConversationId: {
          ...currentState.messagesByConversationId,
          [activeConversationId]: nextMessages,
        },
        pendingMessages: [...currentState.pendingMessages, optimisticMessage],
        sendStatus: "sending",
      };
    });

    try {
      const response = await getWorkbenchService().sendMessage({
        accountId: activeAccountId,
        clientMessageId,
        content: normalizedText,
        contentType: "text",
        conversationId: activeConversationId,
      });

      set((currentState) => ({
        messagesByConversationId: {
          ...currentState.messagesByConversationId,
          [activeConversationId]: (
            currentState.messagesByConversationId[activeConversationId] ?? []
          ).map((message) =>
            message.clientMessageId === clientMessageId
              ? {
                  ...message,
                  remoteMessageId: response.messageId,
                }
              : message,
          ),
        },
        sendStatus: "idle",
      }));
    } catch (error) {
      set((currentState) => ({
        messagesByConversationId: {
          ...currentState.messagesByConversationId,
          [activeConversationId]: (
            currentState.messagesByConversationId[activeConversationId] ?? []
          ).map((message) =>
            message.clientMessageId === clientMessageId
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
          (message) => message.clientMessageId !== clientMessageId,
        ),
        sendStatus: "idle",
      }));
    }
  },
  async setActiveAccount(accountId) {
    const state = get();

    if (!accountId || state.activeAccountId === accountId) {
      return;
    }

    set({ isConversationLoading: true });

    try {
      const service = getWorkbenchService();
      const conversationDtos = await service.getConversations(accountId);
      const conversations = conversationDtos.map(adaptConversation);
      const nextConversation = getFirstConversation(conversations, state.activeMode);
      const nextConversationId = nextConversation?.id ?? "";
      const nextMode = nextConversation?.mode ?? state.activeMode;
      const accountMap = Object.fromEntries(
        state.accounts.map((account) => [account.id, account]),
      ) as Record<string, Account>;
      const messageDtos = nextConversationId
        ? await service.getMessages(nextConversationId, { limit: 30 })
        : [];
      const messages = messageDtos.map((message) =>
        adaptMessage(message, state.customerProfilesById, accountMap, state.me),
      );

      set((currentState) => ({
        activeAccountId: accountId,
        activeConversationId: nextConversationId,
        activeMode: nextMode,
        activeMessageSeq: getActiveMessageSeq(
          {
            ...currentState.messagesByConversationId,
            [nextConversationId]: messages,
          },
          nextConversationId,
        ),
        conversationListsByScope: {
          ...currentState.conversationListsByScope,
          [accountId]: conversations,
        },
        isConversationLoading: false,
        messagesByConversationId: nextConversationId
          ? {
              ...currentState.messagesByConversationId,
              [nextConversationId]: messages,
            }
          : currentState.messagesByConversationId,
      }));

      if (nextConversationId) {
        const readResult = await service.markConversationRead(nextConversationId);

        set((currentState) => ({
          ...applyReadResult(
            currentState,
            readResult.conversationId,
            readResult.accountId,
            readResult.accountUnreadCount,
          ),
        }));
      }
    } catch {
      set({ isConversationLoading: false });
    }
  },
  async setActiveConversation(conversationId) {
    const state = get();

    if (!conversationId || !state.activeAccountId || state.activeConversationId === conversationId) {
      return;
    }

    set({
      activeConversationId: conversationId,
      isConversationLoading: true,
    });

    try {
      const service = getWorkbenchService();
      const accountMap = Object.fromEntries(
        state.accounts.map((account) => [account.id, account]),
      ) as Record<string, Account>;
      const messageDtos = await service.getMessages(conversationId, { limit: 30 });
      const messages = messageDtos.map((message) =>
        adaptMessage(message, state.customerProfilesById, accountMap, state.me),
      );

      set((currentState) => ({
        activeMessageSeq: getActiveMessageSeq(
          {
            ...currentState.messagesByConversationId,
            [conversationId]: messages,
          },
          conversationId,
        ),
        isConversationLoading: false,
        messagesByConversationId: {
          ...currentState.messagesByConversationId,
          [conversationId]: messages,
        },
      }));

      const readResult = await service.markConversationRead(conversationId);

      set((currentState) => ({
        ...applyReadResult(
          currentState,
          readResult.conversationId,
          readResult.accountId,
          readResult.accountUnreadCount,
        ),
      }));
    } catch {
      set({ isConversationLoading: false });
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
}));
