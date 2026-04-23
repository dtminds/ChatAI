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
  };
});
