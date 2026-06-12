import { describe, expect, it, vi } from "vitest";
import {
  invalidateSeatAccessBatch,
  invalidateSubUserSessions,
} from "../../src/cache/invalidation.js";
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
    expect("setSessionWithIndex" in cache).toBe(false);
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

  it("logs individual Redis pipeline command failures", async () => {
    const logger = { warn: vi.fn() };
    const commandError = new Error("pipeline command failed");
    const pipeline = {
      exec: vi.fn(async () => [[null, "OK"], [commandError, null]]),
      expire: vi.fn(() => pipeline),
      sadd: vi.fn(() => pipeline),
      set: vi.fn(() => pipeline),
    };
    const client = {
      del: vi.fn(),
      get: vi.fn(),
      pipeline: vi.fn(() => pipeline),
      set: vi.fn(),
      smembers: vi.fn(),
    };
    const cache = new RedisCache(client, logger);

    await expect(cache.sadd("set", ["a"], 60)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      {
        error: "pipeline command failed",
        operation: "sadd",
      },
      "Redis cache command failed",
    );
  });

  it("chunks session invalidation deletes before removing the index key", async () => {
    const cache = {
      del: vi.fn(async () => undefined),
      get: vi.fn(),
      sadd: vi.fn(),
      set: vi.fn(),
      smembers: vi.fn(async () =>
        Array.from({ length: 1001 }, (_, index) => String(index + 1)),
      ),
    };

    await invalidateSubUserSessions(cache, buildCacheKeys("chatai:"), 101);

    expect(cache.del).toHaveBeenCalledTimes(3);
    expect(cache.del.mock.calls[0]).toHaveLength(1000);
    expect(cache.del.mock.calls[0]?.[0]).toBe("chatai:auth:session:1");
    expect(cache.del.mock.calls[1]).toEqual(["chatai:auth:session:1001"]);
    expect(cache.del.mock.calls[2]).toEqual(["chatai:auth:session-index:101"]);
  });

  it("chunks seat-access batch invalidation deletes", async () => {
    const cache = {
      del: vi.fn(async () => undefined),
      get: vi.fn(),
      sadd: vi.fn(),
      set: vi.fn(),
      smembers: vi.fn(),
    };

    await invalidateSeatAccessBatch(
      cache,
      buildCacheKeys("chatai:"),
      Array.from({ length: 1001 }, (_, index) => index + 1),
    );

    expect(cache.del).toHaveBeenCalledTimes(2);
    expect(cache.del.mock.calls[0]).toHaveLength(1000);
    expect(cache.del.mock.calls[0]?.[0]).toBe("chatai:seat-access:1");
    expect(cache.del.mock.calls[1]).toEqual(["chatai:seat-access:1001"]);
  });
});
