import { QUICK_REPLY_ATTACHMENT_MAX_COUNT } from "@chatai/contracts";
import type { Redis } from "ioredis";
import type { WorkflowWorkerConfig } from "./config.js";
import type { createWorkflowWorkerLogger } from "./logger.js";

const RATE_LIMIT_RETRY_MS = 5_000;
const RATE_LIMIT_ERROR_LOG_INTERVAL_MS = 60_000;
const MAX_MESSAGE_RATE_LIMIT_COST = QUICK_REPLY_ATTACHMENT_MAX_COUNT + 1;

const ACQUIRE_TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local rate_per_minute = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])
local redis_time = redis.call("TIME")
local now_ms = redis_time[1] * 1000 + math.floor(redis_time[2] / 1000)
local state = redis.call("HMGET", key, "tokens", "updated_at_ms")
local tokens = tonumber(state[1]) or burst
local updated_at_ms = tonumber(state[2]) or now_ms
local elapsed_ms = math.max(0, now_ms - updated_at_ms)
tokens = math.min(burst, tokens + elapsed_ms * rate_per_minute / 60000)

local allowed = 0
local retry_after_ms = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
else
  retry_after_ms = math.ceil((cost - tokens) * 60000 / rate_per_minute)
end

redis.call("HSET", key, "tokens", tokens, "updated_at_ms", now_ms)
redis.call("PEXPIRE", key, ttl_ms)
return { allowed, retry_after_ms }
`;

export type WorkflowMessageRateLimitAdmission =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export type WorkflowMessageRateLimiter = {
  acquire(input: {
    cost: number;
    seatId: number;
    uid: number;
  }): Promise<WorkflowMessageRateLimitAdmission>;
};

export function createWorkflowMessageRateLimiter(input: {
  client?: Pick<Redis, "eval">;
  config: WorkflowWorkerConfig["messageRateLimit"];
  keyPrefix: string;
  logger: ReturnType<typeof createWorkflowWorkerLogger>;
  now?: () => number;
}): WorkflowMessageRateLimiter {
  if (!input.client) {
    return new InMemoryWorkflowMessageRateLimiter(input.config, input.now);
  }
  return new RedisWorkflowMessageRateLimiter(
    input.client,
    input.config,
    input.keyPrefix,
    input.logger,
  );
}

export class InMemoryWorkflowMessageRateLimiter implements WorkflowMessageRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAtMs: number }>();
  private readonly now: () => number;

  constructor(
    private readonly config: WorkflowWorkerConfig["messageRateLimit"],
    now?: () => number,
  ) {
    this.now = now ?? Date.now;
  }

  async acquire(input: { cost: number; seatId: number; uid: number }) {
    const nowMs = this.now();
    const cost = normalizeMessageRateLimitCost(input.cost);
    const key = createSeatBucketKey(input.uid, input.seatId);
    const existing = this.buckets.get(key) ?? {
      tokens: this.config.burst,
      updatedAtMs: nowMs,
    };
    const tokens = Math.min(
      this.config.burst,
      existing.tokens + Math.max(0, nowMs - existing.updatedAtMs)
        * this.config.ratePerMinute / 60_000,
    );
    if (tokens >= cost) {
      this.buckets.set(key, { tokens: tokens - cost, updatedAtMs: nowMs });
      return { allowed: true as const };
    }
    this.buckets.set(key, { tokens, updatedAtMs: nowMs });
    return {
      allowed: false as const,
      retryAfterMs: Math.ceil((cost - tokens) * 60_000 / this.config.ratePerMinute),
    };
  }
}

class RedisWorkflowMessageRateLimiter implements WorkflowMessageRateLimiter {
  private lastUnavailableLogAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly client: Pick<Redis, "eval">,
    private readonly config: WorkflowWorkerConfig["messageRateLimit"],
    private readonly keyPrefix: string,
    private readonly logger: ReturnType<typeof createWorkflowWorkerLogger>,
  ) {}

  async acquire(input: { cost: number; seatId: number; uid: number }) {
    try {
      const result = await this.client.eval(
        ACQUIRE_TOKEN_BUCKET_SCRIPT,
        1,
        `${this.keyPrefix}workflow:message-seat-rate:${createSeatBucketKey(input.uid, input.seatId)}`,
        this.config.ratePerMinute,
        this.config.burst,
        normalizeMessageRateLimitCost(input.cost),
        getBucketTtlMs(this.config),
      );
      if (!Array.isArray(result) || result.length !== 2) {
        throw new Error("Workflow Message rate limiter returned an invalid Redis result");
      }
      const allowed = Number(result[0]) === 1;
      const retryAfterMs = Number(result[1]);
      if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) {
        throw new Error("Workflow Message rate limiter returned an invalid retry delay");
      }
      return allowed
        ? { allowed: true as const }
        : { allowed: false as const, retryAfterMs: Math.max(1, Math.ceil(retryAfterMs)) };
    } catch (error) {
      const now = Date.now();
      if (now - this.lastUnavailableLogAt >= RATE_LIMIT_ERROR_LOG_INTERVAL_MS) {
        this.lastUnavailableLogAt = now;
        this.logger.warn({
          error: error instanceof Error ? error.message : "unknown",
          event: "workflow.message.rate-limit.unavailable",
          seatId: input.seatId,
          uid: input.uid,
        }, "Workflow Message rate limiter unavailable");
      }
      return { allowed: false as const, retryAfterMs: RATE_LIMIT_RETRY_MS };
    }
  }
}

function createSeatBucketKey(uid: number, seatId: number) {
  return `${uid}:${seatId}`;
}

function normalizeMessageRateLimitCost(cost: number) {
  return Math.min(cost, MAX_MESSAGE_RATE_LIMIT_COST);
}

function getBucketTtlMs(config: WorkflowWorkerConfig["messageRateLimit"]) {
  return Math.max(60_000, Math.ceil(config.burst * 120_000 / config.ratePerMinute));
}
