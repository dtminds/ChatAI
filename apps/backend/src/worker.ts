import Fastify from "fastify";
import { loadBackendEnv, validateBackendEnv } from "./config/env.js";
import { createDatabase } from "./db/mysql.js";
import {
  OpenAiCompatibleInsightAnalyzer,
  createVolcengineArkProviderConfig,
  maskProviderConfigForLog,
} from "./modules/insights/llm-provider.js";
import { InsightsWorkerService, startInsightsWorker } from "./modules/insights/insights-worker.js";
import { MysqlInsightWorkerRepository } from "./modules/insights/insights-worker.repository.js";

loadBackendEnv();
validateBackendEnv();

const logger = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
}).log;

const providerConfig = createVolcengineArkProviderConfig();
logger.info(
  { provider: maskProviderConfigForLog(providerConfig) },
  "会话洞察模型 Provider 已加载",
);

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be configured");
}

const db = createDatabase(databaseUrl);
const workerService = new InsightsWorkerService(new MysqlInsightWorkerRepository(db), {
  model: new OpenAiCompatibleInsightAnalyzer(providerConfig),
});

startInsightsWorker({
  logger,
  runOnce: () => workerService.runOnce(),
});

process.once("SIGINT", () => {
  void db.destroy().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void db.destroy().finally(() => process.exit(0));
});
