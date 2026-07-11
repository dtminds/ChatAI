import { loadWorkflowWorkerConfig } from "./config.js";
import { createWorkflowBroker } from "./broker/index.js";
import { startWorkflowHealthServer } from "./health.js";
import { createWorkflowWorkerLogger } from "./logger.js";

export async function startWorkflowWorker(env: NodeJS.ProcessEnv = process.env) {
  const config = loadWorkflowWorkerConfig(env);
  const logger = createWorkflowWorkerLogger(config.logLevel);
  const broker = await createWorkflowBroker({
    broker: config.broker,
    serviceUrl: config.pulsar.serviceUrl,
    token: config.pulsar.token,
  });
  const roleReadiness = Object.fromEntries([...config.roles].map(role => [role, false]));
  const health = await startWorkflowHealthServer({
    getReadiness: () => ({ broker: true, database: false, roles: roleReadiness }),
    port: config.healthPort,
  });
  logger.info({ environment: config.environment, roles: [...config.roles] }, "workflow worker started");

  return {
    async close() {
      await broker.close();
      await health.close();
      logger.info("workflow worker stopped");
    },
    config,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = await startWorkflowWorker();
  const shutdown = () => void worker.close().finally(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export * from "./broker/index.js";
export * from "./config.js";
export * from "./health.js";
export * from "./logger.js";
