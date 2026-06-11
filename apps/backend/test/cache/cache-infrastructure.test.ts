import { describe, expect, it, vi } from "vitest";
import { buildCacheKeys } from "../../src/cache/keys.js";
import { NoopCache } from "../../src/cache/noop-cache.js";
import { RedisCache } from "../../src/cache/redis-cache.js";

describe("cache infrastructure", () => {
  it("keeps NoopCache as a cache miss fallback", async () => {
    const cache = new NoopCache();

    await expect(cache.get("missing")).resolves.toBeNull();
    await expect(cache.smembers("missing-set")).resolves.toBeNull();
    await expect(cache.set("key", "value", 60)).resolves.toBeUndefined();
    await expect(cache.sadd("set", ["a"], 60)).resolves.toBeUndefined();
    await expect(cache.del("key", "set")).resolves.toBeUndefined();
  });

  it("builds cache keys under a shared prefix", () => {
    const keys = buildCacheKeys("chatai:");

    expect(keys.authSession("501")).toBe("chatai:auth:session:501");
    expect(keys.authSessionIndex("101")).toBe("chatai:auth:session-index:101");
    expect(keys.seatAccess("101")).toBe("chatai:seat-access:101");
  });

  it("treats Redis command failures as cache misses", async () => {
    const logger = { warn: vi.fn() };
    const client = {
      del: vi.fn().mockRejectedValue(new Error("redis down")),
      get: vi.fn().mockRejectedValue(new Error("redis down")),
      pipeline: vi.fn(),
      smembers: vi.fn().mockRejectedValue(new Error("redis down")),
    };
    const cache = new RedisCache(client, logger);

    await expect(cache.get("key")).resolves.toBeNull();
    await expect(cache.smembers("set")).resolves.toBeNull();
    await expect(cache.del("key")).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
