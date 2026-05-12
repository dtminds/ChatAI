import {
  adaptAccount,
  adaptConversation,
  adaptEmployee,
  adaptMessage,
} from "@/pages/chat/api/workbench-adapter";
import type {
  WorkbenchConversationReadResponse,
  WorkbenchMessageStatus,
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchSeatChangeDto,
} from "@chatai/contracts";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import type {
  Account,
  ChatMode,
  Conversation,
  CustomerProfile,
  EmployeeProfile,
  Message,
  MessageStatus,
} from "@/pages/chat/chat-types";

type GatewayContext = {
  accounts: Account[];
  customerProfilesById: Record<string, CustomerProfile>;
  me?: EmployeeProfile;
};

export type WorkbenchScopeRequest = {
  activeConversationId: string;
  activeMessageSeq: number;
  currentAccountId: string;
  sinceVersion: number;
};

export type WorkbenchConversationPage = {
  conversationId: string;
  hasMoreHistory: boolean;
  messages: Message[];
  nextBeforeSeq?: number;
  skippedHiddenCount: number;
};

export type WorkbenchBootstrapResult = {
  accounts: Account[];
  activeAccountId: string;
  activeConversationId: string;
  activeMode: ChatMode;
  conversationListsByScope: Record<string, Conversation[]>;
  conversationPage?: WorkbenchConversationPage;
  me: EmployeeProfile;
};

export type WorkbenchAccountScopeResult = {
  accountId: string;
  conversations: Conversation[];
  conversationPage?: WorkbenchConversationPage;
  nextConversationId: string;
  nextMode: ChatMode;
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
  messageStatusChanges: WorkbenchMessageStatusChange[];
  nextVersion: number;
  request: WorkbenchScopeRequest;
};

const DEFAULT_MESSAGE_PAGE_SIZE = 50;

export async function bootstrapWorkbench(
  preferredMode: ChatMode,
  customerProfilesById: Record<string, CustomerProfile>,
  pageSize = DEFAULT_MESSAGE_PAGE_SIZE,
): Promise<WorkbenchBootstrapResult> {
  const service = getWorkbenchService();
  const [meDto, accountDtos] = await Promise.all([
    service.getMe(),
    service.getSeats(),
  ]);

  const me = adaptEmployee(meDto);
  const accounts = accountDtos.map((account) => adaptAccount(account, account.unreadCount));
  const activeAccountId = accounts[0]?.id ?? "";
  const conversationDtos = activeAccountId
    ? await service.getConversations(activeAccountId)
    : [];
  const conversations = conversationDtos.map(adaptConversation);
  const nextConversation = getFirstConversation(conversations, preferredMode);
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
  };
}

export async function loadAccountScope(
  accountId: string,
  preferredMode: ChatMode,
  context: GatewayContext,
  pageSize = DEFAULT_MESSAGE_PAGE_SIZE,
  preferredConversationId?: string,
): Promise<WorkbenchAccountScopeResult> {
  const service = getWorkbenchService();
  const conversationDtos = await service.getConversations(accountId);
  const conversations = conversationDtos.map(adaptConversation);
  const nextConversation =
    conversations.find((conversation) => conversation.id === preferredConversationId) ??
    getFirstConversation(conversations, preferredMode);
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
  };
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

export async function markConversationRead(
  conversationId: string,
): Promise<WorkbenchConversationReadResponse> {
  return getWorkbenchService().markConversationRead(conversationId);
}

export async function sendTextMessage(
  payload: WorkbenchSendMessagePayload,
): Promise<WorkbenchSendMessageResponse> {
  return getWorkbenchService().sendMessage(payload);
}

export async function takeOverAccount(accountId: string): Promise<Account> {
  const response = await getWorkbenchService().takeOverSeat(accountId);
  return adaptAccount(response.seat, response.seat.unreadCount);
}

export async function pollWorkbench(
  request: WorkbenchScopeRequest,
  context: GatewayContext,
): Promise<WorkbenchPollResult> {
  const response = await getWorkbenchService().poll(request);

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
    messageStatusChanges: response.messageStatusChanges.map((change) => ({
      clientMessageId: change.clientMessageId,
      conversationId: change.conversationId,
      reason: change.reason,
      remoteMessageId: change.messageId,
      status: adaptMessageStatus(change.status),
    })),
    nextVersion: response.nextVersion,
    request,
  };
}

function adaptMessages(
  messageDtos: Parameters<typeof adaptMessage>[0][],
  context: GatewayContext,
) {
  const accountMap = Object.fromEntries(
    context.accounts.map((account) => [account.id, account]),
  ) as Record<string, Account>;

  return messageDtos.map((message) =>
    adaptMessage(
      message,
      context.customerProfilesById,
      accountMap,
      context.me,
    ),
  );
}

function adaptMessageStatus(status: WorkbenchMessageStatus): MessageStatus {
  switch (status) {
    case "failed":
      return "failed";
    case "read":
      return "read";
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
