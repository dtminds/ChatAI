import Fastify from "fastify";
import { loadBackendEnv } from "./config/env.js";
import { dbPlugin } from "./plugins/db.js";
import { createInsightsWorkerRuntime } from "./modules/insights/insights-worker-runtime.js";
import { createUserMemoryWorkerRuntime } from "./modules/ai-hosting/user-memory/user-memory-worker-runtime.js";

loadBackendEnv();

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
});

await app.register(dbPlugin);

const insightsRuntime = createInsightsWorkerRuntime({
  db: app.db,
  logger: app.log,
});

const userMemoryRuntime = createUserMemoryWorkerRuntime({
  db: app.db,
  logger: app.log,
});

const shutdown = async () => {
  await Promise.all([insightsRuntime?.stop(), userMemoryRuntime?.stop()]);
  await app.close();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
