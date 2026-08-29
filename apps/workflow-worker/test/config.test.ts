import { describe, expect, it } from "vitest";
import { loadWorkflowWorkerConfig } from "../src/config.js";

describe("workflow worker config", () => {
  it("loads explicitly configured, isolated Workflow broker resources", () => {
    const config = loadWorkflowWorkerConfig(baseEnv());

    expect(config.topics).toEqual({
      entry: "persistent://pulsar-cluster/chatai-workflow/topic-workflow-entry-dev",
      task: "persistent://pulsar-cluster/chatai-workflow/topic-workflow-task-dev",
    });
    expect(config.subscriptions).toEqual({
      entry: "consumer-chatai-worker-entry-dev",
      task: "consumer-chatai-worker-task-dev",
    });
    expect(config.subscriptionType).toBe("Shared");
    expect(config.deadLetterTopics).toEqual({
      entry: "persistent://pulsar-cluster/chatai-workflow/topic-workflow-entry-dev-dlq",
      task: "persistent://pulsar-cluster/chatai-workflow/topic-workflow-task-dev-dlq",
    });
  });

  it.each([
    "WORKFLOW_ENTRY_TOPIC",
    "WORKFLOW_TASK_TOPIC",
    "WORKFLOW_ENTRY_SUBSCRIPTION",
    "WORKFLOW_TASK_SUBSCRIPTION",
    "WORKFLOW_ENTRY_DLQ_TOPIC",
    "WORKFLOW_TASK_DLQ_TOPIC",
  ])("requires explicit broker resource configuration: %s", (name) => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({ [name]: undefined })))
      .toThrow(`Missing required environment variable: ${name}`);
  });

  it("loads entry and task subscriptions independently", () => {
    const config = loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_ENTRY_SUBSCRIPTION: "entry-subscription",
      WORKFLOW_TASK_SUBSCRIPTION: "task-subscription",
    }));

    expect(config.subscriptions).toEqual({
      entry: "entry-subscription",
      task: "task-subscription",
    });
  });

  it("requires real broker credentials without exposing secret values", () => {
    const token = "secret-token-must-not-leak";

    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_PULSAR_SERVICE_URL: "",
      WORKFLOW_PULSAR_TOKEN: token,
    }))).toThrowError(expect.objectContaining({ message: expect.not.stringContaining(token) }));
  });

  it("qualifies Pulsar topics with the configured tenant and namespace", () => {
    const config = loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_PULSAR_CLUSTER_ID: "pulsar-cluster",
      WORKFLOW_PULSAR_NAMESPACE: "chatai-workflow",
      WORKFLOW_PULSAR_SERVICE_URL: "http://pulsar.example.com:8080",
      WORKFLOW_PULSAR_TOKEN: "secret-token",
    }));

    expect(config.topics).toEqual({
      entry: "persistent://pulsar-cluster/chatai-workflow/topic-workflow-entry-dev",
      task: "persistent://pulsar-cluster/chatai-workflow/topic-workflow-task-dev",
    });
    expect(config.deadLetterTopics).toEqual({
      entry: "persistent://pulsar-cluster/chatai-workflow/topic-workflow-entry-dev-dlq",
      task: "persistent://pulsar-cluster/chatai-workflow/topic-workflow-task-dev-dlq",
    });
  });

  it("requires a cluster ID and namespace for the Pulsar broker", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_PULSAR_CLUSTER_ID: "",
      WORKFLOW_PULSAR_NAMESPACE: "",
      WORKFLOW_PULSAR_SERVICE_URL: "http://pulsar.example.com:8080",
      WORKFLOW_PULSAR_TOKEN: "secret-token",
    }))).toThrow("Missing required Workflow Pulsar cluster ID or namespace");
  });

  it("preserves fully-qualified Pulsar topic overrides", () => {
    const topic = "persistent://another-tenant/another-namespace/custom-entry";
    const config = loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_ENTRY_TOPIC: topic,
      WORKFLOW_PULSAR_CLUSTER_ID: "pulsar-cluster",
      WORKFLOW_PULSAR_NAMESPACE: "chatai-workflow",
      WORKFLOW_PULSAR_SERVICE_URL: "http://pulsar.example.com:8080",
      WORKFLOW_PULSAR_TOKEN: "secret-token",
    }));

    expect(config.topics.entry).toBe(topic);
  });

  it("rejects an unknown NODE_ENV instead of bypassing production checks", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({ NODE_ENV: "prod" })))
      .toThrow("NODE_ENV must be development, test, or production");
  });

  it("rejects a shared Entry and Task topic", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_TASK_TOPIC: "topic-workflow-entry-dev",
    }))).toThrow("WORKFLOW_ENTRY_TOPIC and WORKFLOW_TASK_TOPIC must be different");
  });

  it("requires separate Entry and Task DLQs in production", () => {
    expect(() => loadWorkflowWorkerConfig(productionEnv({
      WORKFLOW_TASK_DLQ_TOPIC: "topic-workflow-entry-prod-dlq",
    }))).toThrow(
      "WORKFLOW_ENTRY_DLQ_TOPIC and WORKFLOW_TASK_DLQ_TOPIC must be different in production",
    );
  });

  it.each([
    ["WORKFLOW_ENTRY_DLQ_TOPIC", "topic-workflow-entry-dev"],
    ["WORKFLOW_ENTRY_DLQ_TOPIC", "topic-workflow-task-dev"],
    ["WORKFLOW_TASK_DLQ_TOPIC", "topic-workflow-entry-dev"],
    ["WORKFLOW_TASK_DLQ_TOPIC", "topic-workflow-task-dev"],
  ])("rejects a DLQ that points to a source topic: %s", (name, topic) => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({ [name]: topic })))
      .toThrow("Workflow source topics and dead-letter topics must be different");
  });

  it("loads the Java entitlement endpoint", () => {
    const config = loadWorkflowWorkerConfig(baseEnv({
      JAVA_INTERNAL_API_TOKEN: "internal-token",
      WORKFLOW_ENTITLEMENT_API_URL: "https://java.example.com/internal/workflow/entitlement",
    }));

    expect(config.entitlement).toEqual({
      apiUrl: "https://java.example.com/internal/workflow/entitlement",
      mode: "allow",
      token: "internal-token",
    });
  });

  it("loads the Java internal API used by runtime-ready action nodes", () => {
    const config = loadWorkflowWorkerConfig(baseEnv({
      JAVA_INTERNAL_API_BASE_URL: " https://java.example.com/ ",
      JAVA_INTERNAL_API_TOKEN: "internal-token",
    }));

    expect(config.javaInternalApi).toEqual({
      baseUrl: "https://java.example.com",
      token: "internal-token",
    });
  });

  it("requires a valid Java internal API base URL", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({ JAVA_INTERNAL_API_BASE_URL: "" })))
      .toThrow("Missing required environment variable: JAVA_INTERNAL_API_BASE_URL");
    expect(() => loadWorkflowWorkerConfig(baseEnv({ JAVA_INTERNAL_API_BASE_URL: "mysql://java" })))
      .toThrow("JAVA_INTERNAL_API_BASE_URL must be an HTTP(S) URL");
  });

  it("defaults entitlement checks to allow outside production", () => {
    expect(loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_ENTITLEMENT_MODE: undefined,
    })).entitlement.mode).toBe("allow");
  });

  it("requires an explicit entitlement mode in production", () => {
    expect(() => loadWorkflowWorkerConfig(productionEnv({
      WORKFLOW_ENTITLEMENT_MODE: undefined,
    }))).toThrow("Missing required environment variable: WORKFLOW_ENTITLEMENT_MODE");

    expect(loadWorkflowWorkerConfig(productionEnv({
      WORKFLOW_ENTITLEMENT_MODE: " allow ",
    })).entitlement.mode).toBe("allow");
  });

  it("loads an explicit enforce entitlement mode", () => {
    const config = loadWorkflowWorkerConfig(productionEnv({
      WORKFLOW_ENTITLEMENT_MODE: "enforce",
      WORKFLOW_ENTITLEMENT_API_URL: "https://java.example.com/internal/workflow/entitlement",
    }));

    expect(config.entitlement.mode).toBe("enforce");
  });

  it("rejects unknown entitlement modes", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_ENTITLEMENT_MODE: "disabled",
    }))).toThrow("WORKFLOW_ENTITLEMENT_MODE must be allow or enforce");
  });

  it("requires the entitlement endpoint in enforce mode", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_ENTITLEMENT_API_URL: undefined,
      WORKFLOW_ENTITLEMENT_MODE: "enforce",
    }))).toThrow(
      "WORKFLOW_ENTITLEMENT_API_URL is required when WORKFLOW_ENTITLEMENT_MODE=enforce",
    );
  });

  it("starts every Phase 3 role by default with bounded runtime settings", () => {
    const config = loadWorkflowWorkerConfig(baseEnv());

    expect([...config.roles].sort()).toEqual([
      "entry-consumer",
      "inference",
      "outbox",
      "reconciler",
      "scheduler",
      "task-consumer",
    ]);
    expect(config.consumerConcurrency).toEqual({ entry: 10, task: 10 });
    expect(config.runtime).toMatchObject({
      capabilityMaxRetryDelayMs: 300_000,
      capabilityRetryDelayMs: 5_000,
      capabilityTimeoutMs: 15_000,
      batchSize: 100,
      dispatchTimeoutMs: 300_000,
      inboxCleanupBatchSize: 1_000,
      historyCleanupBatchSize: 1_000,
      historyCleanupIntervalMs: 3_600_000,
      inferenceConcurrency: 10,
      inferenceHeartbeatIntervalMs: 15_000,
      inferenceIntervalMs: 1_000,
      inferenceLeaseDurationMs: 60_000,
      inferenceMaxAttempts: 5,
      inferenceMaxRetryDelayMs: 300_000,
      inferenceRetryDelayMs: 5_000,
      inferenceTotalTimeoutMs: 600_000,
      leaseDurationMs: 60_000,
      maxOutboxAttempts: 100,
      maxOutboxRetryDelayMs: 300_000,
      maxTaskAttempts: 5,
      outboxPublishConcurrency: 8,
      outboxIntervalMs: 1_000,
      readinessIntervalMs: 30_000,
      reconcileIntervalMs: 30_000,
      runRetentionDays: 180,
      retryDelayMs: 5_000,
      schedulerIntervalMs: 1_000,
      taskOutboxRetentionDays: 30,
    });
  });

  it("requires explicit Entry and Task concurrency in production", () => {
    expect(() => loadWorkflowWorkerConfig(productionEnv({
      WORKFLOW_ENTRY_CONCURRENCY: undefined,
      WORKFLOW_TASK_CONCURRENCY: undefined,
    }))).toThrow("Missing required environment variable: WORKFLOW_ENTRY_CONCURRENCY");
    expect(() => loadWorkflowWorkerConfig(productionEnv({
      WORKFLOW_ENTRY_CONCURRENCY: "20",
      WORKFLOW_TASK_CONCURRENCY: undefined,
    }))).toThrow("Missing required environment variable: WORKFLOW_TASK_CONCURRENCY");
    expect(loadWorkflowWorkerConfig(productionEnv({
      WORKFLOW_ENTRY_CONCURRENCY: "20",
      WORKFLOW_TASK_CONCURRENCY: "30",
    })).consumerConcurrency).toEqual({ entry: 20, task: 30 });
  });

  it("requires explicit roles in production", () => {
    expect(() => loadWorkflowWorkerConfig(productionEnv({
      WORKFLOW_WORKER_ROLES: undefined,
    }))).toThrow("Missing required environment variable: WORKFLOW_WORKER_ROLES");
    expect(loadWorkflowWorkerConfig(productionEnv({
      WORKFLOW_WORKER_ROLES: "entry-consumer,task-consumer",
    })).roles).toEqual(new Set(["entry-consumer", "task-consumer"]));
  });

  it("rejects empty roles", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_WORKER_ROLES: ",",
    }))).toThrow("WORKFLOW_WORKER_ROLES must contain at least one role");
  });

  it.each(["0", "-1", "1.5", "1001"])(
    "rejects invalid consumer concurrency %s",
    (value) => {
      expect(() => loadWorkflowWorkerConfig(baseEnv({
        WORKFLOW_ENTRY_CONCURRENCY: value,
      }))).toThrow("WORKFLOW_ENTRY_CONCURRENCY must be an integer from 1 to 1000");
      expect(() => loadWorkflowWorkerConfig(baseEnv({
        WORKFLOW_TASK_CONCURRENCY: value,
      }))).toThrow("WORKFLOW_TASK_CONCURRENCY must be an integer from 1 to 1000");
    },
  );

  it("allows runtime durations above the TCP port range", () => {
    const config = loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_CAPABILITY_MAX_RETRY_DELAY_MS: "900000",
      WORKFLOW_CAPABILITY_RETRY_DELAY_MS: "15000",
      WORKFLOW_DISPATCH_TIMEOUT_MS: "600000",
      WORKFLOW_LEASE_DURATION_MS: "120000",
    }));

    expect(config.runtime.capabilityMaxRetryDelayMs).toBe(900_000);
    expect(config.runtime.capabilityRetryDelayMs).toBe(15_000);
    expect(config.runtime.dispatchTimeoutMs).toBe(600_000);
    expect(config.runtime.leaseDurationMs).toBe(120_000);
  });

  it("keeps the capability timeout within half of the task lease", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_CAPABILITY_TIMEOUT_MS: "30001",
      WORKFLOW_LEASE_DURATION_MS: "60000",
    }))).toThrow("WORKFLOW_CAPABILITY_TIMEOUT_MS must not exceed half of WORKFLOW_LEASE_DURATION_MS");

    expect(loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_CAPABILITY_TIMEOUT_MS: "30000",
      WORKFLOW_LEASE_DURATION_MS: "60000",
    })).runtime.capabilityTimeoutMs).toBe(30_000);
  });

  it("requires the inference heartbeat to renew before its lease expires", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_INFERENCE_HEARTBEAT_INTERVAL_MS: "60000",
      WORKFLOW_INFERENCE_LEASE_DURATION_MS: "60000",
    }))).toThrow(
      "WORKFLOW_INFERENCE_HEARTBEAT_INTERVAL_MS must be less than WORKFLOW_INFERENCE_LEASE_DURATION_MS",
    );

    expect(loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_INFERENCE_HEARTBEAT_INTERVAL_MS: "15000",
      WORKFLOW_INFERENCE_LEASE_DURATION_MS: "60000",
    })).runtime.inferenceHeartbeatIntervalMs).toBe(15_000);
  });

  it("bounds inference concurrency independently from generic batch work", () => {
    expect(loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_BATCH_SIZE: "100",
      WORKFLOW_INFERENCE_CONCURRENCY: "12",
    })).runtime.inferenceConcurrency).toBe(12);
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_INFERENCE_CONCURRENCY: "101",
    }))).toThrow("WORKFLOW_INFERENCE_CONCURRENCY must be an integer from 1 to 100");
  });

  it("rejects oversized workflow batch counts", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_BATCH_SIZE: "1001",
    }))).toThrow("WORKFLOW_BATCH_SIZE must be an integer from 1 to 1000");
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_HISTORY_CLEANUP_BATCH_SIZE: "1001",
    }))).toThrow("WORKFLOW_HISTORY_CLEANUP_BATCH_SIZE must be an integer from 1 to 1000");
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_INBOX_CLEANUP_BATCH_SIZE: "1001",
    }))).toThrow("WORKFLOW_INBOX_CLEANUP_BATCH_SIZE must be an integer from 1 to 1000");
    expect(loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_BATCH_SIZE: "1000",
    })).runtime.batchSize).toBe(1000);
  });

  it("bounds Outbox publish concurrency independently from the batch size", () => {
    expect(loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_BATCH_SIZE: "1000",
      WORKFLOW_OUTBOX_PUBLISH_CONCURRENCY: "16",
    })).runtime.outboxPublishConcurrency).toBe(16);
    for (const value of ["0", "-1", "1.5", "101"]) {
      expect(() => loadWorkflowWorkerConfig(baseEnv({
        WORKFLOW_OUTBOX_PUBLISH_CONCURRENCY: value,
      }))).toThrow("WORKFLOW_OUTBOX_PUBLISH_CONCURRENCY must be an integer from 1 to 100");
    }
  });

  it("rejects an invalid health port independently from durations", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_HEALTH_PORT: "65536",
    }))).toThrow("WORKFLOW_HEALTH_PORT must be an integer from 1 to 65535");
  });

});

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "mysql://user:password@localhost/workflow",
    JAVA_INTERNAL_API_BASE_URL: "https://java.example.com",
    WORKFLOW_ENTRY_DLQ_TOPIC: "topic-workflow-entry-dev-dlq",
    WORKFLOW_ENTRY_CONCURRENCY: "10",
    WORKFLOW_ENTRY_SUBSCRIPTION: "consumer-chatai-worker-entry-dev",
    WORKFLOW_ENTRY_TOPIC: "topic-workflow-entry-dev",
    WORKFLOW_PULSAR_CLUSTER_ID: "pulsar-cluster",
    WORKFLOW_PULSAR_NAMESPACE: "chatai-workflow",
    WORKFLOW_PULSAR_SERVICE_URL: "http://pulsar.example.com:8080",
    WORKFLOW_PULSAR_TOKEN: "secret-token",
    WORKFLOW_TASK_DLQ_TOPIC: "topic-workflow-task-dev-dlq",
    WORKFLOW_TASK_CONCURRENCY: "10",
    WORKFLOW_TASK_SUBSCRIPTION: "consumer-chatai-worker-task-dev",
    WORKFLOW_TASK_TOPIC: "topic-workflow-task-dev",
    ...overrides,
  };
}

function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseEnv({
    NODE_ENV: "production",
    WORKFLOW_ENTITLEMENT_MODE: "allow",
    WORKFLOW_ENTRY_DLQ_TOPIC: "topic-workflow-entry-prod-dlq",
    WORKFLOW_ENTRY_SUBSCRIPTION: "consumer-chatai-worker-entry-prod",
    WORKFLOW_ENTRY_TOPIC: "topic-workflow-entry-prod",
    WORKFLOW_TASK_DLQ_TOPIC: "topic-workflow-task-prod-dlq",
    WORKFLOW_TASK_SUBSCRIPTION: "consumer-chatai-worker-task-prod",
    WORKFLOW_TASK_TOPIC: "topic-workflow-task-prod",
    WORKFLOW_WORKER_ROLES: "entry-consumer,task-consumer,scheduler",
    ...overrides,
  });
}
