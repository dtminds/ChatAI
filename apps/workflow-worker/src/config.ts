import {
  WORKFLOW_RUN_RETENTION_DAYS,
  WORKFLOW_TASK_OUTBOX_RETENTION_DAYS,
} from "@chatai/contracts";
import {
  WORKFLOW_MYSQL_WRITE_CHUNK_SIZE,
  WORKFLOW_RUNTIME_BATCH_LIMIT,
} from "@chatai/workflow-runtime";

export type WorkflowWorkerRole = "entry-consumer" | "inference" | "outbox" | "reconciler" | "scheduler" | "task-consumer";

export type WorkflowWorkerConfig = {
  consumerConcurrency: {
    entry: number;
    task: number;
  };
  databaseUrl: string;
  entitlement: {
    activeRunLimit: number;
  };
  healthPort: number;
  javaInternalApi: {
    baseUrl: string;
    token: string | null;
  };
  logLevel: string;
  maxRedeliverCount: number;
  pulsar: {
    serviceUrl: string | null;
    token: string | null;
  };
  redis: {
    commandTimeoutMs: number;
    connectTimeoutMs: number;
    enabled: boolean;
    keyPrefix: string;
    url: string | null;
  };
  roles: ReadonlySet<WorkflowWorkerRole>;
  runtime: {
    capabilityMaxRetryDelayMs: number;
    capabilityRetryDelayMs: number;
    capabilityTimeoutMs: number;
    batchSize: number;
    dispatchTimeoutMs: number;
    historyCleanupBatchSize: number;
    historyCleanupIntervalMs: number;
    inferenceConcurrency: number;
    inferenceHeartbeatIntervalMs: number;
    inferenceIntervalMs: number;
    inferenceLeaseDurationMs: number;
    inferenceMaxAttempts: number;
    inferenceMaxRetryDelayMs: number;
    inferenceRetryDelayMs: number;
    inferenceTotalTimeoutMs: number;
    inboxCleanupBatchSize: number;
    leaseDurationMs: number;
    maxTaskAttempts: number;
    maxOutboxAttempts: number;
    maxOutboxRetryDelayMs: number;
    outboxPublishConcurrency: number;
    outboxIntervalMs: number;
    readinessIntervalMs: number;
    reconcileIntervalMs: number;
    retryDelayMs: number;
    runRetentionDays: number;
    schedulerIntervalMs: number;
    taskOutboxRetentionDays: number;
  };
  subscriptions: {
    entry: string;
    task: string;
  };
  deadLetterTopics: {
    entry: string;
    task: string;
  };
  topics: {
    entry: string;
    task: string;
  };
};

const DEFAULT_ROLES: WorkflowWorkerRole[] = [
  "entry-consumer",
  "inference",
  "outbox",
  "reconciler",
  "scheduler",
  "task-consumer",
];

const ALL_ROLES: WorkflowWorkerRole[] = [...DEFAULT_ROLES];

export function loadWorkflowWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkflowWorkerConfig {
  const nodeEnvironment = parseNodeEnvironment(env.NODE_ENV);
  const databaseUrl = requireValue(env, "DATABASE_URL");
  const javaInternalApiBaseUrl = requireHttpBaseUrl(env, "JAVA_INTERNAL_API_BASE_URL");
  const pulsarServiceUrl = optionalValue(env.WORKFLOW_PULSAR_SERVICE_URL);
  const pulsarToken = optionalValue(env.WORKFLOW_PULSAR_TOKEN);
  const pulsarClusterId = optionalValue(env.WORKFLOW_PULSAR_CLUSTER_ID);
  const pulsarNamespace = optionalValue(env.WORKFLOW_PULSAR_NAMESPACE);
  if (!pulsarServiceUrl || !pulsarToken) {
    throw new Error("Missing required Workflow Pulsar configuration");
  }
  if (!pulsarClusterId || !pulsarNamespace) {
    throw new Error("Missing required Workflow Pulsar cluster ID or namespace");
  }

  const entrySubscription = requireValue(env, "WORKFLOW_ENTRY_SUBSCRIPTION");
  const taskSubscription = requireValue(env, "WORKFLOW_TASK_SUBSCRIPTION");
  const qualifyTopic = (topic: string) => qualifyPulsarTopic(
    topic,
    pulsarClusterId!,
    pulsarNamespace!,
  );
  const capabilityTimeoutMs = parseDurationMs(
    env.WORKFLOW_CAPABILITY_TIMEOUT_MS,
    15_000,
    "WORKFLOW_CAPABILITY_TIMEOUT_MS",
  );
  const leaseDurationMs = parseDurationMs(
    env.WORKFLOW_LEASE_DURATION_MS,
    60_000,
    "WORKFLOW_LEASE_DURATION_MS",
  );
  const redisEnabled = env.REDIS_ENABLED === "true";
  const redisUrl = optionalValue(env.REDIS_URL);
  if (redisEnabled && !redisUrl) {
    throw new Error("REDIS_URL must be configured when REDIS_ENABLED=true");
  }
  if (capabilityTimeoutMs * 2 > leaseDurationMs) {
    throw new Error("WORKFLOW_CAPABILITY_TIMEOUT_MS must not exceed half of WORKFLOW_LEASE_DURATION_MS");
  }
  const inferenceLeaseDurationMs = parseDurationMs(
    env.WORKFLOW_INFERENCE_LEASE_DURATION_MS,
    60_000,
    "WORKFLOW_INFERENCE_LEASE_DURATION_MS",
  );
  const inferenceHeartbeatIntervalMs = parseDurationMs(
    env.WORKFLOW_INFERENCE_HEARTBEAT_INTERVAL_MS,
    15_000,
    "WORKFLOW_INFERENCE_HEARTBEAT_INTERVAL_MS",
  );
  if (inferenceHeartbeatIntervalMs >= inferenceLeaseDurationMs) {
    throw new Error(
      "WORKFLOW_INFERENCE_HEARTBEAT_INTERVAL_MS must be less than WORKFLOW_INFERENCE_LEASE_DURATION_MS",
    );
  }
  const entryConsumerConcurrency = parseConsumerConcurrency(
    env.WORKFLOW_ENTRY_CONCURRENCY,
    nodeEnvironment,
    "WORKFLOW_ENTRY_CONCURRENCY",
  );
  const taskConsumerConcurrency = parseConsumerConcurrency(
    env.WORKFLOW_TASK_CONCURRENCY,
    nodeEnvironment,
    "WORKFLOW_TASK_CONCURRENCY",
  );
  const roles = parseRoles(env.WORKFLOW_WORKER_ROLES, nodeEnvironment);
  const entryTopic = qualifyTopic(requireValue(env, "WORKFLOW_ENTRY_TOPIC"));
  const taskTopic = qualifyTopic(requireValue(env, "WORKFLOW_TASK_TOPIC"));
  const entryDeadLetterTopic = qualifyTopic(requireValue(env, "WORKFLOW_ENTRY_DLQ_TOPIC"));
  const taskDeadLetterTopic = qualifyTopic(requireValue(env, "WORKFLOW_TASK_DLQ_TOPIC"));
  if (entryTopic === taskTopic) {
    throw new Error("WORKFLOW_ENTRY_TOPIC and WORKFLOW_TASK_TOPIC must be different");
  }
  if ([entryTopic, taskTopic].includes(entryDeadLetterTopic)
    || [entryTopic, taskTopic].includes(taskDeadLetterTopic)) {
    throw new Error("Workflow source topics and dead-letter topics must be different");
  }
  if (nodeEnvironment === "production" && entryDeadLetterTopic === taskDeadLetterTopic) {
    throw new Error("WORKFLOW_ENTRY_DLQ_TOPIC and WORKFLOW_TASK_DLQ_TOPIC must be different in production");
  }
  return {
    consumerConcurrency: {
      entry: entryConsumerConcurrency,
      task: taskConsumerConcurrency,
    },
    databaseUrl,
    entitlement: {
      activeRunLimit: parseNonNegativeSafeInteger(
        env.WORKFLOW_ACTIVE_RUN_LIMIT,
        10_000,
        "WORKFLOW_ACTIVE_RUN_LIMIT",
      ),
    },
    healthPort: parsePort(env.WORKFLOW_HEALTH_PORT, 3002, "WORKFLOW_HEALTH_PORT"),
    javaInternalApi: {
      baseUrl: javaInternalApiBaseUrl,
      token: optionalValue(env.JAVA_INTERNAL_API_TOKEN),
    },
    logLevel: optionalValue(env.LOG_LEVEL) ?? "info",
    maxRedeliverCount: parseCount(
      env.WORKFLOW_MAX_REDELIVER_COUNT,
      5,
      "WORKFLOW_MAX_REDELIVER_COUNT",
    ),
    pulsar: { serviceUrl: pulsarServiceUrl, token: pulsarToken },
    redis: {
      commandTimeoutMs: parseDurationMs(
        env.REDIS_COMMAND_TIMEOUT_MS,
        500,
        "REDIS_COMMAND_TIMEOUT_MS",
      ),
      connectTimeoutMs: parseDurationMs(
        env.REDIS_CONNECT_TIMEOUT_MS,
        3_000,
        "REDIS_CONNECT_TIMEOUT_MS",
      ),
      enabled: redisEnabled,
      keyPrefix: optionalValue(env.REDIS_KEY_PREFIX) ?? "chatai:",
      url: redisUrl,
    },
    roles,
    runtime: {
      capabilityMaxRetryDelayMs: parseDurationMs(
        env.WORKFLOW_CAPABILITY_MAX_RETRY_DELAY_MS,
        300_000,
        "WORKFLOW_CAPABILITY_MAX_RETRY_DELAY_MS",
      ),
      capabilityRetryDelayMs: parseDurationMs(
        env.WORKFLOW_CAPABILITY_RETRY_DELAY_MS,
        5_000,
        "WORKFLOW_CAPABILITY_RETRY_DELAY_MS",
      ),
      capabilityTimeoutMs,
      batchSize: parseInteger(env.WORKFLOW_BATCH_SIZE, 100, "WORKFLOW_BATCH_SIZE", WORKFLOW_RUNTIME_BATCH_LIMIT),
      dispatchTimeoutMs: parseDurationMs(
        env.WORKFLOW_DISPATCH_TIMEOUT_MS,
        300_000,
        "WORKFLOW_DISPATCH_TIMEOUT_MS",
      ),
      historyCleanupBatchSize: parseInteger(
        env.WORKFLOW_HISTORY_CLEANUP_BATCH_SIZE,
        1_000,
        "WORKFLOW_HISTORY_CLEANUP_BATCH_SIZE",
        WORKFLOW_RUNTIME_BATCH_LIMIT,
      ),
      historyCleanupIntervalMs: parseDurationMs(
        env.WORKFLOW_HISTORY_CLEANUP_INTERVAL_MS,
        3_600_000,
        "WORKFLOW_HISTORY_CLEANUP_INTERVAL_MS",
      ),
      inferenceConcurrency: parseInteger(
        env.WORKFLOW_INFERENCE_CONCURRENCY,
        10,
        "WORKFLOW_INFERENCE_CONCURRENCY",
        100,
      ),
      inferenceHeartbeatIntervalMs,
      inferenceIntervalMs: parseDurationMs(
        env.WORKFLOW_INFERENCE_INTERVAL_MS,
        1_000,
        "WORKFLOW_INFERENCE_INTERVAL_MS",
      ),
      inferenceLeaseDurationMs,
      inferenceMaxAttempts: parseCount(
        env.WORKFLOW_INFERENCE_MAX_ATTEMPTS,
        5,
        "WORKFLOW_INFERENCE_MAX_ATTEMPTS",
      ),
      inferenceMaxRetryDelayMs: parseDurationMs(
        env.WORKFLOW_INFERENCE_MAX_RETRY_DELAY_MS,
        300_000,
        "WORKFLOW_INFERENCE_MAX_RETRY_DELAY_MS",
      ),
      inferenceRetryDelayMs: parseDurationMs(
        env.WORKFLOW_INFERENCE_RETRY_DELAY_MS,
        5_000,
        "WORKFLOW_INFERENCE_RETRY_DELAY_MS",
      ),
      inferenceTotalTimeoutMs: parseDurationMs(
        env.WORKFLOW_INFERENCE_TOTAL_TIMEOUT_MS,
        600_000,
        "WORKFLOW_INFERENCE_TOTAL_TIMEOUT_MS",
      ),
      inboxCleanupBatchSize: parseInteger(
        env.WORKFLOW_INBOX_CLEANUP_BATCH_SIZE,
        1_000,
        "WORKFLOW_INBOX_CLEANUP_BATCH_SIZE",
        WORKFLOW_RUNTIME_BATCH_LIMIT,
      ),
      leaseDurationMs,
      maxTaskAttempts: parseCount(
        env.WORKFLOW_MAX_TASK_ATTEMPTS,
        5,
        "WORKFLOW_MAX_TASK_ATTEMPTS",
      ),
      maxOutboxAttempts: parseCount(
        env.WORKFLOW_MAX_OUTBOX_ATTEMPTS,
        100,
        "WORKFLOW_MAX_OUTBOX_ATTEMPTS",
      ),
      maxOutboxRetryDelayMs: parseDurationMs(
        env.WORKFLOW_MAX_OUTBOX_RETRY_DELAY_MS,
        300_000,
        "WORKFLOW_MAX_OUTBOX_RETRY_DELAY_MS",
      ),
      outboxPublishConcurrency: parseInteger(
        env.WORKFLOW_OUTBOX_PUBLISH_CONCURRENCY,
        8,
        "WORKFLOW_OUTBOX_PUBLISH_CONCURRENCY",
        WORKFLOW_MYSQL_WRITE_CHUNK_SIZE,
      ),
      outboxIntervalMs: parseDurationMs(
        env.WORKFLOW_OUTBOX_INTERVAL_MS,
        1_000,
        "WORKFLOW_OUTBOX_INTERVAL_MS",
      ),
      readinessIntervalMs: parseDurationMs(
        env.WORKFLOW_READINESS_INTERVAL_MS,
        30_000,
        "WORKFLOW_READINESS_INTERVAL_MS",
      ),
      reconcileIntervalMs: parseDurationMs(
        env.WORKFLOW_RECONCILE_INTERVAL_MS,
        30_000,
        "WORKFLOW_RECONCILE_INTERVAL_MS",
      ),
      retryDelayMs: parseDurationMs(
        env.WORKFLOW_OUTBOX_RETRY_DELAY_MS,
        5_000,
        "WORKFLOW_OUTBOX_RETRY_DELAY_MS",
      ),
      runRetentionDays: WORKFLOW_RUN_RETENTION_DAYS,
      schedulerIntervalMs: parseDurationMs(
        env.WORKFLOW_SCHEDULER_INTERVAL_MS,
        1_000,
        "WORKFLOW_SCHEDULER_INTERVAL_MS",
      ),
      taskOutboxRetentionDays: WORKFLOW_TASK_OUTBOX_RETENTION_DAYS,
    },
    subscriptions: {
      entry: entrySubscription,
      task: taskSubscription,
    },
    deadLetterTopics: {
      entry: entryDeadLetterTopic,
      task: taskDeadLetterTopic,
    },
    topics: {
      entry: entryTopic,
      task: taskTopic,
    },
  };
}

function qualifyPulsarTopic(topic: string, clusterId: string, namespace: string) {
  if (topic.startsWith("persistent://")) return topic;
  if (topic.includes("://")) throw new Error("Workflow Pulsar topics must use persistent://");
  return `persistent://${clusterId}/${namespace}/${topic}`;
}

function parseNodeEnvironment(value: string | undefined) {
  if (value === undefined || value === "development" || value === "test" || value === "production") {
    return value;
  }
  throw new Error("NODE_ENV must be development, test, or production");
}

function parseRoles(value: string | undefined, nodeEnvironment: string | undefined) {
  if (!optionalValue(value)) {
    if (nodeEnvironment === "production") {
      throw new Error("Missing required environment variable: WORKFLOW_WORKER_ROLES");
    }
    return new Set(DEFAULT_ROLES);
  }
  const roles = value!.split(",").map(item => item.trim()).filter(Boolean);
  if (roles.length === 0) {
    throw new Error("WORKFLOW_WORKER_ROLES must contain at least one role");
  }
  const invalid = roles.filter(role => !ALL_ROLES.includes(role as WorkflowWorkerRole));
  if (invalid.length > 0) throw new Error(`Unknown Workflow Worker role: ${invalid.join(", ")}`);
  return new Set(roles as WorkflowWorkerRole[]);
}

function parseInteger(value: string | undefined, fallback: number, name: string, maximum: number) {
  if (!optionalValue(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  }
  return parsed;
}

function parsePort(value: string | undefined, fallback: number, name: string) {
  return parseInteger(value, fallback, name, 65_535);
}

function parseDurationMs(value: string | undefined, fallback: number, name: string) {
  return parseInteger(value, fallback, name, 86_400_000);
}

function parseCount(value: string | undefined, fallback: number, name: string) {
  return parseInteger(value, fallback, name, 1_000_000);
}

function parseNonNegativeSafeInteger(value: string | undefined, fallback: number, name: string) {
  if (!optionalValue(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return parsed;
}

function parseConsumerConcurrency(
  value: string | undefined,
  nodeEnvironment: string | undefined,
  name: string,
) {
  if (nodeEnvironment === "production" && !optionalValue(value)) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return parseInteger(value, 10, name, 1_000);
}

function requireValue(env: NodeJS.ProcessEnv, name: string) {
  const value = optionalValue(env[name]);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireHttpBaseUrl(env: NodeJS.ProcessEnv, name: string) {
  const value = requireValue(env, name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an HTTP(S) URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be an HTTP(S) URL`);
  }
  return value.replace(/\/+$/, "");
}

function optionalValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}
