import { Redis } from "ioredis";
import fp from "fastify-plugin";
import { buildCacheKeys } from "../cache/keys.js";
import { NoopCache } from "../cache/noop-cache.js";
import { RedisCache } from "../cache/redis-cache.js";
import type { CachePort } from "../cache/cache-port.js";

declare module "fastify" {
  interface FastifyInstance {
    cache: CachePort;
    cacheKeys: ReturnType<typeof buildCacheKeys>;
  }
}

export const redisPlugin = fp(async (app) => {
  const cacheKeys = buildCacheKeys(process.env.REDIS_KEY_PREFIX ?? "chatai:");
  app.decorate("cacheKeys", cacheKeys);

  if (process.env.REDIS_ENABLED !== "true") {
    app.decorate("cache", new NoopCache());
    return;
  }

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL must be configured when REDIS_ENABLED=true");
  }

  const client = new Redis(redisUrl, {
    commandTimeout: readPositiveInteger(
      process.env.REDIS_COMMAND_TIMEOUT_MS,
      500,
    ),
    connectTimeout: readPositiveInteger(
      process.env.REDIS_CONNECT_TIMEOUT_MS,
      3000,
    ),
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  const cache = new RedisCache(client, app.log);

  client.on("error", (error: Error) => {
    app.log.warn({ error: error.message }, "Redis cache client error");
  });

  try {
    await client.connect();
  } catch (error) {
    app.log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Redis cache connect failed; continuing with runtime fallback",
    );
  }

  app.decorate("cache", cache);
  app.addHook("onClose", async () => {
    client.disconnect();
  });
});

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
