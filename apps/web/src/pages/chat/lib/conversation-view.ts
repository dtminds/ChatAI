import type { ChatMode, Conversation } from "@/pages/chat/chat-types";

export type ConversationView = "all" | "ai" | "human" | "unread";

export const DEFAULT_CONVERSATION_VIEW = "all" satisfies ConversationView;

export type ConversationViewOption = {
  label: string;
  value: ConversationView;
};

const BASE_VIEW_OPTIONS = [
  { label: "全部", value: "all" },
  { label: "未读", value: "unread" },
] as const satisfies readonly ConversationViewOption[];

const SINGLE_AI_VIEW_OPTIONS = [
  { label: "人工接待", value: "human" },
  { label: "AI托管", value: "ai" },
] as const satisfies readonly ConversationViewOption[];

export function getConversationViewOptions(
  mode: ChatMode,
  isAiHostingEnabled: boolean,
): ConversationViewOption[] {
  if (mode !== "single" || !isAiHostingEnabled) {
    return [...BASE_VIEW_OPTIONS];
  }

  return [...BASE_VIEW_OPTIONS, ...SINGLE_AI_VIEW_OPTIONS];
}

export function isConversationViewAvailable(
  view: ConversationView,
  mode: ChatMode,
  isAiHostingEnabled: boolean,
) {
  return getConversationViewOptions(mode, isAiHostingEnabled).some(
    (option) => option.value === view,
  );
}

export function resolveConversationView(
  view: ConversationView,
  mode: ChatMode,
  isAiHostingEnabled: boolean,
): ConversationView {
  return isConversationViewAvailable(view, mode, isAiHostingEnabled)
    ? view
    : DEFAULT_CONVERSATION_VIEW;
}

export function filterConversationsByView(
  conversations: Conversation[],
  mode: ChatMode,
  view: ConversationView,
  isAiHostingEnabled = false,
  retainedConversationIds?: ReadonlySet<string>,
) {
  const resolvedView = resolveConversationView(view, mode, isAiHostingEnabled);

  return conversations.filter((conversation) =>
    isConversationIncludedInView(
      conversation,
      mode,
      resolvedView,
      isAiHostingEnabled,
      retainedConversationIds,
    ),
  );
}

export function getConversationIdsInView(
  conversations: Conversation[],
  mode: ChatMode,
  view: ConversationView,
  isAiHostingEnabled = false,
) {
  return filterConversationsByView(
    conversations,
    mode,
    view,
    isAiHostingEnabled,
  ).map((conversation) => conversation.id);
}

function isConversationIncludedInView(
  conversation: Conversation,
  mode: ChatMode,
  resolvedView: ConversationView,
  isAiHostingEnabled: boolean,
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

    if (resolvedView === "ai") {
      return isAiHostingEnabled && conversation.aiHosted === true;
    }

    if (resolvedView === "human") {
      return isAiHostingEnabled && conversation.aiHosted !== true;
    }

    return true;
}

export function getConversationViewLabel(view: ConversationView) {
  return [...BASE_VIEW_OPTIONS, ...SINGLE_AI_VIEW_OPTIONS].find(
    (option) => option.value === view,
  )?.label ?? "全部";
}
