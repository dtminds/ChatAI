import {
  createWorkflowEntryPartitionKey,
  type WorkflowEntryEvent,
  type WorkflowExecutionSpec,
} from "@chatai/contracts";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
} from "@chatai/workflow-runtime";
import { describe, expect, it, vi } from "vitest";
import { startEntryConsumer } from "../src/entry-consumer.js";
import { publishWorkflowOutboxBatch } from "../src/outbox-publisher.js";
import { scheduleWorkflowTasks } from "../src/scheduler.js";
import { startTaskConsumer } from "../src/task-consumer.js";
import { createFakeWorkflowEventCatalog } from "./support/fake-workflow-event-catalog.js";
import { FakeWorkflowBroker } from "./support/fake-workflow-broker.js";

describe("Wait Event Entry runtime composition", () => {
  it("latches the first Entry message and resumes after its fixed delay", async () => {
    const harness = await createHarness();
    await harness.publishOutbox();
    await expect(harness.repository.findEventSubscriptionByTask(
      9,
      harness.created.task.id,
    )).resolves.toMatchObject({
      effectiveFrom: new Date("2026-08-10T00:00:00.000Z"),
      status: "waiting",
    });

    harness.setNow(new Date("2026-08-10T00:00:05.000Z"));
    await publishEntry(harness.broker, messageEvent({
      eventId: "message-event-1",
      messageId: 101,
      occurredAt: "2026-08-10T00:00:04.000Z",
    }));
    harness.setNow(new Date("2026-08-10T00:00:09.000Z"));
    await publishEntry(harness.broker, messageEvent({
      eventId: "message-event-2",
      messageId: 102,
      occurredAt: "2026-08-10T00:00:08.000Z",
    }));

    const beforeResume = new Date("2026-08-10T00:00:33.999Z");
    harness.setNow(beforeResume);
    await expect(scheduleWorkflowTasks({
      leaseDurationMs: 60_000,
      leaseOwner: "scheduler-1",
      limit: 10,
      maxAttempts: 5,
      now: beforeResume,
      repository: harness.repository,
      retryDelayMs: 5_000,
    })).resolves.toMatchObject({ dispatched: 0 });

    const resumeAt = new Date("2026-08-10T00:00:34.000Z");
    harness.setNow(resumeAt);
    await expect(scheduleWorkflowTasks({
      leaseDurationMs: 60_000,
      leaseOwner: "scheduler-1",
      limit: 10,
      maxAttempts: 5,
      now: resumeAt,
      repository: harness.repository,
      retryDelayMs: 5_000,
    })).resolves.toMatchObject({
      dispatched: 1,
    });
    await harness.publishOutbox();
    await harness.publishOutbox();

    await expect(harness.repository.findRun(9, harness.created.run.id)).resolves.toMatchObject({
      context: {
        outputs: {
          "wait-event": {
            message: {
              id: 101,
              parts: [{ text: "第一条消息", type: "text" }],
              role: "customer",
            },
            triggeredAt: "2026-08-10T00:00:04.000Z",
          },
        },
      },
      status: "completed",
    });
    await expect(harness.repository.findEventSubscriptionByTask(
      9,
      harness.created.task.id,
    )).resolves.toMatchObject({
      resumeAt,
      status: "triggered",
      triggerEventId: "message-event-1",
    });
    expect(harness.broker.getPublished("entry-dlq")).toEqual([]);
    await harness.broker.close();
  });

  it("reaches the timeout terminal path when no Entry message arrives", async () => {
    const harness = await createHarness();
    await harness.publishOutbox();

    const expiresAt = new Date("2026-08-10T00:01:00.000Z");
    harness.setNow(expiresAt);
    await expect(scheduleWorkflowTasks({
      leaseDurationMs: 60_000,
      leaseOwner: "scheduler-1",
      limit: 10,
      maxAttempts: 5,
      now: expiresAt,
      repository: harness.repository,
      retryDelayMs: 5_000,
    })).resolves.toMatchObject({ dispatched: 1 });
    await harness.publishOutbox();
    await harness.publishOutbox();

    await expect(harness.repository.findRun(9, harness.created.run.id)).resolves.toMatchObject({
      context: { outputs: { "wait-event": {} } },
      status: "completed",
    });
    await expect(harness.repository.findEventSubscriptionByTask(
      9,
      harness.created.task.id,
    )).resolves.toMatchObject({ status: "timed_out" });
    await harness.broker.close();
  });
});

async function createHarness() {
  let now = new Date("2026-08-10T00:00:00.000Z");
  const broker = new FakeWorkflowBroker();
  const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
  const service = new WorkflowRuntimeService({
    deactivateWorkflowForEntitlementLoss: vi.fn(async () => ({ affectedDefinitions: 0 })),
    findDefinition: vi.fn(async () => ({
      bizStatus: 1 as const,
      publishedRevision: 1,
      runtimeStatus: "active" as const,
      statusReason: null,
      workflowType: "chatai_sop" as const,
    })),
    findRevision: vi.fn(async () => ({
      executionSpec: executionSpec(),
      revision: 1,
      subjectType: "chatai_contact" as const,
      workflowType: "chatai_sop" as const,
    })),
    findRuntimeSnapshots: vi.fn(async (uid, keys) => ({
      invalidKeys: [],
      snapshots: keys.map(({ revision, workflowId }) => ({
        definition: {
          bizStatus: 1 as const,
          publishedRevision: 1,
          runtimeStatus: "active" as const,
          statusReason: null,
          workflowType: "chatai_sop" as const,
        },
        revision: {
          executionSpec: executionSpec(),
          revision,
          subjectType: "chatai_contact" as const,
          workflowType: "chatai_sop" as const,
        },
        uid,
        workflowId,
      })),
    })),
  }, repository, undefined, {
    clock: () => now,
    entitlementPort: {
      check: vi.fn(async () => ({ activeRunLimit: 10_000, entitled: true })),
    },
  });
  const created = await repository.createRunWithInitialTask({
    activeRunLimit: 10_000,
    context: { outputs: {}, trigger: { projection: { seatId: 101 } } },
    entryEventId: "entry-event-1",
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
    initialNodeId: "wait-event",
    initialNodeKind: "wait-event",
    occurredAt: now,
    revision: 1,
    shardId: 7,
    subjectId: "chatai_external_456",
    subjectType: "chatai_contact",
    uid: 9,
    workflowId: "31",
    workflowType: "chatai_sop",
  });
  if (created.kind !== "success") throw new Error(`Expected run, received ${created.kind}`);

  await startTaskConsumer({
    broker,
    maxInFlight: 10,
    now: () => now,
    runtimeService: service,
    subscription: "task-sub",
    topic: "task",
    workerId: "worker-1",
  });
  await startEntryConsumer({
    bindingReader: { listActiveTriggerBindings: vi.fn(async () => []) },
    broker,
    deadLetterTopic: "entry-dlq",
    eventCatalog: createFakeWorkflowEventCatalog(),
    inboxRepository: repository,
    maxInFlight: 10,
    messageReader: {
      findById: vi.fn(async ({ messageId }) => ({
        id: messageId,
        parts: [{ text: messageId === 101 ? "第一条消息" : "第二条消息", type: "text" as const }],
        role: "customer" as const,
      })),
    },
    now: () => now,
    runtimeService: service,
    subscription: "entry-sub",
    subscriptionReader: repository,
    topic: "entry",
  });

  return {
    broker,
    created,
    publishOutbox: () => publishOutbox(broker, repository, () => now),
    repository,
    setNow(value: Date) { now = value; },
  };
}

async function publishEntry(broker: FakeWorkflowBroker, event: WorkflowEntryEvent) {
  await broker.publish({
    data: Buffer.from(JSON.stringify(event)),
    key: createWorkflowEntryPartitionKey(event),
    topic: "entry",
  });
  await broker.drain();
}

async function publishOutbox(
  broker: FakeWorkflowBroker,
  repository: InMemoryWorkflowRuntimeRepository,
  now: () => Date,
) {
  await publishWorkflowOutboxBatch({
    broker,
    leaseDurationMs: 30_000,
    leaseOwner: "publisher-1",
    limit: 10,
    maxAttempts: 3,
    maxRetryDelayMs: 60_000,
    now,
    publishConcurrency: 8,
    repository,
    retryDelayMs: 1_000,
    topic: "task",
  });
  await broker.drain();
}

function messageEvent(input: {
  eventId: string;
  messageId: number;
  occurredAt: string;
}): WorkflowEntryEvent {
  return {
    eventId: input.eventId,
    eventType: "message.received",
    occurredAt: input.occurredAt,
    payload: {
      externalUserId: 3267,
      messageId: input.messageId,
      seatId: 101,
      thirdExternalUserId: "chatai_external_456",
      workUserId: 201,
    },
    payloadVersion: 1,
    schemaVersion: 1,
    source: "chatai",
    uid: 9,
  };
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
