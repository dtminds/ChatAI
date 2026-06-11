import type { CachePort } from "./cache-port.js";

export class NoopCache implements CachePort {
  async del() {
    return undefined;
  }

  async get() {
    return null;
  }

  async sadd() {
    return undefined;
  }

  async set() {
    return undefined;
  }

  async smembers() {
    return null;
  }
}
