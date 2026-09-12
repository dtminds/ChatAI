import { describe, expect, it, vi } from "vitest";
import { RedisDailyUsageLimiter } from "../../src/usage-limit/redis-daily-usage-limiter.js";

describe("RedisDailyUsageLimiter", () => {
  it("reserves usage with one atomic Redis evaluation", async () => {
    const evalCommand = vi.fn().mockResolvedValue(1);
    const limiter = new RedisDailyUsageLimiter({ eval: evalCommand });

    await expect(limiter.reserve({
      key: "chatai:composer:ai-edit:daily:9:2026-09-13",
      limit: 200,
      ttlSeconds: 3600,
    })).resolves.toBe(true);

    expect(evalCommand).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("INCR", KEYS[1])'),
      1,
      "chatai:composer:ai-edit:daily:9:2026-09-13",
      "200",
      "3600",
    );
  });

  it("returns a rejected reservation after the limit is reached", async () => {
    const limiter = new RedisDailyUsageLimiter({
      eval: vi.fn().mockResolvedValue(0),
    });

    await expect(limiter.reserve({
      key: "usage-key",
      limit: 200,
      ttlSeconds: 60,
    })).resolves.toBe(false);
  });

  it("rejects malformed Redis responses", async () => {
    const limiter = new RedisDailyUsageLimiter({
      eval: vi.fn().mockResolvedValue(2),
    });

    await expect(limiter.reserve({
      key: "usage-key",
      limit: 200,
      ttlSeconds: 60,
    })).rejects.toThrow("Invalid Redis daily usage limit response");
  });
});
