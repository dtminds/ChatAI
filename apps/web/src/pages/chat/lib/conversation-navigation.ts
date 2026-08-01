const CONVERSATION_ROUTE_PREFIX = "/chat/conversations/";

export const OPEN_CONVERSATION_LOCATION_STATE = {
  openConversation: true,
} as const;

/**
 * Public navigation protocol for opening a conversation from another module.
 *
 * Prefer `OpenConversationLink` for links. Imperative callers should use this
 * target with `navigate(target.pathname, { state: target.state })` instead of
 * constructing `/chat/conversations/:id` themselves.
 *
 * The state marks an intentional application open: the workbench selects and
 * temporarily promotes the conversation, then replaces the URL with `/chat`.
 * A bare conversation URL has no intent state, so it opens without promotion.
 */
export function createOpenConversationTarget(conversationId: string) {
  return {
    pathname: `${CONVERSATION_ROUTE_PREFIX}${encodeURIComponent(conversationId)}`,
    state: OPEN_CONVERSATION_LOCATION_STATE,
  } as const;
}

export function getRoutedConversationId(pathname: string) {
  if (!pathname.startsWith(CONVERSATION_ROUTE_PREFIX)) {
    return undefined;
  }

  const encodedConversationId = pathname.slice(CONVERSATION_ROUTE_PREFIX.length);

  if (!encodedConversationId) {
    return undefined;
  }

  try {
    return decodeURIComponent(encodedConversationId);
  } catch {
    return undefined;
  }
}

export function isConversationRoutePath(pathname: string) {
  return pathname.startsWith(CONVERSATION_ROUTE_PREFIX);
}

export function isOpenConversationLocationState(
  value: unknown,
): value is typeof OPEN_CONVERSATION_LOCATION_STATE {
  return (
    typeof value === "object" &&
    value !== null &&
    "openConversation" in value &&
    value.openConversation === true
  );
}
