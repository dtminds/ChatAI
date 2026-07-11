import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { MysqlWorkflowRuntimeRepository, WorkflowRuntimeService } from "@chatai/workflow-runtime";
import { loadWorkflowWorkerConfig } from "./config.js";
import { createWorkflowBroker } from "./broker/index.js";
import { createWorkflowDatabase } from "./database.js";
import { startEntryConsumer } from "./entry-consumer.js";
import { startWorkflowHealthServer } from "./health.js";
import { createWorkflowWorkerLogger } from "./logger.js";
import { startWorkflowWorker, startWorkflowWorkerRuntime } from "./runtime.js";
import { startTaskConsumer } from "./task-consumer.js";

export async function startWorkflowWorkerProcess(env: NodeJS.ProcessEnv = process.env) {
  const config = loadWorkflowWorkerConfig(env);
  const logger = createWorkflowWorkerLogger(config.logLevel);
  const database = createWorkflowDatabase(config.databaseUrl);
  const repository = new MysqlWorkflowRuntimeRepository(database);
  const runtimeService = new WorkflowRuntimeService(repository, repository);
  let broker: Awaited<ReturnType<typeof createWorkflowBroker>>;
  try {
    broker = await createWorkflowBroker({
      broker: config.broker,
      serviceUrl: config.pulsar.serviceUrl,
      token: config.pulsar.token,
    });
  } catch (error) {
    await database.destroy();
    throw error;
  }
  const workerId = `${config.environment}-${process.pid}-${randomUUID()}`;
  return startWorkflowWorker({
    config,
    logger,
    startHealth: startWorkflowHealthServer,
    startRuntime: () => startWorkflowWorkerRuntime({
      broker,
      config,
      database,
      entryConsumer: startEntryConsumer,
      pingDatabase: async () => { await sql`select 1`.execute(database); },
      runtimeService,
      taskConsumer: startTaskConsumer,
      triggerBindingReader: repository,
      workerId,
    }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = await startWorkflowWorkerProcess();
  const shutdown = () => void worker.close().finally(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export * from "./broker/index.js";
export * from "./config.js";
export * from "./database.js";
export * from "./entry-consumer.js";
export * from "./error-policy.js";
export * from "./health.js";
export * from "./logger.js";
export * from "./runtime.js";
export * from "./task-consumer.js";
