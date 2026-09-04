import os from "node:os";
import type { Kysely } from "kysely";
import type { Database } from "@chatai/database";
import { VOLCENGINE_ARK_MEMORY_MODEL } from "@chatai/llm";
import type { UserMemoryWorkerLogger } from "./user-memory-logger.js";
import { VolcengineUserMemoryProvider } from "./user-memory-provider.js";
import { DEFAULT_USER_MEMORY_CUSTOMER_LIMIT_RESOLVER } from "./user-memory-policy.js";
import { UserMemoryWorker } from "./user-memory-worker.js";
import { UserMemoryWorkerObservability } from "./user-memory-worker-observability.js";

export type UserMemoryWorkerRuntimeConfig = { enabled: boolean };
type RuntimeEnv = {
  AGENT_USER_MEMORY_WORKER_ENABLED?: string;
};

const VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export function parseUserMemoryWorkerRuntimeConfig(env: RuntimeEnv = process.env): UserMemoryWorkerRuntimeConfig {
  const enabled = env.AGENT_USER_MEMORY_WORKER_ENABLED?.trim().toLowerCase() === "true";
  return { enabled };
}

export function createUserMemoryWorkerRuntime(input: { db: Kysely<Database>; env?: RuntimeEnv; logger: UserMemoryWorkerLogger; volcengineArkApiKey?: string }) {
  const env = input.env ?? process.env;
  const config = parseUserMemoryWorkerRuntimeConfig(env);
  if (!config.enabled) {
    input.logger.info({ component: "agent-user-memory-worker", eventCode: "agent_user_memory_worker.disabled" }, "Agent 用户记忆 worker 未启用");
    return undefined;
  }
  const apiKey = input.volcengineArkApiKey?.trim();
  if (!apiKey) throw new Error("Volcengine Ark apiKey is required for Agent user memory");
  const workerId = `${os.hostname()}:${process.pid}`;
  const worker = new UserMemoryWorker({
    db: input.db, logger: input.logger, customerLimitResolver: DEFAULT_USER_MEMORY_CUSTOMER_LIMIT_RESOLVER, workerId,
    provider: new VolcengineUserMemoryProvider({ apiKey, model: VOLCENGINE_ARK_MEMORY_MODEL, baseUrl: VOLCENGINE_ARK_BASE_URL }),
  });
  const observability = new UserMemoryWorkerObservability({ db: input.db, logger: input.logger, reportedBy: workerId });
  observability.start();
  let stopped = false; let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      while (!stopped) {
        const startedAt = observability.tickStarted();
        try {
          const hasMore = await worker.tick();
          observability.tickSucceeded(startedAt);
          if (!hasMore) break;
        } catch (error) {
          observability.tickFailed(startedAt, error);
          throw error;
        }
      }
    } catch (error) { input.logger.error({ error }, "Agent user-memory worker tick failed"); } finally { running = false; }
  };
  const timer = setInterval(() => void run(), 3_000);
  timer.unref();
  void run();
  return { async stop() { stopped = true; clearInterval(timer); while (running) await new Promise((resolve) => setTimeout(resolve, 25)); await observability.stop(); } };
}
