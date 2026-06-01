import Fastify from "fastify";
import { loadBackendEnv, validateBackendEnv } from "./config/env.js";
import { createVolcengineArkProviderConfig, maskProviderConfigForLog } from "./modules/insights/llm-provider.js";
import { startInsightsWorker } from "./modules/insights/insights-worker.js";

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

startInsightsWorker({
  logger,
  runOnce: async () => {
    // The first worker slice wires scheduling and provider configuration.
    // Message sync, sessionization and analysis job execution are attached in later slices.
  },
});
