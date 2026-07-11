import Fastify from "fastify";
import { assertDatabaseUtc8Timezone } from "@chatai/workflow-runtime";
import { loadBackendEnv } from "./config/env.js";
import { dbPlugin } from "./plugins/db.js";
import { createInsightsWorkerRuntime } from "./modules/insights/insights-worker-runtime.js";

loadBackendEnv();

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
});

await app.register(dbPlugin);
try {
  await assertDatabaseUtc8Timezone(app.db);
} catch (error) {
  await app.close();
  throw error;
}

const runtime = createInsightsWorkerRuntime({
  db: app.db,
  logger: app.log,
});

const shutdown = async () => {
  await runtime?.stop();
  await app.close();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
