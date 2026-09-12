export type DailyUsageLimiter = {
  reserve(input: {
    key: string;
    limit: number;
    ttlSeconds: number;
  }): Promise<boolean>;
};

export class UnavailableDailyUsageLimiter implements DailyUsageLimiter {
  async reserve(): Promise<boolean> {
    throw new Error("Daily usage limiter is unavailable");
  }
}
