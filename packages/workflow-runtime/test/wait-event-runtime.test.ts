import type { WorkflowExecutionSpec } from "@chatai/contracts";
import { createWorkflowDeploymentCapabilities } from "@chatai/workflow-engine";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
  type WorkflowEventSubscriptionRecord,
} from "../src/index.js";

const WAIT_EVENT_CAPABILITY = {
  capabilityKey: "event.message.received",
  contractVersion: 1,
} as const;
const ENTERED_AT = new Date("2026-08-10T00:00:00.000Z");
const EXPIRES_AT = new Date("2026-08-10T00:01:00.000Z");
const COLLECT_UNTIL = new Date("2026-08-10T00:00:15.000Z");

describe("Wait Event runtime", () => {
  it("establishes a subscription without routing the node", async () => {
    const harness = await createHarness();

    const result = await enterWaitEvent(harness);

    expect(result).toMatchObject({
      kind: "waiting",
      subscription: {
        collectUntil: null,
        effectiveFrom: ENTERED_AT,
        eventType: "message.received",
        expiresAt: EXPIRES_AT,
        status: "waiting",
      },
      task: { dueAt: EXPIRES_AT, status: "pending", taskType: "wait-event" },
    });
    expect(harness.repository.snapshot()).toMatchObject({
      nodeExecutions: [],
      runs: [{ currentNodeId: "wait-event", status: "waiting" }],
      tasks: [{ nodeId: "wait-event", status: "pending" }],
    });
  });

  it("collects messages for ten seconds and routes the triggered output", async () => {
    const harness = await createHarness();
    const waiting = await enterWaitEvent(harness);
    const first = await recordMessage(harness, waiting.subscription, {
      eventId: "message-event-1",
      messageId: 101,
      occurredAt: new Date("2026-08-10T00:00:05.000Z"),
      recordedAt: new Date("2026-08-10T00:00:05.000Z"),
      text: "第一条消息",
    });
    if (first.kind !== "success") throw new Error(`Expected first message, received ${first.kind}`);
    await recordMessage(harness, first.subscription, {
      eventId: "message-event-2",
      messageId: 102,
      occurredAt: new Date("2026-08-10T00:00:04.000Z"),
      recordedAt: new Date("2026-08-10T00:00:09.000Z"),
      text: "第二条消息",
    });

    const completed = await dispatchAndExecute(harness, COLLECT_UNTIL);

    expect(completed).toMatchObject({
      kind: "success",
      nextTask: { nodeId: "end", status: "dispatched" },
      run: {
        context: {
          outputs: {
            "wait-event": {
              lastMessageAt: "2026-08-10T00:00:05.000Z",
              messageCount: 2,
              messageIds: [102, 101],
              textContent: "第二条消息\n第一条消息",
            },
          },
        },
      },
    });
    await expect(harness.repository.findEventSubscriptionByTask(
      9,
      waiting.task.id,
    )).resolves.toMatchObject({
      collectUntil: COLLECT_UNTIL,
      status: "triggered",
    });
  });

  it("routes timeout and can resume after the timeout CAS was already persisted", async () => {
    const harness = await createHarness();
    const waiting = await enterWaitEvent(harness);
    await expect(harness.repository.timeoutEventSubscription({
      subscriptionId: waiting.subscription.id,
      timedOutAt: EXPIRES_AT,
      uid: 9,
    })).resolves.toMatchObject({ kind: "success" });

    const completed = await dispatchAndExecute(harness, EXPIRES_AT);

    expect(completed).toMatchObject({
      kind: "success",
      nextTask: { nodeId: "end", status: "dispatched" },
      run: { context: { outputs: { "wait-event": {} } } },
    });
  });

  it("fails the node when collected output exceeds the core output limit", async () => {
    const harness = await createHarness();
    const waiting = await enterWaitEvent(harness);
    await recordMessage(harness, waiting.subscription, {
      eventId: "message-event-large",
      messageId: 101,
      occurredAt: new Date("2026-08-10T00:00:05.000Z"),
      recordedAt: new Date("2026-08-10T00:00:05.000Z"),
      text: "x".repeat(5_000),
    });

    const completed = await dispatchAndExecute(harness, COLLECT_UNTIL);

    expect(completed).toMatchObject({
      errorCode: "WORKFLOW_NODE_OUTPUT_TOO_LARGE",
      kind: "node-failed",
      nodeKind: "wait-event",
      run: { status: "failed" },
    });
  });

  it("does not consume a subscription while its deployment capability is disabled", async () => {
    const deploymentCapabilities = createWorkflowDeploymentCapabilities([WAIT_EVENT_CAPABILITY]);
    const harness = await createHarness(deploymentCapabilities);
    const waiting = await enterWaitEvent(harness);
    deploymentCapabilities.capabilities.length = 0;

    await expect(recordMessage(harness, waiting.subscription, {
      eventId: "message-event-disabled",
      messageId: 101,
      occurredAt: new Date("2026-08-10T00:00:05.000Z"),
      recordedAt: new Date("2026-08-10T00:00:05.000Z"),
      text: "不会被收集",
    })).rejects.toMatchObject({ code: "WORKFLOW_DEPLOYMENT_CAPABILITY_DISABLED" });
    await expect(harness.repository.findEventSubscriptionByTask(
      9,
      waiting.task.id,
    )).resolves.toMatchObject({ status: "waiting" });
  });

  it("rejects an event from a different Subject identity", async () => {
    const harness = await createHarness();
    const waiting = await enterWaitEvent(harness);

    await expect(recordMessage(harness, waiting.subscription, {
      eventId: "message-event-other-subject",
      messageId: 101,
      occurredAt: new Date("2026-08-10T00:00:05.000Z"),
      recordedAt: new Date("2026-08-10T00:00:05.000Z"),
      subjectType: "wecom_contact",
      text: "错误主体",
    })).rejects.toMatchObject({ code: "WORKFLOW_DEFINITION_STALE" });
    await expect(harness.repository.findEventSubscriptionByTask(
      9,
      waiting.task.id,
    )).resolves.toMatchObject({ status: "waiting" });
  });
});

async function createHarness(
  deploymentCapabilities = createWorkflowDeploymentCapabilities([WAIT_EVENT_CAPABILITY]),
) {
  const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => ENTERED_AT);
  const spec = executionSpec();
  const service = new WorkflowRuntimeService({
    applyEntitlementLoss: vi.fn(async () => ({ affectedDefinitions: 0 })),
    findDefinition: vi.fn(async () => ({
      bizStatus: 1 as const,
      publishedRevision: 1,
      runtimeStatus: "active" as const,
      statusReason: null,
      workflowType: "chatai_sop" as const,
    })),
    findRevision: vi.fn(async () => ({
      executionSpec: spec,
      revision: 1,
      subjectType: "chatai_contact" as const,
      workflowType: "chatai_sop" as const,
    })),
  }, repository, undefined, {
    clock: () => ENTERED_AT,
    deploymentCapabilities,
    entitlementPort: {
      check: vi.fn(async () => ({ entitled: true, unentitledSince: null })),
    },
  });
  const created = await repository.createRunWithInitialTask({
    context: { outputs: {}, trigger: {} },
    entryEventId: "entry-event-1",
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
    initialNodeId: "wait-event",
    initialNodeKind: "wait-event",
    occurredAt: ENTERED_AT,
    revision: 1,
    shardId: 7,
    subjectId: "customer-1",
    subjectType: "chatai_contact",
    uid: 9,
    workflowId: "31",
    workflowType: "chatai_sop",
  });
  if (created.kind !== "success") throw new Error(`Expected run, received ${created.kind}`);
  return { created, repository, service };
}

async function enterWaitEvent(harness: Awaited<ReturnType<typeof createHarness>>) {
  const result = await harness.service.executeTask({
    messageId: "task-message-initial",
    now: ENTERED_AT,
    taskId: harness.created.task.id,
    taskVersion: harness.created.task.taskVersion,
    uid: 9,
    workerId: "worker-1",
  });
  if (!("subscription" in result) || result.kind !== "waiting") {
    throw new Error("Expected Wait Event subscription");
  }
  return result;
}

function recordMessage(
  harness: Awaited<ReturnType<typeof createHarness>>,
  subscription: WorkflowEventSubscriptionRecord,
  input: {
    eventId: string;
    messageId: number;
    occurredAt: Date;
    recordedAt: Date;
    subjectId?: string;
    subjectType?: "chatai_contact" | "wecom_contact";
    text: string;
  },
) {
  return harness.service.recordWaitEvent({
    eventId: input.eventId,
    eventOccurredAt: input.occurredAt,
    eventType: "message.received",
    match: { accountId: "account-a", messageType: "text", text: input.text },
    projection: { messageId: input.messageId, messageType: "text", text: input.text },
    recordedAt: input.recordedAt,
    subscription,
    subjectId: input.subjectId ?? "customer-1",
    subjectType: input.subjectType ?? "chatai_contact",
    uid: 9,
  });
}

async function dispatchAndExecute(
  harness: Awaited<ReturnType<typeof createHarness>>,
  now: Date,
) {
  await expect(harness.repository.dispatchDueTasks({ limit: 10, now })).resolves.toMatchObject({
    dispatched: 1,
  });
  const task = await harness.repository.findTask(9, harness.created.task.id);
  if (!task) throw new Error("Wait Event task is missing");
  return harness.service.executeTask({
    messageId: `task-message-${task.taskVersion}`,
    now,
    taskId: task.id,
    taskVersion: task.taskVersion,
    uid: 9,
    workerId: "worker-1",
  });
}

function executionSpec(): WorkflowExecutionSpec {
  return {
    edges: [
      {
        id: "wait-event-triggered-end",
        source: "wait-event",
        sourceOutletId: "triggered",
        target: "end",
      },
      {
        id: "wait-event-timeout-end",
        source: "wait-event",
        sourceOutletId: "timeout",
        target: "end",
      },
    ],
    entryNodeId: "wait-event",
    nodes: [
      {
        config: {
          event: {
            capabilityKey: "event.message.received",
            collectWindowSeconds: 10,
            contractVersion: 1,
            type: "message.received",
          },
          timeout: { duration: 1, unit: "minute" },
        },
        id: "wait-event",
        kind: "wait-event",
        nodeSchemaVersion: 1,
        requiredCapabilities: [WAIT_EVENT_CAPABILITY],
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
        requiredCapabilities: [],
      },
    ],
    requiredCapabilities: [WAIT_EVENT_CAPABILITY],
    revision: 1,
    schemaVersion: 2,
    terminalNodeId: "end",
    workflowId: "31",
  };
}
