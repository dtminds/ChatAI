import os from "node:os";
import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema.js";
import type { AppLogger } from "../../../shared/logger.js";
import { VolcengineUserMemoryProvider } from "./user-memory-provider.js";
import { DEFAULT_USER_MEMORY_CUSTOMER_LIMIT_RESOLVER, USER_MEMORY_SCHEDULE, USER_MEMORY_TIMEZONE } from "./user-memory-service.js";
import { UserMemoryWorker } from "./user-memory-worker.js";

export type UserMemoryWorkerRuntimeConfig = { enabled: boolean; executionMode: "sync"; schedule: "02:00"; timezone: "Asia/Shanghai" };
type RuntimeEnv = {
  AGENT_USER_MEMORY_WORKER_ENABLED?: string;
  AGENT_USER_MEMORY_DAILY_TIME?: string;
  AGENT_USER_MEMORY_TIMEZONE?: string;
  AGENT_USER_MEMORY_EXECUTION_MODE?: string;
  VOLCENGINE_ARK_API_KEY?: string;
  VOLCENGINE_ARK_BASE_URL?: string;
  VOLCENGINE_ARK_MODEL?: string;
  VOLCENGINE_ARK_MAX_TOKENS?: string;
};

export function parseUserMemoryWorkerRuntimeConfig(env: RuntimeEnv = process.env): UserMemoryWorkerRuntimeConfig {
  const enabled = env.AGENT_USER_MEMORY_WORKER_ENABLED?.trim().toLowerCase() === "true";
  const schedule = env.AGENT_USER_MEMORY_DAILY_TIME?.trim() || USER_MEMORY_SCHEDULE;
  const timezone = env.AGENT_USER_MEMORY_TIMEZONE?.trim() || USER_MEMORY_TIMEZONE;
  const executionMode = env.AGENT_USER_MEMORY_EXECUTION_MODE?.trim() || "sync";
  if (schedule !== USER_MEMORY_SCHEDULE) throw new Error("AGENT_USER_MEMORY_DAILY_TIME must be 02:00");
  if (timezone !== USER_MEMORY_TIMEZONE) throw new Error("AGENT_USER_MEMORY_TIMEZONE must be Asia/Shanghai");
  if (executionMode !== "sync") throw new Error("AGENT_USER_MEMORY_EXECUTION_MODE must be sync until Batch support is implemented");
  return { enabled, schedule, timezone, executionMode };
}

export function createUserMemoryWorkerRuntime(input: { db: Kysely<Database>; env?: RuntimeEnv; logger: AppLogger }) {
  const env = input.env ?? process.env;
  const config = parseUserMemoryWorkerRuntimeConfig(env);
  if (!config.enabled) {
    input.logger.info({ component: "agent-user-memory-worker", eventCode: "agent_user_memory_worker.disabled" }, "Agent 用户记忆 worker 未启用");
    return undefined;
  }
  const apiKey = env.VOLCENGINE_ARK_API_KEY?.trim();
  const model = env.VOLCENGINE_ARK_MODEL?.trim();
  if (!apiKey || !model) throw new Error("VOLCENGINE_ARK_API_KEY and VOLCENGINE_ARK_MODEL are required for Agent user memory");
  const maxTokens = env.VOLCENGINE_ARK_MAX_TOKENS ? Number(env.VOLCENGINE_ARK_MAX_TOKENS) : undefined;
  if (maxTokens != null && (!Number.isSafeInteger(maxTokens) || maxTokens <= 0)) throw new Error("VOLCENGINE_ARK_MAX_TOKENS must be a positive integer");
  const worker = new UserMemoryWorker({
    db: input.db, logger: input.logger, customerLimitResolver: DEFAULT_USER_MEMORY_CUSTOMER_LIMIT_RESOLVER, workerId: `${os.hostname()}:${process.pid}`,
    provider: new VolcengineUserMemoryProvider({ apiKey, model, baseUrl: env.VOLCENGINE_ARK_BASE_URL?.trim() || "https://ark.cn-beijing.volces.com/api/v3", ...(maxTokens ? { maxTokens } : {}) }),
  });
  let stopped = false; let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      while (!stopped && await worker.tick()) {
        // Drain immediately so customer items do not incur the scheduler interval between model calls.
      }
    } catch (error) { input.logger.error({ error }, "Agent user-memory worker tick failed"); } finally { running = false; }
  };
  const timer = setInterval(() => void run(), 3_000);
  timer.unref();
  void run();
  return { async stop() { stopped = true; clearInterval(timer); while (running) await new Promise((resolve) => setTimeout(resolve, 25)); } };
}
