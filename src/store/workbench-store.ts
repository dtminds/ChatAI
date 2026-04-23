import { create } from "zustand";
import { seedAccounts, seedConversations, seedCustomerProfiles, seedMessages } from "@/pages/chat/mock-data";
import type { Account, ChatMode, Conversation, CustomerProfile, Message } from "@/pages/chat/chat-types";

type PollState = {
  status: "idle" | "polling" | "error";
  intervalMs: number;
};

type WorkbenchState = {
  accounts: Account[];
  conversationListsByScope: Record<string, Conversation[]>;
  customerProfilesById: Record<string, CustomerProfile>;
  messagesByConversationId: Record<string, Message[]>;
  activeAccountId: string;
  activeConversationId: string;
  activeMode: ChatMode;
  pollState: PollState;
  sinceVersion: number;
  activeMessageSeq: number;
  pendingMessages: Message[];
  setActiveAccount: (accountId: string) => void;
  setActiveConversation: (conversationId: string) => void;
  setActiveMode: (mode: ChatMode) => void;
  sendAgentTextMessage: (text: string) => void;
};

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
  return messagesByConversationId[conversationId]?.length ?? 0;
}

function formatWorkbenchTimestamp(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
    .concat(" ")
    .concat(
      [
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0"),
      ].join(":"),
    );
}

function formatConversationPreview(text: string) {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (normalizedText.length <= 28) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, 28)}…`;
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => {
  const initialAccountId = seedAccounts[0]?.id ?? "";
  const initialMode: ChatMode = "single";
  const initialConversationId = getFirstConversationId(
    seedConversations,
    initialAccountId,
    initialMode,
  );

  return {
    accounts: seedAccounts,
    conversationListsByScope: seedConversations,
    customerProfilesById: seedCustomerProfiles,
    messagesByConversationId: seedMessages,
    activeAccountId: initialAccountId,
    activeConversationId: initialConversationId,
    activeMode: initialMode,
    pollState: {
      status: "idle",
      intervalMs: 2500,
    },
    sinceVersion: 1284,
    activeMessageSeq: getActiveMessageSeq(seedMessages, initialConversationId),
    pendingMessages: [],
    setActiveAccount: (accountId) => {
      const state = get();
      const nextConversationId = getFirstConversationId(
        state.conversationListsByScope,
        accountId,
        state.activeMode,
      );

      set({
        activeAccountId: accountId,
        activeConversationId: nextConversationId,
        activeMessageSeq: getActiveMessageSeq(
          state.messagesByConversationId,
          nextConversationId,
        ),
      });
    },
    setActiveConversation: (conversationId) => {
      const state = get();

      set({
        activeConversationId: conversationId,
        activeMessageSeq: getActiveMessageSeq(
          state.messagesByConversationId,
          conversationId,
        ),
      });
    },
    setActiveMode: (mode) => {
      const state = get();
      const nextConversationId = getFirstConversationId(
        state.conversationListsByScope,
        state.activeAccountId,
        mode,
      );

      set({
        activeMode: mode,
        activeConversationId: nextConversationId,
        activeMessageSeq: getActiveMessageSeq(
          state.messagesByConversationId,
          nextConversationId,
        ),
      });
    },
    sendAgentTextMessage: (text) => {
      const normalizedText = text.trim();

      if (!normalizedText) {
        return;
      }

      const state = get();
      const { activeAccountId, activeConversationId } = state;

      if (!activeAccountId || !activeConversationId) {
        return;
      }

      const currentMessages = state.messagesByConversationId[activeConversationId] ?? [];
      const activeAccount = state.accounts.find(
        (account) => account.id === activeAccountId,
      );
      const latestAgentMessage = [...currentMessages]
        .reverse()
        .find((message) => message.role === "agent");
      const sentAt = formatWorkbenchTimestamp(new Date());
      const author = activeAccount
        ? `${activeAccount.name}-${activeAccount.operator}`
        : "当前客服";

      const nextMessage: Message = {
        id: `msg-local-${Date.now()}`,
        conversationId: activeConversationId,
        role: "agent",
        author,
        sender: {
          id: `sender-agent-${activeAccountId}`,
          name: author,
          avatarUrl:
            latestAgentMessage?.role === "agent"
              ? latestAgentMessage.sender.avatarUrl
              : activeAccount?.avatarUrl,
        },
        content: {
          type: "text",
          text: normalizedText,
        },
        sentAt,
        status: "sent",
      };

      const nextMessages = [...currentMessages, nextMessage];
      const currentConversations =
        state.conversationListsByScope[activeAccountId] ?? [];
      const updatedConversation = currentConversations.find(
        (conversation) => conversation.id === activeConversationId,
      );

      if (!updatedConversation) {
        return;
      }

      const nextConversationList = [
        {
          ...updatedConversation,
          preview: formatConversationPreview(normalizedText),
          unread: 0,
          updatedAt: sentAt,
        },
        ...currentConversations.filter(
          (conversation) => conversation.id !== activeConversationId,
        ),
      ];

      set({
        activeMessageSeq: nextMessages.length,
        conversationListsByScope: {
          ...state.conversationListsByScope,
          [activeAccountId]: nextConversationList,
        },
        messagesByConversationId: {
          ...state.messagesByConversationId,
          [activeConversationId]: nextMessages,
        },
        sinceVersion: state.sinceVersion + 1,
      });
    },
  };
});
