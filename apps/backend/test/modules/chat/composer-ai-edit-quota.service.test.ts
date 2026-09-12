import { describe, expect, it, vi } from "vitest";
import {
  COMPOSER_AI_EDIT_DAILY_LIMIT,
  ComposerAiEditQuotaService,
  getShanghaiDailyBucket,
} from "../../../src/modules/chat/composer-ai-edit-quota.service.js";

function createLogger() {
  return {
    warn: vi.fn(),
  };
}

describe("ComposerAiEditQuotaService", () => {
  it("uses a tenant daily key and expires it at the next Shanghai midnight", async () => {
    const limiter = {
      reserve: vi.fn().mockResolvedValue(true),
    };
    const service = new ComposerAiEditQuotaService({
      clock: () => new Date("2026-09-13T07:00:00.000Z"),
      keyPrefix: "chatai:test:",
      limiter,
      logger: createLogger(),
    });

    await service.reserve(9);

    expect(limiter.reserve).toHaveBeenCalledWith({
      key: "chatai:test:composer:ai-edit:daily:9:2026-09-13",
      limit: COMPOSER_AI_EDIT_DAILY_LIMIT,
      ttlSeconds: 9 * 60 * 60,
    });
  });

  it("moves to the next daily bucket at Shanghai midnight", () => {
    expect(getShanghaiDailyBucket(new Date("2026-09-13T15:59:59.500Z"))).toEqual({
      date: "2026-09-13",
      ttlSeconds: 1,
    });
    expect(getShanghaiDailyBucket(new Date("2026-09-13T16:00:00.000Z"))).toEqual({
      date: "2026-09-14",
      ttlSeconds: 24 * 60 * 60,
    });
  });

  it("returns a 429 error when the tenant daily quota is exhausted", async () => {
    const service = new ComposerAiEditQuotaService({
      limiter: {
        reserve: vi.fn().mockResolvedValue(false),
      },
      logger: createLogger(),
    });

    await expect(service.reserve(9)).rejects.toMatchObject({
      code: "COMPOSER_AI_EDIT_QUOTA_EXCEEDED",
      details: { limit: 200 },
      statusCode: 429,
    });
  });

  it("fails closed when the limiter is unavailable", async () => {
    const logger = createLogger();
    const service = new ComposerAiEditQuotaService({
      limiter: {
        reserve: vi.fn().mockRejectedValue(new Error("redis unavailable")),
      },
      logger,
    });

    await expect(service.reserve(9)).rejects.toMatchObject({
      code: "COMPOSER_AI_EDIT_QUOTA_UNAVAILABLE",
      statusCode: 503,
    });
    expect(logger.warn).toHaveBeenCalledWith({
      error: "redis unavailable",
      uid: 9,
    }, "Composer AI edit quota reservation failed");
  });
});
