import type { WorkflowTriggerBindingReader } from "@chatai/workflow-runtime";
import type { WorkflowBroker, WorkflowBrokerSubscription } from "./broker/types.js";
import type { WorkflowWorkerConfig } from "./config.js";
import type { startEntryConsumer } from "./entry-consumer.js";
import type { WorkflowReadiness } from "./health.js";
import {
  logWorkflowReadinessTransition,
  logWorkflowRoleHeartbeat,
  type WorkflowWorkerLogger,
} from "./observability.js";
import type { startTaskConsumer } from "./task-consumer.js";
import type { publishWorkflowOutboxBatch } from "./outbox-publisher.js";
import type { reconcileWorkflowRuntime } from "./reconciler.js";
import type { startRoleLoop } from "./role-loop.js";
import type { scheduleWorkflowTasks } from "./scheduler.js";

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
  input.logger.info({
    environment: input.config.environment,
    event: "workflow.worker.started",
    roles: [...input.config.roles],
  }, "workflow worker started");
  let closed = false;
  return {
    async close() {
      if (closed) return;
      closed = true;
      await runtime.close();
      await health.close();
      input.logger.info({ event: "workflow.worker.stopped" }, "workflow worker stopped");
    },
  };
}

export async function startWorkflowWorkerRuntime(input: {
  broker: WorkflowBroker;
  config: WorkflowWorkerConfig;
  database: { destroy(): Promise<void> };
  entryConsumer: typeof startEntryConsumer;
  pingDatabase(): Promise<void>;
  logger: WorkflowWorkerLogger;
  outboxPublisher(input: Parameters<typeof publishWorkflowOutboxBatch>[0]): ReturnType<typeof publishWorkflowOutboxBatch>;
  outboxRepository: Parameters<typeof publishWorkflowOutboxBatch>[0]["repository"];
  reconciler(input: Parameters<typeof reconcileWorkflowRuntime>[0]): ReturnType<typeof reconcileWorkflowRuntime>;
  reconcilerService: Parameters<typeof reconcileWorkflowRuntime>[0]["reconciler"];
  roleLoop: typeof startRoleLoop;
  runtimeService: WorkerRuntimeService;
  scheduler(input: Parameters<typeof scheduleWorkflowTasks>[0]): ReturnType<typeof scheduleWorkflowTasks>;
  schedulerRepository: Parameters<typeof scheduleWorkflowTasks>[0]["repository"];
  taskConsumer: typeof startTaskConsumer;
  triggerBindingReader: WorkflowTriggerBindingReader;
  workerId: string;
}) {
  const subscriptions: WorkflowBrokerSubscription[] = [];
  const loops: Array<{ close(): Promise<void> }> = [];
  const readiness: WorkflowReadiness = {
    broker: true,
    database: false,
    roles: Object.fromEntries([...input.config.roles].map(role => [role, false])),
  };
  let closed = false;
  let previousReadiness = structuredClone(readiness);

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
    if (input.config.roles.has("scheduler")) {
      loops.push(startBackgroundRole("scheduler", input.config.runtime.schedulerIntervalMs, () =>
        input.scheduler({
          limit: input.config.runtime.batchSize,
          now: new Date(),
          repository: input.schedulerRepository,
          shardIds: input.config.runtime.shardIds,
        })));
    }
    if (input.config.roles.has("outbox")) {
      loops.push(startBackgroundRole("outbox", input.config.runtime.outboxIntervalMs, () =>
        input.outboxPublisher({
          broker: input.broker,
          leaseDurationMs: input.config.runtime.leaseDurationMs,
          leaseOwner: input.workerId,
          limit: input.config.runtime.batchSize,
          maxAttempts: input.config.runtime.maxOutboxAttempts,
          maxRetryDelayMs: input.config.runtime.maxOutboxRetryDelayMs,
          repository: input.outboxRepository,
          retryDelayMs: input.config.runtime.retryDelayMs,
          topic: input.config.topics.task,
        })));
    }
    if (input.config.roles.has("reconciler")) {
      let afterRunId: string | undefined;
      loops.push(startBackgroundRole("reconciler", input.config.runtime.reconcileIntervalMs, async () => {
        const result = await input.reconciler({
          afterRunId,
          dispatchTimeoutMs: input.config.runtime.dispatchTimeoutMs,
          inboxCleanupBatchSize: input.config.runtime.inboxCleanupBatchSize,
          limit: input.config.runtime.batchSize,
          maxTaskAttempts: input.config.runtime.maxTaskAttempts,
          now: new Date(),
          reconciler: input.reconcilerService,
        });
        afterRunId = result.nextCursor ?? undefined;
        return result;
      }));
    }
    loops.push(input.roleLoop({
      intervalMs: input.config.runtime.readinessIntervalMs,
      onError: error => input.logger.error({
        err: error,
        event: "workflow.worker.readiness.failed",
        role: "readiness",
      }, "workflow worker readiness probe failed"),
      onHeartbeat: heartbeat => {
        const currentReadiness = heartbeat.result as WorkflowReadiness;
        logWorkflowReadinessTransition(input.logger, previousReadiness, currentReadiness);
        previousReadiness = structuredClone(currentReadiness);
      },
      role: "readiness",
      run: async () => {
        const healthTopics = new Set<string>();
        if (input.config.roles.has("entry-consumer")) healthTopics.add(input.config.topics.entry);
        if (input.config.roles.has("task-consumer") || input.config.roles.has("outbox")) {
          healthTopics.add(input.config.topics.task);
        }
        const [database, broker] = await Promise.allSettled([
          input.pingDatabase(),
          input.broker.checkHealth([...healthTopics]),
        ]);
        readiness.database = database.status === "fulfilled";
        readiness.broker = broker.status === "fulfilled";
        if (input.config.roles.has("entry-consumer")) {
          readiness.roles["entry-consumer"] = subscriptions[0]?.isConnected() ?? false;
        }
        if (input.config.roles.has("task-consumer")) {
          const taskIndex = input.config.roles.has("entry-consumer") ? 1 : 0;
          readiness.roles["task-consumer"] = subscriptions[taskIndex]?.isConnected() ?? false;
        }
        return structuredClone(readiness);
      },
    }));
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
    await Promise.allSettled(loops.map(loop => loop.close()));
    await Promise.allSettled(subscriptions.map(subscription => subscription.close()));
    await Promise.allSettled([input.broker.close(), input.database.destroy()]);
  }

  function startBackgroundRole(
    role: "outbox" | "reconciler" | "scheduler",
    intervalMs: number,
    run: () => Promise<unknown>,
  ) {
    return input.roleLoop({
      intervalMs,
      onError: error => {
        readiness.roles[role] = false;
        input.logger.error({
          err: error,
          event: "workflow.worker.role.failed",
          role,
        }, "workflow worker role iteration failed");
      },
      onHeartbeat: heartbeat => {
        readiness.roles[role] = true;
        logWorkflowRoleHeartbeat(input.logger, role, heartbeat);
      },
      role,
      run,
    });
  }
}
