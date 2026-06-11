import type { CachePort } from "./cache-port.js";

type CacheLogger = {
  warn(details: Record<string, unknown>, message: string): void;
};

type RedisPipeline = {
  exec(): Promise<unknown>;
  expire(key: string, ttlSeconds: number): RedisPipeline;
  sadd(key: string, members: string[]): RedisPipeline;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): RedisPipeline;
};

type RedisPipelineResult = Array<[Error | null, unknown] | undefined>;

export type RedisCacheClient = {
  del(...keys: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  pipeline(): RedisPipeline;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
};

export class RedisCache implements CachePort {
  constructor(
    private readonly client: RedisCacheClient,
    private readonly logger: CacheLogger,
  ) {}

  async del(...keys: string[]) {
    if (!keys.length) {
      return;
    }

    await this.run("del", () => this.client.del(...keys), undefined);
  }

  async get(key: string) {
    return this.run("get", () => this.client.get(key), null);
  }

  async sadd(key: string, members: string[], ttlSeconds: number) {
    if (!members.length) {
      return;
    }

    await this.run("sadd", async () => {
      const pipeline = this.client.pipeline();
      pipeline.sadd(key, members);
      pipeline.expire(key, ttlSeconds);
      return executePipeline(pipeline);
    }, undefined);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.run("set", () => this.client.set(key, value, "EX", ttlSeconds), undefined);
  }

  async smembers(key: string) {
    return this.run("smembers", () => this.client.smembers(key), null);
  }

  async setSessionWithIndex(input: {
    indexKey: string;
    indexTtlSeconds: number;
    sessionId: string;
    sessionKey: string;
    sessionTtlSeconds: number;
    value: string;
  }) {
    await this.run("set-session-with-index", async () => {
      const pipeline = this.client.pipeline();
      pipeline.set(input.sessionKey, input.value, "EX", input.sessionTtlSeconds);
      pipeline.sadd(input.indexKey, [input.sessionId]);
      pipeline.expire(input.indexKey, input.indexTtlSeconds);
      return executePipeline(pipeline);
    }, undefined);
  }

  private async run<T>(
    operation: string,
    command: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await command();
    } catch (error) {
      this.logger.warn({
        error: error instanceof Error ? error.message : String(error),
        operation,
      }, "Redis cache command failed");
      return fallback;
    }
  }
}

async function executePipeline(pipeline: RedisPipeline) {
  const results = await pipeline.exec();

  if (!Array.isArray(results)) {
    return results;
  }

  for (const result of results as RedisPipelineResult) {
    const error = result?.[0];

    if (error) {
      throw error;
    }
  }

  return results;
}
