export function buildCacheKeys(prefix: string) {
  const normalizedPrefix = prefix.trim();

  return {
    authSession: (sessionId: string | number) =>
      `${normalizedPrefix}auth:session:${sessionId}`,
    authSessionIndex: (subUserId: string | number) =>
      `${normalizedPrefix}auth:session-index:${subUserId}`,
    chatAgentPreflightRate: (
      uid: string | number,
      conversationId: string | number,
      bucket = "initial",
    ) =>
      `${normalizedPrefix}chat:chat-agent-preflight:rate:${uid}:${conversationId}:${bucket}`,
    seatAccess: (subUserId: string | number) =>
      `${normalizedPrefix}seat-access:${subUserId}`,
  };
}
