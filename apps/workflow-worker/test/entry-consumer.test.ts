import type { WorkflowEntryEvent } from "@chatai/contracts";
import { WorkflowRuntimeError, type WorkflowTriggerBindingRecord } from "@chatai/workflow-runtime";
import { describe, expect, it, vi } from "vitest";
import { createEntryConsumerHandler, startEntryConsumer } from "../src/entry-consumer.js";
import { createBrokerMessage } from "./helpers/broker-message.js";
import { createFakeWorkflowEventCatalog } from "./support/fake-workflow-event-catalog.js";
import { FakeWorkflowBroker } from "./support/fake-workflow-broker.js";

const eventCatalog = createFakeWorkflowEventCatalog();

describe("workflow entry consumer", () => {
  it("fans one event out to every matching active workflow and ACKs after admission", async () => {
    const bindings = [binding("31"), binding("32")];
    const startRun = vi.fn(async () => ({ deduplicated: false, kind: "success" as const }));
    const message = createBrokerMessage(event());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => bindings) },
      eventCatalog,
      runtimeService: { startRun },
    });

    await expect(handler(message)).resolves.toEqual({ code: "admitted", disposition: "ack" });

    expect(startRun).toHaveBeenCalledTimes(2);
    expect(startRun).toHaveBeenNthCalledWith(1, expect.objectContaining({
      entryEventId: "event-1",
      expectedRevision: 2,
      subjectId: "external-user-1",
      subjectType: "chatai_contact",
      workflowId: "31",
    }));
    expect(startRun).toHaveBeenNthCalledWith(1, expect.objectContaining({
      trigger: {
        eventId: "event-1",
        eventType: "contact.friend_added",
        occurredAt: "2026-08-09T10:30:15.123Z",
        payload: {},
        payloadVersion: 1,
        source: "worker-test",
      },
    }));
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.negativeAck).not.toHaveBeenCalled();
  });

  it("ACKs nonmatching bindings and entry-policy rejection", async () => {
    const startRun = vi.fn(async () => ({ kind: "entry-policy-rejected" as const }));
    const message = createBrokerMessage(event({ payload: { accountId: "account-b" } }));
    const handler = createEntryConsumerHandler({
      bindingReader: {
        listActiveTriggerBindings: vi.fn(async () => [
          binding("31"),
          binding("32", { accountIds: ["account-b"] }),
        ]),
      },
      eventCatalog,
      runtimeService: { startRun },
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
      runtimeService: { startRun },
    });

    await expect(handler(message)).resolves.toEqual({ code: "admitted", disposition: "ack" });

    expect(startRun).toHaveBeenCalledTimes(2);
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("NACKs malformed messages and transient admission failures", async () => {
    const malformed = createBrokerMessage(Buffer.from("not-json"));
    const transient = createBrokerMessage(event());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => [binding("31")]) },
      eventCatalog,
      runtimeService: { startRun: vi.fn(async () => { throw new Error("database unavailable"); }) },
    });

    await expect(handler(malformed)).resolves.toEqual({ code: "invalid_json", disposition: "nack" });
    await expect(handler(transient)).resolves.toEqual({
      code: "temporary_failure",
      disposition: "nack",
    });

    expect(malformed.negativeAck).toHaveBeenCalledTimes(1);
    expect(transient.negativeAck).toHaveBeenCalledTimes(1);
    expect(malformed.ack).not.toHaveBeenCalled();
  });

  it("routes malformed entry messages to the DLQ after broker redelivery", async () => {
    const broker = new FakeWorkflowBroker();
    await startEntryConsumer({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => []) },
      broker,
      deadLetterTopic: "entry-dlq",
      eventCatalog,
      maxRedeliverCount: 2,
      runtimeService: { startRun: vi.fn() },
      subscription: "entry-sub",
      topic: "entry",
    });

    await broker.publish({ data: Buffer.from("not-json"), topic: "entry" });
    await broker.drain();

    expect(broker.getPublished("entry-dlq")).toHaveLength(1);
    await broker.close();
  });

  it("NACKs unsupported catalog events and reports deduplicated admission", async () => {
    const unknown = createBrokerMessage(event({ eventType: "test.unknown" }));
    const duplicate = createBrokerMessage(event());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => [binding("31")]) },
      eventCatalog,
      runtimeService: {
        startRun: vi.fn(async () => ({ deduplicated: true, kind: "success" as const })),
      },
    });

    await expect(handler(unknown)).resolves.toEqual({
      code: "unknown_event_type",
      disposition: "nack",
    });
    await expect(handler(duplicate)).resolves.toEqual({
      code: "deduplicated",
      disposition: "ack",
    });
  });
});

function event(overrides: Partial<WorkflowEntryEvent> = {}): WorkflowEntryEvent {
  return {
    eventId: "event-1",
    eventType: "contact.friend_added",
    occurredAt: "2026-08-09T10:30:15.123Z",
    payload: { accountId: "account-a" },
    payloadVersion: 1,
    schemaVersion: 1,
    source: "worker-test",
    subjectId: "external-user-1",
    subjectType: "chatai_contact",
    uid: 9,
    ...overrides,
  };
}

function binding(
  workflowId: string,
  overrides: Partial<WorkflowTriggerBindingRecord["filter"]> = {},
): WorkflowTriggerBindingRecord {
  const now = new Date("2026-07-11T00:00:00.000Z");
  return {
    createdAt: now,
    eventType: "contact.friend_added",
    filter: {
      accountIds: ["account-a"],
      entryPolicy: { mode: "never" },
      triggers: [{ type: "contact.friend_added" }],
      ...overrides,
    },
    id: workflowId,
    revision: 2,
    status: 1,
    subjectType: "chatai_contact",
    uid: 9,
    updatedAt: now,
    workflowId,
  };
}
