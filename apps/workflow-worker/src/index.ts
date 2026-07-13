import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import {
  assertDatabaseUtc8Timezone,
  MysqlWorkflowRuntimeRepository,
  WorkflowRuntimeReconciler,
  WorkflowRuntimeService,
} from "@chatai/workflow-runtime";
import { loadWorkflowWorkerConfig } from "./config.js";
import { createWorkflowBroker } from "./broker/index.js";
import { createWorkflowDatabase } from "./database.js";
import { startEntryConsumer } from "./entry-consumer.js";
import { startWorkflowHealthServer } from "./health.js";
import { createWorkflowWorkerLogger } from "./logger.js";
import { publishWorkflowOutboxBatch } from "./outbox-publisher.js";
import { reconcileWorkflowRuntime } from "./reconciler.js";
import { startRoleLoop } from "./role-loop.js";
import { startWorkflowWorker, startWorkflowWorkerRuntime } from "./runtime.js";
import { scheduleWorkflowTasks } from "./scheduler.js";
import { startTaskConsumer } from "./task-consumer.js";

export async function startWorkflowWorkerProcess(env: NodeJS.ProcessEnv = process.env) {
  const config = loadWorkflowWorkerConfig(env);
  const logger = createWorkflowWorkerLogger(config.logLevel);
  const database = createWorkflowDatabase(config.databaseUrl);
  const repository = new MysqlWorkflowRuntimeRepository(database);
  const runtimeService = new WorkflowRuntimeService(repository, repository, undefined, {
    actionMaxRetryDelayMs: config.runtime.actionMaxRetryDelayMs,
    actionRetryDelayMs: config.runtime.actionRetryDelayMs,
    maxTaskAttempts: config.runtime.maxTaskAttempts,
    taskLeaseDurationMs: config.runtime.leaseDurationMs,
  });
  const reconcilerService = new WorkflowRuntimeReconciler(repository);
  let broker: Awaited<ReturnType<typeof createWorkflowBroker>>;
  try {
    await assertDatabaseUtc8Timezone(database);
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
      logger,
      outboxPublisher: publishWorkflowOutboxBatch,
      outboxRepository: repository,
      pingDatabase: async () => { await sql`select 1`.execute(database); },
      reconciler: reconcileWorkflowRuntime,
      reconcilerService,
      roleLoop: startRoleLoop,
      runtimeService,
      scheduler: scheduleWorkflowTasks,
      schedulerRepository: repository,
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
export * from "./outbox-publisher.js";
export * from "./observability.js";
export * from "./reconciler.js";
export * from "./role-loop.js";
export * from "./runtime.js";
export * from "./scheduler.js";
export * from "./smoke-entry.js";
export * from "./task-consumer.js";
