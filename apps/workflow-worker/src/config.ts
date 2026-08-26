import {
  WORKFLOW_RUN_RETENTION_DAYS,
  WORKFLOW_TASK_OUTBOX_RETENTION_DAYS,
} from "@chatai/contracts";
import {
  WORKFLOW_RUNTIME_BATCH_LIMIT,
} from "@chatai/workflow-runtime";

export type WorkflowEnvironment = "dev" | "test";
export type WorkflowWorkerRole = "entry-consumer" | "inference" | "outbox" | "reconciler" | "scheduler" | "task-consumer";

export type WorkflowWorkerConfig = {
  broker: "pulsar";
  databaseUrl: string;
  entitlement: {
    apiUrl: string | null;
    mode: "allow" | "enforce";
    token: string | null;
  };
  environment: WorkflowEnvironment;
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
    outboxIntervalMs: number;
    readinessIntervalMs: number;
    reconcileIntervalMs: number;
    retryDelayMs: number;
    runRetentionDays: number;
    schedulerIntervalMs: number;
    shardIds: number[];
    taskOutboxRetentionDays: number;
  };
  subscriptionType: "Shared";
  subscriptions: {
    entry: string;
    task: string;
  };
  deadLetterTopics: {
    entry: string | null;
    task: string | null;
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
  const databaseUrl = requireValue(env, "DATABASE_URL");
  const javaInternalApiBaseUrl = requireHttpBaseUrl(env, "JAVA_INTERNAL_API_BASE_URL");
  const environment = parseEnvironment(env.WORKFLOW_ENVIRONMENT);
  const broker = parseBroker(env.WORKFLOW_BROKER);
  const pulsarServiceUrl = optionalValue(env.WORKFLOW_PULSAR_SERVICE_URL);
  const pulsarToken = optionalValue(env.WORKFLOW_PULSAR_TOKEN);
  const pulsarClusterId = optionalValue(env.WORKFLOW_PULSAR_CLUSTER_ID);
  const pulsarNamespace = optionalValue(env.WORKFLOW_PULSAR_NAMESPACE);
  if (broker === "pulsar" && (!pulsarServiceUrl || !pulsarToken)) {
    throw new Error("Missing required Workflow Pulsar configuration");
  }
  if (broker === "pulsar" && (!pulsarClusterId || !pulsarNamespace)) {
    throw new Error("Missing required Workflow Pulsar cluster ID or namespace");
  }

  const subscription = optionalValue(env.WORKFLOW_SUBSCRIPTION)
    ?? `consumer-chatai-worker-env-${environment}`;
  const entrySubscription = optionalValue(env.WORKFLOW_ENTRY_SUBSCRIPTION) ?? subscription;
  const taskSubscription = optionalValue(env.WORKFLOW_TASK_SUBSCRIPTION) ?? subscription;
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
  const entitlementMode = parseEntitlementMode(env.WORKFLOW_ENTITLEMENT_MODE);
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
  return {
    broker,
    databaseUrl,
    entitlement: {
      apiUrl: optionalValue(env.WORKFLOW_ENTITLEMENT_API_URL),
      mode: entitlementMode,
      token: optionalValue(env.JAVA_INTERNAL_API_TOKEN),
    },
    environment,
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
    roles: parseRoles(env.WORKFLOW_WORKER_ROLES),
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
      shardIds: parseShardIds(env.WORKFLOW_SHARD_IDS),
      taskOutboxRetentionDays: WORKFLOW_TASK_OUTBOX_RETENTION_DAYS,
    },
    subscriptionType: "Shared",
    subscriptions: {
      entry: entrySubscription,
      task: taskSubscription,
    },
    deadLetterTopics: {
      entry: qualifyTopic(optionalValue(env.WORKFLOW_ENTRY_DLQ_TOPIC) ?? `${entrySubscription}-DLQ`),
      task: qualifyTopic(optionalValue(env.WORKFLOW_TASK_DLQ_TOPIC) ?? `${taskSubscription}-DLQ`),
    },
    topics: {
      entry: qualifyTopic(optionalValue(env.WORKFLOW_ENTRY_TOPIC) ?? `topic-workflow-entry-${environment}`),
      task: qualifyTopic(optionalValue(env.WORKFLOW_TASK_TOPIC) ?? `topic-workflow-task-${environment}`),
    },
  };
}

function qualifyPulsarTopic(topic: string, clusterId: string, namespace: string) {
  if (topic.startsWith("persistent://")) return topic;
  if (topic.includes("://")) throw new Error("Workflow Pulsar topics must use persistent://");
  return `persistent://${clusterId}/${namespace}/${topic}`;
}

function parseBroker(value: string | undefined): WorkflowWorkerConfig["broker"] {
  if (value === "pulsar") return value;
  throw new Error("WORKFLOW_BROKER must be pulsar");
}

function parseEnvironment(value: string | undefined): WorkflowEnvironment {
  if (value === "dev" || value === "test") return value;
  throw new Error("WORKFLOW_ENVIRONMENT must be dev or test");
}

function parseEntitlementMode(value: string | undefined): WorkflowWorkerConfig["entitlement"]["mode"] {
  const mode = optionalValue(value) ?? "allow";
  if (mode === "allow" || mode === "enforce") return mode;
  throw new Error("WORKFLOW_ENTITLEMENT_MODE must be allow or enforce");
}

function parseRoles(value: string | undefined) {
  if (!optionalValue(value)) return new Set(DEFAULT_ROLES);
  const roles = value!.split(",").map(item => item.trim()).filter(Boolean);
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

function parseShardIds(value: string | undefined) {
  const normalized = optionalValue(value);
  if (!normalized) return Array.from({ length: 256 }, (_, index) => index);
  const shardIds = [...new Set(normalized.split(",").map(item => Number(item.trim())))];
  if (shardIds.length === 0 || shardIds.some(id => !Number.isInteger(id) || id < 0 || id > 255)) {
    throw new Error("WORKFLOW_SHARD_IDS must contain comma-separated integers from 0 to 255");
  }
  return shardIds.sort((first, second) => first - second);
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
