export type WorkflowEnvironment = "dev" | "test01";
export type WorkflowWorkerRole = "entry-consumer" | "outbox" | "reconciler" | "scheduler" | "task-consumer";

export type WorkflowWorkerConfig = {
  broker: "fake" | "pulsar";
  databaseUrl: string;
  environment: WorkflowEnvironment;
  healthPort: number;
  logLevel: string;
  pulsar: {
    serviceUrl: string | null;
    token: string | null;
  };
  roles: ReadonlySet<WorkflowWorkerRole>;
  subscriptionType: "Shared";
  subscriptions: {
    entry: string;
    task: string;
  };
  topics: {
    entry: string;
    task: string;
  };
};

const ALL_ROLES: WorkflowWorkerRole[] = [
  "entry-consumer",
  "task-consumer",
  "scheduler",
  "outbox",
  "reconciler",
];

export function loadWorkflowWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkflowWorkerConfig {
  const databaseUrl = requireValue(env, "DATABASE_URL");
  const environment = parseEnvironment(env.WORKFLOW_ENVIRONMENT);
  const broker = env.WORKFLOW_BROKER === "fake" ? "fake" : "pulsar";
  const pulsarServiceUrl = optionalValue(env.WORKFLOW_PULSAR_SERVICE_URL);
  const pulsarToken = optionalValue(env.WORKFLOW_PULSAR_TOKEN);
  if (broker === "pulsar" && (!pulsarServiceUrl || !pulsarToken)) {
    throw new Error("Missing required Workflow Pulsar configuration");
  }

  const subscriptionPrefix = optionalValue(env.WORKFLOW_SUBSCRIPTION_PREFIX)
    ?? `consumer-chatai-worker-env-${environment}`;
  return {
    broker,
    databaseUrl,
    environment,
    healthPort: parsePositiveInteger(env.WORKFLOW_HEALTH_PORT, 3002, "WORKFLOW_HEALTH_PORT"),
    logLevel: optionalValue(env.LOG_LEVEL) ?? "info",
    pulsar: { serviceUrl: pulsarServiceUrl, token: pulsarToken },
    roles: parseRoles(env.WORKFLOW_WORKER_ROLES),
    subscriptionType: "Shared",
    subscriptions: {
      entry: optionalValue(env.WORKFLOW_ENTRY_SUBSCRIPTION) ?? `${subscriptionPrefix}-entry`,
      task: optionalValue(env.WORKFLOW_TASK_SUBSCRIPTION) ?? `${subscriptionPrefix}-task`,
    },
    topics: {
      entry: optionalValue(env.WORKFLOW_ENTRY_TOPIC) ?? `topic-workflow-entry-${environment}`,
      task: optionalValue(env.WORKFLOW_TASK_TOPIC) ?? `topic-workflow-task-${environment}`,
    },
  };
}

function parseEnvironment(value: string | undefined): WorkflowEnvironment {
  if (value === "dev" || value === "test01") return value;
  throw new Error("WORKFLOW_ENVIRONMENT must be dev or test01");
}

function parseRoles(value: string | undefined) {
  if (!optionalValue(value)) return new Set(ALL_ROLES);
  const roles = value!.split(",").map(item => item.trim()).filter(Boolean);
  const invalid = roles.filter(role => !ALL_ROLES.includes(role as WorkflowWorkerRole));
  if (invalid.length > 0) throw new Error(`Unknown Workflow Worker role: ${invalid.join(", ")}`);
  return new Set(roles as WorkflowWorkerRole[]);
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string) {
  if (!optionalValue(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
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
