export type CachePort = {
  del(...keys: string[]): Promise<void>;
  get(key: string): Promise<string | null>;
  sadd(key: string, members: string[], ttlSeconds: number): Promise<void>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  setSessionWithIndex?(input: {
    indexKey: string;
    indexTtlSeconds: number;
    sessionId: string;
    sessionKey: string;
    sessionTtlSeconds: number;
    value: string;
  }): Promise<void>;
  smembers(key: string): Promise<string[] | null>;
};
