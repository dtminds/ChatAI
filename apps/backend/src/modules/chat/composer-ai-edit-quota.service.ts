import type { DailyUsageLimiter } from "../../usage-limit/daily-usage-limiter.js";
import {
  ServiceUnavailableError,
  TooManyRequestsError,
} from "../../shared/errors.js";

export const COMPOSER_AI_EDIT_DAILY_LIMIT = 200;
export type ComposerAiEditQuota = {
  reserve(uid: number): Promise<void>;
};

const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

type ComposerAiEditQuotaLogger = {
  warn(details: Record<string, unknown>, message: string): void;
};

type ComposerAiEditQuotaServiceOptions = {
  clock?: () => Date;
  keyPrefix?: string;
  limit?: number;
  limiter: DailyUsageLimiter;
  logger: ComposerAiEditQuotaLogger;
};

export class ComposerAiEditQuotaService {
  private readonly clock: () => Date;
  private readonly keyPrefix: string;
  private readonly limit: number;
  private readonly limiter: DailyUsageLimiter;
  private readonly logger: ComposerAiEditQuotaLogger;

  constructor(options: ComposerAiEditQuotaServiceOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.keyPrefix = options.keyPrefix?.trim() || "chatai:";
    this.limit = options.limit ?? COMPOSER_AI_EDIT_DAILY_LIMIT;
    this.limiter = options.limiter;
    this.logger = options.logger;
  }

  async reserve(uid: number) {
    const bucket = getShanghaiDailyBucket(this.clock());
    let allowed: boolean;

    try {
      allowed = await this.limiter.reserve({
        key: `${this.keyPrefix}composer:ai-edit:daily:${uid}:${bucket.date}`,
        limit: this.limit,
        ttlSeconds: bucket.ttlSeconds,
      });
    } catch (error) {
      this.logger.warn({
        error: error instanceof Error ? error.message : String(error),
        uid,
      }, "Composer AI edit quota reservation failed");
      throw new ServiceUnavailableError(
        "COMPOSER_AI_EDIT_QUOTA_UNAVAILABLE",
        "AI 助写暂时不可用",
      );
    }

    if (!allowed) {
      throw new TooManyRequestsError(
        "COMPOSER_AI_EDIT_QUOTA_EXCEEDED",
        "今日 AI 助写次数已用完",
        { limit: this.limit },
      );
    }
  }
}

export function getShanghaiDailyBucket(now: Date) {
  const shifted = new Date(now.getTime() + SHANGHAI_UTC_OFFSET_MS);
  const date = shifted.toISOString().slice(0, 10);
  const nextMidnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  ) - SHANGHAI_UTC_OFFSET_MS;

  return {
    date,
    ttlSeconds: Math.max(1, Math.ceil((nextMidnightUtc - now.getTime()) / 1000)),
  };
}
