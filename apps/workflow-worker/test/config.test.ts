import { describe, expect, it } from "vitest";
import { loadWorkflowWorkerConfig } from "../src/config.js";

describe("workflow worker config", () => {
  it.each([
    ["dev", "topic-workflow-entry-dev", "topic-workflow-task-dev"],
    ["test01", "topic-workflow-entry-test01", "topic-workflow-task-test01"],
  ] as const)("maps %s to isolated workflow topics", (environment, entryTopic, taskTopic) => {
    const config = loadWorkflowWorkerConfig(baseEnv({ WORKFLOW_ENVIRONMENT: environment }));

    expect(config.topics).toEqual({ entry: entryTopic, task: taskTopic });
    expect(config.subscriptions).toEqual({
      entry: `consumer-chatai-worker-env-${environment}`,
      task: `consumer-chatai-worker-env-${environment}`,
    });
    expect(config.subscriptionType).toBe("Shared");
    expect(config.deadLetterTopics.entry).toBe(`consumer-chatai-worker-env-${environment}-DLQ`);
    expect(config.deadLetterTopics.task).toBe(`consumer-chatai-worker-env-${environment}-DLQ`);
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

  it("rejects unknown broker modes instead of falling through to Pulsar", () => {
    expect(() => loadWorkflowWorkerConfig(baseEnv({ WORKFLOW_BROKER: "tdmq" })))
      .toThrow("WORKFLOW_BROKER must be fake or pulsar");
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
      batchSize: 100,
      leaseDurationMs: 60_000,
      outboxIntervalMs: 1_000,
      reconcileIntervalMs: 30_000,
      retryDelayMs: 5_000,
      schedulerIntervalMs: 1_000,
    });
    expect(config.runtime.shardIds).toHaveLength(256);
  });
});

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "mysql://user:password@localhost/workflow",
    WORKFLOW_BROKER: "fake",
    WORKFLOW_ENVIRONMENT: "dev",
    ...overrides,
  };
}
