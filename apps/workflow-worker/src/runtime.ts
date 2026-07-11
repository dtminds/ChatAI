import type { WorkflowTriggerBindingReader } from "@chatai/workflow-runtime";
import type { WorkflowBroker, WorkflowBrokerSubscription } from "./broker/types.js";
import type { WorkflowWorkerConfig } from "./config.js";
import type { startEntryConsumer } from "./entry-consumer.js";
import type { WorkflowReadiness } from "./health.js";
import type { startTaskConsumer } from "./task-consumer.js";

type WorkerRuntimeService = Parameters<typeof startEntryConsumer>[0]["runtimeService"]
  & Parameters<typeof startTaskConsumer>[0]["runtimeService"];

export async function startWorkflowWorker(input: {
  config: WorkflowWorkerConfig;
  logger: { info(value: unknown, message?: string): void };
  startHealth(input: {
    getReadiness(): WorkflowReadiness;
    port: number;
  }): Promise<{ close(): Promise<void> }>;
  startRuntime(): Promise<{
    close(): Promise<void>;
    getReadiness(): WorkflowReadiness;
  }>;
}) {
  const runtime = await input.startRuntime();
  let health: { close(): Promise<void> };
  try {
    health = await input.startHealth({
      getReadiness: runtime.getReadiness,
      port: input.config.healthPort,
    });
  } catch (error) {
    await runtime.close();
    throw error;
  }
  input.logger.info({ environment: input.config.environment, roles: [...input.config.roles] }, "workflow worker started");
  let closed = false;
  return {
    async close() {
      if (closed) return;
      closed = true;
      await runtime.close();
      await health.close();
      input.logger.info("workflow worker stopped");
    },
  };
}

export async function startWorkflowWorkerRuntime(input: {
  broker: WorkflowBroker;
  config: WorkflowWorkerConfig;
  database: { destroy(): Promise<void> };
  entryConsumer: typeof startEntryConsumer;
  pingDatabase(): Promise<void>;
  runtimeService: WorkerRuntimeService;
  taskConsumer: typeof startTaskConsumer;
  triggerBindingReader: WorkflowTriggerBindingReader;
  workerId: string;
}) {
  const subscriptions: WorkflowBrokerSubscription[] = [];
  const readiness: WorkflowReadiness = {
    broker: true,
    database: false,
    roles: Object.fromEntries([...input.config.roles].map(role => [role, false])),
  };
  let closed = false;

  try {
    await input.pingDatabase();
    readiness.database = true;
    if (input.config.roles.has("entry-consumer")) {
      subscriptions.push(await input.entryConsumer({
        bindingReader: input.triggerBindingReader,
        broker: input.broker,
        deadLetterTopic: input.config.deadLetterTopics.entry ?? undefined,
        maxRedeliverCount: input.config.maxRedeliverCount,
        runtimeService: input.runtimeService,
        subscription: input.config.subscriptions.entry,
        topic: input.config.topics.entry,
      }));
      readiness.roles["entry-consumer"] = true;
    }
    if (input.config.roles.has("task-consumer")) {
      subscriptions.push(await input.taskConsumer({
        broker: input.broker,
        deadLetterTopic: input.config.deadLetterTopics.task ?? undefined,
        maxRedeliverCount: input.config.maxRedeliverCount,
        runtimeService: input.runtimeService,
        subscription: input.config.subscriptions.task,
        topic: input.config.topics.task,
        workerId: input.workerId,
      }));
      readiness.roles["task-consumer"] = true;
    }
  } catch (error) {
    await closeResources();
    throw error;
  }

  return {
    close: closeResources,
    getReadiness: () => structuredClone(readiness),
  };

  async function closeResources() {
    if (closed) return;
    closed = true;
    for (const role of Object.keys(readiness.roles)) readiness.roles[role] = false;
    readiness.broker = false;
    readiness.database = false;
    await Promise.allSettled(subscriptions.map(subscription => subscription.close()));
    await Promise.allSettled([input.broker.close(), input.database.destroy()]);
  }
}
