import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { getWorkflowNodeContract, type WorkflowNodeKind } from "@chatai/contracts";
import {
  WORKFLOW_EVENT_CATALOG,
  WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS,
} from "@chatai/workflow-engine";
import {
  assertDatabaseUtc8Timezone,
  createWorkflowEntitlementPort,
  MysqlWorkflowRuntimeRepository,
  MysqlWorkflowLlmTestAttemptRepository,
  WorkflowRuntimeReconciler,
  WorkflowRuntimeService,
  WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
  WORKFLOW_HANDOFF_CAPABILITY_BINDING,
  WORKFLOW_MESSAGE_CAPABILITY_BINDING,
  WORKFLOW_TAG_CAPABILITY_BINDING,
  WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
  UnavailableWorkflowJavaInferencePort,
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
import { processWorkflowInferenceBatch } from "./inference-worker.js";
import { MysqlWorkflowMessageQueryPort } from "./message-query-port.js";

export async function startWorkflowWorkerProcess(env: NodeJS.ProcessEnv = process.env) {
  const config = loadWorkflowWorkerConfig(env);
  const logger = createWorkflowWorkerLogger(config.logLevel);
  const inferenceAdapter = new UnavailableWorkflowJavaInferencePort();
  const runtimeReadyNodeKinds: readonly WorkflowNodeKind[] = WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS;
  const runtimeReadyInferenceKinds = runtimeReadyNodeKinds.filter(kind =>
    getWorkflowNodeContract(kind).executionClass === "inference");
  if (runtimeReadyInferenceKinds.length > 0) {
    throw new Error(
      `Workflow runtime-ready inference nodes lack a production adapter: ${runtimeReadyInferenceKinds.join(", ")}`,
    );
  }
  const database = createWorkflowDatabase(config.databaseUrl);
  const repository = new MysqlWorkflowRuntimeRepository(database);
  const llmTestAttemptRepository = config.llmTestMode === "mock"
    ? new MysqlWorkflowLlmTestAttemptRepository(database)
    : undefined;
  const llmTestWorker = config.llmTestMode === "mock"
    ? await loadLlmTestWorker()
    : undefined;
  const entitlementPort = createWorkflowEntitlementPort({
    endpoint: config.entitlement.apiUrl,
    mode: config.entitlement.mode,
    token: config.entitlement.token,
  });
  const runtimeService = new WorkflowRuntimeService(
    repository,
    repository,
    undefined,
    {
      capabilityMaxRetryDelayMs: config.runtime.capabilityMaxRetryDelayMs,
      capabilityRetryDelayMs: config.runtime.capabilityRetryDelayMs,
      capabilityTimeoutMs: config.runtime.capabilityTimeoutMs,
      capabilityBindings: [
        WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
        WORKFLOW_HANDOFF_CAPABILITY_BINDING,
        WORKFLOW_MESSAGE_CAPABILITY_BINDING,
        WORKFLOW_TAG_CAPABILITY_BINDING,
        WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
      ],
      entitlementPort,
      maxTaskAttempts: config.runtime.maxTaskAttempts,
      messageQueryPort: new MysqlWorkflowMessageQueryPort(database),
      inferenceTotalTimeoutMs: config.runtime.inferenceTotalTimeoutMs,
      taskLeaseDurationMs: config.runtime.leaseDurationMs,
    },
  );
  const reconcilerService = new WorkflowRuntimeReconciler(repository);
  let broker: Awaited<ReturnType<typeof createWorkflowBroker>>;
  try {
    runtimeService.assertRuntimeComposition();
    await assertDatabaseUtc8Timezone(database);
    broker = await createWorkflowBroker({
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
      eventCatalog: WORKFLOW_EVENT_CATALOG,
      eventSubscriptionReader: repository,
      inboxRepository: repository,
      inferenceAdapter,
      inferenceRepository: repository,
      inferenceWorker: processWorkflowInferenceBatch,
      llmTestAdapter: llmTestWorker?.adapter,
      llmTestAttemptRepository,
      llmTestAttemptWorker: llmTestWorker?.process,
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

async function loadLlmTestWorker() {
  const [{ processWorkflowLlmTestAttemptBatch }, { WorkflowLlmTestMockAdapter }] = await Promise.all([
    import("./llm-test-attempt-worker.js"),
    import("./llm-test-mock-adapter.js"),
  ]);
  return {
    adapter: new WorkflowLlmTestMockAdapter(),
    process: processWorkflowLlmTestAttemptBatch,
  };
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
export * from "./inference-worker.js";
export * from "./logger.js";
export * from "./outbox-publisher.js";
export * from "./observability.js";
export * from "./reconciler.js";
export * from "./role-loop.js";
export * from "./runtime.js";
export * from "./scheduler.js";
export * from "./task-consumer.js";
