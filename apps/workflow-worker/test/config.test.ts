import { describe, expect, it } from "vitest";
import { loadWorkflowWorkerConfig } from "../src/config.js";

describe("workflow worker config", () => {
  it.each([
    [
      "dev",
      "persistent://pulsar-cluster/chatai-workflow/topic-workflow-entry-dev",
      "persistent://pulsar-cluster/chatai-workflow/topic-workflow-task-dev",
    ],
    [
      "test01",
      "persistent://pulsar-cluster/chatai-workflow/topic-workflow-entry-test01",
      "persistent://pulsar-cluster/chatai-workflow/topic-workflow-task-test01",
    ],
  ] as const)("maps %s to isolated workflow topics", (environment, entryTopic, taskTopic) => {
    const config = loadWorkflowWorkerConfig(baseEnv({ WORKFLOW_ENVIRONMENT: environment }));

    expect(config.topics).toEqual({ entry: entryTopic, task: taskTopic });
    expect(config.subscriptions).toEqual({
      entry: `consumer-chatai-worker-env-${environment}`,
      task: `consumer-chatai-worker-env-${environment}`,
    });
    expect(config.subscriptionType).toBe("Shared");
    expect(config.deadLetterTopics.entry).toBe(
      `persistent://pulsar-cluster/chatai-workflow/consumer-chatai-worker-env-${environment}-DLQ`,
    );
    expect(config.deadLetterTopics.task).toBe(
      `persistent://pulsar-cluster/chatai-workflow/consumer-chatai-worker-env-${environment}-DLQ`,
    );
  });

  it("allows entry and task subscriptions to be overridden independently", () => {
    const config = loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_ENTRY_SUBSCRIPTION: "entry-subscription",
      WORKFLOW_SUBSCRIPTION: "shared-subscription",
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
      WORKFLOW_BROKER: "pulsar",
      WORKFLOW_PULSAR_SERVICE_URL: "",
      WORKFLOW_PULSAR_TOKEN: token,
    }))).toThrowError(expect.objectContaining({ message: expect.not.stringContaining(token) }));
  });

  it("qualifies Pulsar topics with the configured tenant and namespace", () => {
    const config = loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_BROKER: "pulsar",
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
      entry: "persistent://pulsar-cluster/chatai-workflow/consumer-chatai-worker-env-dev-DLQ",
      task: "persistent://pulsar-cluster/chatai-workflow/consumer-chatai-worker-env-dev-DLQ",
    });
  });

  it("requires a cluster ID and namespace for the Pulsar broker", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_BROKER: "pulsar",
      WORKFLOW_PULSAR_CLUSTER_ID: "",
      WORKFLOW_PULSAR_NAMESPACE: "",
      WORKFLOW_PULSAR_SERVICE_URL: "http://pulsar.example.com:8080",
      WORKFLOW_PULSAR_TOKEN: "secret-token",
    }))).toThrow("Missing required Workflow Pulsar cluster ID or namespace");
  });

  it("preserves fully-qualified Pulsar topic overrides", () => {
    const topic = "persistent://another-tenant/another-namespace/custom-entry";
    const config = loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_BROKER: "pulsar",
      WORKFLOW_ENTRY_TOPIC: topic,
      WORKFLOW_PULSAR_CLUSTER_ID: "pulsar-cluster",
      WORKFLOW_PULSAR_NAMESPACE: "chatai-workflow",
      WORKFLOW_PULSAR_SERVICE_URL: "http://pulsar.example.com:8080",
      WORKFLOW_PULSAR_TOKEN: "secret-token",
    }));

    expect(config.topics.entry).toBe(topic);
  });

  it("rejects unknown broker modes instead of falling through to Pulsar", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({ WORKFLOW_BROKER: "tdmq" })))
      .toThrow("WORKFLOW_BROKER must be pulsar");
  });

  it("loads deployment capabilities and the Java entitlement endpoint", () => {
    const config = loadWorkflowWorkerConfig(baseEnv({
      JAVA_INTERNAL_API_TOKEN: "internal-token",
      WORKFLOW_DEPLOYMENT_CAPABILITIES: "event.contact.tag_added@1,event.contact.friend_added@1",
      WORKFLOW_ENTITLEMENT_API_URL: "https://java.example.com/internal/workflow/entitlement",
    }));

    expect(config.deploymentCapabilities.capabilities).toEqual([
      { capabilityKey: "event.contact.friend_added", contractVersion: 1 },
      { capabilityKey: "event.contact.tag_added", contractVersion: 1 },
    ]);
    expect(config.deploymentCapabilities.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(config.entitlement).toEqual({
      apiUrl: "https://java.example.com/internal/workflow/entitlement",
      token: "internal-token",
    });
  });

  it("starts every Phase 3 role by default with bounded runtime settings", () => {
    const config = loadWorkflowWorkerConfig(baseEnv());

    expect([...config.roles].sort()).toEqual([
      "entry-consumer",
      "outbox",
      "reconciler",
      "scheduler",
      "task-consumer",
    ]);
    expect(config.runtime).toMatchObject({
      capabilityMaxRetryDelayMs: 300_000,
      capabilityRetryDelayMs: 5_000,
      capabilityTimeoutMs: 15_000,
      batchSize: 100,
      dispatchTimeoutMs: 300_000,
      inboxCleanupBatchSize: 1_000,
      historyCleanupBatchSize: 1_000,
      historyCleanupIntervalMs: 3_600_000,
      leaseDurationMs: 60_000,
      maxOutboxAttempts: 100,
      maxOutboxRetryDelayMs: 300_000,
      maxTaskAttempts: 5,
      outboxIntervalMs: 1_000,
      readinessIntervalMs: 30_000,
      reconcileIntervalMs: 30_000,
      runRetentionDays: 180,
      retryDelayMs: 5_000,
      schedulerIntervalMs: 1_000,
      taskOutboxRetentionDays: 30,
    });
    expect(config.runtime.shardIds).toHaveLength(256);
  });

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

  it("rejects an invalid health port independently from durations", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({
      WORKFLOW_HEALTH_PORT: "65536",
    }))).toThrow("WORKFLOW_HEALTH_PORT must be an integer from 1 to 65535");
  });

});

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "mysql://user:password@localhost/workflow",
    WORKFLOW_BROKER: "pulsar",
    WORKFLOW_ENVIRONMENT: "dev",
    WORKFLOW_PULSAR_CLUSTER_ID: "pulsar-cluster",
    WORKFLOW_PULSAR_NAMESPACE: "chatai-workflow",
    WORKFLOW_PULSAR_SERVICE_URL: "http://pulsar.example.com:8080",
    WORKFLOW_PULSAR_TOKEN: "secret-token",
    ...overrides,
  };
}
