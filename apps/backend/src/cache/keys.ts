export function buildCacheKeys(prefix: string) {
  const normalizedPrefix = prefix.trim();

  return {
    authSession: (sessionId: string | number) =>
      `${normalizedPrefix}auth:session:${sessionId}`,
    authSessionIndex: (subUserId: string | number) =>
      `${normalizedPrefix}auth:session-index:${subUserId}`,
    seatAccess: (subUserId: string | number) =>
      `${normalizedPrefix}seat-access:${subUserId}`,
  };
}
