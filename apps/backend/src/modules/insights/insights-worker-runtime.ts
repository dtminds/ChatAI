import { BadRequestError } from "../../shared/errors.js";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  InsightsWorkerService,
  startInsightsWorker,
  type InsightSessionAnalyzer,
  type InsightWorkerCursor,
} from "./insights-worker.js";
import { MysqlInsightWorkerRepository } from "./insights-worker.repository.js";
import {
  OpenAiCompatibleInsightAnalyzer,
  createVolcengineArkProviderConfig,
  maskProviderConfigForLog,
} from "./llm-provider.js";

export type InsightsWorkerRuntimeConfig = {
  batchSize: number;
  enabled: boolean;
  intervalMs: number;
  modelEnabled: boolean;
  startLookbackDays: number;
  uidAllowlist?: Set<number>;
};

type WorkerRuntimeEnv = {
  INSIGHTS_WORKER_BATCH_SIZE?: string;
  INSIGHTS_WORKER_ENABLED?: string;
  INSIGHTS_WORKER_INTERVAL_MS?: string;
  INSIGHTS_WORKER_MODEL_ENABLED?: string;
  INSIGHTS_WORKER_START_LOOKBACK_DAYS?: string;
  INSIGHTS_WORKER_UID_ALLOWLIST?: string;
  VOLCENGINE_ARK_API_KEY?: string;
  VOLCENGINE_ARK_BASE_URL?: string;
  VOLCENGINE_ARK_LITE_MAX_TOKENS?: string;
  VOLCENGINE_ARK_LITE_MODEL?: string;
  VOLCENGINE_ARK_MAX_TOKENS?: string;
  VOLCENGINE_ARK_MODEL?: string;
};

type WorkerLogger = {
  error(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
};

export function parseInsightsWorkerRuntimeConfig(
  env: WorkerRuntimeEnv = process.env,
): InsightsWorkerRuntimeConfig {
  return {
    batchSize: parsePositiveInteger(
      env.INSIGHTS_WORKER_BATCH_SIZE,
      "INSIGHTS_WORKER_BATCH_SIZE",
      200,
    ),
    enabled: parseBoolean(env.INSIGHTS_WORKER_ENABLED),
    intervalMs: parseMinimumInteger(
      env.INSIGHTS_WORKER_INTERVAL_MS,
      "INSIGHTS_WORKER_INTERVAL_MS",
      3_000,
      1_000,
    ),
    modelEnabled: parseBoolean(env.INSIGHTS_WORKER_MODEL_ENABLED),
    startLookbackDays: parsePositiveInteger(
      env.INSIGHTS_WORKER_START_LOOKBACK_DAYS,
      "INSIGHTS_WORKER_START_LOOKBACK_DAYS",
      3,
    ),
    uidAllowlist: parseUidAllowlist(env.INSIGHTS_WORKER_UID_ALLOWLIST),
  };
}

export function getInitialInsightWorkerCursor(input: {
  now?: Date;
  startLookbackDays: number;
}): InsightWorkerCursor {
  const now = input.now ?? new Date();

  return {
    cursorAuditId: 0,
    cursorMsgtime: now.getTime() - input.startLookbackDays * 24 * 60 * 60_000,
  };
}

export function createInsightsWorkerRuntime(input: {
  db: Kysely<Database>;
  env?: WorkerRuntimeEnv;
  logger: WorkerLogger;
}) {
  const config = parseInsightsWorkerRuntimeConfig(input.env);

  if (!config.enabled) {
    input.logger.info({}, "会话洞察 worker 未启用");
    return undefined;
  }

  const repository = new MysqlInsightWorkerRepository(input.db, {
    startLookbackDays: config.startLookbackDays,
  });
  const model = config.modelEnabled ? createInsightAnalyzer(input.env, input.logger) : undefined;
  const service = new InsightsWorkerService(repository, {
    batchSize: config.batchSize,
    logger: input.logger,
    model,
    uidAllowlist: config.uidAllowlist,
  });

  return startInsightsWorker({
    intervalMs: config.intervalMs,
    logger: input.logger,
    runOnce: () => service.runOnce(),
  });
}

function createInsightAnalyzer(
  env: WorkerRuntimeEnv | undefined,
  logger: WorkerLogger,
): InsightSessionAnalyzer {
  const providerConfig = createVolcengineArkProviderConfig(env);

  logger.info(
    { provider: maskProviderConfigForLog(providerConfig) },
    "会话洞察模型 provider 已配置",
  );

  return new OpenAiCompatibleInsightAnalyzer(providerConfig);
}

function parseBoolean(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function parsePositiveInteger(value: string | undefined, name: string, fallback: number) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BadRequestError("INSIGHTS_WORKER_CONFIG_INVALID", `${name} must be a positive integer`);
  }

  return parsed;
}

function parseMinimumInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
) {
  const parsed = parsePositiveInteger(value, name, fallback);

  if (parsed < minimum) {
    throw new BadRequestError("INSIGHTS_WORKER_CONFIG_INVALID", `${name} must be at least ${minimum}`);
  }

  return parsed;
}

function parseUidAllowlist(value: string | undefined) {
  const values = (value ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isSafeInteger(item) && item > 0);

  return values.length > 0 ? new Set(values) : undefined;
}
