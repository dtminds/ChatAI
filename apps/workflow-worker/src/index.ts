import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
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
  WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING,
  WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
  WORKFLOW_HANDOFF_CAPABILITY_BINDING,
  WORKFLOW_MESSAGE_CAPABILITY_BINDING,
  WORKFLOW_ORDER_CONVERSION_CAPABILITY_BINDING,
  WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
  WORKFLOW_TAG_CAPABILITY_BINDING,
  WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
} from "@chatai/workflow-runtime";
import { WorkflowCapabilityRouter } from "./capability-router.js";
import { loadWorkflowWorkerConfig } from "./config.js";
import { createWorkflowBroker } from "./broker/index.js";
import { createWorkflowDatabase } from "./database.js";
import { HttpWorkflowAudienceFilterCapabilityPort } from "./audience-filter-capability-port.js";
import { HttpWorkflowContactIdentityPort } from "./contact-identity-port.js";
import { HttpWorkflowCustomerUpdateCapabilityPort } from "./customer-update-capability-port.js";
import { createWorkflowEntitlementCache } from "./entitlement-cache.js";
import { startEntryConsumer } from "./entry-consumer.js";
import { startWorkflowHealthServer } from "./health.js";
import { createWorkflowWorkerLogger } from "./logger.js";
import { publishWorkflowOutbox } from "./outbox-publisher.js";
import { reconcileWorkflowRuntime } from "./reconciler.js";
import { startRoleLoop } from "./role-loop.js";
import { startWorkflowWorker, startWorkflowWorkerRuntime } from "./runtime.js";
import { scheduleWorkflowTasks } from "./scheduler.js";
import { startTaskConsumer } from "./task-consumer.js";
import { createWorkflowWorkerRuntimeState } from "./worker-runtime-state.js";
import { processWorkflowInferenceBatch } from "./inference-worker.js";
import {
  MysqlWorkflowEntryMessageReader,
  MysqlWorkflowMessageQueryPort,
} from "./message-query-port.js";
import { MysqlWorkflowMessageCapabilityPort } from "./message-capability-port.js";
import { HttpWorkflowTagCapabilityPort } from "./tag-capability-port.js";
import { HttpWorkflowTagQueryCapabilityPort } from "./tag-query-capability-port.js";
import { MysqlWorkflowHandoffCapabilityPort } from "./handoff-capability-port.js";
import { HttpWorkflowOrderConversionCapabilityPort } from "./order-conversion-capability-port.js";
import { HttpWorkflowOrderBindCapabilityPort } from "./order-bind-capability-port.js";
import { createVolcengineChatCompletionAdapter } from "./volcengine-chat-completion-adapter.js";
import { MysqlWorkflowAiCollectConversationPort } from "./ai-collect-conversation-port.js";
import { HttpWorkflowConversationDirectivePort } from "./conversation-directive-port.js";
import { processWorkflowConversationDirectiveDisableBatch } from "./conversation-directive-worker.js";
import type { WorkflowLlmTestAdapter } from "./llm-test-adapter.js";

export async function startWorkflowWorkerProcess(env: NodeJS.ProcessEnv = process.env) {
  const config = loadWorkflowWorkerConfig(env);
  const logger = createWorkflowWorkerLogger(config.logLevel);
  const runtimeReadyNodeKinds: readonly WorkflowNodeKind[] = WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS;
  const runtimeReadyInferenceKinds = runtimeReadyNodeKinds.filter(kind =>
    getWorkflowNodeContract(kind).executionClass === "inference");
  const productionInferenceKinds = new Set<WorkflowNodeKind>(["ai-intent", "llm"]);
  if (runtimeReadyInferenceKinds.some(kind => !productionInferenceKinds.has(kind))) {
    throw new Error(
      `Workflow runtime-ready inference nodes lack a production adapter: ${runtimeReadyInferenceKinds.join(", ")}`,
    );
  }
  const database = createWorkflowDatabase(config.databaseUrl);
  let entitlementCache: Awaited<ReturnType<typeof createWorkflowEntitlementCache>>;
  try {
    entitlementCache = await createWorkflowEntitlementCache(config.redis, logger);
  } catch (error) {
    await database.destroy();
    throw error;
  }
  let inferenceAdapter: ReturnType<typeof createVolcengineChatCompletionAdapter> | undefined;
  let llmTestAttemptRepository: MysqlWorkflowLlmTestAttemptRepository | undefined;
  let llmTestWorker: Awaited<ReturnType<typeof loadLlmTestWorker>> | undefined;
  try {
    if (config.roles.has("inference")) {
      inferenceAdapter = createVolcengineChatCompletionAdapter(database, env, logger);
      llmTestAttemptRepository = new MysqlWorkflowLlmTestAttemptRepository(database);
      llmTestWorker = await loadLlmTestWorker(inferenceAdapter);
    }
  } catch (error) {
    await Promise.allSettled([database.destroy(), entitlementCache.close()]);
    throw error;
  }
  const repository = new MysqlWorkflowRuntimeRepository(database);
  const entitlementPort = createWorkflowEntitlementPort({
    activeRunLimit: config.entitlement.activeRunLimit,
    baseUrl: config.javaInternalApi.baseUrl,
    cache: entitlementCache.cache,
    cacheKeyPrefix: config.redis.keyPrefix,
    token: config.javaInternalApi.token,
  });
  const messageCapabilityPort = new MysqlWorkflowMessageCapabilityPort(database, {
    baseUrl: config.javaInternalApi.baseUrl,
    token: config.javaInternalApi.token,
  });
  const customerUpdateCapabilityPort = new HttpWorkflowCustomerUpdateCapabilityPort({
    baseUrl: config.javaInternalApi.baseUrl,
    token: config.javaInternalApi.token,
  });
  const tagQueryCapabilityPort = new HttpWorkflowTagQueryCapabilityPort({
    baseUrl: config.javaInternalApi.baseUrl,
    token: config.javaInternalApi.token,
  });
  const audienceFilterCapabilityPort = new HttpWorkflowAudienceFilterCapabilityPort({
    baseUrl: config.javaInternalApi.baseUrl,
    token: config.javaInternalApi.token,
  });
  const tagCapabilityPort = new HttpWorkflowTagCapabilityPort({
    baseUrl: config.javaInternalApi.baseUrl,
    token: config.javaInternalApi.token,
  });
  const handoffCapabilityPort = new MysqlWorkflowHandoffCapabilityPort(database, {
    baseUrl: config.javaInternalApi.baseUrl,
    token: config.javaInternalApi.token,
  });
  const orderBindCapabilityPort = new HttpWorkflowOrderBindCapabilityPort({
    baseUrl: config.javaInternalApi.baseUrl,
    token: config.javaInternalApi.token,
  });
  const orderConversionCapabilityPort = new HttpWorkflowOrderConversionCapabilityPort({
    baseUrl: config.javaInternalApi.baseUrl,
    token: config.javaInternalApi.token,
  });
  const capabilityPort = new WorkflowCapabilityRouter([
    {
      binding: WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING,
      port: audienceFilterCapabilityPort,
    },
    {
      binding: WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
      port: customerUpdateCapabilityPort,
    },
    { binding: WORKFLOW_HANDOFF_CAPABILITY_BINDING, port: handoffCapabilityPort },
    { binding: WORKFLOW_MESSAGE_CAPABILITY_BINDING, port: messageCapabilityPort },
    {
      binding: WORKFLOW_ORDER_CONVERSION_CAPABILITY_BINDING,
      port: orderConversionCapabilityPort,
    },
    {
      binding: WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
      port: orderBindCapabilityPort,
    },
    { binding: WORKFLOW_TAG_CAPABILITY_BINDING, port: tagCapabilityPort },
    { binding: WORKFLOW_TAG_QUERY_CAPABILITY_BINDING, port: tagQueryCapabilityPort },
  ]);
  const aiCollectConversationPort = new MysqlWorkflowAiCollectConversationPort(database, {
    baseUrl: config.javaInternalApi.baseUrl,
    token: config.javaInternalApi.token,
  });
  const conversationDirectivePort = new HttpWorkflowConversationDirectivePort({
    baseUrl: config.javaInternalApi.baseUrl,
    token: config.javaInternalApi.token,
  });
  const runtimeService = new WorkflowRuntimeService(
    repository,
    repository,
    capabilityPort,
    {
      capabilityMaxRetryDelayMs: config.runtime.capabilityMaxRetryDelayMs,
      capabilityRetryDelayMs: config.runtime.capabilityRetryDelayMs,
      capabilityTimeoutMs: config.runtime.capabilityTimeoutMs,
      capabilityBindings: capabilityPort.bindings,
      aiCollectConversationPort,
      contactIdentityPort: new HttpWorkflowContactIdentityPort({
        baseUrl: config.javaInternalApi.baseUrl,
        token: config.javaInternalApi.token,
      }),
      conversationDirectivePort,
      entitlementPort,
      maxTaskAttempts: config.runtime.maxTaskAttempts,
      messageQueryPort: new MysqlWorkflowMessageQueryPort(database),
      inferenceTotalTimeoutMs: config.runtime.inferenceTotalTimeoutMs,
      taskLeaseDurationMs: config.runtime.leaseDurationMs,
    },
  );
  const reconcilerService = new WorkflowRuntimeReconciler(repository, { entitlementPort });
  let broker: Awaited<ReturnType<typeof createWorkflowBroker>>;
  try {
    runtimeService.assertRuntimeComposition();
    await assertDatabaseUtc8Timezone(database);
    broker = await createWorkflowBroker({
      serviceUrl: config.pulsar.serviceUrl,
      token: config.pulsar.token,
    });
  } catch (error) {
    await Promise.allSettled([database.destroy(), entitlementCache.close()]);
    throw error;
  }
  const workerId = `${process.pid}-${randomUUID()}`;
  const runtimeState = createWorkflowWorkerRuntimeState({
    db: database,
    logger,
    reportedBy: `${hostname()}:${process.pid}`.slice(0, 128),
  });
  runtimeState.start();
  return startWorkflowWorker({
    config,
    logger,
    startHealth: startWorkflowHealthServer,
    startRuntime: () => startWorkflowWorkerRuntime({
      broker,
      config,
      conversationDirectivePort,
      conversationDirectiveRepository: repository,
      conversationDirectiveWorker: processWorkflowConversationDirectiveDisableBatch,
      database,
      entitlementCache,
      entryConsumer: startEntryConsumer,
      eventCatalog: WORKFLOW_EVENT_CATALOG,
      eventSubscriptionReader: repository,
      inboxRepository: repository,
      messageReader: new MysqlWorkflowEntryMessageReader(database),
      inferenceAdapter,
      inferenceRepository: repository,
      inferenceWorker: processWorkflowInferenceBatch,
      llmTestAdapter: llmTestWorker?.adapter,
      llmTestAttemptRepository,
      llmTestAttemptWorker: llmTestWorker?.process,
      logger,
      outboxPublisher: publishWorkflowOutbox,
      outboxRepository: repository,
      pingDatabase: async () => { await sql`select 1`.execute(database); },
      reconciler: reconcileWorkflowRuntime,
      reconcilerService,
      roleLoop: startRoleLoop,
      runtimeService,
      runtimeState,
      scheduler: scheduleWorkflowTasks,
      schedulerRepository: repository,
      taskConsumer: startTaskConsumer,
      triggerBindingReader: repository,
      workerId,
    }),
    workerId,
  });
}

async function loadLlmTestWorker(inferenceAdapter: ReturnType<typeof createVolcengineChatCompletionAdapter>) {
  const { processWorkflowLlmTestAttemptBatch } = await import("./llm-test-attempt-worker.js");
  return {
    adapter: {
      execute: async (request: Parameters<WorkflowLlmTestAdapter["execute"]>[0]) =>
        inferenceAdapter.execute({
          contractVersion: 1,
          deadlineAt: request.deadlineAt,
          executionKey: request.executionKey,
          payload: request.payload,
          signal: request.signal,
          uid: request.uid,
        }),
    },
    process: processWorkflowLlmTestAttemptBatch,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = await startWorkflowWorkerProcess();
  const shutdown = () => void worker.close().finally(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export * from "./audience-filter-capability-port.js";
export * from "./ai-collect-conversation-port.js";
export * from "./broker/index.js";
export * from "./capability-router.js";
export * from "./config.js";
export * from "./contact-identity-port.js";
export * from "./conversation-directive-port.js";
export * from "./conversation-directive-worker.js";
export * from "./customer-update-capability-port.js";
export * from "./database.js";
export * from "./entry-consumer.js";
export * from "./entitlement-cache.js";
export * from "./error-policy.js";
export * from "./health.js";
export * from "./handoff-capability-port.js";
export * from "./inference-worker.js";
export * from "./logger.js";
export * from "./llm-test-adapter.js";
export * from "./message-capability-port.js";
export * from "./outbox-publisher.js";
export * from "./observability.js";
export * from "./reconciler.js";
export * from "./role-loop.js";
export * from "./runtime.js";
export * from "./scheduler.js";
export * from "./tag-capability-port.js";
export * from "./tag-query-capability-port.js";
export * from "./task-consumer.js";
export * from "./volcengine-chat-completion-adapter.js";
