import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowMessageRateLimiter,
  InMemoryWorkflowMessageRateLimiter,
} from "../src/message-rate-limiter.js";

describe("Workflow Message rate limiter", () => {
  it("allows one maximum message group and refills one message every five seconds", async () => {
    let now = 0;
    const limiter = new InMemoryWorkflowMessageRateLimiter({
      burst: 6,
      ratePerMinute: 12,
    }, () => now);

    await expect(limiter.acquire({ cost: 6, seatId: 101, uid: 9 }))
      .resolves.toEqual({ allowed: true });
    await expect(limiter.acquire({ cost: 1, seatId: 101, uid: 9 }))
      .resolves.toEqual({ allowed: false, retryAfterMs: 5_000 });

    now += 5_000;
    await expect(limiter.acquire({ cost: 1, seatId: 101, uid: 9 }))
      .resolves.toEqual({ allowed: true });
    await expect(limiter.acquire({ cost: 2, seatId: 101, uid: 9 }))
      .resolves.toEqual({ allowed: false, retryAfterMs: 10_000 });
  });

  it("keeps buckets independent by uid and seatId", async () => {
    const limiter = new InMemoryWorkflowMessageRateLimiter({
      burst: 6,
      ratePerMinute: 12,
    }, () => 0);

    await limiter.acquire({ cost: 6, seatId: 101, uid: 9 });

    await expect(limiter.acquire({ cost: 1, seatId: 102, uid: 9 }))
      .resolves.toEqual({ allowed: true });
    await expect(limiter.acquire({ cost: 1, seatId: 101, uid: 10 }))
      .resolves.toEqual({ allowed: true });
  });

  it("caps oversized message groups so they can eventually acquire the bucket", async () => {
    let now = 0;
    const limiter = new InMemoryWorkflowMessageRateLimiter({
      burst: 6,
      ratePerMinute: 12,
    }, () => now);

    await expect(limiter.acquire({ cost: 7, seatId: 101, uid: 9 }))
      .resolves.toEqual({ allowed: true });
    await expect(limiter.acquire({ cost: 7, seatId: 101, uid: 9 }))
      .resolves.toEqual({ allowed: false, retryAfterMs: 30_000 });

    now += 30_000;
    await expect(limiter.acquire({ cost: 7, seatId: 101, uid: 9 }))
      .resolves.toEqual({ allowed: true });
  });

  it("uses one Redis bucket for the uid and seat and fails closed when Redis is unavailable", async () => {
    const evalCommand = vi.fn()
      .mockResolvedValueOnce([0, 10_000])
      .mockRejectedValue(new Error("redis unavailable"));
    const warn = vi.fn();
    const limiter = createWorkflowMessageRateLimiter({
      client: { eval: evalCommand } as never,
      config: { burst: 6, ratePerMinute: 12 },
      keyPrefix: "chatai:test:",
      logger: { warn } as never,
    });

    await expect(limiter.acquire({ cost: 2, seatId: 101, uid: 9 }))
      .resolves.toEqual({ allowed: false, retryAfterMs: 10_000 });
    expect(evalCommand).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('redis.call("TIME")'),
      1,
      "chatai:test:workflow:message-seat-rate:9:101",
      12,
      6,
      2,
      60_000,
    );

    await expect(limiter.acquire({ cost: 1, seatId: 101, uid: 9 }))
      .resolves.toEqual({ allowed: false, retryAfterMs: 5_000 });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      event: "workflow.message.rate-limit.unavailable",
      seatId: 101,
      uid: 9,
    }), "Workflow Message rate limiter unavailable");
    await limiter.acquire({ cost: 1, seatId: 101, uid: 9 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("caps oversized message groups before acquiring the Redis bucket", async () => {
    const evalCommand = vi.fn().mockResolvedValue([1, 0]);
    const limiter = createWorkflowMessageRateLimiter({
      client: { eval: evalCommand } as never,
      config: { burst: 6, ratePerMinute: 12 },
      keyPrefix: "chatai:test:",
      logger: { warn: vi.fn() } as never,
    });

    await expect(limiter.acquire({ cost: 7, seatId: 101, uid: 9 }))
      .resolves.toEqual({ allowed: true });
    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("TIME")'),
      1,
      "chatai:test:workflow:message-seat-rate:9:101",
      12,
      6,
      6,
      60_000,
    );
  });
});
