import {
  assertDatabaseUtc8Timezone,
  createDatabase,
} from "@chatai/database";
import { createInsightsWorkerRuntime } from "@chatai/insights";
import { createUserMemoryWorkerRuntime } from "@chatai/user-memory";
import pino from "pino";
import { parseBackendWorkerConfig } from "./config.js";

const config = parseBackendWorkerConfig();
const logger = pino({ level: config.logLevel });
const db = createDatabase(config.databaseUrl);

try {
  await assertDatabaseUtc8Timezone(db);
} catch (error) {
  await db.destroy();
  throw error;
}

const insightsRuntime = createInsightsWorkerRuntime({
  db,
  logger,
  volcengineArkApiKey: config.volcengineArkApiKey,
});
const userMemoryRuntime = createUserMemoryWorkerRuntime({
  db,
  logger,
  volcengineArkApiKey: config.volcengineArkApiKey,
});
let shutdownPromise: Promise<void> | undefined;

async function shutdown() {
  shutdownPromise ??= Promise.all([
    insightsRuntime?.stop(),
    userMemoryRuntime?.stop(),
  ])
    .then(() => db.destroy())
    .then(() => undefined);

  return shutdownPromise;
}

function handleSignal(signal: NodeJS.Signals) {
  logger.info({ signal }, "Backend Worker 正在停止");
  void shutdown()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error({ error }, "Backend Worker 停止失败");
      process.exit(1);
    });
}

process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);
