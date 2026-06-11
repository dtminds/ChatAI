import type { CachePort } from "./cache-port.js";
import { buildCacheKeys } from "./keys.js";

const DELETE_BATCH_SIZE = 1000;

type InvalidationLogger = {
  warn(details: Record<string, unknown>, message: string): void;
};

export async function invalidateSession(
  cache: CachePort | undefined,
  keys: ReturnType<typeof buildCacheKeys>,
  sessionId: string | number,
  logger?: InvalidationLogger,
) {
  await safelyInvalidate(
    () => cache?.del(keys.authSession(sessionId)),
    logger,
  );
}

export async function invalidateSubUserSessions(
  cache: CachePort | undefined,
  keys: ReturnType<typeof buildCacheKeys>,
  subUserId: string | number,
  logger?: InvalidationLogger,
) {
  const indexKey = keys.authSessionIndex(subUserId);
  const sessionIds = await safelyReadMembers(cache, indexKey, logger);
  const sessionKeys = sessionIds.map((sessionId) => keys.authSession(sessionId));

  for (let i = 0; i < sessionKeys.length; i += DELETE_BATCH_SIZE) {
    const batch = sessionKeys.slice(i, i + DELETE_BATCH_SIZE);
    await safelyInvalidate(
      () => cache?.del(...batch),
      logger,
    );
  }

  await safelyInvalidate(
    () => cache?.del(indexKey),
    logger,
  );
}

export async function invalidateSeatAccess(
  cache: CachePort | undefined,
  keys: ReturnType<typeof buildCacheKeys>,
  subUserId: string | number,
  logger?: InvalidationLogger,
) {
  await safelyInvalidate(
    () => cache?.del(keys.seatAccess(subUserId)),
    logger,
  );
}

export async function invalidateSeatAccessBatch(
  cache: CachePort | undefined,
  keys: ReturnType<typeof buildCacheKeys>,
  subUserIds: Array<string | number>,
  logger?: InvalidationLogger,
) {
  const uniqueKeys = Array.from(
    new Set(subUserIds.map((subUserId) => keys.seatAccess(subUserId))),
  );

  await safelyInvalidate(
    () => cache?.del(...uniqueKeys),
    logger,
  );
}

async function safelyReadMembers(
  cache: CachePort | undefined,
  indexKey: string,
  logger?: InvalidationLogger,
) {
  try {
    return (await cache?.smembers(indexKey)) ?? [];
  } catch (error) {
    logInvalidationFailure(error, logger);
    return [];
  }
}

async function safelyInvalidate(
  invalidate: () => Promise<void> | undefined,
  logger?: InvalidationLogger,
) {
  try {
    await invalidate();
  } catch (error) {
    logInvalidationFailure(error, logger);
  }
}

function logInvalidationFailure(
  error: unknown,
  logger?: InvalidationLogger,
) {
  logger?.warn(
    { error: error instanceof Error ? error.message : String(error) },
    "Cache invalidation failed",
  );
}
