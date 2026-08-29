import { Redis } from "ioredis";
import type { WorkflowEntitlementCache } from "@chatai/workflow-runtime";
import type { WorkflowWorkerConfig } from "./config.js";
import type { createWorkflowWorkerLogger } from "./logger.js";

export async function createWorkflowEntitlementCache(
  config: WorkflowWorkerConfig["redis"],
  logger: ReturnType<typeof createWorkflowWorkerLogger>,
): Promise<{ cache?: WorkflowEntitlementCache; close(): Promise<void> }> {
  if (!config.enabled || !config.url) {
    return { close: async () => {} };
  }
  const client = new Redis(config.url, {
    commandTimeout: config.commandTimeoutMs,
    connectTimeout: config.connectTimeoutMs,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  client.on("error", (error: Error) => {
    logger.warn({ error: error.message }, "Workflow entitlement Redis client error");
  });
  try {
    await client.connect();
    await client.ping();
  } catch (error) {
    client.disconnect();
    throw new Error("Workflow entitlement Redis startup check failed", { cause: error });
  }
  return {
    cache: {
      get: key => client.get(key),
      set: async (key, value, ttlSeconds) => {
        await client.set(key, value, "EX", ttlSeconds);
      },
    },
    async close() {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    },
  };
}
