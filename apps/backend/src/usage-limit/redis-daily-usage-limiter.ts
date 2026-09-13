import type { DailyUsageLimiter } from "./daily-usage-limiter.js";

const RESERVE_DAILY_USAGE_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

if current == nil or limit == nil or ttl == nil then
  return redis.error_reply("invalid daily usage limit arguments")
end

if current >= limit then
  if redis.call("TTL", KEYS[1]) < 0 then
    redis.call("EXPIRE", KEYS[1], ttl)
  end
  return 0
end

local next = redis.call("INCR", KEYS[1])
if next == 1 or redis.call("TTL", KEYS[1]) < 0 then
  redis.call("EXPIRE", KEYS[1], ttl)
end

return 1
`;

export type RedisDailyUsageLimiterClient = {
  eval(
    script: string,
    numberOfKeys: number,
    key: string,
    limit: string,
    ttlSeconds: string,
  ): Promise<unknown>;
};

export class RedisDailyUsageLimiter implements DailyUsageLimiter {
  constructor(private readonly client: RedisDailyUsageLimiterClient) {}

  async reserve(input: {
    key: string;
    limit: number;
    ttlSeconds: number;
  }): Promise<boolean> {
    const result = await this.client.eval(
      RESERVE_DAILY_USAGE_SCRIPT,
      1,
      input.key,
      String(input.limit),
      String(input.ttlSeconds),
    );

    if (result !== 0 && result !== 1 && result !== "0" && result !== "1") {
      throw new Error("Invalid Redis daily usage limit response");
    }

    return Number(result) === 1;
  }
}
