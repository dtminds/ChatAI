import type { Kysely } from "kysely";
import type { Database } from "@chatai/database";
import {
  InsightsWorkerService,
  startInsightsWorkerPipelines,
  type InsightSessionAnalyzer,
} from "./insights-worker.js";
import { MysqlInsightWorkerRepository } from "./insights-worker.repository.js";
import {
  OpenAiCompatibleInsightAnalyzer,
  createVolcengineArkProviderConfig,
  maskProviderConfigForLog,
} from "./llm-provider.js";
import { parseInsightsWorkerTraceUids } from "./insights-worker-observer-access.js";
import {
  InsightsWorkerObservability,
  type InsightsWorkerLogger,
} from "./insights-worker-observability.js";
import os from "node:os";

export type InsightsWorkerRuntimeConfig = {
  enabled: boolean;
  modelEnabled: boolean;
  traceUids: ReadonlySet<number>;
};

type WorkerRuntimeEnv = {
  INSIGHTS_WORKER_ENABLED?: string;
  INSIGHTS_WORKER_MODEL_ENABLED?: string;
  INSIGHTS_WORKER_TRACE_UID_ALLOWLIST?: string;
};

type WorkerLogger = InsightsWorkerLogger;

export function parseInsightsWorkerRuntimeConfig(
  env: WorkerRuntimeEnv = process.env,
): InsightsWorkerRuntimeConfig {
  return {
    enabled: parseBoolean(env.INSIGHTS_WORKER_ENABLED),
    modelEnabled: parseBoolean(env.INSIGHTS_WORKER_MODEL_ENABLED),
    traceUids: parseInsightsWorkerTraceUids(
      env.INSIGHTS_WORKER_TRACE_UID_ALLOWLIST,
    ),
  };
}

export function createInsightsWorkerRuntime(input: {
  db: Kysely<Database>;
  env?: WorkerRuntimeEnv;
  logger: WorkerLogger;
  volcengineArkApiKey?: string;
}) {
  const config = parseInsightsWorkerRuntimeConfig(input.env);

  if (!config.enabled) {
    input.logger.info({
      component: "insights-worker",
      eventCode: "insights_worker.disabled",
    }, "会话洞察 worker 未启用");
    return undefined;
  }

  const repository = new MysqlInsightWorkerRepository(input.db);
  const observability = new InsightsWorkerObservability({
    logger: input.logger,
    reportedBy: `${os.hostname()}:${process.pid}`,
    repository,
    traceUids: config.traceUids,
  });
  const model = config.modelEnabled
    ? createInsightAnalyzer(input.volcengineArkApiKey, input.logger, observability)
    : undefined;
  const service = new InsightsWorkerService(repository, {
    logger: input.logger,
    model,
    observability,
  });
  observability.start();

  return startInsightsWorkerPipelines({
    analysis: () => service.runAnalysisOnce(),
    discovery: () => service.runDiscoveryOnce().then(() => undefined),
    logger: input.logger,
    observability,
    sessionization: () => service.runSessionizationOnce(),
  });
}

function createInsightAnalyzer(
  apiKey: string | undefined,
  logger: WorkerLogger,
  observability: InsightsWorkerObservability,
): InsightSessionAnalyzer {
  const providerConfig = createVolcengineArkProviderConfig({ apiKey });

  logger.info(
    { provider: maskProviderConfigForLog(providerConfig) },
    "会话洞察模型 provider 已配置",
  );

  return new OpenAiCompatibleInsightAnalyzer(providerConfig, observability);
}

function parseBoolean(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}
