import type { ChatMode, Conversation } from "@/pages/chat/chat-types";
import { isConversationAIHostingEnabled } from "@/pages/chat/lib/conversation-ai-hosting";

export type ConversationView = "all" | "ai" | "human" | "read-unreplied" | "unread";

export const DEFAULT_CONVERSATION_VIEW = "all" satisfies ConversationView;

export type ConversationViewOption = {
  label: string;
  value: ConversationView;
};

const BASE_VIEW_OPTIONS = [
  { label: "全部", value: "all" },
  { label: "未读", value: "unread" },
] as const satisfies readonly ConversationViewOption[];

const SINGLE_VIEW_OPTIONS = [
  { label: "已读未回", value: "read-unreplied" },
] as const satisfies readonly ConversationViewOption[];

const SINGLE_AI_VIEW_OPTIONS = [
  { label: "人工接待", value: "human" },
  { label: "AI托管", value: "ai" },
] as const satisfies readonly ConversationViewOption[];

export function getConversationViewOptions(
  mode: ChatMode,
  isSeatAIHostingEnabled: boolean,
): ConversationViewOption[] {
  if (mode !== "single") {
    return [...BASE_VIEW_OPTIONS];
  }

  if (!isSeatAIHostingEnabled) {
    return [...BASE_VIEW_OPTIONS, ...SINGLE_VIEW_OPTIONS];
  }

  return [...BASE_VIEW_OPTIONS, ...SINGLE_VIEW_OPTIONS, ...SINGLE_AI_VIEW_OPTIONS];
}

export function isConversationViewAvailable(
  view: ConversationView,
  mode: ChatMode,
  isSeatAIHostingEnabled: boolean,
) {
  return getConversationViewOptions(mode, isSeatAIHostingEnabled).some(
    (option) => option.value === view,
  );
}

export function resolveConversationView(
  view: ConversationView,
  mode: ChatMode,
  isSeatAIHostingEnabled: boolean,
): ConversationView {
  return isConversationViewAvailable(view, mode, isSeatAIHostingEnabled)
    ? view
    : DEFAULT_CONVERSATION_VIEW;
}

export function filterConversationsByView(
  conversations: Conversation[],
  mode: ChatMode,
  view: ConversationView,
  isSeatAIHostingEnabled = false,
  retainedConversationIds?: ReadonlySet<string>,
) {
  const resolvedView = resolveConversationView(view, mode, isSeatAIHostingEnabled);

  return conversations.filter((conversation) =>
    isConversationIncludedInView(
      conversation,
      mode,
      resolvedView,
      isSeatAIHostingEnabled,
      retainedConversationIds,
    ),
  );
}

export function getConversationIdsInView(
  conversations: Conversation[],
  mode: ChatMode,
  view: ConversationView,
  isSeatAIHostingEnabled = false,
) {
  return filterConversationsByView(
    conversations,
    mode,
    view,
    isSeatAIHostingEnabled,
  ).map((conversation) => conversation.id);
}

function isConversationIncludedInView(
  conversation: Conversation,
  mode: ChatMode,
  resolvedView: ConversationView,
  isSeatAIHostingEnabled: boolean,
  retainedConversationIds?: ReadonlySet<string>,
) {
    if (conversation.mode !== mode) {
      return false;
    }

    if (retainedConversationIds?.has(conversation.id)) {
      return true;
    }

    if (resolvedView === "unread") {
      return conversation.unread > 0;
    }

    if (resolvedView === "read-unreplied") {
      return (
        conversation.unread === 0 &&
        conversation.replied === false &&
        Boolean(conversation.lastMessageId) &&
        conversation.customerBindType !== 2
      );
    }

    if (resolvedView === "ai") {
      return isConversationAIHostingEnabled(conversation, isSeatAIHostingEnabled);
    }

    if (resolvedView === "human") {
      return (
        isSeatAIHostingEnabled &&
        !isConversationAIHostingEnabled(conversation, isSeatAIHostingEnabled)
      );
    }

    return true;
}

export function getConversationViewLabel(view: ConversationView) {
  return [...BASE_VIEW_OPTIONS, ...SINGLE_VIEW_OPTIONS, ...SINGLE_AI_VIEW_OPTIONS].find(
    (option) => option.value === view,
  )?.label ?? "全部";
}
