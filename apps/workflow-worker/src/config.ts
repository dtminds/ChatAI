export type WorkflowEnvironment = "dev" | "test01";
export type WorkflowWorkerRole = "entry-consumer" | "outbox" | "reconciler" | "scheduler" | "task-consumer";

export type WorkflowWorkerConfig = {
  broker: "fake" | "pulsar";
  databaseUrl: string;
  environment: WorkflowEnvironment;
  healthPort: number;
  logLevel: string;
  maxRedeliverCount: number;
  pulsar: {
    serviceUrl: string | null;
    token: string | null;
  };
  roles: ReadonlySet<WorkflowWorkerRole>;
  runtime: {
    actionMaxRetryDelayMs: number;
    actionRetryDelayMs: number;
    batchSize: number;
    dispatchTimeoutMs: number;
    inboxCleanupBatchSize: number;
    leaseDurationMs: number;
    maxTaskAttempts: number;
    maxOutboxAttempts: number;
    maxOutboxRetryDelayMs: number;
    outboxIntervalMs: number;
    readinessIntervalMs: number;
    reconcileIntervalMs: number;
    retryDelayMs: number;
    schedulerIntervalMs: number;
    shardIds: number[];
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
  "outbox",
  "reconciler",
  "scheduler",
  "task-consumer",
];

const ALL_ROLES: WorkflowWorkerRole[] = [...DEFAULT_ROLES];

export function loadWorkflowWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkflowWorkerConfig {
  const databaseUrl = requireValue(env, "DATABASE_URL");
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
  const qualifyTopic = (topic: string) => broker === "pulsar"
    ? qualifyPulsarTopic(topic, pulsarClusterId!, pulsarNamespace!)
    : topic;
  return {
    broker,
    databaseUrl,
    environment,
    healthPort: parsePort(env.WORKFLOW_HEALTH_PORT, 3002, "WORKFLOW_HEALTH_PORT"),
    logLevel: optionalValue(env.LOG_LEVEL) ?? "info",
    maxRedeliverCount: parseCount(
      env.WORKFLOW_MAX_REDELIVER_COUNT,
      5,
      "WORKFLOW_MAX_REDELIVER_COUNT",
    ),
    pulsar: { serviceUrl: pulsarServiceUrl, token: pulsarToken },
    roles: parseRoles(env.WORKFLOW_WORKER_ROLES),
    runtime: {
      actionMaxRetryDelayMs: parseDurationMs(
        env.WORKFLOW_ACTION_MAX_RETRY_DELAY_MS,
        300_000,
        "WORKFLOW_ACTION_MAX_RETRY_DELAY_MS",
      ),
      actionRetryDelayMs: parseDurationMs(
        env.WORKFLOW_ACTION_RETRY_DELAY_MS,
        5_000,
        "WORKFLOW_ACTION_RETRY_DELAY_MS",
      ),
      batchSize: parseCount(env.WORKFLOW_BATCH_SIZE, 100, "WORKFLOW_BATCH_SIZE"),
      dispatchTimeoutMs: parseDurationMs(
        env.WORKFLOW_DISPATCH_TIMEOUT_MS,
        300_000,
        "WORKFLOW_DISPATCH_TIMEOUT_MS",
      ),
      inboxCleanupBatchSize: parseCount(
        env.WORKFLOW_INBOX_CLEANUP_BATCH_SIZE,
        1_000,
        "WORKFLOW_INBOX_CLEANUP_BATCH_SIZE",
      ),
      leaseDurationMs: parseDurationMs(
        env.WORKFLOW_LEASE_DURATION_MS,
        60_000,
        "WORKFLOW_LEASE_DURATION_MS",
      ),
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
      schedulerIntervalMs: parseDurationMs(
        env.WORKFLOW_SCHEDULER_INTERVAL_MS,
        1_000,
        "WORKFLOW_SCHEDULER_INTERVAL_MS",
      ),
      shardIds: parseShardIds(env.WORKFLOW_SHARD_IDS),
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
  if (value === "fake" || value === "pulsar") return value;
  throw new Error("WORKFLOW_BROKER must be fake or pulsar");
}

function parseEnvironment(value: string | undefined): WorkflowEnvironment {
  if (value === "dev" || value === "test01") return value;
  throw new Error("WORKFLOW_ENVIRONMENT must be dev or test01");
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

function optionalValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}
