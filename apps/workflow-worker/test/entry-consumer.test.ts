import { readFileSync } from "node:fs";
import type { WorkflowEntryEvent } from "@chatai/contracts";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeError,
  type WorkflowEventSubscriptionRecord,
  type WorkflowInboxRepository,
  type WorkflowTriggerBindingRecord,
} from "@chatai/workflow-runtime";
import { describe, expect, it, vi } from "vitest";
import { createEntryConsumerHandler, startEntryConsumer } from "../src/entry-consumer.js";
import { createBrokerMessage } from "./helpers/broker-message.js";
import { createFakeWorkflowEventCatalog } from "./support/fake-workflow-event-catalog.js";
import { FakeWorkflowBroker } from "./support/fake-workflow-broker.js";

const eventCatalog = createFakeWorkflowEventCatalog();
const workflowFixtureRoot = new URL(
  "../../../packages/contracts/test/fixtures/workflow/",
  import.meta.url,
);

describe("workflow entry consumer", () => {
  it("fans one event out to every matching active workflow and ACKs after admission", async () => {
    const bindings = [binding("31"), binding("32", [201], "wecom_contact")];
    const startRun = vi.fn(async () => ({ deduplicated: false, kind: "success" as const }));
    const message = createBrokerMessage(event());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => bindings) },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      runtimeService: { startRun },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(message)).resolves.toEqual({ code: "admitted", disposition: "ack" });

    expect(startRun).toHaveBeenCalledTimes(2);
    expect(startRun).toHaveBeenNthCalledWith(1, expect.objectContaining({
      entryEventId: "event-1",
      expectedRevision: 2,
      subjectId: "chatai_external_456",
      subjectType: "chatai_contact",
      workflowId: "31",
    }));
    expect(startRun).toHaveBeenNthCalledWith(2, expect.objectContaining({
      subjectId: "3267",
      subjectType: "wecom_contact",
      workflowId: "32",
    }));
    expect(startRun).toHaveBeenNthCalledWith(1, expect.objectContaining({
      trigger: {
        eventId: "event-1",
        eventType: "contact.friend_added",
        occurredAt: "2026-08-09T10:30:15.123Z",
        payloadVersion: 1,
        projection: {
          externalUserId: 3267,
          seatId: 101,
          thirdExternalUserId: "chatai_external_456",
          workUserId: 201,
        },
        source: "wecom",
      },
    }));
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.negativeAck).not.toHaveBeenCalled();
  });

  it("does not start a ChatAI Run when a matching WeCom event has no ChatAI identity", async () => {
    const startRun = vi.fn(async () => ({ deduplicated: false, kind: "success" as const }));
    const message = createBrokerMessage(readSharedEntryFixture(
      "entry/v1/valid/contact-friend-added.json",
    ));
    const handler = createEntryConsumerHandler({
      bindingReader: {
        listActiveTriggerBindings: vi.fn(async () => [
          binding("31"),
          binding("32", [201], "wecom_contact"),
        ]),
      },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      runtimeService: { startRun },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(message)).resolves.toEqual({ code: "admitted", disposition: "ack" });

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
      subjectId: "3267",
      subjectType: "wecom_contact",
      workflowId: "32",
    }));
  });

  it("fans one message event out to both Start bindings and Wait Event subscriptions", async () => {
    const startRun = vi.fn(async () => ({ deduplicated: false, kind: "success" as const }));
    const recordWaitEvent = vi.fn(async () => ({ kind: "success" as const }));
    const subscriptionReader = createSubscriptionReader([subscription("subscription-1")]);
    const message = createBrokerMessage(messageEvent());
    const handler = createEntryConsumerHandler({
      bindingReader: {
        listActiveTriggerBindings: vi.fn(async () => [messageBinding("31")]),
      },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      now: () => new Date("2026-08-10T00:00:05.000Z"),
      runtimeService: { recordWaitEvent, startRun },
      subscriptionReader,
    });

    await expect(handler(message)).resolves.toEqual({ code: "admitted", disposition: "ack" });

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(recordWaitEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "message-event-1",
      eventOccurredAt: new Date("2026-08-10T00:00:04.000Z"),
      eventType: "message.received",
      projection: {
        externalUserId: 3267,
        message: {
          id: 1001,
          parts: [{ text: "想了解价格", type: "text" }],
          role: "customer",
        },
        seatId: 101,
        thirdExternalUserId: "chatai_external_456",
        workUserId: 201,
      },
      recordedAt: new Date("2026-08-10T00:00:05.000Z"),
      subscription: expect.objectContaining({ id: "subscription-1" }),
      subjectId: "chatai_external_456",
      subjectType: "chatai_contact",
    }));
    expect(subscriptionReader.listMatchingEventSubscriptions).toHaveBeenCalledWith(
      9,
      "chatai_contact",
      "message.received",
      "chatai_external_456",
      101,
      new Date("2026-08-10T00:00:04.000Z"),
    );
  });

  it("admits a subscription-only message event and deduplicates a lost trigger CAS", async () => {
    const recordWaitEvent = vi.fn()
      .mockResolvedValueOnce({ kind: "success" })
      .mockResolvedValueOnce({ kind: "conflict" });
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => []) },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      runtimeService: { recordWaitEvent, startRun: vi.fn() },
      subscriptionReader: createSubscriptionReader([subscription("subscription-1")]),
    });

    await expect(handler(createBrokerMessage(messageEvent()))).resolves.toEqual({
      code: "admitted",
      disposition: "ack",
    });
    await expect(handler(createBrokerMessage(messageEvent({ eventId: "message-event-2" })))).resolves
      .toEqual({ code: "deduplicated", disposition: "ack" });
  });

  it("retries partial fan-out and relies on downstream idempotency before completing the Inbox", async () => {
    const startRun = vi.fn()
      .mockResolvedValueOnce({ deduplicated: false, kind: "success" })
      .mockResolvedValueOnce({ deduplicated: true, kind: "success" });
    const recordWaitEvent = vi.fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ kind: "success" });
    const inboxRepository = createInboxRepository();
    const handler = createEntryConsumerHandler({
      bindingReader: {
        listActiveTriggerBindings: vi.fn(async () => [messageBinding("31")]),
      },
      eventCatalog,
      inboxRepository,
      runtimeService: { recordWaitEvent, startRun },
      subscriptionReader: createSubscriptionReader([subscription("subscription-1")]),
    });

    await expect(handler(createBrokerMessage(messageEvent()))).resolves.toEqual({
      code: "temporary_failure",
      disposition: "nack",
      errorCode: "UNEXPECTED_ERROR",
      errorName: "Error",
      failureStage: "runtime_admission",
    });
    await expect(handler(createBrokerMessage(messageEvent()))).resolves.toEqual({
      code: "admitted",
      disposition: "ack",
    });

    expect(startRun).toHaveBeenCalledTimes(2);
    expect(recordWaitEvent).toHaveBeenCalledTimes(2);
    expect(inboxRepository.recordProcessedInboxMessage).toHaveBeenCalledTimes(1);
  });

  it("ACKs a subscription event that no longer matches its frozen seat filter", async () => {
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => []) },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      runtimeService: {
        recordWaitEvent: vi.fn(async () => ({ kind: "not-matched" as const })),
        startRun: vi.fn(),
      },
      subscriptionReader: createSubscriptionReader([subscription("subscription-1")]),
    });

    await expect(handler(createBrokerMessage(messageEvent()))).resolves.toEqual({
      code: "no_match",
      disposition: "ack",
    });
  });

  it("ACKs nonmatching bindings and entry-policy rejection", async () => {
    const startRun = vi.fn(async () => ({ kind: "entry-policy-rejected" as const }));
    const message = createBrokerMessage(event({
      payload: {
        externalUserId: 3267,
        seatId: 101,
        thirdExternalUserId: "chatai_external_456",
        workUserId: 202,
      },
    }));
    const handler = createEntryConsumerHandler({
      bindingReader: {
        listActiveTriggerBindings: vi.fn(async () => [
          binding("31"),
          binding("32", [202]),
        ]),
      },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      runtimeService: { startRun },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(message)).resolves.toEqual({
      code: "entry_policy_rejected",
      disposition: "ack",
    });

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("continues fan-out after one matched workflow becomes paused", async () => {
    const startRun = vi.fn()
      .mockRejectedValueOnce(new WorkflowRuntimeError("WORKFLOW_RUNTIME_PAUSED", "paused"))
      .mockResolvedValueOnce({ deduplicated: false, kind: "success" });
    const message = createBrokerMessage(event());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => [binding("31"), binding("32")]) },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      runtimeService: { startRun },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(message)).resolves.toEqual({ code: "admitted", disposition: "ack" });

    expect(startRun).toHaveBeenCalledTimes(2);
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("moves malformed messages to the Entry DLQ and NACKs transient admission failures", async () => {
    const dispositionOrder: string[] = [];
    const malformed = createBrokerMessage(Buffer.from("not-json"), {
      onAck: () => dispositionOrder.push("ack"),
    });
    const transient = createBrokerMessage(event());
    const publishToDeadLetter = vi.fn(async () => { dispositionOrder.push("publish"); });
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => [binding("31")]) },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      publishToDeadLetter,
      runtimeService: { startRun: vi.fn(async () => { throw new Error("database unavailable"); }) },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(malformed)).resolves.toEqual({ code: "invalid_json", disposition: "ack" });
    await expect(handler(transient)).resolves.toEqual({
      code: "temporary_failure",
      disposition: "nack",
      errorCode: "UNEXPECTED_ERROR",
      errorName: "Error",
      failureStage: "runtime_admission",
    });

    expect(publishToDeadLetter).toHaveBeenCalledWith(malformed, "invalid_json");
    expect(dispositionOrder).toEqual(["publish", "ack"]);
    expect(malformed.ack).toHaveBeenCalledTimes(1);
    expect(malformed.negativeAck).not.toHaveBeenCalled();
    expect(transient.negativeAck).toHaveBeenCalledTimes(1);
  });

  it("publishes permanently invalid entry messages to the DLQ before ACKing", async () => {
    const broker = new FakeWorkflowBroker();
    const logger = { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    await startEntryConsumer({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => []) },
      broker,
      deadLetterTopic: "entry-dlq",
      eventCatalog,
      inboxRepository: createInboxRepository(),
      logger,
      maxRedeliverCount: 2,
      runtimeService: { startRun: vi.fn() },
      subscriptionReader: createSubscriptionReader(),
      subscription: "entry-sub",
      topic: "entry",
    });

    await broker.publish({ data: Buffer.from("not-json"), topic: "entry" });
    await broker.drain();

    expect(broker.getPublished("entry-dlq")).toEqual([
      expect.objectContaining({
        data: Buffer.from("not-json"),
        properties: {
          workflowEntryOriginalTopic: "entry",
          workflowEntryResultCode: "invalid_json",
        },
      }),
    ]);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      code: "invalid_json",
      deadLetterTopic: "entry-dlq",
      disposition: "ack",
      event: "workflow.entry.consume.rejected",
      messageId: "1",
      redeliveryCount: 0,
      role: "entry-consumer",
      topic: "entry",
    }), "workflow entry message rejected");
    await broker.close();
  });

  it("NACKs when the Entry DLQ publish fails", async () => {
    const message = createBrokerMessage(Buffer.from("not-json"));
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => []) },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      publishToDeadLetter: vi.fn(async () => { throw new Error("broker unavailable"); }),
      runtimeService: { startRun: vi.fn() },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(message)).resolves.toEqual({
      code: "temporary_failure",
      disposition: "nack",
      errorCode: "UNEXPECTED_ERROR",
      errorName: "Error",
      failureStage: "dlq_publish",
    });
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.negativeAck).toHaveBeenCalledTimes(1);
  });

  it("moves unsupported catalog events to the Entry DLQ and reports deduplicated admission", async () => {
    const unknown = createBrokerMessage(event({ eventType: "test.unknown" }));
    const duplicate = createBrokerMessage(event());
    const publishToDeadLetter = vi.fn(async () => {});
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => [binding("31")]) },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      publishToDeadLetter,
      runtimeService: {
        startRun: vi.fn(async () => ({ deduplicated: true, kind: "success" as const })),
      },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(unknown)).resolves.toEqual({
      code: "unknown_event_type",
      disposition: "ack",
    });
    await expect(handler(duplicate)).resolves.toEqual({
      code: "deduplicated",
      disposition: "ack",
    });
    expect(publishToDeadLetter).toHaveBeenCalledWith(unknown, "unknown_event_type");
  });

  it("ACKs an Entry event already recorded in the Inbox without loading bindings", async () => {
    const listActiveTriggerBindings = vi.fn(async () => [binding("31")]);
    const inboxRepository = createInboxRepository({
      hasProcessedInboxMessage: vi.fn(async () => true),
    });
    const message = createBrokerMessage(event());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings },
      eventCatalog,
      inboxRepository,
      runtimeService: { startRun: vi.fn() },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(message)).resolves.toEqual({
      code: "deduplicated",
      disposition: "ack",
    });
    expect(listActiveTriggerBindings).not.toHaveBeenCalled();
    expect(inboxRepository.recordProcessedInboxMessage).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("keeps a previously completed no-match event from entering a later binding", async () => {
    const inboxRepository = new InMemoryWorkflowRuntimeRepository();
    const startRun = vi.fn(async () => ({ deduplicated: false, kind: "success" as const }));
    const bindings: WorkflowTriggerBindingRecord[] = [];
    const listActiveTriggerBindings = vi.fn(async () => bindings);
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings },
      eventCatalog,
      inboxRepository,
      now: () => new Date("2026-08-10T00:00:00.000Z"),
      runtimeService: { startRun },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(createBrokerMessage(event()))).resolves.toEqual({
      code: "no_match",
      disposition: "ack",
    });
    bindings.push(binding("31"));
    await expect(handler(createBrokerMessage(event()))).resolves.toEqual({
      code: "deduplicated",
      disposition: "ack",
    });

    expect(listActiveTriggerBindings).toHaveBeenCalledTimes(1);
    expect(startRun).not.toHaveBeenCalled();
  });

  it("NACKs after admission when the Entry Inbox cannot be completed", async () => {
    const message = createBrokerMessage(event());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => [binding("31")]) },
      eventCatalog,
      inboxRepository: createInboxRepository({
        recordProcessedInboxMessage: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      }),
      runtimeService: {
        startRun: vi.fn(async () => ({ deduplicated: false, kind: "success" as const })),
      },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(message)).resolves.toEqual({
      code: "temporary_failure",
      disposition: "nack",
      errorCode: "UNEXPECTED_ERROR",
      errorName: "Error",
      failureStage: "inbox_record",
    });
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.negativeAck).toHaveBeenCalledTimes(1);
  });

  it("reports the stable Runtime error code and admission stage for retryable failures", async () => {
    const message = createBrokerMessage(event());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => [binding("31")]) },
      eventCatalog,
      inboxRepository: createInboxRepository(),
      runtimeService: {
        startRun: vi.fn(async () => {
          throw new WorkflowRuntimeError(
            "WORKFLOW_ENTITLEMENT_UNAVAILABLE",
            "temporarily unavailable",
            503,
          );
        }),
      },
      subscriptionReader: createSubscriptionReader(),
    });

    await expect(handler(message)).resolves.toEqual({
      code: "temporary_failure",
      disposition: "nack",
      errorCode: "WORKFLOW_ENTITLEMENT_UNAVAILABLE",
      errorName: "WorkflowRuntimeError",
      failureStage: "runtime_admission",
    });
  });
});

function createInboxRepository(
  overrides: Partial<WorkflowInboxRepository> = {},
): WorkflowInboxRepository {
  return {
    hasProcessedInboxMessage: vi.fn(async () => false),
    recordProcessedInboxMessage: vi.fn(async () => true),
    ...overrides,
  };
}

function readSharedEntryFixture(path: string): WorkflowEntryEvent {
  return JSON.parse(readFileSync(new URL(path, workflowFixtureRoot), "utf8")) as WorkflowEntryEvent;
}

function createSubscriptionReader(subscriptions: WorkflowEventSubscriptionRecord[] = []) {
  return {
    listMatchingEventSubscriptions: vi.fn(async () => subscriptions),
  };
}

function event(overrides: Partial<WorkflowEntryEvent> = {}): WorkflowEntryEvent {
  return {
    eventId: "event-1",
    eventType: "contact.friend_added",
    occurredAt: "2026-08-09T10:30:15.123Z",
    payload: {
      externalUserId: 3267,
      seatId: 101,
      thirdExternalUserId: "chatai_external_456",
      workUserId: 201,
    },
    payloadVersion: 1,
    schemaVersion: 1,
    source: "wecom",
    uid: 9,
    ...overrides,
  };
}

function binding(
  workflowId: string,
  workUserIds: number[] = [201],
  subjectType: WorkflowTriggerBindingRecord["subjectType"] = "chatai_contact",
): WorkflowTriggerBindingRecord {
  const now = new Date("2026-07-11T00:00:00.000Z");
  return {
    createdAt: now,
    eventType: "contact.friend_added",
    filter: {
      entryPolicy: { mode: "never" },
      eventType: "contact.friend_added",
      sourceIds: [],
      workUserIds,
    },
    id: workflowId,
    revision: 2,
    status: 1,
    subjectType,
    uid: 9,
    updatedAt: now,
    workflowId,
  };
}

function messageBinding(workflowId: string): WorkflowTriggerBindingRecord {
  const now = new Date("2026-08-10T00:00:00.000Z");
  return {
    createdAt: now,
    eventType: "message.received",
    filter: {
      entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
      eventType: "message.received",
      keywords: ["价格"],
      seatIds: [101],
    },
    id: workflowId,
    revision: 1,
    status: 1,
    subjectType: "chatai_contact",
    uid: 9,
    updatedAt: now,
    workflowId,
  };
}

function messageEvent(overrides: Partial<WorkflowEntryEvent> = {}): WorkflowEntryEvent {
  return event({
    eventId: "message-event-1",
    eventType: "message.received",
    occurredAt: "2026-08-10T00:00:04.000Z",
    payload: {
      externalUserId: 3267,
      message: {
        id: 1001,
        parts: [{ text: "想了解价格", type: "text" }],
        role: "customer",
      },
      seatId: 101,
      thirdExternalUserId: "chatai_external_456",
      workUserId: 201,
    },
    source: "chatai",
    ...overrides,
  });
}

function subscription(id: string): WorkflowEventSubscriptionRecord {
  return {
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    effectiveFrom: new Date("2026-08-10T00:00:00.000Z"),
    eventType: "message.received",
    expiresAt: new Date("2026-08-10T00:01:00.000Z"),
    id,
    nodeId: "wait-event",
    revision: 1,
    resumeAt: null,
    runId: "run-1",
    seatId: 101,
    status: "waiting",
    subjectId: "chatai_external_456",
    subjectType: "chatai_contact",
    taskId: "task-1",
    triggerEventId: null,
    triggerOccurredAt: null,
    triggerProjection: null,
    uid: 9,
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    workflowId: "31",
  };
}
