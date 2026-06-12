import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisClient = vi.hoisted(() => ({
  call: vi.fn(async () => "OK"),
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(),
  on: vi.fn(),
  ping: vi.fn(async () => "PONG"),
  quit: vi.fn(async () => undefined),
}));

const Redis = vi.hoisted(() => vi.fn(function RedisMock() {
  return redisClient;
}));

vi.mock("ioredis", () => ({
  Redis,
}));

describe("redisPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_ENABLED = "true";
    process.env.REDIS_URL = "redis://localhost:6379/0";
  });

  afterEach(() => {
    delete process.env.REDIS_COMMAND_TIMEOUT_MS;
    delete process.env.REDIS_CONNECT_TIMEOUT_MS;
    delete process.env.REDIS_ENABLED;
    delete process.env.REDIS_KEY_PREFIX;
    delete process.env.REDIS_URL;
  });

  it("closes Redis connections gracefully with quit on app shutdown", async () => {
    const { redisPlugin } = await import("../../src/plugins/redis.js");
    const app = Fastify({ logger: false });

    await app.register(redisPlugin);
    await app.close();

    expect(redisClient.quit).toHaveBeenCalledTimes(1);
    expect(redisClient.disconnect).not.toHaveBeenCalled();
  });

  it("forces Redis disconnect when graceful quit fails", async () => {
    redisClient.quit.mockRejectedValueOnce(new Error("quit failed"));
    const { redisPlugin } = await import("../../src/plugins/redis.js");
    const app = Fastify({ logger: false });

    await app.register(redisPlugin);
    await app.close();

    expect(redisClient.quit).toHaveBeenCalledTimes(1);
    expect(redisClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("fails startup when Redis is enabled but connect fails", async () => {
    redisClient.connect.mockRejectedValueOnce(new Error("connect failed"));
    const { redisPlugin } = await import("../../src/plugins/redis.js");
    const app = Fastify({ logger: false });

    app.register(redisPlugin);
    await expect(app.ready()).rejects.toThrow(
      "Redis cache startup check failed",
    );
    expect(redisClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("fails startup when Redis is enabled but ping fails", async () => {
    redisClient.ping.mockRejectedValueOnce(new Error("ping failed"));
    const { redisPlugin } = await import("../../src/plugins/redis.js");
    const app = Fastify({ logger: false });

    app.register(redisPlugin);
    await expect(app.ready()).rejects.toThrow(
      "Redis cache startup check failed",
    );
    expect(redisClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("validates supplied Redis credentials during startup", async () => {
    process.env.REDIS_URL = "redis://:secret@localhost:6379/0";
    const { redisPlugin } = await import("../../src/plugins/redis.js");
    const app = Fastify({ logger: false });

    await app.register(redisPlugin);
    await app.close();

    expect(redisClient.call).toHaveBeenCalledWith("AUTH", "secret");
    expect(redisClient.ping).toHaveBeenCalledTimes(1);
  });

  it("fails startup when supplied Redis credentials are rejected", async () => {
    process.env.REDIS_URL = "redis://:secret@localhost:6379/0";
    redisClient.call.mockRejectedValueOnce(new Error("ERR AUTH failed"));
    const { redisPlugin } = await import("../../src/plugins/redis.js");
    const app = Fastify({ logger: false });

    app.register(redisPlugin);
    await expect(app.ready()).rejects.toThrow(
      "Redis cache startup check failed",
    );
    expect(redisClient.disconnect).toHaveBeenCalledTimes(1);
  });
});
