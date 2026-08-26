import type { WorkflowExecutionSpec } from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
  type WorkflowEventSubscriptionRecord,
} from "../src/index.js";

const ENTERED_AT = new Date("2026-08-10T00:00:00.000Z");
const EXPIRES_AT = new Date("2026-08-10T00:01:00.000Z");
const EVENT_OCCURRED_AT = new Date("2026-08-10T00:00:05.000Z");
const RESUME_AT = new Date("2026-08-10T00:00:35.000Z");

describe("Wait Event runtime", () => {
  it("records the actual completion time when a Wait Event finishes", async () => {
    let runtimeNow = ENTERED_AT;
    const harness = await createHarness(() => runtimeNow);
    await enterWaitEvent(harness);
    const dueAt = new Date(ENTERED_AT.getTime() + 60_000);
    const completedAt = new Date(dueAt.getTime() + 2_000);
    runtimeNow = completedAt;

    await dispatchAndExecute(harness, dueAt);

    await expect(harness.repository.findRun(9, harness.created.run.id)).resolves.toMatchObject({
      context: {
        nodeLifecycle: {
          "wait-event": { exitedAt: completedAt.toISOString() },
        },
      },
    });
  });

  it("establishes a subscription without routing the node", async () => {
    const harness = await createHarness();

    const result = await enterWaitEvent(harness);

    expect(result).toMatchObject({
      kind: "waiting",
      subscription: {
        effectiveFrom: ENTERED_AT,
        eventType: "message.received",
        expiresAt: EXPIRES_AT,
        resumeAt: null,
        status: "waiting",
        triggerOccurredAt: null,
        triggerProjection: null,
      },
      task: { dueAt: EXPIRES_AT, status: "pending", taskType: "wait-event" },
    });
    expect(harness.repository.snapshot()).toMatchObject({
      nodeExecutions: [],
      runs: [{ currentNodeId: "wait-event", status: "waiting" }],
      tasks: [{ nodeId: "wait-event", status: "pending" }],
    });
  });

  it("latches the first message, waits from event time and routes only that trigger fact", async () => {
    const harness = await createHarness();
    const waiting = await enterWaitEvent(harness);
    const first = await recordMessage(harness, waiting.subscription, {
      eventId: "message-event-1",
      messageId: 101,
      occurredAt: EVENT_OCCURRED_AT,
      recordedAt: new Date("2026-08-10T00:00:08.000Z"),
      text: "第一条消息",
    });
    if (first.kind !== "success") throw new Error(`Expected first message, received ${first.kind}`);
    await expect(harness.repository.timeoutEventSubscription({
      subscriptionId: waiting.subscription.id,
      timedOutAt: EXPIRES_AT,
      uid: 9,
    })).resolves.toEqual({ kind: "conflict" });
    await expect(recordMessage(harness, waiting.subscription, {
      eventId: "message-event-2",
      messageId: 102,
      occurredAt: new Date("2026-08-10T00:00:09.000Z"),
      recordedAt: new Date("2026-08-10T00:00:09.000Z"),
      text: "第二条消息",
    })).resolves.toEqual({ kind: "conflict" });

    await expect(harness.repository.dispatchDueTasks({
      limit: 10,
      now: new Date("2026-08-10T00:00:34.999Z"),
    })).resolves.toMatchObject({ dispatched: 0 });

    const completed = await dispatchAndExecute(harness, RESUME_AT);

    expect(completed).toMatchObject({
      kind: "success",
      nextTask: { nodeId: "end", status: "dispatched" },
      run: {
        context: {
          outputs: {
            "wait-event": {
              message: {
                id: 101,
                parts: [{ text: "第一条消息", type: "text" }],
                role: "customer",
              },
              triggeredAt: EVENT_OCCURRED_AT.toISOString(),
            },
          },
        },
      },
    });
    await expect(harness.repository.findEventSubscriptionByTask(
      9,
      waiting.task.id,
    )).resolves.toMatchObject({
      resumeAt: RESUME_AT,
      status: "triggered",
      triggerOccurredAt: EVENT_OCCURRED_AT,
      triggerProjection: {
        message: {
          id: 101,
          parts: [{ text: "第一条消息", type: "text" }],
          role: "customer",
        },
      },
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

  it("silently truncates the tail of an oversized trigger message", async () => {
    const harness = await createHarness();
    const waiting = await enterWaitEvent(harness);
    await recordMessage(harness, waiting.subscription, {
      eventId: "message-event-large",
      messageId: 101,
      occurredAt: EVENT_OCCURRED_AT,
      recordedAt: EVENT_OCCURRED_AT,
      text: "你".repeat(12_000),
    });

    const completed = await dispatchAndExecute(harness, RESUME_AT);

    expect(completed).toMatchObject({ kind: "success", run: { status: "running" } });
    const run = await harness.repository.findRun(9, harness.created.run.id);
    const output = (run?.context.outputs as Record<string, Record<string, unknown>>)["wait-event"]!;
    const message = output.message as { parts: Array<{ text: string; type: string }> };
    expect(Object.keys(output).sort()).toEqual(["message", "triggeredAt"]);
    expect(message.parts[0]!.text.length).toBeGreaterThan(0);
    expect(message.parts[0]!.text.length).toBeLessThan(12_000);
    expect("你".repeat(12_000).startsWith(message.parts[0]!.text)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(output), "utf8")).toBeLessThanOrEqual(8 * 1_024);
  });

  it("resumes immediately when the fixed delay has already elapsed before recording", async () => {
    const harness = await createHarness();
    const waiting = await enterWaitEvent(harness);
    const recordedAt = new Date("2026-08-10T00:00:40.000Z");

    await expect(recordMessage(harness, waiting.subscription, {
      eventId: "message-event-delayed-delivery",
      messageId: 101,
      occurredAt: EVENT_OCCURRED_AT,
      recordedAt,
      text: "延迟投递消息",
    })).resolves.toMatchObject({
      kind: "success",
      subscription: { resumeAt: recordedAt },
      task: { dueAt: recordedAt },
    });
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

async function createHarness(clock: () => Date = () => ENTERED_AT) {
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
    clock,
    entitlementPort: {
      check: vi.fn(async () => ({ activeRunLimit: 10_000, entitled: true, unentitledSince: null })),
    },
  });
  const created = await repository.createRunWithInitialTask({
    activeRunLimit: 10_000,
    context: { outputs: {}, trigger: { projection: { seatId: 101 } } },
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
    match: { seatId: 101 },
    projection: {
      message: {
        id: input.messageId,
        parts: [{ text: input.text, type: "text" }],
        role: "customer",
      },
      seatId: 101,
    },
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
          delay: { duration: 30, unit: "second" },
          event: {
            type: "message.received",
          },
          timeout: { duration: 1, unit: "minute" },
        },
        id: "wait-event",
        kind: "wait-event",
        nodeSchemaVersion: 1,
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
      },
    ],
    revision: 1,
    schemaVersion: 3,
    terminalNodeId: "end",
    workflowId: "31",
  };
}
