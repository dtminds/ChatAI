export function buildCacheKeys(prefix: string) {
  const normalizedPrefix = prefix.trim();

  return {
    authSession: (sessionId: string | number) =>
      `${normalizedPrefix}auth:session:${sessionId}`,
    authSessionIndex: (subUserId: string | number) =>
      `${normalizedPrefix}auth:session-index:${subUserId}`,
    customerResponsePreflightRate: (
      uid: string | number,
      conversationId: string | number,
      bucket = "initial",
    ) =>
      `${normalizedPrefix}chat:customer-response-preflight:rate:${uid}:${conversationId}:${bucket}`,
    customerResponsePreflightResult: (
      uid: string | number,
      conversationId: string | number,
      messageId: string | number,
    ) =>
      `${normalizedPrefix}chat:customer-response-preflight:result:${uid}:${conversationId}:${messageId}`,
    customerResponseAssistance: (
      uid: string | number,
      conversationId: string | number,
    ) =>
      `${normalizedPrefix}chat:customer-response-preflight:assistance:${uid}:${conversationId}`,
    seatAccess: (subUserId: string | number) =>
      `${normalizedPrefix}seat-access:${subUserId}`,
  };
}
